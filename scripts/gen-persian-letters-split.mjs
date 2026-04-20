/**
 * gen-persian-letters-split.mjs
 *
 * For each letter:
 *   1. TTS "حروف الفبای فارسی. [letter_name]."
 *      — full opener sentence anchors Persian pronunciation context
 *   2. Silence-detect the gap between opener and letter name → cut there
 *   3. Fallback: if no gap found, cut at measured opener duration
 *   4. Upload trimmed clip to Firebase Storage → update alphabet.json
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'sturbridge-e59d9.firebasestorage.app'
});

const ALPHABET_PATH = path.join(__dirname, '../static/data/Persian/alphabet.json');
const TMP = path.join(__dirname, 'voice-samples/persian/letters-individual');
fs.mkdirSync(TMP, { recursive: true });

const alphabet = JSON.parse(fs.readFileSync(ALPHABET_PATH, 'utf8'));

// Override TTS letter name embedded in the Persian opener sentence
const NAME_OVERRIDES = {
    'se': 'سِه',    // ث: TTS says "tha" (Arabic); Persian name is "seh" = س sound
};

// Full standalone TTS text for letters that can't be fixed via the opener approach
const STANDALONE_OVERRIDES = {
    'vav': 'vav',   // English phonetic — TTS Persian "واو" → "waw"; English "vav" is close enough
};

function letterName(letter) {
    if (NAME_OVERRIDES[letter.id]) return NAME_OVERRIDES[letter.id];
    const fa = letter.name_fa;
    if (fa.length > 2) return fa;           // جيم, سين, دال… already complete
    if (fa.endsWith('ا')) return fa;         // طا, ظا — long-a vowel already present
    return fa + 'ه';                         // بِ→بِه  رِ→رِه  هِ→هِه  (preserves kasra)
}

async function ttsOpenAI(text) {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: 'tts-1-hd', input: text, voice: 'shimmer', response_format: 'mp3' })
    });
    if (!resp.ok) throw new Error(`TTS ${resp.status}: ${await resp.text()}`);
    return Buffer.from(await resp.arrayBuffer());
}

function duration(filePath) {
    return parseFloat(
        execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`).toString().trim()
    );
}

// Find the silence_end that marks the sentence boundary between the opener and letter name.
// The boundary gap is the LONGEST silence in the expected region — longer than any
// intra-word micro-pause but before the trailing silence.
// Window: opener - 0.40s  to  opener + 0.25s
function findCutPoint(audioPath, openerDuration) {
    const log = execSync(
        `ffmpeg -i "${audioPath}" -af silencedetect=noise=-40dB:d=0.03 -f null - 2>&1`
    ).toString();

    const totalDur = duration(audioPath);
    const windowMin = openerDuration - 0.40;
    const windowMax = openerDuration + 0.25;

    // Collect (end, dur) pairs within the window, excluding trailing silence
    const lines = log.split('\n');
    const gaps = [];
    for (let i = 0; i < lines.length; i++) {
        const endM = lines[i].match(/silence_end: ([\d.]+)/);
        const durM = lines[i].match(/silence_duration: ([\d.]+)/);
        if (endM && durM) {
            const end = parseFloat(endM[1]);
            const dur = parseFloat(durM[1]);
            if (end > windowMin && end < windowMax && end < totalDur - 0.15) {
                gaps.push({ end, dur });
            }
        }
    }

    if (gaps.length > 0) {
        // Longest gap = sentence boundary
        gaps.sort((a, b) => b.dur - a.dur);
        return gaps[0].end;
    }

    return openerDuration;
}

// ── Step 1: measure the opener alone ─────────────────────────────────────────
console.log('Measuring opener duration…');
const openerBuf = await ttsOpenAI('حروف الفبای فارسی.');
const openerPath = path.join(TMP, '_opener.mp3');
fs.writeFileSync(openerPath, openerBuf);
const openerDuration = duration(openerPath);
console.log(`Opener: ${openerDuration.toFixed(3)}s\n`);

// Optional: --only alef,be,pe  regenerates only those letters
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const onlyIds = onlyArg ? new Set(onlyArg.replace('--only=', '').split(',')) : null;

// ── Step 2: generate + cut each letter ───────────────────────────────────────
const bucket = admin.storage().bucket();
const CONCURRENCY = 5;

async function processLetter(letter) {
    const rawPath = path.join(TMP, `${letter.id}_raw.mp3`);
    const outPath = path.join(TMP, `${letter.id}.mp3`);

    const { spawnSync } = await import('child_process');

    if (STANDALONE_OVERRIDES[letter.id]) {
        // Generate directly — no opener, no cutting needed
        const buf = await ttsOpenAI(STANDALONE_OVERRIDES[letter.id]);
        fs.writeFileSync(outPath, buf);
    } else {
        const name = letterName(letter);
        const text = 'حروف الفبای فارسی. ' + name + '.';

        const buf = await ttsOpenAI(text);
        fs.writeFileSync(rawPath, buf);

        const cutAt = findCutPoint(rawPath, openerDuration);
        const start = Math.max(0, cutAt - 0.02);

        // ffmpeg 8.x exits non-zero for short MP3 clips; output is still valid
        spawnSync('ffmpeg', ['-y', '-ss', String(start), '-i', rawPath, outPath], { stdio: 'ignore' });
    }

    const storagePath = `persian/letters/${letter.id}.mp3`;
    const file = bucket.file(storagePath);
    await file.save(fs.readFileSync(outPath), { contentType: 'audio/mpeg' });
    await file.makePublic();

    const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    letter.audio_url = url;

    const outDur = duration(outPath);
    const standalone = !!STANDALONE_OVERRIDES[letter.id];
    const info = standalone ? 'standalone' : `total=${duration(rawPath).toFixed(2)}s  cut=${cutAt.toFixed(2)}s`;
    console.log(`  ✓ ${letter.name_en.padEnd(25)} ${info}  out=${outDur.toFixed(2)}s`);
}

async function runPool(tasks, limit) {
    let i = 0;
    async function worker() {
        while (i < tasks.length) { const t = tasks[i++]; await t(); }
    }
    await Promise.all(Array.from({ length: limit }, worker));
}

const toProcess = onlyIds ? alphabet.filter(l => onlyIds.has(l.id)) : alphabet;
console.log(`Processing ${toProcess.length} letter(s)…\n`);
await runPool(toProcess.map(letter => () => processLetter(letter)), CONCURRENCY);

fs.writeFileSync(ALPHABET_PATH, JSON.stringify(alphabet, null, 2));
console.log(`\nDone. Updated ${ALPHABET_PATH}`);

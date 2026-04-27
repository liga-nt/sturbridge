/**
 * import-lexaudio-hebrew.mjs
 *
 * Imports a sentence range from a LexAudio Hebrew text into Sturbridge.
 * Clips Hebrew audio per sentence (from LexAudio segment M4A + timepoints),
 * generates English audio via Azure TTS, uploads both to Firebase Storage,
 * writes a self-contained Firestore lesson document, and updates word_forms.json.
 *
 * Usage:
 *   node scripts/import-lexaudio-hebrew.mjs Moses/Torah/Genesis 1 5
 *   node scripts/import-lexaudio-hebrew.mjs Moses/Torah/Genesis 1 10 --force
 *
 * Prerequisites:
 *   - ffmpeg installed and on PATH
 *   - .env with AZURE_API_KEY
 *   - sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json in project root
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

const db     = admin.firestore();
const bucket = admin.storage().bucket();

// ── CLI args ───────────────────────────────────────────────────────────────────
const [,, textPath, startArg, endArg, ...flags] = process.argv;
const FORCE = flags.includes('--force');

if (!textPath || !startArg || !endArg) {
    console.error('Usage: node scripts/import-lexaudio-hebrew.mjs <TextPath> <startSent> <endSent>');
    console.error('  e.g. Moses/Torah/Genesis 1 5');
    process.exit(1);
}

const startSent = parseInt(startArg);
const endSent   = parseInt(endArg);
if (isNaN(startSent) || isNaN(endSent) || startSent < 1 || endSent < startSent) {
    console.error('Invalid sentence range. Both must be positive integers with start ≤ end.');
    process.exit(1);
}

// ── Paths ──────────────────────────────────────────────────────────────────────
const LEXAUDIO_ROOT = path.join(__dirname, '../../LexAudio/Classical/App');
const textName      = path.basename(textPath); // e.g. "Genesis"
const textNameLower = textName.toLowerCase();

const CONTENT_JSON  = path.join(LEXAUDIO_ROOT, 'content/hebrew', `${textPath}.json`);
const AUDIO_DIR     = path.join(LEXAUDIO_ROOT, 'audio/hebrew', textPath, 'audio/normal');
const TP_DIR        = path.join(LEXAUDIO_ROOT, 'audio/hebrew', textPath, 'timepoints/normal');
const WF_PATH       = path.join(__dirname, '../static/data/Hebrew/word_forms.json');

const AZURE_KEY  = process.env.AZURE_API_KEY;
const AZURE_URL  = 'https://centralus.tts.speech.microsoft.com/cognitiveservices/v1';
const HE_VOICE   = 'he-IL-AvriNeural';
const EN_VOICE   = 'en-US-JennyNeural';

if (!AZURE_KEY) {
    console.error('AZURE_API_KEY not set in .env');
    process.exit(1);
}

// ── Lesson ID ──────────────────────────────────────────────────────────────────
const lessonId = `${textNameLower}-${startSent}-${endSent}`;

// ── Load source data ───────────────────────────────────────────────────────────
console.log(`\n── Loading LexAudio source: ${textPath} ──\n`);

const contentData = JSON.parse(fs.readFileSync(CONTENT_JSON, 'utf8'));

// Flatten all segments into a map: sentNum → { sentence, translation, words[] }
const allSentences = {};
for (const [, seg] of Object.entries(contentData.segments)) {
    for (const [sn, sentData] of Object.entries(seg.sentences ?? {})) {
        allSentences[parseInt(sn)] = sentData;
    }
}

// Load all timepoints files and merge into one map: sentNum → { wordPos → { pre?, main, post? } }
const allTimepoints = {};
const tpFiles = fs.readdirSync(TP_DIR).filter(f => f.endsWith('.json'));
for (const tpFile of tpFiles) {
    const tp = JSON.parse(fs.readFileSync(path.join(TP_DIR, tpFile), 'utf8'));
    for (const [sn, words] of Object.entries(tp)) {
        allTimepoints[parseInt(sn)] = words;
    }
}

// Map each sentence to its segment audio file (by finding which segment file's timepoints contain it)
const segmentFiles = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.m4a'));
const tpFileMap = {}; // sentNum → segment M4A path
for (const tpFile of tpFiles) {
    const tpData = JSON.parse(fs.readFileSync(path.join(TP_DIR, tpFile), 'utf8'));
    const segmentId = path.basename(tpFile, '.json');
    const m4aFile   = segmentFiles.find(f => f.startsWith(segmentId.split('_')[0]));
    if (!m4aFile) {
        console.warn(`  No audio file found for timepoints file: ${tpFile}`);
        continue;
    }
    for (const sn of Object.keys(tpData)) {
        tpFileMap[parseInt(sn)] = path.join(AUDIO_DIR, m4aFile);
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseMorph(morphStr) {
    if (!morphStr || typeof morphStr !== 'string') return { pos: 'unknown' };
    const parts = morphStr.trim().split(/\s+/);
    const pos   = parts[0];
    if (pos === 'verb') {
        // "verb qal perf 3 m sg" | "verb qal impf 2 f pl" | "verb qal inf" | "verb qal ptcp m sg abs"
        const [, stem, tense, ...rest] = parts;
        if (!stem || !tense) return { pos };
        const m = { pos, stem, tense };
        if (tense === 'inf') return m;
        if (tense === 'ptcp' && rest.length >= 1) {
            const [gender, number, state] = rest;
            return { pos, stem, tense, gender, number, state };
        }
        const [person, gender, number] = rest;
        return { pos, stem, tense, person, gender, number };
    }
    if (pos === 'noun' || pos === 'adj') {
        // "noun f sg abs" | "noun m pl cst"
        const [, gender, number, state] = parts;
        return { pos, gender, number, state };
    }
    if (pos === 'pron') {
        // "pron 3 m sg" | "pron 1 c pl"
        const [, person, gender, number] = parts;
        return { pos, person, gender, number };
    }
    if (pos === 'art') {
        const [, gender, number] = parts;
        return gender ? { pos, gender, number } : { pos };
    }
    return { pos };
}

function stripNikud(str) {
    // Strip Hebrew cantillation (U+0591–U+05AF) and vowel points (U+05B0–U+05C7)
    return str.replace(/[֑-ׇ]/g, '');
}

function dictEntrySlug(dictEntry) {
    return stripNikud(dictEntry).replace(/\s+/g, '_').replace(/[^א-ת_]/g, '') || 'word';
}

// ── Azure TTS ──────────────────────────────────────────────────────────────────
async function azureTts(text, voice, lang) {
    const ssml = `<speak version="1.0" xml:lang="${lang}" xmlns="http://www.w3.org/2001/10/synthesis">` +
                 `<voice name="${voice}"><prosody rate="-10%">${escapeXml(text)}</prosody></voice></speak>`;
    const resp = await fetch(AZURE_URL, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
        },
        body: ssml
    });
    if (!resp.ok) throw new Error(`Azure TTS ${resp.status}: ${await resp.text()}`);
    return Buffer.from(await resp.arrayBuffer());
}

function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Storage upload ─────────────────────────────────────────────────────────────
async function uploadFile(storagePath, buffer, contentType) {
    const file = bucket.file(storagePath);
    await file.save(buffer, { contentType });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

// ── ffmpeg clip ────────────────────────────────────────────────────────────────
function clipAudio(inputPath, startSec, endSec, outputPath) {
    const pad   = 0.1; // small padding for natural audio boundaries
    const start = Math.max(0, startSec - pad);
    const end   = endSec + 0.2;
    execSync(`ffmpeg -y -ss ${start.toFixed(3)} -to ${end.toFixed(3)} -i "${inputPath}" -c copy "${outputPath}"`, { stdio: 'pipe' });
    return { clipStart: start };
}

// ── Main ───────────────────────────────────────────────────────────────────────
console.log(`Importing ${textPath} sentences ${startSent}–${endSent} → lesson "${lessonId}"\n`);

// Check if lesson already exists
const existingSnap = await db.collection('lessons').doc(lessonId).get();
if (existingSnap.exists && !FORCE) {
    console.log(`Lesson "${lessonId}" already exists. Use --force to reimport.`);
    process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sturbridge-import-'));

// Track unique dictEntries for vocab + word_forms
const dictEntryMap = new Map(); // dictEntry → { shortDef, morph (string), parsedMorph, strong }
const wordFormsMap = {};        // surface form → entry (to merge into word_forms.json)

const sentences = [];
let lessonNum = 0;

for (let sn = startSent; sn <= endSent; sn++) {
    const sentData  = allSentences[sn];
    const tpData    = allTimepoints[sn];
    const audioPath = tpFileMap[sn];

    if (!sentData) { console.warn(`  Sentence ${sn}: not found in content JSON, skipping.`); continue; }
    if (!tpData)   { console.warn(`  Sentence ${sn}: no timepoints, skipping.`); continue; }
    if (!audioPath) { console.warn(`  Sentence ${sn}: no audio segment, skipping.`); continue; }

    process.stdout.write(`  Sentence ${sn}... `);

    // Find sentence time bounds from timepoints
    const wordTimes = Object.values(tpData).map(w => w.main).filter(Boolean);
    if (wordTimes.length === 0) { console.log('no word timepoints, skipping.'); continue; }
    const sentStart = Math.min(...wordTimes.map(w => w.start));
    const sentEnd   = Math.max(...wordTimes.map(w => w.end));

    // Clip Hebrew audio
    const clipOut  = path.join(tmpDir, `sent-${sn}-he.m4a`);
    const { clipStart } = clipAudio(audioPath, sentStart, sentEnd, clipOut);
    const clipBuf  = fs.readFileSync(clipOut);
    const heUrl    = await uploadFile(
        `hebrew/lessons/${lessonId}/sentence-${lessonNum}-he.m4a`,
        clipBuf, 'audio/mp4'
    );

    // Adjusted Hebrew timepoints (relative to clip start)
    const heTimepoints = {};
    for (const [wp, timing] of Object.entries(tpData)) {
        if (!timing.main) continue;
        heTimepoints[wp] = {
            start: parseFloat((timing.main.start - clipStart).toFixed(3)),
            end:   parseFloat((timing.main.end   - clipStart).toFixed(3))
        };
    }

    // Generate English audio via Azure TTS
    const translation = sentData.translation ?? '';
    const enBuf  = await azureTts(translation, EN_VOICE, 'en-US');
    const enPath = path.join(tmpDir, `sent-${sn}-en.mp3`);
    fs.writeFileSync(enPath, enBuf);
    const enUrl  = await uploadFile(
        `hebrew/lessons/${lessonId}/sentence-${lessonNum}-en.mp3`,
        enBuf, 'audio/mpeg'
    );

    // Build word objects
    const words = sentData.words.map(w => {
        const parsedMorph = parseMorph(w.morph);
        const entry = {
            sentPos:   w.sentPos,
            text:      w.text,
            text2:     w.text2 ?? stripNikud(w.text),
            dictEntry: w.dictEntry ?? null,
            shortDef:  w.shortDef  ?? null,
            morph:     parsedMorph,
            strong:    w.strong    ?? null,
            engSentPos: w.engSentPos ?? null,
        };

        // Track for vocab_list + word_forms
        if (w.dictEntry) {
            if (!dictEntryMap.has(w.dictEntry)) {
                dictEntryMap.set(w.dictEntry, {
                    shortDef:    w.shortDef ?? null,
                    morphStr:    w.morph    ?? null,
                    parsedMorph,
                    strong:      w.strong   ?? null,
                });
            }
            // word_forms: surface form → entry
            const wfEntry = {
                dictEntry:  w.dictEntry,
                shortDef:   w.shortDef   ?? null,
                morph:      parsedMorph,
                vocabTier:  null,
                paradigmKey: null,
                standard_refs: []
            };
            wordFormsMap[w.text]   = wfEntry;
            const bare = stripNikud(w.text);
            if (bare !== w.text) wordFormsMap[bare] = wfEntry;
        }

        return entry;
    });

    sentences.push({
        num:                lessonNum,
        hebrew:             sentData.sentence ?? '',
        english:            translation,
        words,
        hebrew_audio_url:   heUrl,
        english_audio_url:  enUrl,
        timepoints: {
            hebrew:  heTimepoints,
            english: {}
        }
    });

    lessonNum++;
    console.log(`✓ (${sentStart.toFixed(2)}s–${sentEnd.toFixed(2)}s)`);
}

// ── Generate per-dictEntry word audio ──────────────────────────────────────────
console.log(`\n── Generating word audio for ${dictEntryMap.size} unique words ──\n`);

const vocabList = [];
for (const [dictEntry, info] of dictEntryMap.entries()) {
    process.stdout.write(`  ${dictEntry}... `);
    const slug       = dictEntrySlug(dictEntry);
    const storagePath = `hebrew/vocab/${slug}.mp3`;

    let audioUrl = null;
    try {
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (!exists || FORCE) {
            const buf = await azureTts(dictEntry, HE_VOICE, 'he-IL');
            await uploadFile(storagePath, buf, 'audio/mpeg');
        }
        audioUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        console.log('✓');
    } catch (e) {
        console.log(`✗ (${e.message})`);
    }

    vocabList.push({
        dictEntry,
        shortDef:  info.shortDef,
        vocabTier: null,
        audioUrl
    });

    // Add audioUrl back to word objects in sentences
    for (const sent of sentences) {
        for (const word of sent.words) {
            if (word.dictEntry === dictEntry) word.audioUrl = audioUrl;
        }
    }
}

// ── Update word_forms.json ─────────────────────────────────────────────────────
console.log('\n── Updating word_forms.json ──\n');

const existingWF = fs.existsSync(WF_PATH)
    ? JSON.parse(fs.readFileSync(WF_PATH, 'utf8'))
    : {};

let wfAdded = 0;
for (const [form, entry] of Object.entries(wordFormsMap)) {
    if (!existingWF[form]) {
        existingWF[form] = entry;
        wfAdded++;
    }
}
fs.writeFileSync(WF_PATH, JSON.stringify(existingWF), 'utf8');
console.log(`  Added ${wfAdded} new forms (${Object.keys(existingWF).length} total)`);

// ── Write Firestore lesson ─────────────────────────────────────────────────────
console.log('\n── Writing Firestore lesson ──\n');

const lessonDoc = {
    lessonId,
    courseId:      'hebrew-alphabet',
    source:        'lexaudio',
    sourceText:    textPath,
    sentenceRange: [startSent, endSent],
    title:         `${textName} ${startSent}–${endSent}`,
    lang:          'hebrew',
    sentences,
    vocabList,
    importedAt:    admin.firestore.FieldValue.serverTimestamp()
};

await db.collection('lessons').doc(lessonId).set(lessonDoc);
console.log(`  ✓ lessons/${lessonId}`);

// ── Cleanup ────────────────────────────────────────────────────────────────────
fs.rmSync(tmpDir, { recursive: true });

console.log(`\n✓ Done. Lesson "${lessonId}" imported with ${sentences.length} sentences.\n`);

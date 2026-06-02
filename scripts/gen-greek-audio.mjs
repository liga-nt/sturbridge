/**
 * gen-greek-audio.mjs
 *
 * Generates ElevenLabs TTS audio for Greek alphabet letters and intro vocabulary.
 * Uses the David voice (multilingual) for both Greek and English audio.
 * URLs are written back into the JSON files.
 *
 * Usage:
 *   node scripts/gen-greek-audio.mjs --letters [--force]
 *   node scripts/gen-greek-audio.mjs --vocab   [--force]
 *   node scripts/gen-greek-audio.mjs --letters --vocab [--force]
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'sturbridge-e59d9.firebasestorage.app'
});

const ELEVEN_KEY  = process.env.ELEVEN_LABS_API_KEY;
const DAVID_ID    = '62eXAzXYsxMOUszcxeJ4'; // ElevenLabs David voice
const MODEL_MULTI = 'eleven_v3'; // for Greek (multilingual)
const MODEL_EN    = 'eleven_v3'; // for English definitions
const CONCURRENCY = 3;

const args  = process.argv.slice(2);
const has   = flag => args.includes(flag);
const FORCE = has('--force');

// --tiers intro beginning intermediate  (default: intro only)
const TIERS = (() => {
    const idx = args.indexOf('--tiers');
    if (idx === -1) return ['intro'];
    const tiers = [];
    for (let i = idx + 1; i < args.length && !args[i].startsWith('--'); i++) tiers.push(args[i]);
    return tiers.length ? tiers : ['intro'];
})();

if (!has('--letters') && !has('--vocab')) {
    console.log('Usage: node scripts/gen-greek-audio.mjs [--letters] [--vocab] [--tiers intro beginning intermediate] [--force]');
    process.exit(0);
}

// ── Storage upload ────────────────────────────────────────────────────────────
async function uploadAudio(storagePath, audioBuffer) {
    const bucket = admin.storage().bucket();
    const file   = bucket.file(storagePath);
    await file.save(audioBuffer, { contentType: 'audio/mpeg' });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────
async function tts(text, model = MODEL_MULTI) {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${DAVID_ID}`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: { stability: 0.75, similarity_boost: 0.75 }
        })
    });
    if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
    return Buffer.from(await resp.arrayBuffer());
}

// ── Concurrency pool ──────────────────────────────────────────────────────────
async function runPool(tasks, limit) {
    const results = [];
    let i = 0;
    async function worker() {
        while (i < tasks.length) {
            const idx = i++;
            results[idx] = await tasks[idx]();
        }
    }
    await Promise.all(Array.from({ length: limit }, worker));
    return results;
}

// ── Slug: strip diacritics, lowercase, spaces → underscores ──────────────────
function slug(greek) {
    return greek
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '_');
}

// ── Letters ───────────────────────────────────────────────────────────────────
if (has('--letters')) {
    const filePath = path.join(__dirname, '../static/data/Greek/alphabet.json');
    const letters  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const todo     = letters.filter(l => FORCE || !l.audio_url);

    console.log(`\n── Letters: ${todo.length} / ${letters.length} to generate ──`);

    const tasks = todo.map(letter => async () => {
        console.log(`  ${letter.id} — "${letter.name_greek}"`);
        const buf = await tts(letter.name_greek, MODEL_MULTI);
        letter.audio_url = await uploadAudio(`greek/letters/${letter.id}.mp3`, buf);
        console.log(`  ✓ ${letter.id}`);
    });

    await runPool(tasks, CONCURRENCY);
    fs.writeFileSync(filePath, JSON.stringify(letters, null, 2));
    console.log(`Done. Updated ${filePath}`);
}

// ── Vocab ─────────────────────────────────────────────────────────────────────
if (has('--vocab')) {
    const filePath = path.join(__dirname, '../static/data/Greek/nge_vocabulary.json');
    const data     = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries  = data.entries;

    // Pre-assign unique slugs across all entries in array order so collisions
    // (e.g. εἰμί vs εἶμι both strip to ειμι) get stable unique filenames.
    const usedSlugs = new Map();
    for (const entry of entries) {
        const base = slug(entry.greek);
        const count = usedSlugs.get(base) ?? 0;
        usedSlugs.set(base, count + 1);
        entry._slug = count === 0 ? base : `${base}_${count + 1}`;
    }

    const TIER_FIELD = e => e.vocabTier ?? e.introduced;
    const pool = entries.filter(e => TIERS.includes(TIER_FIELD(e)));
    const todo = pool.filter(e => FORCE || !e.audio_greek_url || !e.audio_en_url);

    console.log(`\n── Vocab: ${todo.length} / ${pool.length} words to generate (tiers: ${TIERS.join(', ')}) ──`);

    const tasks = todo.map(entry => async () => {
        const id = entry._slug;
        console.log(`  ${entry.greek} (${id})`);

        const [grBuf, enBuf] = await Promise.all([
            !entry.audio_greek_url || FORCE ? tts(entry.greek, MODEL_MULTI)   : null,
            !entry.audio_en_url    || FORCE ? tts(entry.definition, MODEL_EN) : null,
        ]);

        if (grBuf) entry.audio_greek_url = await uploadAudio(`greek/vocab/${id}_gr.mp3`, grBuf);
        if (enBuf) entry.audio_en_url    = await uploadAudio(`greek/vocab/${id}_en.mp3`, enBuf);

        console.log(`  ✓ ${entry.greek}`);
    });

    await runPool(tasks, CONCURRENCY);

    // Strip internal _slug field before writing
    for (const entry of entries) delete entry._slug;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Done. Updated ${filePath}`);
}

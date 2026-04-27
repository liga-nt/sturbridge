/**
 * gen-hebrew-audio.mjs
 *
 * Generates ElevenLabs TTS audio for Hebrew alphabet letters (David voice).
 * Uses name_he (vocalized Hebrew name) as TTS input for natural pronunciation.
 * URLs are written back into static/data/Hebrew/alphabet.json.
 *
 * Usage:
 *   node scripts/gen-hebrew-audio.mjs [--force]
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
const DAVID_ID    = '62eXAzXYsxMOUszcxeJ4';
const MODEL       = 'eleven_multilingual_v2';
const CONCURRENCY = 3;

const FORCE = process.argv.includes('--force');

if (!ELEVEN_KEY) {
    console.error('ELEVEN_LABS_API_KEY not set in .env');
    process.exit(1);
}

// ── Storage upload ─────────────────────────────────────────────────────────────
async function uploadAudio(storagePath, audioBuffer) {
    const bucket = admin.storage().bucket();
    const file   = bucket.file(storagePath);
    await file.save(audioBuffer, { contentType: 'audio/mpeg' });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

// ── ElevenLabs TTS ─────────────────────────────────────────────────────────────
async function tts(text) {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${DAVID_ID}`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text,
            model_id: MODEL,
voice_settings: { stability: 0.75, similarity_boost: 0.75 }
        })
    });
    if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
    return Buffer.from(await resp.arrayBuffer());
}

// ── Concurrency pool ───────────────────────────────────────────────────────────
async function runPool(tasks, limit) {
    let i = 0;
    async function worker() {
        while (i < tasks.length) {
            const idx = i++;
            await tasks[idx]();
        }
    }
    await Promise.all(Array.from({ length: limit }, worker));
}

// ── Main ───────────────────────────────────────────────────────────────────────
const filePath = path.join(__dirname, '../static/data/Hebrew/alphabet.json');
const letters  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const todo     = letters.filter(l => FORCE || !l.audio_url);

console.log(`\n── Hebrew letters: ${todo.length} / ${letters.length} to generate ──\n`);
if (todo.length === 0) {
    console.log('All audio_urls already set. Use --force to regenerate.');
    process.exit(0);
}

const tasks = todo.map(letter => async () => {
    console.log(`  ${letter.id} — "${letter.name_he}"`);
    const buf = await tts(letter.name_he);
    letter.audio_url = await uploadAudio(`hebrew/letters/${letter.id}.mp3`, buf);
    console.log(`  ✓ ${letter.id}  →  ${letter.audio_url}`);
});

await runPool(tasks, CONCURRENCY);
fs.writeFileSync(filePath, JSON.stringify(letters, null, 2));
console.log(`\nDone. Updated ${filePath}`);

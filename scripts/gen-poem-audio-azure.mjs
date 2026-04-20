/**
 * gen-poem-audio-azure.mjs
 *
 * Generates Persian audio for poem vocabulary cards using Azure Dilara
 * (fa-IR-DilaraNeural). Sends just the surface form (the inflected word
 * as it appears in the poem), uploads to Firebase Storage, and writes
 * the URL back into the poem JSON.
 *
 * Usage:
 *   node scripts/gen-poem-audio-azure.mjs --poem rudaki-001
 *   node scripts/gen-poem-audio-azure.mjs --poem rudaki-001 --force
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

const AZURE_KEY = process.env.AZURE_API_KEY;
const AZURE_URL = 'https://centralus.tts.speech.microsoft.com/cognitiveservices/v1';
const VOICE     = 'fa-IR-DilaraNeural';

const args    = process.argv.slice(2);
const argVal  = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const POEM_ID = argVal('--poem') ?? 'rudaki-001';
const FORCE   = args.includes('--force');

const POEM_PATH = path.join(__dirname, `../static/data/Persian/poems/${POEM_ID}.json`);

if (!fs.existsSync(POEM_PATH)) {
    console.error(`Poem file not found: ${POEM_PATH}`);
    process.exit(1);
}

const poem = JSON.parse(fs.readFileSync(POEM_PATH, 'utf8'));
const todo = poem.cards.filter(c => FORCE || !c.audio_url);

console.log(`\nGenerating audio for ${todo.length} / ${poem.cards.length} cards in ${POEM_ID}…`);
console.log(`Voice: ${VOICE}\n`);

// ── SSML builder ─────────────────────────────────────────────────────────────
// Send just the surface form (inflected word as it appears in the poem).
// Dilara handles unvoweled Persian reliably.
function buildSsml(text) {
    return `<speak version="1.0" xml:lang="fa-IR" xmlns="http://www.w3.org/2001/10/synthesis">` +
           `<voice name="${VOICE}">` +
           `<prosody rate="-10%">${text}</prosody>` +
           `</voice></speak>`;
}

async function azureTts(text) {
    const resp = await fetch(AZURE_URL, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        },
        body: buildSsml(text),
    });
    if (!resp.ok) throw new Error(`Azure TTS ${resp.status}: ${await resp.text()}`);
    return Buffer.from(await resp.arrayBuffer());
}

async function uploadAudio(storagePath, buf) {
    const bucket = admin.storage().bucket();
    const file   = bucket.file(storagePath);
    await file.save(buf, { contentType: 'audio/mpeg' });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

// ── Process cards ─────────────────────────────────────────────────────────────
const CONCURRENCY = 5;
let i = 0;

async function worker() {
    while (i < todo.length) {
        const card = todo[i++];
        try {
            console.log(`  ${card.id}  ${card.surface}  (${card.prompt_en.slice(0, 40)})`);
            const buf  = await azureTts(card.surface);
            const url  = await uploadAudio(`persian/poems/${POEM_ID}/${card.id}.mp3`, buf);
            card.audio_url = url;
            console.log(`  ✓ ${card.id}`);
        } catch (e) {
            console.error(`  ✗ ${card.id}  ${e.message}`);
        }
    }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

fs.writeFileSync(POEM_PATH, JSON.stringify(poem, null, 2));
console.log(`\nDone. Updated ${POEM_PATH}`);
process.exit(0);

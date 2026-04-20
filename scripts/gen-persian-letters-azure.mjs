/**
 * gen-persian-letters-azure.mjs
 *
 * Generates Persian letter audio using Microsoft Azure Dilara (fa-IR-DilaraNeural).
 * Each letter gets a single MP3 with the three short vowel combinations:
 *   بَ (ba) · بِ (be) · بُ (bo)
 *
 * Alef (ا) is handled separately — it gets its name "الف" since it's a vowel carrier.
 *
 * Usage:
 *   node scripts/gen-persian-letters-azure.mjs           # all 32 letters
 *   node scripts/gen-persian-letters-azure.mjs --only=be,pe,te
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

const ALPHABET_PATH = path.join(__dirname, '../static/data/Persian/alphabet.json');
const TMP = path.join(__dirname, 'voice-samples/persian/letters-azure');
fs.mkdirSync(TMP, { recursive: true });

const alphabet = JSON.parse(fs.readFileSync(ALPHABET_PATH, 'utf8'));

const AZURE_KEY    = process.env.AZURE_API_KEY;
const AZURE_URL    = 'https://centralus.tts.speech.microsoft.com/cognitiveservices/v1';
const VOICE        = 'fa-IR-DilaraNeural';
const FATHA        = '\u064E'; // َ  a
const KASRA        = '\u0650'; // ِ  e
const DAMMA        = '\u064F'; // ُ  o

function buildSsml(innerText) {
    return `<speak version="1.0" xml:lang="fa-IR" xmlns="http://www.w3.org/2001/10/synthesis">` +
           `<voice name="${VOICE}">` +
           `<prosody rate="-20%">${innerText}</prosody>` +
           `</voice></speak>`;
}

function letterSsml(letter) {
    if (letter.id === 'alef') {
        // Alef is a vowel carrier — just say the letter name
        return buildSsml('الف');
    }
    const c = letter.char;
    return buildSsml(
        `${c}${FATHA}<break time="500ms"/> ${c}${KASRA}<break time="500ms"/> ${c}${DAMMA}`
    );
}

async function azureTts(ssml) {
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

const bucket = admin.storage().bucket();
const CONCURRENCY = 5;

const onlyArg = process.argv.find(a => a.startsWith('--only='));
const onlyIds = onlyArg ? new Set(onlyArg.replace('--only=', '').split(',')) : null;
const toProcess = onlyIds ? alphabet.filter(l => onlyIds.has(l.id)) : alphabet;

async function processLetter(letter) {
    const ssml    = letterSsml(letter);
    const outPath = path.join(TMP, `${letter.id}.mp3`);

    const buf = await azureTts(ssml);
    fs.writeFileSync(outPath, buf);

    const storagePath = `persian/letters/${letter.id}.mp3`;
    const file = bucket.file(storagePath);
    await file.save(buf, { contentType: 'audio/mpeg' });
    await file.makePublic();

    const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    letter.audio_url = url;
    console.log(`  ✓ ${letter.name_en}`);
}

async function runPool(tasks, limit) {
    let i = 0;
    async function worker() {
        while (i < tasks.length) { const t = tasks[i++]; await t(); }
    }
    await Promise.all(Array.from({ length: limit }, worker));
}

console.log(`Generating ${toProcess.length} letter(s) with Azure Dilara…\n`);
await runPool(toProcess.map(l => () => processLetter(l)), CONCURRENCY);

fs.writeFileSync(ALPHABET_PATH, JSON.stringify(alphabet, null, 2));
console.log(`\nDone. Updated ${ALPHABET_PATH}`);

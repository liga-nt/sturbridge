/**
 * gen-hebrew-letters-azure.mjs
 *
 * Generates Hebrew letter audio using Microsoft Azure (he-IL-AvriNeural).
 * Each letter's clip says the letter name, then the consonant with three vowels:
 *   [name_he] · [char]ַ · [char]ִ · [char]ֹ
 *   e.g. "בֵּית... בַ... בִ... בֹ"
 *
 * Alef and Ayin (silent consonants) say the name, then bare vowel sounds.
 *
 * Usage:
 *   node scripts/gen-hebrew-letters-azure.mjs             # all 22 letters
 *   node scripts/gen-hebrew-letters-azure.mjs --only=mem,nun,he
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

const ALPHABET_PATH = path.join(__dirname, '../static/data/Hebrew/alphabet.json');
const TMP = path.join(__dirname, 'voice-samples/hebrew/letters-azure');
fs.mkdirSync(TMP, { recursive: true });

const alphabet = JSON.parse(fs.readFileSync(ALPHABET_PATH, 'utf8'));

const AZURE_KEY = process.env.AZURE_API_KEY;
const AZURE_URL = 'https://centralus.tts.speech.microsoft.com/cognitiveservices/v1';
const VOICE     = 'he-IL-AvriNeural';

const PATAH  = 'ַ'; // ַ  a
const HIRIQ  = 'ִ'; // ִ  i
const HOLAM  = 'ֹ'; // ֹ  o

// Silent consonants — vowels appear without consonant
const SILENT = new Set(['alef', 'ayin']);

function buildSsml(innerText) {
    return `<speak version="1.0" xml:lang="he-IL" xmlns="http://www.w3.org/2001/10/synthesis">` +
           `<voice name="${VOICE}">` +
           `<prosody rate="-15%">${innerText}</prosody>` +
           `</voice></speak>`;
}

function letterSsml(letter) {
    const name = letter.name_he;
    const c    = letter.char;

    if (SILENT.has(letter.id)) {
        // Alef/Ayin: say the name, then bare vowels (consonant is silent)
        return buildSsml(
            `${name}<break time="600ms"/> ` +
            `${c}${PATAH}<break time="400ms"/> ` +
            `${c}${HIRIQ}<break time="400ms"/> ` +
            `${c}${HOLAM}`
        );
    }

    return buildSsml(
        `${name}<break time="600ms"/> ` +
        `${c}${PATAH}<break time="400ms"/> ` +
        `${c}${HIRIQ}<break time="400ms"/> ` +
        `${c}${HOLAM}`
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

    const storagePath = `hebrew/letters/${letter.id}.mp3`;
    const file = bucket.file(storagePath);
    await file.save(buf, { contentType: 'audio/mpeg' });
    await file.makePublic();

    letter.audio_url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    console.log(`  ✓ ${letter.name_en.padEnd(14)} ${letter.audio_url}`);
}

async function runPool(tasks, limit) {
    let i = 0;
    async function worker() {
        while (i < tasks.length) { const t = tasks[i++]; await t(); }
    }
    await Promise.all(Array.from({ length: limit }, worker));
}

console.log(`\nGenerating ${toProcess.length} letter(s) with Azure ${VOICE}…\n`);
await runPool(toProcess.map(l => () => processLetter(l)), CONCURRENCY);

fs.writeFileSync(ALPHABET_PATH, JSON.stringify(alphabet, null, 2));
console.log(`\nDone. Updated ${ALPHABET_PATH}`);

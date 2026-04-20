/**
 * gen-persian-forms.mjs
 *
 * Builds static/data/Persian/letter-forms.json.
 * For each letter, generates combos that show it in each of its visible forms:
 *
 *   Connectors (25 letters): isolated · initial · medial · final
 *   Non-connectors (7: ا د ذ ر ز ژ و): isolated · after-connector
 *
 * Frame letter used: ن (nun) — common, clear in all positions
 *
 * Also generates Azure Dilara audio for each form combo and stores audio_url + audio_timestamps.
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

const ALPHABET_PATH  = path.join(__dirname, '../static/data/Persian/alphabet.json');
const FORMS_PATH     = path.join(__dirname, '../static/data/Persian/letter-forms.json');
const TMP            = path.join(__dirname, 'voice-samples/persian/forms');
fs.mkdirSync(TMP, { recursive: true });

const alphabet = JSON.parse(fs.readFileSync(ALPHABET_PATH, 'utf8'));

const AZURE_KEY = process.env.AZURE_API_KEY;
const AZURE_URL = 'https://centralus.tts.speech.microsoft.com/cognitiveservices/v1';
const VOICE     = 'fa-IR-DilaraNeural';
const FATHA     = '\u064E';

// Letters that do NOT connect on the left side (non-connectors)
const NON_CONNECTORS = new Set(['ا','د','ذ','ر','ز','ژ','و']);

// Frame letter: ن (nun) — connects on both sides and is visually unambiguous
const FRAME = 'ن';

function buildSsml(text) {
    return `<speak version="1.0" xml:lang="fa-IR" xmlns="http://www.w3.org/2001/10/synthesis">` +
           `<voice name="${VOICE}"><prosody rate="-10%">${text}</prosody></voice></speak>`;
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
    if (!resp.ok) throw new Error(`Azure ${resp.status}: ${await resp.text()}`);
    return Buffer.from(await resp.arrayBuffer());
}

function getDuration(mp3Path) {
    return parseFloat(
        execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${mp3Path}"`).toString().trim()
    );
}

const bucket = admin.storage().bucket();

async function generateFormAudio(id, text) {
    const ssml    = buildSsml(text + FATHA); // add fatha so vowel is clear
    const outPath = path.join(TMP, `${id}.mp3`);

    const buf = await azureTts(ssml);
    fs.writeFileSync(outPath, buf);

    const storagePath = `persian/forms/${id}.mp3`;
    const file = bucket.file(storagePath);
    await file.save(buf, { contentType: 'audio/mpeg' });
    await file.makePublic();

    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

function buildForms(letter) {
    const c = letter.char;
    const isConnector = !NON_CONNECTORS.has(c);

    if (!isConnector) {
        return [
            { label: 'isolated',        text: c },
            { label: 'after-connector', text: FRAME + c },
        ];
    }

    return [
        { label: 'isolated', text: c },
        { label: 'initial',  text: c + FRAME },   // c connects right → initial form
        { label: 'medial',   text: FRAME + c + FRAME }, // c connects both → medial form
        { label: 'final',    text: FRAME + c },    // c connects left → final form
    ];
}

const CONCURRENCY = 4;
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const onlyIds = onlyArg ? new Set(onlyArg.replace('--only=', '').split(',')) : null;
const toProcess = onlyIds ? alphabet.filter(l => onlyIds.has(l.id)) : alphabet;

// Load existing forms if present (so we can update incrementally)
let formsData = fs.existsSync(FORMS_PATH)
    ? JSON.parse(fs.readFileSync(FORMS_PATH, 'utf8'))
    : [];
const formsMap = new Map(formsData.map(e => [e.id, e]));

async function processLetter(letter) {
    const rawForms = buildForms(letter);
    const entry = {
        id: letter.id,
        char: letter.char,
        name_en: letter.name_en,
        qwerty_key: letter.qwerty_key,
        transliteration: letter.transliteration,
        is_connector: !NON_CONNECTORS.has(letter.char),
        forms: []
    };

    for (const form of rawForms) {
        const audioId = `${letter.id}_${form.label}`;
        try {
            const url = await generateFormAudio(audioId, form.text);
            entry.forms.push({ label: form.label, text: form.text, audio_url: url });
            console.log(`  ✓ ${audioId}`);
        } catch (err) {
            console.error(`  ✗ ${audioId}: ${err.message}`);
            entry.forms.push({ label: form.label, text: form.text, audio_url: null });
        }
    }

    formsMap.set(letter.id, entry);
}

async function runPool(tasks, limit) {
    let i = 0;
    async function worker() {
        while (i < tasks.length) { const t = tasks[i++]; await t(); }
    }
    await Promise.all(Array.from({ length: limit }, worker));
}

console.log(`Generating letter forms for ${toProcess.length} letter(s)…\n`);
await runPool(toProcess.map(l => () => processLetter(l)), CONCURRENCY);

// Write in alphabet order
const ordered = alphabet.map(l => formsMap.get(l.id)).filter(Boolean);
fs.writeFileSync(FORMS_PATH, JSON.stringify(ordered, null, 2));
console.log(`\nDone. Wrote ${FORMS_PATH}`);

/**
 * gen-alphabet-hint-audio.mjs
 *
 * Generates ElevenLabs TTS audio (with word-level alignment) for the
 * instruction hints shown at the top of each tab on the Alphabet and Lesson pages.
 *
 * Outputs:
 *   static/data/Greek/alphabet_hints.json   (--alphabet, default)
 *   static/data/Greek/lesson_hints.json     (--lesson)
 *
 * Usage:
 *   node scripts/gen-alphabet-hint-audio.mjs [--alphabet] [--lesson] [--tab vocab] [--force]
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

const ELEVEN_KEY = process.env.ELEVEN_LABS_API_KEY;
const VOICE_ID   = '62eXAzXYsxMOUszcxeJ4'; // David
const MODEL      = 'eleven_v3';
const FORCE      = process.argv.includes('--force');
const RUN_ALPHA  = process.argv.includes('--alphabet') || (!process.argv.includes('--lesson'));
const RUN_LESSON = process.argv.includes('--lesson');

// --tab sequence --tab vocab  → only regenerate those tabs
const TAB_ARGS = (() => {
    const tabs = [];
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--tab' && args[i + 1]) tabs.push(args[++i]);
    }
    return tabs.length ? new Set(tabs) : null; // null = all tabs
})();

// Text to read for each tab — button labels are excluded.
const HINTS = {
    sequence:    'Click a tile or type a letter to hear it. Choose your input style here.',
    flashcards:  'Practice the letter names and their transliteration. Use the buttons below if you want to focus on one or the other.',
    recognition: 'Click the upper or lower case letter that matches the letter shown.',
    diacritics:  'Type each word with its correct accent and breathing marks. Choose your input style.',
    vocab:       'This is all the vocabulary you will need to memorize for the National Greek Exam. For now you can practice typing and transliterating while you get familiar with the vocab. Choose your input style.',
};

// Hints for the lesson page tabs.
const LESSON_HINTS = {
    vocab: 'Type each Greek word. Use the buttons to choose the vocab you want to practice and to hide the Greek or English columns. Select your input style here:',
};

async function uploadAudio(storagePath, buffer) {
    const bucket = admin.storage().bucket();
    const file   = bucket.file(storagePath);
    await file.save(buffer, { contentType: 'audio/mpeg' });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

function buildAlignment(alignmentData) {
    const chars  = alignmentData.characters;
    const starts = alignmentData.character_start_times_seconds;
    const ends   = alignmentData.character_end_times_seconds;
    const fullText = chars.join('');
    const wordRe = /\S+/g;
    const result = [];
    let m;
    while ((m = wordRe.exec(fullText)) !== null) {
        const s = m.index;
        const e = s + m[0].length - 1;
        if (s < starts.length && e < ends.length) {
            result.push({ word: m[0], start: starts[s], end: ends[e] });
        }
    }
    return result;
}

async function generateHint(tabId, text, storagePrefix = 'greek/alphabet-hints') {
    console.log(`  Calling ElevenLabs for "${tabId}"…`);
    const resp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`,
        {
            method: 'POST',
            headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                model_id: MODEL,
                voice_settings: { stability: 0.65, similarity_boost: 0.75 }
            })
        }
    );
    if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
    const data      = await resp.json();
    const buffer    = Buffer.from(data.audio_base64, 'base64');
    const storagePath = `${storagePrefix}/${tabId}.mp3`;
    const audioUrl  = await uploadAudio(storagePath, buffer);
    const alignment = buildAlignment(data.alignment);
    console.log(`  ✓ ${tabId} — ${alignment.length} words, uploaded`);
    return { text, audioUrl, alignment };
}

async function runHints(hints, outPath, storagePrefix) {
    let existing = {};
    if (fs.existsSync(outPath) && !FORCE) {
        existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    }
    const result = { ...existing };
    for (const [tabId, text] of Object.entries(hints)) {
        const targeted = TAB_ARGS ? TAB_ARGS.has(tabId) : true;
        if (!targeted) { console.log(`  skipping ${tabId} (not in --tab list)`); continue; }
        if (existing[tabId] && !FORCE && !TAB_ARGS?.has(tabId)) {
            console.log(`  skipping ${tabId} (already exists, use --force or --tab ${tabId} to regenerate)`);
            continue;
        }
        result[tabId] = await generateHint(tabId, text, storagePrefix);
    }
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`\nWrote ${outPath}`);
}

async function main() {
    if (!ELEVEN_KEY) { console.error('Missing ELEVEN_LABS_API_KEY'); process.exit(1); }

    if (RUN_ALPHA) {
        console.log('\n── Alphabet hints ──');
        await runHints(HINTS, path.join(__dirname, '../static/data/Greek/alphabet_hints.json'), 'greek/alphabet-hints');
    }
    if (RUN_LESSON) {
        console.log('\n── Lesson hints ──');
        await runHints(LESSON_HINTS, path.join(__dirname, '../static/data/Greek/lesson_hints.json'), 'greek/lesson-hints');
    }

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

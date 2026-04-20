/**
 * gen-persian-audio.mjs
 *
 * Generates ElevenLabs TTS audio for Persian data files and uploads to Firebase Storage.
 * URLs are written back into the JSON file.
 *
 * Usage:
 *   node scripts/gen-persian-audio.mjs --list-voices
 *   node scripts/gen-persian-audio.mjs --letters --voice-id <id>
 *   node scripts/gen-persian-audio.mjs --words   --voice-id <id>
 *
 * --list-voices   Query ElevenLabs and print voices that support Persian/Arabic/multilingual.
 * --letters       Generate audio for static/data/Persian/alphabet.json  (32 items)
 * --words         Generate audio for static/data/Persian/words.json      (~500 items, Farsi + English)
 * --voice-id      ElevenLabs voice ID to use (required unless --list-voices)
 * --force         Re-generate even if audio_url already set
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
const OPENAI_KEY  = process.env.OPENAI_API_KEY;
const MODEL       = 'eleven_multilingual_v2';
const CONCURRENCY = 5;

// Prefix each letter name with "الفبا:" to anchor Persian context,
// and use bare char+ه for short names (no kasra diacritic)
function letterTtsText(letter) {
    const name = letter.name_fa.length <= 2 ? letter.char + 'ه' : letter.name_fa;
    return 'الفبا: ' + name;
}

// ── Arg parsing ──────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const has     = flag => args.includes(flag);
const argVal  = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const LIST_VOICES = has('--list-voices');
const DO_LETTERS  = has('--letters');
const DO_WORDS    = has('--words');
const VOICE_ID    = argVal('--voice-id');
const FORCE       = has('--force');

if (!LIST_VOICES && !DO_LETTERS && !DO_WORDS) {
    console.log('Usage: node scripts/gen-persian-audio.mjs [--list-voices] [--letters] [--words] --voice-id <id> [--force]');
    process.exit(0);
}

// ── List voices ───────────────────────────────────────────────────────────────
if (LIST_VOICES) {
    const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': ELEVEN_KEY }
    });
    const { voices } = await resp.json();

    // Filter for voices likely to handle Persian (multilingual, Arabic, or Persian labels)
    const relevant = voices.filter(v => {
        const labels = JSON.stringify(v.labels ?? {}).toLowerCase();
        const desc   = (v.description ?? '').toLowerCase();
        return labels.includes('persian') || labels.includes('arabic') ||
               labels.includes('farsi')  || labels.includes('multilingual') ||
               desc.includes('persian')  || desc.includes('arabic') ||
               v.high_quality_base_model_ids?.includes('eleven_multilingual_v2');
    });

    console.log(`\nFound ${relevant.length} potentially Persian-capable voices:\n`);
    for (const v of relevant) {
        const lang = v.labels?.language ?? v.labels?.accent ?? '—';
        console.log(`  ${v.voice_id}  ${v.name.padEnd(30)} lang=${lang}`);
    }
    console.log('\nRun with --letters --voice-id <id> to generate letter audio.');
    process.exit(0);
}

// VOICE_ID only needed for ElevenLabs fallback; OpenAI path doesn't require it

// ── Firebase Storage upload ───────────────────────────────────────────────────
async function uploadAudio(storagePath, audioBuffer) {
    const bucket = admin.storage().bucket();
    const file   = bucket.file(storagePath);
    await file.save(audioBuffer, { contentType: 'audio/mpeg' });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

// ── OpenAI TTS (Persian with Shimmer) ────────────────────────────────────────
async function ttsOpenAI(text, voice = 'shimmer') {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1-hd', input: text, voice, response_format: 'mp3' })
    });
    if (!resp.ok) throw new Error(`OpenAI TTS ${resp.status}: ${await resp.text()}`);
    return Buffer.from(await resp.arrayBuffer());
}

// ── ElevenLabs TTS (David, for non-Persian or fallback) ──────────────────────
async function ttsElevenLabs(text) {
    const voiceId = VOICE_ID ?? '62eXAzXYsxMOUszcxeJ4'; // David
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.75, similarity_boost: 0.75 } })
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

// ── Letters ───────────────────────────────────────────────────────────────────
if (DO_LETTERS) {
    const filePath = path.join(__dirname, '../static/data/Persian/alphabet.json');
    const letters  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const todo     = letters.filter(l => FORCE || !l.audio_url);

    console.log(`Generating audio for ${todo.length} / ${letters.length} letters...`);

    const tasks = todo.map(letter => async () => {
        const text = letterTtsText(letter);
        console.log(`  ${letter.id} — "${text}"`);
        const buf = await ttsOpenAI(text);
        const url = await uploadAudio(`persian/letters/${letter.id}.mp3`, buf);
        letter.audio_url = url;
        console.log(`  ✓ ${letter.id}`);
    });

    await runPool(tasks, CONCURRENCY);

    fs.writeFileSync(filePath, JSON.stringify(letters, null, 2));
    console.log(`\nDone. Updated ${filePath}`);
}

// ── Words ─────────────────────────────────────────────────────────────────────
if (DO_WORDS) {
    const filePath = path.join(__dirname, '../static/data/Persian/words.json');
    const words    = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const todo     = words.filter(w => FORCE || !w.audio_fa_url || !w.audio_en_url);

    console.log(`Generating audio for ${todo.length} / ${words.length} words...`);

    const tasks = todo.map(word => async () => {
        console.log(`  ${word.id} — ${word.farsi} (${word.transliteration})`);
        const [faBuffer, enBuffer] = await Promise.all([
            !word.audio_fa_url || FORCE ? ttsOpenAI(word.farsi)          : null,
            !word.audio_en_url || FORCE ? ttsOpenAI(word.english, 'nova') : null,
        ]);
        if (faBuffer) word.audio_fa_url = await uploadAudio(`persian/words/${word.id}_fa.mp3`, faBuffer);
        if (enBuffer) word.audio_en_url = await uploadAudio(`persian/words/${word.id}_en.mp3`, enBuffer);
        console.log(`  ✓ ${word.id}`);
    });

    await runPool(tasks, CONCURRENCY);

    fs.writeFileSync(filePath, JSON.stringify(words, null, 2));
    console.log(`\nDone. Updated ${filePath}`);
}

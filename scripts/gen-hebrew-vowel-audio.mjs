/**
 * gen-hebrew-vowel-audio.mjs
 *
 * Generates per-vowel and name-only audio for each Hebrew letter using Azure TTS.
 * Adds the following fields to static/data/Hebrew/alphabet.json:
 *
 *   name_audio_url   — letter name only (for keypress playback)
 *   vowel_audio      — { patah, qamats, tsere, segol, hiriq, holam, qibbuts, shva, shuruk,
 *                        hataf_patah, hataf_segol, hataf_qamats }  (hatafim only on gutturals)
 *   dagesh_audio_url — dagesh form + patah (bet / kaf / pe only; soft form reuses vowel_audio.patah)
 *
 * Usage:
 *   node scripts/gen-hebrew-vowel-audio.mjs             # skip already-generated
 *   node scripts/gen-hebrew-vowel-audio.mjs --force      # regenerate everything
 *   node scripts/gen-hebrew-vowel-audio.mjs --only=alef,bet
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
const alphabet = JSON.parse(fs.readFileSync(ALPHABET_PATH, 'utf8'));

const AZURE_KEY = process.env.AZURE_API_KEY;
const AZURE_URL = 'https://centralus.tts.speech.microsoft.com/cognitiveservices/v1';
const VOICE     = 'he-IL-AvriNeural';

if (!AZURE_KEY) {
  console.error('AZURE_API_KEY not set in .env');
  process.exit(1);
}

const FORCE   = process.argv.includes('--force');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const onlyIds = onlyArg ? new Set(onlyArg.replace('--only=', '').split(',')) : null;

const STANDARD_VOWELS = [
  { key: 'patah',   mark: 'ַ' },
  { key: 'qamats',  mark: 'ָ' },
  { key: 'tsere',   mark: 'ֵ' },
  { key: 'segol',   mark: 'ֶ' },
  { key: 'hiriq',   mark: 'ִ' },
  { key: 'holam',   mark: 'ֹ' },
  { key: 'qibbuts', mark: 'ֻ' },
  { key: 'shva',    mark: 'ְ' },
];

const HATAFIM = [
  { key: 'hataf_patah',  mark: 'ֲ' },
  { key: 'hataf_segol',  mark: 'ֱ' },
  { key: 'hataf_qamats', mark: 'ֳ' },
];

function buildSsml(text) {
  return `<speak version="1.0" xml:lang="he-IL" xmlns="http://www.w3.org/2001/10/synthesis">` +
         `<voice name="${VOICE}"><prosody rate="-20%">${text}</prosody></voice></speak>`;
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

async function upload(storagePath, buf) {
  const bucket = admin.storage().bucket();
  const file   = bucket.file(storagePath);
  await file.save(buf, { contentType: 'audio/mpeg' });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

async function gen(text, storagePath) {
  const buf = await azureTts(buildSsml(text));
  return upload(storagePath, buf);
}

async function processLetter(letter) {
  const c = letter.char;
  letter.vowel_audio = letter.vowel_audio ?? {};

  // Name only
  if (FORCE || !letter.name_audio_url) {
    letter.name_audio_url = await gen(letter.name_he, `hebrew/names/${letter.id}.mp3`);
    console.log(`    name`);
  }

  // Standard vowels
  for (const v of STANDARD_VOWELS) {
    if (!FORCE && letter.vowel_audio[v.key]) continue;
    letter.vowel_audio[v.key] = await gen(`${c}${v.mark}`, `hebrew/vowels/${letter.id}-${v.key}.mp3`);
    console.log(`    ${v.key}`);
  }

  // Shuruk — char + vav + shuruk (e.g. בּוּ "boo")
  if (FORCE || !letter.vowel_audio.shuruk) {
    letter.vowel_audio.shuruk = await gen(`${c}וּ`, `hebrew/vowels/${letter.id}-shuruk.mp3`);
    console.log(`    shuruk`);
  }

  // Hatafim — guttural letters only
  if (letter.guttural) {
    for (const h of HATAFIM) {
      if (!FORCE && letter.vowel_audio[h.key]) continue;
      const fileKey = h.key.replace('_', '-');
      letter.vowel_audio[h.key] = await gen(`${c}${h.mark}`, `hebrew/vowels/${letter.id}-${fileKey}.mp3`);
      console.log(`    ${h.key}`);
    }
  }

  // Dagesh vowel audio (bet / kaf / pe only)
  // Full parallel set using dagesh_char — soft form uses vowel_audio above.
  if (letter.dagesh_char) {
    letter.dagesh_vowel_audio = letter.dagesh_vowel_audio ?? {};

    for (const v of STANDARD_VOWELS) {
      if (!FORCE && letter.dagesh_vowel_audio[v.key]) continue;
      letter.dagesh_vowel_audio[v.key] = await gen(
        `${letter.dagesh_char}${v.mark}`,
        `hebrew/dagesh/${letter.id}-${v.key}.mp3`
      );
      console.log(`    dagesh-${v.key}`);
    }

    if (FORCE || !letter.dagesh_vowel_audio.shuruk) {
      letter.dagesh_vowel_audio.shuruk = await gen(
        `${letter.dagesh_char}וּ`,
        `hebrew/dagesh/${letter.id}-shuruk.mp3`
      );
      console.log(`    dagesh-shuruk`);
    }
  }
}

const toProcess = alphabet.filter(l => !onlyIds || onlyIds.has(l.id));
console.log(`\nGenerating vowel audio for ${toProcess.length} letter(s)…\n`);

for (const letter of toProcess) {
  console.log(`── ${letter.name_en}`);
  await processLetter(letter);
}

fs.writeFileSync(ALPHABET_PATH, JSON.stringify(alphabet, null, 2));
console.log(`\nDone. Updated ${ALPHABET_PATH}`);

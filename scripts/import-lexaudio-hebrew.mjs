/**
 * import-lexaudio-hebrew.mjs
 *
 * Imports a sentence range from a LexAudio Hebrew text into Sturbridge.
 * Clips Hebrew + English audio per sentence from LexAudio M4A segments,
 * uploads both to Firebase Storage, writes a Firestore lesson document,
 * and updates word_forms.json.
 *
 * LexAudio audio layout (confirmed):
 *   audio/original/  = Hebrew reading (natural pace)
 *   audio/normal/    = English TTS
 *   timepoints/original/ = Hebrew word-level timepoints
 *   timepoints/normal/   = English word-level timepoints
 *
 * Usage:
 *   node scripts/import-lexaudio-hebrew.mjs Moses/Torah/Genesis 1 5
 *   node scripts/import-lexaudio-hebrew.mjs Moses/Torah/Genesis 1 10 --force
 *
 * Prerequisites:
 *   - ffmpeg installed and on PATH
 *   - .env with AZURE_API_KEY (for per-word flashcard audio only)
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
const FORCE            = flags.includes('--force');
const SKIP_VOCAB_AUDIO = flags.includes('--skip-vocab-audio');
const DELETE           = flags.includes('--delete');

if (!textPath || !startArg || !endArg) {
    console.error('Usage: node scripts/import-lexaudio-hebrew.mjs <TextPath> <startSent> <endSent> [--force] [--skip-vocab-audio] [--delete]');
    console.error('  e.g. Moses/Torah/Genesis 1 5');
    console.error('  --force             Overwrite existing lesson');
    console.error('  --skip-vocab-audio  Re-import without regenerating per-word Azure TTS audio');
    console.error('  --delete            Delete lesson from Firestore and Storage (sentence audio only)');
    process.exit(1);
}

// ── Delete path ────────────────────────────────────────────────────────────────
if (DELETE) {
    console.log(`\nDeleting lesson "${lessonId}"...\n`);

    // Delete Firestore document
    const snap = await db.collection('lessons').doc(lessonId).get();
    if (!snap.exists) {
        console.log(`  Lesson "${lessonId}" not found in Firestore.`);
    } else {
        await db.collection('lessons').doc(lessonId).delete();
        console.log(`  ✓ Deleted Firestore: lessons/${lessonId}`);
    }

    // Delete sentence audio files from Storage
    const prefix = `hebrew/lessons/${lessonId}/`;
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) {
        console.log(`  No Storage files found under ${prefix}`);
    } else {
        for (const file of files) {
            await file.delete();
            console.log(`  ✓ Deleted Storage: ${file.name}`);
        }
    }

    console.log(`\nDone. Vocab audio (hebrew/vocab/) was left intact.\n`);
    process.exit(0);
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

const CONTENT_JSON = path.join(LEXAUDIO_ROOT, 'content/hebrew', `${textPath}.json`);
const HE_AUDIO_DIR = path.join(LEXAUDIO_ROOT, 'audio/hebrew', textPath, 'audio/original');
const EN_AUDIO_DIR = path.join(LEXAUDIO_ROOT, 'audio/hebrew', textPath, 'audio/normal');
const HE_TP_DIR    = path.join(LEXAUDIO_ROOT, 'audio/hebrew', textPath, 'timepoints/original');
const EN_TP_DIR    = path.join(LEXAUDIO_ROOT, 'audio/hebrew', textPath, 'timepoints/normal');
const WF_PATH      = path.join(__dirname, '../static/data/Hebrew/word_forms.json');

const AZURE_KEY = process.env.AZURE_API_KEY;
const AZURE_URL = 'https://centralus.tts.speech.microsoft.com/cognitiveservices/v1';
const HE_VOICE  = 'he-IL-AvriNeural';

// ── Lesson ID ──────────────────────────────────────────────────────────────────
const lessonId = `${textNameLower}-${startSent}-${endSent}`;

// ── Load source data ───────────────────────────────────────────────────────────
console.log(`\n── Loading LexAudio source: ${textPath} ──\n`);

const contentData = JSON.parse(fs.readFileSync(CONTENT_JSON, 'utf8'));

// Flatten all segments → sentNum → { sentence, translation, words[] }
const allSentences = {};
for (const [, seg] of Object.entries(contentData.segments)) {
    for (const [sn, sentData] of Object.entries(seg.sentences ?? {})) {
        allSentences[parseInt(sn)] = sentData;
    }
}

// Load timepoints for a variant directory → sentNum → { wordPos → timing }
function loadTimepoints(tpDir) {
    const map = {};
    const files = fs.readdirSync(tpDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const tp = JSON.parse(fs.readFileSync(path.join(tpDir, file), 'utf8'));
        for (const [sn, words] of Object.entries(tp)) {
            map[parseInt(sn)] = words;
        }
    }
    return map;
}

// Build sentNum → audio file path map for a variant
function buildSegmentMap(tpDir, audioDir) {
    const tpFiles  = fs.readdirSync(tpDir).filter(f => f.endsWith('.json'));
    const m4aFiles = fs.readdirSync(audioDir).filter(f => f.endsWith('.m4a'));
    const map = {};
    for (const tpFile of tpFiles) {
        const tpData    = JSON.parse(fs.readFileSync(path.join(tpDir, tpFile), 'utf8'));
        const segPrefix = path.basename(tpFile, '.json').split('_')[0]; // e.g. "1"
        const m4a       = m4aFiles.find(f => f.startsWith(segPrefix + '_'));
        if (!m4a) { console.warn(`  No M4A for timepoints file: ${tpFile}`); continue; }
        for (const sn of Object.keys(tpData)) {
            map[parseInt(sn)] = path.join(audioDir, m4a);
        }
    }
    return map;
}

const heTimepoints  = loadTimepoints(HE_TP_DIR);
const enTimepoints  = loadTimepoints(EN_TP_DIR);
const heSegmentMap  = buildSegmentMap(HE_TP_DIR, HE_AUDIO_DIR);
const enSegmentMap  = buildSegmentMap(EN_TP_DIR, EN_AUDIO_DIR);

// ── Helpers ────────────────────────────────────────────────────────────────────

// Known verb stem names (used to detect infinitive pattern)
const KNOWN_STEMS = new Set(['qal','niphal','piel','pual','hiphil','hophal','hitpael','polel','polal','poel','hithpolel','nithpael']);

function parseMorph(morphStr) {
    if (!morphStr || typeof morphStr !== 'string') return { pos: 'unknown' };
    const parts = morphStr.trim().split(/\s+/);
    const pos   = parts[0];

    if (pos === 'verb') {
        if (parts.length < 2) return { pos };
        const p1 = parts[1];
        if (p1 === '1' || p1 === '2' || p1 === '3') {
            // "verb 3 m sg qal qatal"
            const [, person, gender, number, stem, tense] = parts;
            return { pos, person, gender, number, stem, tense: tense ?? stem };
        }
        if (KNOWN_STEMS.has(p1)) {
            // "verb qal infinitive construct" | "verb hiphil infinitive construct"
            const [, stem, , type] = parts; // parts[2] = "infinitive"
            const tense = type ? `infinitive_${type}` : 'infinitive';
            return { pos, stem, tense };
        }
        // "verb f sg piel participle active" | "verb m sg qal participle active"
        const [, gender, number, stem, tense, voice] = parts;
        if (!stem) return { pos };
        const m = { pos, gender, number, stem, tense };
        if (voice) m.voice = voice;
        return m;
    }
    if (pos === 'noun' || pos === 'adjective' || pos === 'adj') {
        const [, gender, number, state] = parts;
        return { pos: pos === 'adjective' ? 'adj' : pos, gender, number, state };
    }
    if (pos === 'pronoun' || pos === 'pron') {
        const [, person, gender, number] = parts;
        return { pos: 'pron', person, gender, number };
    }
    return { pos };
}

function assignParadigmKey(m) {
    if (!m || !m.pos) return null;
    const { pos, stem, tense, gender } = m;
    if (pos === 'verb') {
        if (!stem) return null;
        if (!tense) return null;
        return `${stem}_${tense}`;
    }
    if (pos === 'noun') {
        if (gender === 'f') return 'noun_fem';
        if (gender === 'both') return 'noun_both';
        return 'noun_masc';
    }
    if (pos === 'adj') {
        return gender === 'f' ? 'adj_fem' : 'adj_masc';
    }
    return null;
}

function stripNikud(str) {
    return str.replace(/[֑-ׇ]/g, '');
}

function dictEntrySlug(dictEntry) {
    return stripNikud(dictEntry).replace(/\s+/g, '_').replace(/[^א-ת_]/g, '') || 'word';
}

// ── Azure TTS (word audio only) ────────────────────────────────────────────────
async function azureTts(text, voice, lang) {
    if (!AZURE_KEY) throw new Error('AZURE_API_KEY not set');
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
// Re-encode to AAC rather than -c copy to avoid packet-boundary click/pop artifacts.
// preRoll: seconds before first timepoint (English needs more to avoid losing word onset)
// postRoll: seconds after last timepoint (both languages need enough tail to avoid cutoff pop)
function clipAudio(inputPath, startSec, endSec, outputPath, preRoll = 0.1, postRoll = 0.5) {
    const start = Math.max(0, startSec - preRoll);
    const end   = endSec + postRoll;
    execSync(
        `ffmpeg -y -ss ${start.toFixed(3)} -to ${end.toFixed(3)} -i "${inputPath}" -c:a aac -b:a 128k "${outputPath}"`,
        { stdio: 'pipe' }
    );
    return start; // clipStart (for timepoint adjustment)
}

// Build adjusted timepoints relative to clip start
function adjustTimepoints(tpData, clipStart) {
    const result = {};
    for (const [wp, timing] of Object.entries(tpData)) {
        if (!timing.main) continue;
        result[wp] = {
            start: parseFloat((timing.main.start - clipStart).toFixed(3)),
            end:   parseFloat((timing.main.end   - clipStart).toFixed(3))
        };
    }
    return result;
}

// ── Main ───────────────────────────────────────────────────────────────────────
console.log(`Importing ${textPath} sentences ${startSent}–${endSent} → lesson "${lessonId}"\n`);

const existingSnap = await db.collection('lessons').doc(lessonId).get();
if (existingSnap.exists && !FORCE && !SKIP_VOCAB_AUDIO) {
    console.log(`Lesson "${lessonId}" already exists. Use --force to reimport, or --skip-vocab-audio to re-import without regenerating word audio.`);
    process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sturbridge-import-'));

const dictEntryMap = new Map(); // dictEntry → { shortDef, definition, parsedMorph, strong }
const wordFormsMap = {};

const sentences = [];
let lessonNum = 0;

for (let sn = startSent; sn <= endSent; sn++) {
    const sentData   = allSentences[sn];
    const heTpData   = heTimepoints[sn];
    const enTpData   = enTimepoints[sn];
    const heAudioPath = heSegmentMap[sn];
    const enAudioPath = enSegmentMap[sn];

    if (!sentData)    { console.warn(`  Sentence ${sn}: not in content JSON, skipping.`); continue; }
    if (!heTpData)    { console.warn(`  Sentence ${sn}: no Hebrew timepoints, skipping.`); continue; }
    if (!heAudioPath) { console.warn(`  Sentence ${sn}: no Hebrew audio segment, skipping.`); continue; }

    process.stdout.write(`  Sentence ${sn}... `);

    // Hebrew audio bounds
    const heWordTimes = Object.values(heTpData).map(w => w.main).filter(Boolean);
    if (heWordTimes.length === 0) { console.log('no Hebrew word timepoints, skipping.'); continue; }
    const heSentStart = Math.min(...heWordTimes.map(w => w.start));
    const heSentEnd   = Math.max(...heWordTimes.map(w => w.end));

    // Clip Hebrew
    const heOut      = path.join(tmpDir, `sent-${sn}-he.m4a`);
    const heClipStart = clipAudio(heAudioPath, heSentStart, heSentEnd, heOut, 0.1, 0.15);
    const heUrl       = await uploadFile(
        `hebrew/lessons/${lessonId}/sentence-${lessonNum}-he.m4a`,
        fs.readFileSync(heOut), 'audio/mp4'
    );
    const heAdjusted = adjustTimepoints(heTpData, heClipStart);

    // English audio (clip if available, skip otherwise)
    let enUrl = null;
    let enAdjusted = {};
    if (enTpData && enAudioPath) {
        const enWordTimes = Object.values(enTpData).map(w => w.main).filter(Boolean);
        if (enWordTimes.length > 0) {
            const enSentStart = Math.min(...enWordTimes.map(w => w.start));
            const enSentEnd   = Math.max(...enWordTimes.map(w => w.end));
            const enOut       = path.join(tmpDir, `sent-${sn}-en.m4a`);
            const enClipStart = clipAudio(enAudioPath, enSentStart, enSentEnd, enOut, 0.4, 0.15);
            enUrl = await uploadFile(
                `hebrew/lessons/${lessonId}/sentence-${lessonNum}-en.m4a`,
                fs.readFileSync(enOut), 'audio/mp4'
            );
            enAdjusted = adjustTimepoints(enTpData, enClipStart);
        }
    }

    // Build word objects
    const words = sentData.words.map(w => {
        const parsedMorph = parseMorph(w.morph);
        const paradigmKey = assignParadigmKey(parsedMorph);
        if (w.dictEntry) {
            if (!dictEntryMap.has(w.dictEntry)) {
                dictEntryMap.set(w.dictEntry, {
                    shortDef:    w.shortDef   ?? null,
                    definition:  w.definition ?? null,
                    parsedMorph,
                    strong:      w.strong     ?? null,
                });
            }
            const wfEntry = {
                dictEntry:   w.dictEntry,
                shortDef:    w.shortDef   ?? null,
                definition:  w.definition ?? null,
                morph:       parsedMorph,
                vocabTier:   null,
                paradigmKey,
                standard_refs: []
            };
            wordFormsMap[w.text] = wfEntry;
            const bare = stripNikud(w.text);
            if (bare !== w.text) wordFormsMap[bare] = wfEntry;
        }
        return {
            sentPos:     w.sentPos,
            text:        w.text,
            text2:       w.text2 ?? stripNikud(w.text),
            dictEntry:   w.dictEntry  ?? null,
            shortDef:    w.shortDef   ?? null,
            definition:  w.definition ?? null,
            morph:       parsedMorph,
            paradigmKey,
            strong:      w.strong     ?? null,
            engSentPos:  w.engSentPos ?? null,
        };
    });

    sentences.push({
        num:               lessonNum,
        hebrew:            sentData.sentence ?? '',
        english:           sentData.translation ?? '',
        words,
        hebrew_audio_url:  heUrl,
        english_audio_url: enUrl,
        timepoints: {
            hebrew:  heAdjusted,
            english: enAdjusted
        }
    });

    lessonNum++;
    console.log(`✓ he(${heSentStart.toFixed(2)}–${heSentEnd.toFixed(2)}s)${enUrl ? ' en✓' : ''}`);
}

// ── Generate per-dictEntry word audio (Hebrew TTS for flashcards) ──────────────
if (SKIP_VOCAB_AUDIO) {
    console.log(`\n── Skipping vocab audio (--skip-vocab-audio) — reusing existing URLs for ${dictEntryMap.size} words ──\n`);
} else {
    console.log(`\n── Generating word audio for ${dictEntryMap.size} unique words ──\n`);
    if (!AZURE_KEY) console.warn('  AZURE_API_KEY not set — skipping word audio generation');
}

const vocabList = [];
for (const [dictEntry, info] of dictEntryMap.entries()) {
    const slug        = dictEntrySlug(dictEntry);
    const storagePath = `hebrew/vocab/${slug}.mp3`;
    // Deterministic URL — valid whether we upload now or already uploaded previously
    let audioUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    if (!SKIP_VOCAB_AUDIO) {
        process.stdout.write(`  ${dictEntry}... `);
        if (AZURE_KEY) {
            try {
                const file = bucket.file(storagePath);
                const [exists] = await file.exists();
                if (!exists || FORCE) {
                    const buf = await azureTts(dictEntry, HE_VOICE, 'he-IL');
                    await uploadFile(storagePath, buf, 'audio/mpeg');
                }
                console.log('✓');
            } catch (e) {
                console.log(`✗ (${e.message})`);
                audioUrl = null;
            }
        } else {
            console.log('skipped (no Azure key)');
            audioUrl = null;
        }
    }

    vocabList.push({ dictEntry, shortDef: info.shortDef, definition: info.definition ?? null, vocabTier: null, audioUrl });

    // Backfill audioUrl into word objects
    for (const sent of sentences) {
        for (const word of sent.words) {
            if (word.dictEntry === dictEntry) word.audioUrl = audioUrl;
        }
    }
}

// ── Update word_forms.json ─────────────────────────────────────────────────────
console.log('\n── Updating word_forms.json ──\n');
const existingWF = fs.existsSync(WF_PATH) ? JSON.parse(fs.readFileSync(WF_PATH, 'utf8')) : {};
let wfAdded = 0, wfUpdated = 0;
for (const [form, entry] of Object.entries(wordFormsMap)) {
    if (!existingWF[form]) {
        existingWF[form] = entry;
        wfAdded++;
    } else {
        // Update shortDef/definition in case they changed (e.g. after lexicon regeneration)
        existingWF[form].shortDef   = entry.shortDef;
        existingWF[form].definition = entry.definition;
        wfUpdated++;
    }
}
fs.writeFileSync(WF_PATH, JSON.stringify(existingWF), 'utf8');
console.log(`  Added ${wfAdded} new, updated ${wfUpdated} existing forms (${Object.keys(existingWF).length} total)`);

// ── Write Firestore lesson ─────────────────────────────────────────────────────
console.log('\n── Writing Firestore lesson ──\n');

await db.collection('lessons').doc(lessonId).set({
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
});
console.log(`  ✓ lessons/${lessonId}`);

// ── Cleanup ────────────────────────────────────────────────────────────────────
fs.rmSync(tmpDir, { recursive: true });
console.log(`\n✓ Done. Lesson "${lessonId}" imported with ${sentences.length} sentences.\n`);

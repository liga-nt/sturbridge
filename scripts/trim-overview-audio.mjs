/**
 * Trims 2 seconds from the chapter 1 overview audio and adjusts alignment timestamps.
 *
 * Steps:
 *   1. Find chapter 1 lesson in Firestore
 *   2. Download overview audio, trim first 2s with ffmpeg, re-upload to same Storage path
 *   3. Subtract 2s from all alignment timestamps, re-save to Firestore
 *
 * Usage: node scripts/trim-overview-audio.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'sturbridge-e59d9.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const TRIM_SECONDS = 2.0;
const COURSE_ID = 'grade7-greek';

// ── 1. Find chapter 1 lesson ──────────────────────────────────────────────────
const snap = await db.collection('lessons')
  .where('courseId', '==', COURSE_ID)
  .where('chapter', '==', 1)
  .limit(1)
  .get();

if (snap.empty) { console.error('No chapter 1 lesson found.'); process.exit(1); }
const lessonDoc = snap.docs[0];
const lessonId = lessonDoc.id;
const lesson = lessonDoc.data();
const audioUrl = lesson.overview?.audioUrl;
const alignment = lesson.overview?.alignment ?? [];

if (!audioUrl) { console.error('No overview.audioUrl on lesson', lessonId); process.exit(1); }
if (!alignment.length) { console.error('No overview.alignment on lesson', lessonId); process.exit(1); }

console.log(`Lesson: ${lessonId} — "${lesson.title}"`);
console.log(`Audio URL: ${audioUrl}`);
console.log(`Alignment words: ${alignment.length}, first word start: ${alignment[0].start}s`);

// ── 2. Download audio ─────────────────────────────────────────────────────────
console.log('\nDownloading audio...');
const audioResp = await fetch(audioUrl);
if (!audioResp.ok) { console.error('Download failed:', audioResp.status); process.exit(1); }
const originalBuf = Buffer.from(await audioResp.arrayBuffer());

const tmpOriginal = join(tmpdir(), 'overview_original.mp3');
const tmpTrimmed  = join(tmpdir(), 'overview_trimmed.mp3');
writeFileSync(tmpOriginal, originalBuf);
console.log(`Downloaded ${originalBuf.length} bytes`);

// ── 3. Trim with ffmpeg ───────────────────────────────────────────────────────
console.log(`Trimming first ${TRIM_SECONDS}s...`);
execSync(`ffmpeg -y -i "${tmpOriginal}" -ss ${TRIM_SECONDS} -c copy "${tmpTrimmed}"`, { stdio: 'inherit' });
const trimmedBuf = readFileSync(tmpTrimmed);
console.log(`Trimmed file: ${trimmedBuf.length} bytes`);

// ── 4. Re-upload to same Storage path ────────────────────────────────────────
// Extract path from URL: .../o/greek%2Flessons%2F...%2F...
const urlPath = decodeURIComponent(new URL(audioUrl).pathname.replace(/^\/[^/]+\//, ''));
console.log(`\nUploading to: ${urlPath}`);
const file = bucket.file(urlPath);
await file.save(trimmedBuf, { contentType: 'audio/mpeg', metadata: { cacheControl: 'no-cache, no-store' } });
await file.makePublic();
const newUrl = `https://storage.googleapis.com/${bucket.name}/${urlPath}?v=${Date.now()}`;
console.log(`Uploaded: ${newUrl}`);

// ── 5. Adjust alignment timestamps ───────────────────────────────────────────
const newAlignment = alignment
  .map(({ word, start, end }) => ({
    word,
    start: Math.max(0, Math.round((start - TRIM_SECONDS) * 1000) / 1000),
    end:   Math.max(0, Math.round((end   - TRIM_SECONDS) * 1000) / 1000)
  }))
  .filter(({ end }) => end > 0);

console.log(`\nAlignment: ${alignment.length} → ${newAlignment.length} words`);
console.log(`First word: "${newAlignment[0].word}" at ${newAlignment[0].start}s`);

// ── 6. Save to Firestore ──────────────────────────────────────────────────────
await db.collection('lessons').doc(lessonId).update({
  'overview.audioUrl':   newUrl,
  'overview.alignment':  newAlignment,
  'overview.videoStartOffset': 0,
  updatedAt: admin.firestore.Timestamp.now()
});
console.log('\nFirestore updated.');

// Cleanup
unlinkSync(tmpOriginal);
unlinkSync(tmpTrimmed);
console.log('Done.');

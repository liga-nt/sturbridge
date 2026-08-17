/**
 * Synthesizes and caches ElevenLabs TTS audio (with word-level alignment) for
 * every spoken field of every variant in an item's pregenerated pool.
 *
 * Reads from the PERSISTED pool written by pregenerate-pool.mjs (not fresh
 * generate() calls) — this guarantees every variant that can ever actually be
 * served for a piloted item already has audio, with zero cache-miss risk.
 *
 * Each complete rendered sentence (post-{{placeholder}}-fill) is synthesized
 * as one whole TTS call — never a pre-recorded carrier phrase spliced with a
 * separately-synthesized number, which would sound robotic and make
 * word-level alignment fragile. Cached by content hash of the exact text, so
 * repeated boilerplate across variants/items still dedupes for free — the
 * full task list is deduped by hash up front, so identical text anywhere in
 * the batch (even across different items/fields) is only ever synthesized
 * once, regardless of concurrency.
 *
 * Run pregenerate-variants.mjs and pregenerate-pool.mjs first.
 *
 * Usage:
 *   node --env-file=.env scripts/pregenerate-audio.mjs --items=MA227383,MA247745,MA713939739
 *   node --env-file=.env scripts/pregenerate-audio.mjs               # every templated item
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { createHash } from 'crypto';
import { renderSpokenFields } from '../src/lib/utils/feedbackTemplates.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'sturbridge-e59d9.firebasestorage.app',
});
const db = admin.firestore();

const VOICE_ID = 'VjfnlXZ0T79W9G6QHcUg';
const MODEL_ID = 'eleven_v3';
const TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`;

// Matches the CONCURRENCY=3 already used for ElevenLabs elsewhere in this
// codebase (gen-hebrew-audio.mjs, gen-greek-audio.mjs) — Azure-based scripts
// here use 4-5, but ElevenLabs specifically has proven to want a lower cap.
const CONCURRENCY = 3;

const args = process.argv.slice(2);
const targetItems = args.find(a => a.startsWith('--items='))?.split('=')[1].split(',') ?? null;

function contentHash(text) {
  return createHash('sha1').update(`${VOICE_ID}::${text}`).digest('hex').slice(0, 12);
}

function classify(fieldKey) {
  const bare = fieldKey.replace(/^[A-Z]_/, '');
  return (bare === 'tip1' || bare === 'tip2' || bare === 'reveal') ? 'tip' : 'problem';
}

async function uploadAudio(storagePath, audioBuffer) {
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  await file.save(audioBuffer, { contentType: 'audio/mpeg' });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

async function synthesize(text) {
  const elevenKey = process.env.ELEVEN_LABS_API_KEY;
  if (!elevenKey) throw new Error('ELEVEN_LABS_API_KEY not set in .env');

  const resp = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.8, similarity_boost: 0.7, style: 0.3 },
    }),
  });
  if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return { audioBuffer: Buffer.from(data.audio_base64, 'base64'), alignment: data.alignment };
}

// One task per unique hash — item_id/fieldKey on the stored doc are just the
// first occurrence encountered, for debugging; the doc is looked up by hash
// alone at render time, so which field "owns" it doesn't matter functionally.
async function processTask({ hash, text, item_id, fieldKey }, stats) {
  const ref = db.collection('audioSegments').doc(hash);
  const existing = await ref.get();
  if (existing.exists) {
    stats.cached++;
    return;
  }

  const { audioBuffer, alignment } = await synthesize(text);
  const url = await uploadAudio(`mcas/audio/${hash}.mp3`, audioBuffer);

  await ref.set({
    text,
    url,
    storagePath: `mcas/audio/${hash}.mp3`,
    alignment,
    voice: VOICE_ID,
    model: MODEL_ID,
    itemId: item_id,
    fieldKey,
    createdAt: admin.firestore.Timestamp.now(),
  });

  stats.synthesized++;
  const kind = classify(fieldKey);
  stats[kind]++;
  console.log(`  [synthesized] ${item_id} ${fieldKey} (${hash})  →  ${url}`);
}

async function runPool(tasks, limit, stats) {
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      const task = tasks[idx];
      try {
        await processTask(task, stats);
      } catch (e) {
        stats.failed++;
        console.error(`  ✗ FAILED ${task.item_id} ${task.fieldKey} (${task.hash}): ${e.message}`);
      }
      if ((stats.synthesized + stats.cached + stats.failed) % 25 === 0) {
        console.log(`  … progress: ${stats.synthesized} synthesized, ${stats.cached} cache hit, ${stats.failed} failed / ${tasks.length} total`);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

async function buildTaskList(items) {
  const seen = new Map(); // hash -> task, dedupes identical text across the whole batch
  for (const item_id of items) {
    const templateSnap = await db.collection('questionTemplates').doc(item_id).get();
    if (!templateSnap.exists) {
      console.error(`  ✗ no questionTemplates/${item_id} — run pregenerate-variants.mjs first. Skipping.`);
      continue;
    }
    const template = templateSnap.data();

    const poolSnap = await db.collection('questionVariants').where('item_id', '==', item_id).get();
    if (poolSnap.empty) {
      console.error(`  ✗ no questionVariants for ${item_id} — run pregenerate-pool.mjs first. Skipping.`);
      continue;
    }

    for (const variantDoc of poolSnap.docs) {
      const variant = JSON.parse(variantDoc.data().data);
      const fields = renderSpokenFields(variant, template);
      for (const { fieldKey, text } of fields) {
        const hash = contentHash(text);
        if (!seen.has(hash)) seen.set(hash, { hash, text, item_id, fieldKey });
      }
    }
  }
  return [...seen.values()];
}

async function main() {
  let items = targetItems;
  if (!items) {
    const snap = await db.collection('questionTemplates').get();
    items = snap.docs.map(d => d.id);
  }

  console.log(`Building task list across ${items.length} item(s)...`);
  const tasks = await buildTaskList(items);
  console.log(`${tasks.length} unique text segments in scope (deduped by content hash).\n`);

  const stats = { synthesized: 0, cached: 0, failed: 0, tip: 0, problem: 0 };
  await runPool(tasks, CONCURRENCY, stats);

  console.log('\n✓ Done.');
  console.log(`  Synthesized: ${stats.synthesized} (tip: ${stats.tip}, problem: ${stats.problem})`);
  console.log(`  Cache hits:  ${stats.cached}`);
  console.log(`  Failed:      ${stats.failed}`);
  process.exit(stats.failed > 0 ? 1 : 0);
}

// Guarded so importing this module can never trigger a live run against
// production — only running the file directly does.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}

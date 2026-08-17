/**
 * Pregenerates a bounded pool of N concrete question variants per item and
 * persists them to Firestore in the (flat) questionVariants collection —
 * doc id `${item_id}_${n}`, with item_id stored as a field for querying.
 * This matches the questionVariants/{variantId} rule that already exists in
 * firestore.rules (a flat collection, not a per-item subcollection), which
 * was already scaffolded ahead of this system being built.
 *
 * This is what makes aligned audio (and, later, teacher "flip through") work:
 * every variant a student or teacher can ever be served for a piloted item
 * comes from this fixed pool, so every variant is guaranteed to already have
 * audio pregenerated (see pregenerate-audio.mjs, which reads from this pool).
 *
 * Run this BEFORE pregenerate-audio.mjs. Items not present in this pool are
 * unaffected — src/lib/utils/variantPool.js falls back to live generate()
 * for any item with no pool, exactly like before this system existed.
 *
 * Usage:
 *   node --env-file=.env scripts/pregenerate-pool.mjs --items=MA227383,MA247745 --pool-size=5
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { generate } from '../src/lib/utils/generators.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const args = process.argv.slice(2);
const targetItems = args.find(a => a.startsWith('--items='))?.split('=')[1].split(',') ?? null;
const poolSize = Number(args.find(a => a.startsWith('--pool-size='))?.split('=')[1] ?? 5);
const MAX_RETRIES_PER_VARIANT = 20;

// Strips undefined values (Firestore's JS SDK rejects them) and any other
// non-JSON-safe values a generator might produce.
function sanitize(variant) {
  return JSON.parse(JSON.stringify(variant));
}

async function buildPoolForItem(item_id) {
  const seen = new Set();
  const pool = [];

  while (pool.length < poolSize) {
    let variant = null;
    for (let attempt = 0; attempt < MAX_RETRIES_PER_VARIANT; attempt++) {
      const candidate = generate(item_id);
      if (!candidate) { variant = null; break; }
      const key = JSON.stringify(candidate);
      if (!seen.has(key)) {
        seen.add(key);
        variant = candidate;
        break;
      }
    }
    if (!variant) {
      console.warn(`  ⚠ ${item_id}: stopped at ${pool.length}/${poolSize} distinct variants (generator space too narrow, or no generator)`);
      break;
    }
    pool.push(sanitize({ ...variant, item_id }));
  }

  return pool;
}

// Variants are stored as a single JSON string field rather than spread across
// native Firestore fields — some generators produce nested arrays (e.g.
// stimulus_params.rows: [[..],[..]]), which Firestore rejects when written as
// real nested fields ("invalid nested entity"). Only item_id/poolIndex need
// to be real fields (for the item_id query); everything else round-trips
// through JSON.parse on read.
async function writePool(item_id, pool) {
  const batch = db.batch();
  for (let i = 0; i < pool.length; i++) {
    const ref = db.collection('questionVariants').doc(`${item_id}_${i}`);
    batch.set(ref, { item_id, poolIndex: i, data: JSON.stringify(pool[i]), createdAt: admin.firestore.Timestamp.now() });
  }
  await batch.commit();
}

// Deletes any existing pool docs for this item before writing a fresh set —
// otherwise re-running with a different --pool-size (or just re-rolling)
// leaves stale, audio-less leftovers behind (e.g. shrinking 6→5 would strand
// the old index-5 doc, which still matches the item_id query at runtime).
async function clearExistingPool(item_id) {
  const snap = await db.collection('questionVariants').where('item_id', '==', item_id).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`  cleared ${snap.size} existing variant(s)`);
}

async function main() {
  if (!targetItems) {
    console.error('Error: --items= is required (this script is scoped to explicit items, not the full corpus).');
    process.exit(1);
  }

  console.log(`Building a pool of ${poolSize} variant(s) for ${targetItems.length} item(s)...\n`);

  for (const item_id of targetItems) {
    console.log(`${item_id}`);
    await clearExistingPool(item_id);
    const pool = await buildPoolForItem(item_id);
    if (pool.length === 0) {
      console.warn(`  ⚠ no variants generated — skipping write\n`);
      continue;
    }
    await writePool(item_id, pool);
    console.log(`  ✓ wrote ${pool.length} variant(s) to questionVariants (item_id=${item_id})\n`);
  }

  console.log('✓ Done.');
  process.exit(0);
}

// Guarded so importing this module can never trigger a live run against
// production — only running the file directly does.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}

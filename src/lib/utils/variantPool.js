/**
 * Single picker for "give me a question variant for this item_id" — the one
 * function that should be called instead of generate() directly, everywhere
 * a new variant is minted (teacher preview, quiz regeneration, student
 * practice, dev preview).
 *
 * If a bounded pool exists for the item (questionVariants collection, docs
 * with item_id == item_id, populated by scripts/pregenerate-pool.mjs), picks
 * a random member of it —
 * this guarantees the variant already has a matching questionTemplates doc
 * and pregenerated audio (scripts/pregenerate-audio.mjs). If no pool exists
 * yet (the vast majority of items, not yet piloted), falls back to live
 * generate() exactly as before this system existed — fully non-breaking.
 */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { generate } from './generators.js';

/**
 * Returns a question variant for item_id — from the pool if one exists, else
 * live-generated. Pooled variants carry `_variantId` (the questionVariants
 * doc id) so a reviewer can reference exactly which variant they looked at;
 * live-generated ones have none since there's no stable doc backing them.
 */
export async function pickVariant(item_id) {
  const poolQuery = query(collection(db, 'questionVariants'), where('item_id', '==', item_id));
  const snap = await getDocs(poolQuery);
  if (!snap.empty) {
    const docs = snap.docs;
    const chosen = docs[Math.floor(Math.random() * docs.length)];
    return { ...JSON.parse(chosen.data().data), item_id, _variantId: chosen.id };
  }

  const variant = generate(item_id);
  return variant ? { ...variant, item_id } : null;
}

/**
 * Shared feedback utilities: template filling + per-item param extraction.
 *
 * EXTRACTORS mirrors the EXTRACTORS map in scripts/pregenerate-variants.mjs.
 * When adding a new item, add its extractor to BOTH files.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase/client';

// ── Template substitution ─────────────────────────────────────────────────────

export function fillTemplate(template, params) {
  if (!template) return null;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? `{{${key}}}`);
}

// ── Per-item param extractors ─────────────────────────────────────────────────
// Each fn takes a generated variant and returns a flat { key: value } map.
// Keys match the {{placeholder}} names used in the stored templates.

const EXTRACTORS = {

  'MA227383': (v) => ({
    personName:    v.stimulus_intro?.split(' ')[0] ?? '',
    numbers:       v.stimulus_params?.rows?.flat().join(', ') ?? '',
    correctLetter: v.correct_answer ?? '',
    correctValue:  v.answer_options?.find(o => o.letter === v.correct_answer)?.text ?? '',
    optionValues:  v.answer_options?.map(o => o.text).join(', ') ?? '',
    wrongValues:   v.answer_options?.filter(o => o.letter !== v.correct_answer).map(o => o.text).join(', ') ?? '',
  }),

};

/** Returns filled params for a variant, or {} if no extractor is registered. */
export function extractParams(variant) {
  if (!variant) return {};
  const fn = EXTRACTORS[variant.item_id];
  return fn ? fn(variant) : {};
}

// ── Firestore loader ──────────────────────────────────────────────────────────

/** Loads the feedback template doc from questionTemplates/{item_id}. Returns null if missing. */
export async function loadFeedbackTemplate(item_id) {
  try {
    const snap = await getDoc(doc(db, 'questionTemplates', item_id));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error('loadFeedbackTemplate:', e);
    return null;
  }
}

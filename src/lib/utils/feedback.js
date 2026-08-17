/**
 * Firestore-dependent half of the teaching-prompts feedback system. The pure
 * template-filling/param-extraction logic lives in feedbackTemplates.js (the
 * single source of truth shared with scripts/pregenerate-variants.mjs) — this
 * file just re-exports it so existing imports keep working, and adds the one
 * piece that genuinely can't be shared with a Node script: the Firestore load.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { renderForSpeech } from './feedbackTemplates.js';

export { fillTemplate, extractParams, renderForSpeech } from './feedbackTemplates.js';

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

// ── Pregenerated audio lookup (scripts/pregenerate-audio.mjs) ─────────────────
// Single definition of "given this spoken text, find its cached clip" — must
// hash the EXACT text renderSpokenFields/pregenerate-audio.mjs synthesized
// (voice id + renderForSpeech'd text) or the lookup silently misses. Was
// previously duplicated per-component (MultiPart.svelte, dev/preview); kept
// here once so every caller stays byte-identical with the generation script.
const AUDIO_VOICE_ID = 'VjfnlXZ0T79W9G6QHcUg';

async function audioContentHash(text) {
  const data = new TextEncoder().encode(`${AUDIO_VOICE_ID}::${text}`);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

/** Looks up { url, alignment } for the pregenerated audio matching this text, or null if none exists. */
export async function findAudioSegment(text) {
  if (!text) return null;
  try {
    const hash = await audioContentHash(renderForSpeech(text));
    const snap = await getDoc(doc(db, 'audioSegments', hash));
    return snap.exists() ? { url: snap.data().url, alignment: snap.data().alignment } : null;
  } catch (e) {
    console.error('findAudioSegment:', e);
    return null;
  }
}

/** Looks up just the pregenerated audio URL for this text, or null if none exists. */
export async function findAudioUrl(text) {
  const seg = await findAudioSegment(text);
  return seg?.url ?? null;
}

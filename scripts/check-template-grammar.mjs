/**
 * Grammar-only QA pass over questionTemplates/{item_id} docs. Unlike the
 * correctness/leakage judge in pregenerate-variants.mjs, this only exists to
 * catch placeholder/word-form mismatches that are invisible in the raw
 * template (e.g. "Every {{container}}" where {{container}} always resolves
 * to a plural like "sheets") — they only show up once a real generated
 * variant fills the placeholders in. So for each item: generate one sample
 * variant, fill tip1/tip2/reveal (or each part) with its real params exactly
 * like a student would see, and send ONLY that filled text to a cheap model
 * for a narrow grammar check. Read-only — prints a report, fixes nothing.
 *
 * Usage:
 *   node --env-file=.env scripts/check-template-grammar.mjs
 *   node --env-file=.env scripts/check-template-grammar.mjs --items=MA900751683
 */

import admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'module';
import { generate } from '../src/lib/utils/generators.js';
import { extractParams, fillTemplate } from '../src/lib/utils/feedbackTemplates.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const anthropic = new Anthropic();

const MODEL = 'claude-haiku-4-5-20251001';

const args = process.argv.slice(2);
const targetItems = args.find(a => a.startsWith('--items='))?.split('=')[1].split(',') ?? null;

function extractText(response) {
  const block = response.content.find(b => b.type === 'text');
  if (!block) throw new Error(`No text block (stop_reason: ${response.stop_reason})`);
  return block.text.trim();
}

function buildFilledText(sample, template, isMultiPart) {
  const params = extractParams(sample);
  if (isMultiPart) {
    return sample.parts.map(p => {
      const pt = template.parts?.[p.label];
      if (!pt) return null;
      return `Part ${p.label}:\ntip1: ${fillTemplate(pt.tip1, params)}\ntip2: ${fillTemplate(pt.tip2, params)}\nreveal: ${fillTemplate(pt.reveal, params)}`;
    }).filter(Boolean).join('\n\n');
  }
  return `tip1: ${fillTemplate(template.tip1, params)}\ntip2: ${fillTemplate(template.tip2, params)}\nreveal: ${fillTemplate(template.reveal, params)}`;
}

async function checkGrammar(filledText) {
  const prompt = `Proofread the following text for a 4th-grade math app. Flag ONLY clear grammatical errors — subject-verb agreement, determiner/noun mismatches (e.g. "every sheets", "each envelopes"), missing/wrong plurals, wrong verb tense, missing words. Do NOT flag style, tone, word choice, or math content.

---
${filledText}
---

Respond with ONLY a JSON object: {"errors": ["quote the exact broken phrase — fix"]}
"errors" must be an empty array if there are no grammatical errors.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = extractText(response);
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    try {
      return JSON.parse(stripped);
    } catch {
      // Model sometimes appends trailing commentary after the JSON object —
      // take the substring between the first { and its matching last }.
      const start = stripped.indexOf('{');
      const end = stripped.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error(`No JSON object found: ${stripped}`);
      return JSON.parse(stripped.slice(start, end + 1));
    }
  }
}

async function main() {
  const snap = await db.collection('questionTemplates').get();
  const docs = snap.docs.filter(d => !targetItems || targetItems.includes(d.id));
  console.log(`Checking ${docs.length} template(s)...\n`);

  const flagged = [];
  const skipped = [];

  for (const d of docs) {
    const item_id = d.id;
    const template = d.data();
    const sample = generate(item_id);
    if (!sample) {
      skipped.push(item_id);
      continue;
    }
    const isMultiPart = sample.answer_type === 'multi_part' && Array.isArray(sample.parts);
    const filledText = buildFilledText(sample, template, isMultiPart);
    if (!filledText.trim()) {
      skipped.push(item_id);
      continue;
    }

    try {
      const result = await checkGrammar(filledText);
      if (result.errors?.length) {
        flagged.push({ item_id, errors: result.errors, filledText });
        console.log(`✗ ${item_id}`);
        result.errors.forEach(e => console.log(`    - ${e}`));
      } else {
        console.log(`✓ ${item_id}`);
      }
    } catch (e) {
      console.log(`! ${item_id} — check failed: ${e.message}`);
      skipped.push(item_id);
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${flagged.length} item(s) flagged, ${skipped.length} skipped (no generator or empty), ${docs.length - flagged.length - skipped.length} clean.`);
  if (skipped.length) console.log(`Skipped: ${skipped.join(', ')}`);
  if (flagged.length) {
    console.log(`\nFlagged: ${flagged.map(f => f.item_id).join(', ')}`);
  }

  process.exit(0);
}

main();

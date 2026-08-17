/**
 * Tier-1 validation: for every generator-backed item, sample generate()
 * several times and run the result through extractParams() — checking that
 * extraction produces sane, non-empty, unmangled output. Pure function calls
 * only, no LLM/API cost — this is meant to run BEFORE spending any Anthropic
 * or ElevenLabs budget on an item, surfacing which ones need a variant._params
 * addition to their generator (or, rarely, a hand-written EXTRACTORS
 * override) before pregenerate-variants.mjs is worth running on them.
 *
 * Usage:
 *   node scripts/validate-extractors.mjs [--items=MA227383,MA247745] [--samples=5]
 */

import { generators } from '../src/lib/utils/generators.js';
import { extractParams } from '../src/lib/utils/feedbackTemplates.js';

const args = process.argv.slice(2);
const targetItems = args.find(a => a.startsWith('--items='))?.split('=')[1].split(',') ?? null;
const samples = Number(args.find(a => a.startsWith('--samples='))?.split('=')[1] ?? 5);

const SUSPICIOUS_PATTERNS = [
  /\[\d+\/\d+\]/,     // unstripped [n/d] fraction notation
  /\{?\?\}/,           // unstripped {?} blank marker
  /<[^>]+>/,           // stray HTML
  /\bundefined\b/,     // bad property access
  /\bNaN\b/,           // bad arithmetic
  /\[object Object\]/, // stringified object instead of a real value
];

function checkValue(key, value, issues) {
  if (typeof value !== 'string') {
    issues.push(`${key}: non-string value (${typeof value})`);
    return;
  }
  if (value === '') {
    issues.push(`${key}: empty string`);
    return;
  }
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(value)) {
      issues.push(`${key}: matches ${pattern} — "${value.slice(0, 60)}"`);
    }
  }
}

function validateItem(item_id, genFn) {
  const results = { item_id, answer_type: null, samples: 0, emptyCount: 0, issueSet: new Set() };

  for (let i = 0; i < samples; i++) {
    const variant = genFn();
    if (!variant) continue;
    results.samples++;
    results.answer_type = variant.answer_type;

    const params = extractParams({ ...variant, item_id });
    const keys = Object.keys(params);
    if (keys.length === 0) {
      results.emptyCount++;
      continue;
    }
    const issues = [];
    for (const [k, v] of Object.entries(params)) checkValue(k, v, issues);
    issues.forEach(iss => results.issueSet.add(iss));
  }

  return results;
}

function classify(r) {
  if (r.samples === 0) return 'NO_SAMPLES';
  if (r.emptyCount === r.samples) return 'NEEDS_PARAMS'; // always empty — no extraction coverage at all
  if (r.issueSet.size > 0) return 'SUSPICIOUS';
  if (r.emptyCount > 0) return 'PARTIAL'; // empty on SOME samples but not others — worth a look
  return 'OK';
}

function main() {
  const itemIds = targetItems ?? Object.keys(generators);
  console.log(`Validating extraction for ${itemIds.length} item(s), ${samples} sample(s) each...\n`);

  const byStatus = { OK: [], NEEDS_PARAMS: [], SUSPICIOUS: [], PARTIAL: [], NO_SAMPLES: [] };

  for (const item_id of itemIds) {
    const genFn = generators[item_id];
    if (!genFn) { console.warn(`${item_id}: no generator — skipping`); continue; }
    const r = validateItem(item_id, genFn);
    const status = classify(r);
    byStatus[status].push({ ...r, status });
  }

  for (const status of ['OK', 'PARTIAL', 'SUSPICIOUS', 'NEEDS_PARAMS', 'NO_SAMPLES']) {
    const items = byStatus[status];
    console.log(`\n=== ${status} (${items.length}) ===`);
    for (const r of items) {
      if (status === 'OK') {
        console.log(`  ${r.item_id} [${r.answer_type}]`);
      } else {
        console.log(`  ${r.item_id} [${r.answer_type}] — empty ${r.emptyCount}/${r.samples}` +
          (r.issueSet.size ? `, issues: ${[...r.issueSet].join(' | ')}` : ''));
      }
    }
  }

  console.log(`\n--- Summary ---`);
  for (const status of Object.keys(byStatus)) {
    console.log(`${status}: ${byStatus[status].length}`);
  }
}

main();

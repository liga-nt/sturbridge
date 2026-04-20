#!/usr/bin/env node
/**
 * gen-persian-combos.mjs
 *
 * Generates static/data/Persian/combos.json from alphabet.json.
 *
 * 2-letter (800): all 25 connectors × 32 letters
 *   - connector A  → initial form
 *   - any B        → final form (connector) or final form (non-connector)
 *
 * 3-letter (25): one per connector in medial position
 *   - bracket + target + bracket  (brackets are connectors ≠ target)
 *   - shows target in medial form, brackets in initial / final
 *
 * Total: 825 combos
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

const alphabet = JSON.parse(
    readFileSync(join(ROOT, 'static/data/Persian/alphabet.json'), 'utf8')
);

// These 7 letters only connect on their right — they break the chain on their left.
const NON_CONNECTORS = new Set(['ا', 'د', 'ذ', 'ر', 'ز', 'ژ', 'و']);

const connectors = alphabet.filter(l => !NON_CONNECTORS.has(l.char));  // 25
const all        = alphabet;                                            // 32

const combos = [];
let seq = 1;
const id = n => 'c' + String(n).padStart(4, '0');

// ── 2-letter connected pairs ──────────────────────────────────────────────
// Sorted by connector order, then by full alphabet order within each connector.
for (const a of connectors) {
    for (const b of all) {
        combos.push({ id: id(seq++), text: a.char + b.char, length: 2, audio_url: '' });
    }
}

// ── 3-letter medial combos ────────────────────────────────────────────────
// Default brackets: ب (right, initial) and ن (left, final).
// Fall back when target equals a default bracket.
const FALLBACKS = ['ت', 'پ', 'س', 'ک', 'ل', 'م'];

function bracket(avoid, preferred) {
    if (preferred.char !== avoid.char) return preferred;
    return alphabet.find(l => FALLBACKS.includes(l.char) && l.char !== avoid.char);
}

const bRight = alphabet.find(l => l.char === 'ب');  // default right bracket
const bLeft  = alphabet.find(l => l.char === 'ن');  // default left bracket

for (const target of connectors) {
    const r = bracket(target, bRight);
    const l = bracket(target, bLeft);
    // String order = typing order = rightmost first: r · target · l
    combos.push({ id: id(seq++), text: r.char + target.char + l.char, length: 3, audio_url: '' });
}

writeFileSync(
    join(ROOT, 'static/data/Persian/combos.json'),
    JSON.stringify(combos, null, 2)
);

const n2 = combos.filter(c => c.length === 2).length;
const n3 = combos.filter(c => c.length === 3).length;
console.log(`Wrote ${combos.length} combos  (${n2} two-letter, ${n3} three-letter)`);

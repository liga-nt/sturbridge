#!/usr/bin/env node
/**
 * gen-hebrew-word-forms.mjs
 *
 * Scans the Open Scriptures Hebrew Bible (morphhb) to collect every attested
 * bare inflected form for each lemma present in our word_forms.json, then
 * merges them in — giving the paradigm table real Hebrew Bible attestations
 * rather than √קטל template fallbacks.
 *
 * Bare form = the word without prepositional / conjunction / article prefixes.
 * Cantillation accents are stripped; nikud (vowel points) are kept.
 *
 * Usage:
 *   node scripts/gen-hebrew-word-forms.mjs
 *   node scripts/gen-hebrew-word-forms.mjs --dry-run
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const MORPHHB_DIR = '/Users/npresnall/LexAudio/Classical/morphhb/wlc';
const FORMS_PATH  = path.join(__dirname, '../static/data/Hebrew/word_forms.json');
const DRY_RUN     = process.argv.includes('--dry-run');

// ── Morph code tables ─────────────────────────────────────────────────────────

const STEM_MAP = {
  q: 'qal',      N: 'niphal',    p: 'piel',     P: 'pual',
  h: 'hiphil',   H: 'hophal',    t: 'hithpael', o: 'polel',
  O: 'polal',    r: 'hithpolel', m: 'poel',     M: 'poal',
};

const TENSE_MAP = {
  p: 'qatal',             q: 'weqatal',
  i: 'yiqtol',            w: 'wayyiqtol',
  h: 'cohortative',       j: 'jussive',
  v: 'imperative',        r: 'participle',
  s: 'participle_passive', a: 'infinitive_absolute',
  c: 'infinitive_construct',
};

const GENDER_MAP = { m: 'm', f: 'f', c: 'c', b: 'b' };
const NUMBER_MAP = { s: 'sg', p: 'pl', d: 'du' };
const STATE_MAP  = { a: 'abs', c: 'cst', d: 'det' };

// ── Morph parser ──────────────────────────────────────────────────────────────

function parseMorph(raw) {
  // Strip language marker (H = Hebrew, A = Aramaic) then leading part-of-speech
  const code    = raw.replace(/^[HA]/, '');
  const posChar = code[0];

  if (posChar === 'V') {
    const stem  = STEM_MAP[code[1]]  ?? code[1];
    const tense = TENSE_MAP[code[2]] ?? code[2];
    if (tense === 'participle' || tense === 'participle_passive') {
      // Participles: gender, number, state (no person)
      return { pos: 'verb', stem, tense,
        gender: GENDER_MAP[code[3]] ?? null,
        number: NUMBER_MAP[code[4]] ?? null,
        state:  STATE_MAP[code[5]]  ?? null };
    }
    if (tense === 'infinitive_absolute' || tense === 'infinitive_construct') {
      return { pos: 'verb', stem, tense };
    }
    return { pos: 'verb', stem, tense,
      person: code[3] || null,
      gender: GENDER_MAP[code[4]] ?? null,
      number: NUMBER_MAP[code[5]] ?? null };
  }

  if (posChar === 'N') {
    // Noun: type(1) gender(2) number(3) state(4)
    return { pos: 'noun',
      gender: GENDER_MAP[code[2]] ?? null,
      number: NUMBER_MAP[code[3]] ?? null,
      state:  STATE_MAP[code[4]]  ?? null };
  }

  if (posChar === 'A') {
    return { pos: 'adj',
      gender: GENDER_MAP[code[2]] ?? null,
      number: NUMBER_MAP[code[3]] ?? null,
      state:  STATE_MAP[code[4]]  ?? null };
  }

  const POS = { P: 'pron', R: 'prep', C: 'conj', T: 'art',
                D: 'adv',  I: 'intj', S: 'suff' };
  return { pos: POS[posChar] ?? posChar.toLowerCase() };
}

function deriveParadigmKey(morph) {
  if (morph.pos === 'verb' && morph.stem && morph.tense) {
    return `${morph.stem}_${morph.tense}`;
  }
  if ((morph.pos === 'noun' || morph.pos === 'adj') && morph.gender) {
    const g = morph.gender === 'f' ? 'fem' : morph.gender === 'm' ? 'masc' : 'both';
    return `${morph.pos}_${g}`;
  }
  return null;
}

// ── Text helpers ──────────────────────────────────────────────────────────────

// Strip cantillation accents (U+0591–U+05AF) but keep nikud / dagesh / shin-sin dots
function stripAccents(s) {
  return s.replace(/[֑-֯]/g, '');
}

// Strip all Hebrew pointing for bare lookup
function stripAll(s) {
  return s.replace(/[֑-ׇ]/g, '').replace(/\s+/g, '');
}

// ── XML parser ────────────────────────────────────────────────────────────────

const W_RE = /<w\b([^>]*)>([\s\S]*?)<\/w>/g;

function* iterWords(xml) {
  let m;
  W_RE.lastIndex = 0;
  while ((m = W_RE.exec(xml)) !== null) {
    const attrs  = m[1];
    const raw    = m[2].replace(/<[^>]+>/g, ''); // strip any child markup
    const lemmaM = attrs.match(/lemma="([^"]*)"/);
    const morphM = attrs.match(/morph="([^"]*)"/);
    if (!lemmaM || !morphM || !raw.trim()) continue;
    yield { lemmaAttr: lemmaM[1], morphAttr: morphM[1], rawText: raw.trim() };
  }
}

// For a compound word (prefixes separated by /), return the bare last segment
function bareParts(word) {
  const texts   = word.rawText.split('/');
  const lemmas  = word.lemmaAttr.split('/');
  const morphs  = word.morphAttr.split('/');

  const bareText  = stripAccents(texts[texts.length - 1]);
  const bareLemma = lemmas[lemmas.length - 1].trim(); // e.g. "1254 a"
  const bareMorph = morphs[morphs.length - 1];

  return { bareText, bareLemma, bareMorph };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const wordForms = JSON.parse(fs.readFileSync(FORMS_PATH, 'utf8'));

// 1. Build: stripped_surface → { dictEntry, shortDef, vocabTier, standard_refs }
const surfaceToMeta = {};
for (const [surface, entry] of Object.entries(wordForms)) {
  const key = stripAll(surface);
  surfaceToMeta[key] ??= {
    dictEntry:    entry.dictEntry,
    shortDef:     entry.shortDef,
    vocabTier:    entry.vocabTier,
    standard_refs: entry.standard_refs ?? [],
  };
}

// 2. Scan Genesis to map Strong's lemma → dictEntry.
// Match using the FULL surface form (prefixes joined, accents stripped) so that
// entries like וַיֹּאמֶר (stored with prefix in word_forms) are found correctly.
const genesisXML   = fs.readFileSync(path.join(MORPHHB_DIR, 'Gen.xml'), 'utf8');
const lemmaToDict  = {}; // bareLemma → { dictEntry, shortDef, ... }

for (const word of iterWords(genesisXML)) {
  const { bareLemma } = bareParts(word);
  // Full surface form: remove prefix-boundary slashes, strip accents
  const full     = stripAccents(word.rawText.replace(/\//g, ''));
  const stripped = stripAll(full);
  const meta     = surfaceToMeta[stripped];
  if (meta && !lemmaToDict[bareLemma]) {
    lemmaToDict[bareLemma] = meta;
  }
}

const trackedLemmas = Object.keys(lemmaToDict);
console.log(`Tracking ${trackedLemmas.length} lemmas:`,
  trackedLemmas.map(l => `${l} → ${lemmaToDict[l].dictEntry}`).join(', '));

// 3. Scan all books, collect bare forms per lemma
const allBooks = fs.readdirSync(MORPHHB_DIR)
  .filter(f => f.endsWith('.xml'))
  .map(f => path.join(MORPHHB_DIR, f));

// Deduplicate: track which (bareText + morphCode) pairs we've already seen
// key: `bareText||morphCode` — keeps only one entry per distinct form+parse
const seen = new Map(); // key → { dictEntry, bareMorph }

for (const bookPath of allBooks) {
  const xml = fs.readFileSync(bookPath, 'utf8');
  for (const word of iterWords(xml)) {
    const { bareText, bareLemma, bareMorph } = bareParts(word);
    const meta = lemmaToDict[bareLemma];
    if (!meta) continue;
    const key = `${bareText}||${bareMorph}`;
    if (!seen.has(key)) {
      seen.set(key, { meta, bareText, bareMorph });
    }
  }
}

console.log(`Found ${seen.size} unique (form, morph) pairs across all books.`);

// 4. Merge new entries into wordForms
let added = 0;
for (const { meta, bareText, bareMorph } of seen.values()) {
  if (wordForms[bareText]) continue; // already present (exact nikud match)

  const morph      = parseMorph(bareMorph);
  const paradigmKey = deriveParadigmKey(morph);

  wordForms[bareText] = {
    dictEntry:    meta.dictEntry,
    shortDef:     meta.shortDef,
    morph,
    vocabTier:    meta.vocabTier,
    paradigmKey,
    standard_refs: meta.standard_refs ?? [],
  };
  added++;
}

console.log(`Adding ${added} new entries.`);

if (!DRY_RUN) {
  fs.writeFileSync(FORMS_PATH, JSON.stringify(wordForms, null, 2));
  console.log(`Written to ${FORMS_PATH}`);
} else {
  console.log('Dry run — nothing written.');
  // Show a sample of what would be added
  const sample = Object.entries(wordForms)
    .filter(([, v]) => v.paradigmKey)
    .slice(0, 10);
  for (const [form, entry] of sample) {
    console.log(`  ${form} → ${entry.dictEntry} [${entry.paradigmKey}]`);
  }
}

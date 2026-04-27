// Greek keyboard — EZAccent-style QWERTY → polytonic mapping
// Mirrors Mac polytonic keyboard positions; post-letter diacritics via NFD/NFC toggle.

export const QWERTY_TO_GREEK = {
  q: ';',  // Greek question mark / word divider
  w: 'ς',  // ς final sigma (explicit)
  e: 'ε', r: 'ρ', t: 'τ', y: 'υ', u: 'θ', i: 'ι', o: 'ο', p: 'π',
  a: 'α', s: 'σ', d: 'δ', f: 'φ', g: 'γ', h: 'η', j: 'ξ', k: 'κ', l: 'λ',
  z: 'ζ', x: 'χ', c: 'ψ', v: 'ω', b: 'β', n: 'ν', m: 'μ',
};

// Combining marks keyed by event.key value (post-letter, not dead-key)
export const DIACRITIC_MAP = {
  ';':  '́',  // acute (oxia)
  '`':  '̀',  // grave (varia)
  '[':  '̓',  // smooth breathing (psili)
  '{':  '̔',  // rough breathing (dasia)  — Shift+[
  '=':  '͂',  // circumflex (perispomeni)
  '|':  'ͅ',  // iota subscript (ypogegrammeni) — Shift+\
  '"':  '̈',  // dialytika — Shift+'
};

// Greek base vowels — check NFD base char
const VOWELS = new Set([
  'α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω',  // α ε η ι ο υ ω
  'Α', 'Ε', 'Η', 'Ι', 'Ο', 'Υ', 'Ω',  // Α Ε Η Ι Ο Υ Ω
]);

// Reverse map: Greek char → uppercase QWERTY display label
const GREEK_TO_QWERTY = {};
for (const [k, v] of Object.entries(QWERTY_TO_GREEK)) {
  if (v !== ';') GREEK_TO_QWERTY[v] = k.toUpperCase();
}

/**
 * Map a keyboard event.key to its base Greek character.
 * Returns null for diacritic keys and unmapped keys.
 */
export function keyToGreek(key) {
  if (key in DIACRITIC_MAP) return null;
  return QWERTY_TO_GREEK[key.toLowerCase()] ?? null;
}

/**
 * Apply a diacritic key to the last character of buffer (NFD toggle → NFC).
 * No-ops if last char's NFD base is not a vowel (or ρ for dasia).
 */
export function applyDiacritic(buffer, key) {
  const mark = DIACRITIC_MAP[key];
  if (!mark || buffer.length === 0) return buffer;
  const chars = [...buffer];
  const last = chars[chars.length - 1];
  const nfd = last.normalize('NFD');
  const base = nfd[0];
  if (!VOWELS.has(base) && !(key === '{' && (base === 'ρ' || base === 'Ρ'))) return buffer;
  const updated = nfd.includes(mark) ? nfd.replace(mark, '') : nfd + mark;
  chars[chars.length - 1] = updated.normalize('NFC');
  return chars.join('');
}

/**
 * Convert a trailing σ to ς (call before appending a word-boundary character).
 */
export function processFinalSigma(buffer) {
  const chars = [...buffer];
  if (chars.length > 0 && chars[chars.length - 1] === 'σ') {
    chars[chars.length - 1] = 'ς';
  }
  return chars.join('');
}

/**
 * Strip all Greek diacritics and return bare lowercase string.
 */
export function stripGreekDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Get the display QWERTY key label for a base Greek character.
 */
export function greekToQwerty(char) {
  return GREEK_TO_QWERTY[char] ?? null;
}

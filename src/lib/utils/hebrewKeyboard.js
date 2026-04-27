// Hebrew keyboard — phonetic/mnemonic QWERTY mapping for new learners.
// Lowercase keys map to the primary letter; Shift variants resolve ambiguous sounds.

export const QWERTY_TO_HEBREW = {
  // lowercase → primary letter
  a: 'א', b: 'ב', g: 'ג', d: 'ד', h: 'ה',
  v: 'ו', z: 'ז', y: 'י', k: 'כ', l: 'ל',
  m: 'מ', n: 'נ', s: 'ס', p: 'פ', x: 'צ',
  q: 'ק', r: 'ר', t: 'ת',
  // Shift variants for phonetically ambiguous letters
  H: 'ח',  // het  — strong /h/
  A: 'ע',  // ayin — silent guttural
  S: 'שׁ', // shin — U+05E9 + U+05C1
  T: 'ט',  // tet  — alternate /t/
};

const HEBREW_TO_QWERTY = {};
for (const [k, v] of Object.entries(QWERTY_TO_HEBREW)) {
  // For shin (multi-codepoint), key by the full string
  HEBREW_TO_QWERTY[v] = k;
}

/**
 * Map a keyboard event.key to its Hebrew character, or null if unmapped.
 * Checks both the raw key (for Shift variants H, A, S, T) and lowercase.
 */
export function keyToHebrew(key) {
  return QWERTY_TO_HEBREW[key] ?? QWERTY_TO_HEBREW[key.toLowerCase()] ?? null;
}

/**
 * Return the display QWERTY label for a Hebrew char (uppercase for shift variants).
 */
export function hebrewToQwerty(char) {
  return HEBREW_TO_QWERTY[char] ?? null;
}

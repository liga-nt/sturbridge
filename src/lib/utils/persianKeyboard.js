// ISIRI 2901 Persian keyboard layout (Windows standard)
// Maps US QWERTY event.key values → Persian Unicode characters

export const QWERTY_TO_PERSIAN = {
    'q': 'ض', 'w': 'ص', 'e': 'ث', 'r': 'ق', 't': 'ف',
    'y': 'غ', 'u': 'ع', 'i': 'ه', 'o': 'خ', 'p': 'ح',
    '[': 'ج', ']': 'چ',
    'a': 'ش', 's': 'س', 'd': 'ی', 'f': 'ب', 'g': 'ل',
    'h': 'ا', 'j': 'ت', 'k': 'ن', 'l': 'م', ';': 'ک', "'": 'گ',
    'z': 'ظ', 'x': 'ط', 'c': 'ز', 'v': 'ر',
    'b': 'ذ', 'n': 'د', 'm': 'پ', ',': 'و',
    // Shift variants
    'C': 'ژ',   // Shift+C
    'H': 'آ',   // Shift+H
};

// Reverse map: Persian char → display key label
const PERSIAN_TO_QWERTY = Object.fromEntries(
    Object.entries(QWERTY_TO_PERSIAN).map(([k, v]) => [v, k])
);

/**
 * Map a keyboard event.key to its Persian character.
 * Checks the original key first (for Shift+C → ژ), then lowercase.
 */
export function keyToPersian(key) {
    if (QWERTY_TO_PERSIAN[key] !== undefined) return QWERTY_TO_PERSIAN[key];
    return QWERTY_TO_PERSIAN[key.toLowerCase()] ?? null;
}

/**
 * Get the display label for the QWERTY key that types a given Persian character.
 */
export function persianToQwerty(char) {
    return PERSIAN_TO_QWERTY[char] ?? null;
}

/**
 * Human-readable hint for a qwerty_key string (from alphabet.json).
 * Returns something like "h", "[", "'", "Shift+C".
 */
export function keyHint(qwertyKey) {
    return qwertyKey;
}

/**
 * gen-hebrew-timestamps.mjs
 *
 * Reads each Azure-generated Hebrew letter mp3, finds the silence breaks
 * between the letter name and the three vowel examples, and stores the
 * vowel start times as audio_timestamps: [t0, t1, t2] in alphabet.json.
 *
 * Audio structure per letter:
 *   [name] <600ms break> [char+patah] <400ms break> [char+hiriq] <400ms break> [char+holam]
 *
 * Unlike Persian (where vowels start at t=0), Hebrew timestamps are all > 0
 * because the name comes first.
 *
 * Usage:
 *   node scripts/gen-hebrew-timestamps.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALPHABET_PATH = path.join(__dirname, '../static/data/Hebrew/alphabet.json');
const TMP = path.join(__dirname, 'voice-samples/hebrew/letters-azure');

const alphabet = JSON.parse(fs.readFileSync(ALPHABET_PATH, 'utf8'));

function getVowelStarts(mp3Path) {
    const log = execSync(
        `ffmpeg -i "${mp3Path}" -af silencedetect=noise=-30dB:d=0.08 -f null - 2>&1`
    ).toString();

    // Collect all silence_end values > 0.05s (skip tiny clip lead-in artifacts)
    const ends = [];
    for (const line of log.split('\n')) {
        const m = line.match(/silence_end: ([\d.]+)/);
        if (m) {
            const t = parseFloat(m[1]);
            if (t > 0.05) ends.push(t);
        }
    }

    // ends[0] = end of lead-in silence    → name starts     (skip)
    // ends[1] = end of break after name  → start of char+patah
    // ends[2] = end of break after patah → start of char+hiriq
    // ends[3] = end of break after hiriq → start of char+holam
    // ends[4] = trailing silence (discard)
    return ends.slice(1, 4);
}

console.log('\n── Hebrew timestamps ──\n');

for (const letter of alphabet) {
    const mp3 = path.join(TMP, `${letter.id}.mp3`);
    if (!fs.existsSync(mp3)) {
        console.warn(`  ⚠ missing ${letter.id}.mp3 — skipping`);
        continue;
    }

    const ts = getVowelStarts(mp3);
    if (ts.length < 3) {
        console.warn(`  ⚠ ${letter.id.padEnd(10)} only found ${ts.length} breaks — check audio`);
    }
    letter.audio_timestamps = ts;
    console.log(`  ${letter.id.padEnd(12)} [${ts.map(t => t.toFixed(3)).join(', ')}]`);
}

fs.writeFileSync(ALPHABET_PATH, JSON.stringify(alphabet, null, 2));
console.log('\nDone. Updated alphabet.json with audio_timestamps.');

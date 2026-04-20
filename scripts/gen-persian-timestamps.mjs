/**
 * gen-persian-timestamps.mjs
 *
 * Reads each Azure-generated letter mp3, finds the two 500ms silence breaks,
 * and stores syllable start times as audio_timestamps: [t0, t1, t2] in alphabet.json.
 * Alef (single syllable) gets [0].
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALPHABET_PATH = path.join(__dirname, '../static/data/Persian/alphabet.json');
const TMP = path.join(__dirname, 'voice-samples/persian/letters-azure');

const alphabet = JSON.parse(fs.readFileSync(ALPHABET_PATH, 'utf8'));

function getSyllableStarts(mp3Path) {
    const log = execSync(
        `ffmpeg -i "${mp3Path}" -af silencedetect=noise=-30dB:d=0.08 -f null - 2>&1`
    ).toString();

    // Collect all silence_end values > 0.05s (skip tiny clip lead-in)
    const ends = [];
    for (const line of log.split('\n')) {
        const m = line.match(/silence_end: ([\d.]+)/);
        if (m) {
            const t = parseFloat(m[1]);
            if (t > 0.05) ends.push(t);
        }
    }

    // ends[0] = end of first break (start of بِ), ends[1] = end of second break (start of بُ)
    // trailing silence is the last entry — ignore it
    const t1 = ends[0] ?? null;
    const t2 = ends[1] ?? null;

    // If two breaks found and the last entry is > t2 + 0.1 it's the trailing silence, discard
    return [0, t1, t2].filter(t => t !== null);
}

for (const letter of alphabet) {
    const mp3 = path.join(TMP, `${letter.id}.mp3`);
    if (!fs.existsSync(mp3)) {
        console.warn(`  ⚠ missing ${letter.id}.mp3 — skipping`);
        continue;
    }

    if (letter.id === 'alef') {
        letter.audio_timestamps = [0];
        console.log(`  alef  [0]`);
        continue;
    }

    const ts = getSyllableStarts(mp3);
    letter.audio_timestamps = ts;
    console.log(`  ${letter.id.padEnd(12)} [${ts.map(t => t.toFixed(3)).join(', ')}]`);
}

fs.writeFileSync(ALPHABET_PATH, JSON.stringify(alphabet, null, 2));
console.log('\nDone. Updated alphabet.json with audio_timestamps.');

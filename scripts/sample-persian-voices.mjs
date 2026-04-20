/**
 * Sample all OpenAI TTS voices on a line of Rumi.
 * Saves MP3s to scripts/voice-samples/persian/
 *
 * Usage: node scripts/sample-persian-voices.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const OUT_DIR = path.join(__dirname, 'voice-samples/persian');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Opening couplet of the Masnavi — the reed's lament
const TEXT = 'بشنو این نی چون شکایت می‌کند';

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

console.log(`Text: ${TEXT}`);
console.log(`"Listen to the reed, how it tells a tale of separations"\n`);

for (const voice of VOICES) {
    process.stdout.write(`  ${voice.padEnd(10)} → `);
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'tts-1-hd',
            input: TEXT,
            voice,
            response_format: 'mp3'
        })
    });

    if (!resp.ok) {
        console.log(`FAILED — ${resp.status} ${await resp.text()}`);
        continue;
    }

    const buf  = Buffer.from(await resp.arrayBuffer());
    const file = path.join(OUT_DIR, `${voice}.mp3`);
    fs.writeFileSync(file, buf);
    console.log(file);
}

console.log('\nPlay them with: open scripts/voice-samples/persian/');

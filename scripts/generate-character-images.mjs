/**
 * Generate four canonical character portrait images and upload them to
 * Firebase Storage, then write the download URLs into
 * story_bible/grade7-greek.characterImages in Firestore.
 *
 * Usage:
 *   node scripts/generate-character-images.mjs
 *
 * Reads OPENAI_API_KEY from .env automatically.
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'sturbridge-e59d9.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STORY_BIBLE_ID = 'grade7-greek';

// ---------------------------------------------------------------------------
// Style anchor — every prompt gets this prefix for visual consistency
// ---------------------------------------------------------------------------

const STYLE =
  'Child-friendly crayon drawing illustration. Warm earth tones with bright accent colors. ' +
  'Ancient Athens setting, the Acropolis faintly visible in the background. ' +
  'Waist-up portrait, expressive face, suitable for middle school students. ' +
  'Soft crayon texture, slightly rough edges, colored pencil feel. ';

// ---------------------------------------------------------------------------
// Character prompts — no gifts (those come later in the story)
// ---------------------------------------------------------------------------

const CHARACTERS = [
  {
    slot: 1,
    name: 'Phoebe (Φοίβη)',
    prompt: STYLE +
      'Phoebe is a 13-year-old Greek girl — visibly a young teenager — with dark hair, olive skin, and calm, thoughtful dark eyes. ' +
      'She is taller and older-looking than a 10-year-old child. ' +
      'She wears a light blue ancient Greek chiton with a simple border. ' +
      'Her expression is quiet and perceptive — she has just noticed something others missed. ' +
      'She is not holding anything. Blue accent colors.'
  },
  {
    slot: 2,
    name: 'Pallas (Παλλάς)',
    prompt: STYLE +
      'Pallas is a 13-year-old Greek girl — visibly a young teenager — with bright red hair, olive skin, and bold, confident eyes. ' +
      'She is taller and older-looking than a 10-year-old child. ' +
      'She wears a green ancient Greek chiton. ' +
      'Her posture is upright and decisive — a natural leader ready to act. ' +
      'She is not holding anything. Green accent colors.'
  },
  {
    slot: 3,
    name: 'Kleio (Κλειώ)',
    prompt: STYLE +
      'Klēta is a 10-year-old Greek girl — visibly a young child, noticeably shorter and younger-looking than a 13-year-old. ' +
      'She has dark hair, olive skin, and clever focused eyes. ' +
      'She wears an orange ancient Greek chiton with a small leather apron over it. ' +
      'Her expression is quietly resourceful and concentrated, like she is already solving a problem. ' +
      'She is not holding anything. Orange and copper accent colors.'
  },
  {
    slot: 4,
    name: 'Dolios (Δόλιος)',
    prompt: STYLE +
      'Dolios is a 10-year-old Greek boy — visibly a young child, noticeably shorter and younger-looking than a 13-year-old. ' +
      'He has dark curly hair, olive skin, and mischievous bright eyes. ' +
      'He wears a yellow ancient Greek chiton and sandals. ' +
      'His expression is a wide charming grin — he is about to talk his way out of trouble. ' +
      'He is not holding anything. Yellow and gold accent colors.'
  }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateImage(prompt) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024',
      output_format: 'png'
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Generation failed');
  return data.data[0].b64_json;
}

async function uploadToStorage(slot, buffer) {
  const filePath = `greek/characters/slot-${slot}`;
  const file = bucket.file(filePath);
  const token = randomUUID();

  await file.save(buffer, {
    metadata: {
      contentType: 'image/png',
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });

  const encoded = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not found in .env');
    process.exit(1);
  }

  const updates = {};

  for (const char of CHARACTERS) {
    console.log(`\nGenerating ${char.name}...`);
    try {
      const b64 = await generateImage(char.prompt);
      const buffer = Buffer.from(b64, 'base64');

      // Save a local copy alongside the script for review
      const localPath = path.join(__dirname, `character-slot-${char.slot}.png`);
      fs.writeFileSync(localPath, buffer);
      console.log(`  Saved locally: ${localPath}`);

      console.log(`  Uploading to Firebase Storage...`);
      const url = await uploadToStorage(char.slot, buffer);
      updates[`characterImages.${char.slot}`] = { name: char.name, url };
      console.log(`  Done.`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }

  if (Object.keys(updates).length > 0) {
    console.log('\nWriting URLs to Firestore story bible...');
    await db.collection('story_bible').doc(STORY_BIBLE_ID).update(updates);
    console.log(`Updated ${Object.keys(updates).length} character slot(s).`);
    console.log('\nDone. Refresh the Images tab in the dev workshop to see the portraits.');
  } else {
    console.log('\nNo images were successfully generated.');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

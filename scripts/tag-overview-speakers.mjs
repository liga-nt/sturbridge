/**
 * Uses Claude to add XML voice tags to overview text for all untagged Greek chapters.
 *
 * Tags: <narrator> <phoebe> <dolios> <kleta> <pallas>
 * Narrator = Socrates (first-person). Children speak without quotation marks in most chapters.
 *
 * Usage: ANTHROPIC_API_KEY=... node scripts/tag-overview-speakers.mjs
 *   Or:  node scripts/tag-overview-speakers.mjs  (reads from firebase secret)
 */

import admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sa = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are tagging the overview narration for a Greek history course for 7th graders.
The story follows four time-traveling children who meet Socrates in ancient Athens.
The narrator is Socrates (first person). The children are:

- phoebe: oldest girl, ~13, dark-eyed, watches before she speaks, tends to be direct
- dolios: youngest boy, quick-eyed, playful, charming
- kleta: youngest girl, ~10, sharp eyes, observant, practical
- pallas: second oldest, thoughtful

Your task: wrap every span of text in the correct XML speaker tag.
Use <narrator>...</narrator> for all of Socrates's narration and his own spoken words.
Use <phoebe>, <dolios>, <kleta>, <pallas> for the children's dialogue.

Rules:
- Cover every character in the text — no text should be left untagged
- Do NOT change any wording — the tagged text must be identical to the input text
- Most chapters have no quotation marks; identify dialogue from context (attribution phrases like "she said", "he told me", direct address, etc.)
- When a child speaks, the attribution phrase ("she said", "he told us") belongs in <narrator> before or after
- Keep paragraph structure intact within tags — use newlines freely inside tags
- Output ONLY the fully tagged text, nothing else`;

async function tagChapter(text, chapterTitle) {
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Chapter: "${chapterTitle}"\n\nTag the following overview text with XML speaker tags:\n\n${text}`
    }]
  });
  return msg.content[0].text.trim();
}

// Load all untagged chapters
const snap = await db.collection('lessons').where('courseId', '==', 'grade7-greek').get();
const lessons = snap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(l => l.overview?.text?.trim() && !l.overview.text.includes('<narrator>'))
  .sort((a, b) => a.chapter - b.chapter);

console.log(`Tagging ${lessons.length} chapters...\n`);

for (const lesson of lessons) {
  console.log(`Ch.${lesson.chapter} "${lesson.title}" (${lesson.overview.text.length} chars)...`);
  try {
    const tagged = await tagChapter(lesson.overview.text, lesson.title);

    // Sanity check: tagged text should contain all speaker tags
    if (!tagged.includes('<narrator>')) {
      console.error(`  ✗ No <narrator> tag found — skipping`);
      continue;
    }

    await db.collection('lessons').doc(lesson.id).update({
      'overview.text': tagged,
      updatedAt: admin.firestore.Timestamp.now()
    });
    console.log(`  ✓ Saved (${tagged.length} chars)`);
  } catch (e) {
    console.error(`  ✗ Error: ${e.message}`);
  }

  // Rate limit pause between chapters
  await new Promise(r => setTimeout(r, 2000));
}

console.log('\nDone.');

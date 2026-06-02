/**
 * Seed Firestore with Greek lesson documents from chapter_curriculum.json.
 *
 * Each chapter becomes one lesson document in the `lessons` collection with:
 *   - courseId, chapter_id, chapter (number), title, status: 'draft'
 *   - sentences parsed from the `greek` field (newline-separated)
 *   - vocab_list from the vocab field
 *   - grammar.standardIds from the grammar field
 *   - standardIds from standards_coverage.json for this chapter
 *   - overview.text from chapters_v2/<chapter_id>.md
 *
 * Existing lessons for grade7-greek are deleted first.
 *
 * Usage: node scripts/seed-greek-lessons.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const COURSE_ID = 'grade7-greek';
const dataDir = join(__dirname, '..', 'data', 'Greek');

// ── Load source files ──────────────────────────────────────────────────────

function loadJson(path) {
    const raw = readFileSync(path, 'utf-8')
        .split('\n')
        .filter(line => !line.trimStart().startsWith('//'))
        .join('\n');
    return JSON.parse(raw);
}

const curriculum   = JSON.parse(readFileSync(join(dataDir, 'chapter_curriculum.json'), 'utf-8'));
const outline      = loadJson(join(dataDir, 'outline_v2.json'));
const coverageData = loadJson(join(dataDir, 'standards_coverage.json'));
const coverage     = coverageData.standards ?? [];

const titlesByChapterId = Object.fromEntries(
    (outline.chapters ?? []).map(c => [c.chapter_id, c.title])
);

// Build standards map: chapterIdPrefix → [standardId]
const standardsByChapter = {};
for (const entry of coverage) {
    for (const chPrefix of entry.chapters ?? []) {
        standardsByChapter[chPrefix] ??= [];
        standardsByChapter[chPrefix].push(entry.id);
    }
}

function storyText(chapterId) {
    try {
        return readFileSync(join(dataDir, 'chapters_v2', `${chapterId}.md`), 'utf-8');
    } catch {
        return '';
    }
}

// ── Delete existing grade7-greek lessons ──────────────────────────────────

console.log('Deleting existing grade7-greek lessons…');
const existing = await db.collection('lessons')
    .where('courseId', '==', COURSE_ID)
    .get();

const deleteBatch = db.batch();
for (const doc of existing.docs) {
    deleteBatch.delete(doc.ref);
}
await deleteBatch.commit();
console.log(`  Deleted ${existing.docs.length} existing lessons.`);

// ── Create new lessons ────────────────────────────────────────────────────

const chapterIds = curriculum.map(c => c.chapter_id);

// Standards lookup: use the first prefix segment (e.g. "ch_01" from "ch_01_athens")
function standardsForChapter(chapterId) {
    const prefix = chapterId.replace(/_[^_]+$/, ''); // "ch_01_athens" → "ch_01"
    return standardsByChapter[prefix] ?? [];
}

let num = 1;
for (const ch of curriculum) {
    const title    = titlesByChapterId[ch.chapter_id] ?? ch.chapter_id;
    const stdIds   = standardsForChapter(ch.chapter_id);
    const story    = storyText(ch.chapter_id);

    // Parse Greek sentences from newline-separated text
    const greekLines = (ch.greek ?? '').split('\n').map(s => s.trim()).filter(Boolean);
    const sentences = greekLines.map((line, i) => ({
        num: i + 1,
        greek: line,
        english: '',
        words: [],
        audioGenerated: false,
    }));

    const lesson = {
        courseId: COURSE_ID,
        chapter_id: ch.chapter_id,
        chapter: num,
        title,
        status: 'draft',
        sentences,
        vocab_list: (ch.vocab ?? []).map(word => ({ dictEntry: word })),
        standardIds: stdIds,
        overview: {
            text: story,
            standardIds: [],
            audioUrl: null,
            imageUrl: null,
            imagePrompt: null,
        },
        grammar: {
            standardIds: ch.grammar ?? [],
        },
        story: { standardIds: [] },
        story2: { standardIds: [] },
        map: {
            description: '',
            standardIds: [],
            highlighted: [],
            activeRouteId: null,
            audioUrl: null,
            imageUrl: null,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('lessons').add(lesson);
    console.log(`  Ch.${num} ${ch.chapter_id} → ${ref.id} (${sentences.length} sentences, ${stdIds.length} standards)`);
    num++;
}

console.log(`\nDone — seeded ${curriculum.length} lessons.`);
process.exit(0);

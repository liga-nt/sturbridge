/**
 * Fill in the missing demo data for npresnall@planyourrecovery.com's two
 * classes:
 *   - classes/demo-class-001            ("4th Grade MCAS Standards" — grade4-math)
 *       -> 5 quizzes (one per CCSS domain: OA/NBT/NF/MD/G), each assigned to
 *          the class with simulated per-student results, plus a week of
 *          Practice Log (sessions) entries.
 *   - classes/class-1786391757024        ("4th Grade MCAS Multiplication/
 *          Division" — grade4-fundamentals-math)
 *       -> 5 quizzes (times-table / division-fact ranges), each assigned
 *          with simulated per-student results.
 *
 * All assignments are created already-ended (active:false) so nothing
 * intrudes on a real student session — these are historical/simulated
 * results only. The real npresnall@gmail.com student uid that's still
 * listed on demo-class-001 from earlier testing is deliberately excluded.
 *
 * Safe to re-run: each run adds a fresh batch of quizzes/assignments/results
 * (does not delete or dedupe against a previous run).
 *
 * Usage: node scripts/seed-teacher-demo-results.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateRangeProblems } from '../src/lib/utils/fundamentals.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const TEACHER_ID = 'rFVBg6RsFkVXWUxpfPsAhRWxMOh2'; // npresnall@planyourrecovery.com
const SCHOOL_ID = 'default';
const STANDARDS_CLASS_ID = 'demo-class-001';
const FUNDAMENTALS_CLASS_ID = 'class-1786391757024';
const STUDENT_IDS = Array.from({ length: 20 }, (_, i) => `demo-student-${String(i + 1).padStart(3, '0')}`);

// ---------------------------------------------------------------------------
// Deterministic per-student "ability" so a student's profile (strong/weak)
// stays consistent across every quiz and the practice log.
// ---------------------------------------------------------------------------
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const abilityRng = {};
const STUDENT_ABILITY = Object.fromEntries(STUDENT_IDS.map((uid) => {
  const rng = mulberry32(hashStr(uid));
  abilityRng[uid] = rng;
  return [uid, 0.45 + rng() * 0.5]; // [0.45, 0.95]
}));
function rngFor(uid, salt) {
  return mulberry32(hashStr(uid + ':' + salt));
}

function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d;
}
function ts(date) { return Timestamp.fromDate(date); }

// ---------------------------------------------------------------------------
// Item bank (MCAS course) — same source questionBank.js is built from, plus
// its item_id -> standard map (extracted from source since that file uses
// bare JSON imports that only Vite, not plain Node, can resolve directly).
// ---------------------------------------------------------------------------
function loadItemBank() {
  const dataDir = path.join(__dirname, '..', 'data');
  const files = [
    'g4-math_2019_questions.json', 'g4-math_2021_questions.json',
    'g4-math_2022_questions.json', 'g4-math_2023_questions.json',
    'g4-math_2025_questions.json'
  ];
  const itemsById = {};
  for (const f of files) {
    const items = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    for (const item of items) itemsById[item.item_id] = item;
  }

  const qbSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'utils', 'questionBank.js'), 'utf8'
  );
  const block = qbSource.match(/const ITEM_STANDARD = \{([\s\S]*?)\n\};/)[1];
  const itemStandard = {};
  for (const m of block.matchAll(/'([^']+)':\s*'([^']+)'/g)) {
    itemStandard[m[1]] = m[2];
  }

  const byStandard = {};
  for (const [itemId, standardId] of Object.entries(itemStandard)) {
    const item = itemsById[itemId];
    if (!item) continue;
    (byStandard[standardId] ??= []).push(item);
  }
  return byStandard;
}

function packQuestions(questions) {
  return questions.map((q) => ({ ...q, questionData: JSON.stringify(q.questionData) }));
}

// ---------------------------------------------------------------------------
// Simulated result generation — shared between both classes.
// entryShape: (order, standardId, correct, attempts) -> answer entry object
// ---------------------------------------------------------------------------
async function createQuizWithResults({ classId, name, questions, gradingMode, daysAgoAssigned, entryFor }) {
  const createdAt = daysAgo(daysAgoAssigned, 9);
  const assignedAt = daysAgo(daysAgoAssigned, 9.5);
  const endedAt = daysAgo(Math.max(0, daysAgoAssigned - 1), 14);

  const quizRef = db.collection('quizzes').doc();
  await quizRef.set({
    name, classId, schoolId: SCHOOL_ID, createdBy: TEACHER_ID,
    createdAt: ts(createdAt), currentVersion: 1,
    standardIds: questions.map((q) => q.standardId), archived: false
  });
  await db.collection('quizzes').doc(quizRef.id).collection('versions').doc('1').set({
    version: 1, createdAt: ts(createdAt), questions: packQuestions(questions)
  });

  const assignmentRef = db.collection('quizAssignments').doc();
  await assignmentRef.set({
    quizId: quizRef.id, quizName: name, quizVersion: 1, classId, schoolId: SCHOOL_ID,
    gradingMode, questions: packQuestions(questions), targetStudentIds: STUDENT_IDS,
    assignedBy: TEACHER_ID, assignedAt: ts(assignedAt),
    active: false, endedAt: ts(endedAt), endedReason: 'teacher_ended'
  });

  let studentsWithResults = 0;
  for (const uid of STUDENT_IDS) {
    const rng = rngFor(uid, quizRef.id);
    if (rng() < 0.10) continue; // not started
    studentsWithResults++;

    const ability = STUDENT_ABILITY[uid];
    const completed = rng() < 0.85;
    const answerCount = completed ? questions.length : 1 + Math.floor(rng() * (questions.length - 1));

    const answers = [];
    let cursor = assignedAt.getTime();
    const step = (endedAt.getTime() - assignedAt.getTime()) / (questions.length + 1);
    for (let i = 0; i < answerCount; i++) {
      cursor += step * (0.5 + rng());
      const correct = rng() < ability;
      const attempts = gradingMode === 'help' ? (correct ? 1 : 2) : 1;
      answers.push(entryFor(questions[i], i, correct, attempts, Math.round(cursor)));
    }
    const score = answers.filter((a) => a.correct).length;

    await db.collection('quizProgress').doc(`${assignmentRef.id}_${uid}`).set({
      assignmentId: assignmentRef.id, quizId: quizRef.id, studentId: uid,
      classId, schoolId: SCHOOL_ID, gradingMode,
      status: completed ? 'completed' : 'frozen',
      currentIndex: answerCount, answers, score, total: questions.length,
      startedAt: ts(new Date(assignedAt.getTime() + step)),
      updatedAt: ts(new Date(cursor)),
      completedAt: completed ? ts(new Date(cursor)) : null
    });
  }

  console.log(`  + "${name}" — ${questions.length} questions, ${studentsWithResults}/${STUDENT_IDS.length} students with results`);
}

// ---------------------------------------------------------------------------
// Standards Class (demo-class-001, MCAS item bank) — 5 domain quizzes
// ---------------------------------------------------------------------------
async function seedStandardsClass() {
  console.log('\n=== Standards Class (demo-class-001) — quizzes + results ===');
  const classSnap = await db.collection('classes').doc(STANDARDS_CLASS_ID).get();
  const progression = classSnap.data().standardProgression;
  const byStandard = loadItemBank();

  const DOMAINS = [
    { code: 'OA',  label: 'Operations & Algebraic Thinking' },
    { code: 'NBT', label: 'Number & Operations in Base Ten' },
    { code: 'NF',  label: 'Number & Operations — Fractions' },
    { code: 'MD',  label: 'Measurement & Data' },
    { code: 'G',   label: 'Geometry' }
  ];

  let dayOffset = 28;
  for (const [i, domain] of DOMAINS.entries()) {
    const standardIds = progression.filter((id) => id.split('.')[1] === domain.code);
    const questions = [];
    let order = 0;
    for (const standardId of standardIds) {
      const items = byStandard[standardId];
      if (!items || items.length === 0) continue;
      const item = items[Math.floor(Math.random() * items.length)];
      questions.push({ order: order++, standardId, itemId: item.item_id, questionData: item });
      if (questions.length >= 6) break;
    }
    if (questions.length === 0) {
      console.log(`  ! skipping ${domain.label} — no item-bank coverage`);
      continue;
    }

    await createQuizWithResults({
      classId: STANDARDS_CLASS_ID,
      name: `${domain.label} Quiz`,
      questions,
      gradingMode: i % 2 === 0 ? 'quiz' : 'help',
      daysAgoAssigned: dayOffset,
      entryFor: (q, i, correct, attempts, answeredAt) => ({
        order: i, itemId: q.itemId, standardId: q.standardId,
        correct, attempts, assisted: attempts > 1 && Math.random() < 0.5, answeredAt
      })
    });
    dayOffset -= 5;
  }
}

// ---------------------------------------------------------------------------
// 4th Grade MCAS Multiplication/Division (class-1786391757024, fundamentals)
// — 5 range-based fact quizzes
// ---------------------------------------------------------------------------
async function seedFundamentalsClass() {
  console.log('\n=== MCAS Multiplication/Division (class-1786391757024) — quizzes + results ===');

  const TOPICS = [
    { name: 'Times Tables: ×3–×5',    operation: 'mult', tableMin: 3, tableMax: 5,  count: 8 },
    { name: 'Times Tables: ×6–×9',    operation: 'mult', tableMin: 6, tableMax: 9,  count: 8 },
    { name: 'Times Tables: ×10–×12',  operation: 'mult', tableMin: 10, tableMax: 12, count: 6 },
    { name: 'Division Facts: ÷3–÷6',  operation: 'div',  tableMin: 3, tableMax: 6,  count: 8 },
    { name: 'Division Facts: ÷7–÷10', operation: 'div',  tableMin: 7, tableMax: 10, count: 8 }
  ];

  let dayOffset = 24;
  for (const [i, topic] of TOPICS.entries()) {
    const symbol = topic.operation === 'div' ? '÷' : '×';
    const range = topic.tableMin === topic.tableMax
      ? `${symbol}${topic.tableMin}` : `${symbol}${topic.tableMin}–${symbol}${topic.tableMax}`;
    const label = `${range} facts`;
    const standardId = topic.tableMin === topic.tableMax
      ? `fund4-${topic.operation}-t${topic.tableMin}`
      : `fund4-${topic.operation}-t${topic.tableMin}-${topic.tableMax}`;

    const problems = generateRangeProblems(topic);
    const questions = problems.map((problem, order) => ({
      order, standardId, itemId: null,
      questionData: { ...problem, kind: 'fundamentals', correct_answer: problem.answer, label }
    }));

    await createQuizWithResults({
      classId: FUNDAMENTALS_CLASS_ID,
      name: topic.name,
      questions,
      gradingMode: i % 2 === 0 ? 'quiz' : 'help',
      daysAgoAssigned: dayOffset,
      entryFor: (q, i, correct, attempts, answeredAt) => ({
        order: i, standardId: q.standardId, correct, attempts, answeredAt
      })
    });
    dayOffset -= 4;
  }
}

// ---------------------------------------------------------------------------
// Practice Log (sessions) for the Standards Class, spanning the current week
// ---------------------------------------------------------------------------
async function seedPracticeLog() {
  console.log('\n=== Standards Class (demo-class-001) — Practice Log ===');
  const classSnap = await db.collection('classes').doc(STANDARDS_CLASS_ID).get();
  const progression = classSnap.data().standardProgression;
  const sessionTimeLimit = classSnap.data().dailyTimerSeconds ?? 300;

  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const weekdayOffsets = [0, 1, 2, 3, 4]; // Mon–Fri of the current week
  let written = 0;

  for (const uid of STUDENT_IDS) {
    const ability = STUDENT_ABILITY[uid];
    for (const offset of weekdayOffsets) {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + offset);
      if (dayDate > now) continue; // don't log the future

      const rng = rngFor(uid, 'session-' + offset);
      if (rng() < 0.3) continue; // not every student practices every day

      const dateStr = dayDate.toISOString().slice(0, 10);
      const numStandards = 1 + Math.floor(rng() * 3);
      const shuffled = [...progression].sort(() => rng() - 0.5);
      const standardTimes = {};
      let totalSec = 0;
      let questionsAttempted = 0;
      for (let i = 0; i < numStandards; i++) {
        const sec = 30 + Math.floor(rng() * 270);
        standardTimes[shuffled[i]] = { practiceSec: sec, masterySec: 0 };
        totalSec += sec;
        questionsAttempted += Math.max(1, Math.round(sec / 20));
      }
      const correctUnassisted = Math.round(questionsAttempted * ability * 0.7);
      const correctAssisted = Math.round(questionsAttempted * ability * 0.2);

      const startedAt = new Date(dayDate);
      startedAt.setHours(15 + Math.floor(rng() * 4), Math.floor(rng() * 60), 0, 0);

      const docId = `${STANDARDS_CLASS_ID}_${uid}_${dayDate.getTime()}`;
      await db.collection('sessions').doc(docId).set({
        classId: STANDARDS_CLASS_ID, studentId: uid, date: dateStr,
        standardTimes, sessionTimeLimit, overtime: totalSec > sessionTimeLimit,
        questionsAttempted, correctUnassisted, correctAssisted,
        startedAt: ts(startedAt)
      });
      written++;
    }
  }
  console.log(`  + ${written} session logs written across ${monday.toISOString().slice(0, 10)}–${weekdayOffsets.length} weekdays`);
}

async function main() {
  await seedStandardsClass();
  await seedFundamentalsClass();
  await seedPracticeLog();
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });

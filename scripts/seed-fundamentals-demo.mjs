/**
 * Populate the existing "Sturbridge 4th Grade Fundamentals" class
 * (classes/class-1786391757024, courses/grade4-fundamentals-math, taught by
 * Ms. Chen / demo-teacher-001, previously created with studentIds: []) with
 * the same 20 dummy students already enrolled in her standards class
 * (demo-class-001, courses/grade4-math), plus fake mastery + practice log:
 *
 *   - classes/class-1786391757024.studentIds       (adds the 20 student uids)
 *   - users/{uid}.classIds                          (adds the classId, teacher + 20 students)
 *   - studentProgress/{uid}/standards/{standardId}  (fake mastery on fund4-mult-N / fund4-div-N ids)
 *   - sessions/{id}                                 (fake practice-log entries, last ~2 weeks)
 *
 * Does NOT touch the top-level studentProgress/{uid} doc — that doc belongs
 * to the round-robin mastery flow used by grade4-math (/student/mcas) and is
 * never read by the fundamentals UI (/student/fundamentals), which only
 * reads the standards subcollection + classDoc.standardProgression.
 *
 * Usage: node scripts/seed-fundamentals-demo.mjs
 * Safe to re-run (all writes are set with merge; session doc ids are
 * deterministic per class/student/date).
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLASS_ID = 'class-1786391757024'; // existing "Sturbridge 4th Grade Fundamentals" class
const TEACHER_ID = 'demo-teacher-001';
const SESSION_TIME_LIMIT = 600; // 10 minutes, matches app default

// ---------------------------------------------------------------------------
// Standard progression — same order as scripts/seed-grade4-fundamentals.mjs
// (mult-0..12 by `order`, then div-1..12), 25 total.
// ---------------------------------------------------------------------------

const PROGRESSION = [
  ...Array.from({ length: 13 }, (_, n) => `fund4-mult-${n}`), // fund4-mult-0..12
  ...Array.from({ length: 12 }, (_, n) => `fund4-div-${n + 1}`) // fund4-div-1..12
];

// ---------------------------------------------------------------------------
// Reuse Ms. Chen's existing 20 students (demo-student-001..020)
// ---------------------------------------------------------------------------

const STUDENT_UIDS = Array.from({ length: 20 }, (_, i) => `demo-student-${String(i + 1).padStart(3, '0')}`);

function getGroup(i) {
  if (i < 5) return 'early';
  if (i < 13) return 'mid';
  if (i < 18) return 'advanced';
  return 'mixed';
}

// Scatter sets for the 2 "mixed" students — inconsistent mastery pattern
// rather than a clean run through the progression.
const MIXED_SCATTERS = [
  [0, 1, 2, 4, 6, 9, 13, 15],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 17, 20]
];

function masteredIndicesForStudent(group, groupIndex) {
  let masteredCount;
  switch (group) {
    case 'early':
      masteredCount = groupIndex; // 0..4
      return Array.from({ length: masteredCount }, (_, i) => i);
    case 'mid':
      masteredCount = 6 + groupIndex; // 6..13
      return Array.from({ length: masteredCount }, (_, i) => i);
    case 'advanced':
      masteredCount = Math.min(15 + groupIndex * 2, PROGRESSION.length - 2); // 15..23
      return Array.from({ length: masteredCount }, (_, i) => i);
    case 'mixed':
    default:
      return MIXED_SCATTERS[groupIndex] ?? MIXED_SCATTERS[0];
  }
}

// ---------------------------------------------------------------------------
// Fake mastery ("studentProgress/{uid}/standards/{standardId}") builder
// ---------------------------------------------------------------------------

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function buildStandardsDocs(masteredIndices) {
  const masteredSet = new Set(masteredIndices);
  const standardsDocs = {};

  const sortedMastered = [...masteredIndices].sort((a, b) => a - b);
  const spacingDays = sortedMastered.length ? 28 / sortedMastered.length : 0;

  sortedMastered.forEach((i, rank) => {
    const daysAgo = Math.max(1, Math.round((sortedMastered.length - rank) * spacingDays) + randInt(-1, 1));
    const masteredAt = Date.now() - daysAgo * 24 * 60 * 60 * 1000 - randInt(0, 6 * 60 * 60 * 1000);
    standardsDocs[PROGRESSION[i]] = {
      mastered: true,
      streak: admin.firestore.FieldValue.delete(), // no longer part of the fundamentals mastery shape
      attempts: 8 + randInt(0, 6),
      assistedAttempts: i % 4 === 0 ? 1 : 0,
      questionsSeenIds: [],
      inReviewQueue: false,
      masteredAt
    };
  });

  let current = 0;
  while (masteredSet.has(current) && current < PROGRESSION.length) current++;

  if (current < PROGRESSION.length) {
    standardsDocs[PROGRESSION[current]] = {
      mastered: false,
      streak: admin.firestore.FieldValue.delete(), // no longer part of the fundamentals mastery shape
      attempts: randInt(1, 4),
      assistedAttempts: 0,
      questionsSeenIds: [],
      inReviewQueue: false
    };
  }

  return { standardsDocs, currentIndex: current < PROGRESSION.length ? current : null };
}

// ---------------------------------------------------------------------------
// Fake practice log ("sessions") builder
// ---------------------------------------------------------------------------

const MASTERY_FRACTION_BY_GROUP = {
  early: 0,
  mid: 0.2,
  advanced: 0.38,
  mixed: 0.15
};

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function isWeekday(d) {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/** Last ~14 calendar days (inclusive of today), weekdays only, oldest first. */
function recentWeekdays() {
  const days = [];
  const today = new Date();
  for (let offset = 13; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    if (isWeekday(d)) days.push(d);
  }
  return days;
}

function buildSessionDoc({ classId, uid, date, currentStdId, masteredIndices, group }) {
  const totalSec = randInt(150, 800);
  const masteryFraction = MASTERY_FRACTION_BY_GROUP[group] ?? 0;
  const hasMastered = masteredIndices.length > 0;
  const masterySec = hasMastered ? Math.round(totalSec * masteryFraction * (0.6 + Math.random() * 0.8)) : 0;
  const practiceSec = totalSec - masterySec;

  const standardTimes = {};
  if (currentStdId) {
    standardTimes[currentStdId] = { practiceSec, masterySec: 0 };
  }
  if (masterySec > 0) {
    const masteryStdId = PROGRESSION[masteredIndices[randInt(0, masteredIndices.length - 1)]];
    standardTimes[masteryStdId] = standardTimes[masteryStdId] || { practiceSec: 0, masterySec: 0 };
    standardTimes[masteryStdId].masterySec += masterySec;
  }
  if (!currentStdId && masterySec === 0) return null; // nothing to log (fully done + no mastery time)

  const finalTotalSec = Object.values(standardTimes).reduce((s, t) => s + t.practiceSec + t.masterySec, 0);

  const hh = randInt(15, 18);
  const mm = randInt(0, 59);
  const startedAt = admin.firestore.Timestamp.fromDate(
    new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
  );

  return {
    classId,
    studentId: uid,
    date,
    standardTimes,
    sessionTimeLimit: SESSION_TIME_LIMIT,
    questionsAnswered: 0,
    overtime: finalTotalSec > SESSION_TIME_LIMIT,
    startedAt
  };
}

// ---------------------------------------------------------------------------
// Batch helper (Firestore limit: 500 writes per batch)
// ---------------------------------------------------------------------------

class BatchWriter {
  constructor(db) {
    this.db = db;
    this.batch = db.batch();
    this.count = 0;
    this.total = 0;
  }

  set(ref, data, opts) {
    this.batch.set(ref, data, opts || {});
    this.count++;
    this.total++;
  }

  async flushIfNeeded() {
    if (this.count >= 450) {
      await this.batch.commit();
      this.batch = this.db.batch();
      this.count = 0;
    }
  }

  async flush() {
    if (this.count > 0) {
      await this.batch.commit();
      this.count = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedClass() {
  console.log('Enrolling students into existing fundamentals class...');
  await db.collection('classes').doc(CLASS_ID).set({
    studentIds: STUDENT_UIDS,
    sessionTimeLimit: SESSION_TIME_LIMIT,
    leaderboardEnabled: true,
    leaderboardSize: 5
  }, { merge: true });
  console.log(`  ✓ classes/${CLASS_ID}.studentIds set to ${STUDENT_UIDS.length} students`);
}

async function enrollUsers() {
  console.log('Enrolling teacher + students...');
  const batch = db.batch();
  batch.set(db.collection('users').doc(TEACHER_ID), {
    classIds: admin.firestore.FieldValue.arrayUnion(CLASS_ID)
  }, { merge: true });
  for (const uid of STUDENT_UIDS) {
    batch.set(db.collection('users').doc(uid), {
      classIds: admin.firestore.FieldValue.arrayUnion(CLASS_ID)
    }, { merge: true });
  }
  await batch.commit();
  console.log(`  ✓ ${STUDENT_UIDS.length + 1} user docs updated`);
}

async function seedMasteryAndSessions() {
  console.log('Seeding fake mastery + practice log...');
  const writer = new BatchWriter(db);
  const weekdays = recentWeekdays();
  let sessionCount = 0;

  for (let i = 0; i < STUDENT_UIDS.length; i++) {
    const uid = STUDENT_UIDS[i];
    const group = getGroup(i);
    const groupIndex = group === 'early' ? i
      : group === 'mid' ? i - 5
      : group === 'advanced' ? i - 13
      : i - 18;

    const masteredIndices = masteredIndicesForStudent(group, groupIndex);
    const { standardsDocs, currentIndex } = buildStandardsDocs(masteredIndices);
    const currentStdId = currentIndex !== null ? PROGRESSION[currentIndex] : null;

    for (const [standardId, data] of Object.entries(standardsDocs)) {
      writer.set(
        db.collection('studentProgress').doc(uid).collection('standards').doc(standardId),
        data,
        { merge: true }
      );
    }
    await writer.flushIfNeeded();

    for (const day of weekdays) {
      if (Math.random() > 0.75) continue; // not every student practices every day
      const date = toISODate(day);
      const session = buildSessionDoc({ classId: CLASS_ID, uid, date, currentStdId, masteredIndices, group });
      if (!session) continue;
      const docId = `${CLASS_ID}_${uid}_${date}`;
      writer.set(db.collection('sessions').doc(docId), session, { merge: true });
      sessionCount++;
      await writer.flushIfNeeded();
    }
  }

  await writer.flush();
  console.log(`  ✓ mastery data + ${sessionCount} session logs written (${writer.total} total writes)`);
}

async function main() {
  try {
    await seedClass();
    await enrollUsers();
    await seedMasteryAndSessions();
    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();

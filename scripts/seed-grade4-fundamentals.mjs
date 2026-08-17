/**
 * Seed Firestore with:
 *   - courses/grade4-math            (rename label to '4th Grade Standards')
 *   - courses/grade4-fundamentals-math  (new course, contentKey 'fundamentals-math')
 *   - standards/{id}                 (25 standards: mult ×0–×12, div ÷1–÷12)
 *
 * Usage: node scripts/seed-grade4-fundamentals.mjs
 * Safe to re-run (all writes use set with merge).
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

const RENAMED_COURSE = {
  id: 'grade4-math',
  label: '4th Grade Standards'
};

const NEW_COURSE = {
  id: 'grade4-fundamentals-math',
  label: '4th Grade Fundamentals',
  grade: '4',
  subject: 'math',
  contentKey: 'fundamentals-math',
  progressionType: 'mastery',
  schoolId: null
};

// ---------------------------------------------------------------------------
// Standards — one tier at a time, no review rows.
// Multiplication: cumulative through ×N (N = 0..12), includes 0.
// Division: cumulative through ÷N (N = 1..12), no remainders, no ÷0.
// ---------------------------------------------------------------------------

const STANDARDS = [];

for (let n = 0; n <= 12; n++) {
  STANDARDS.push({
    id: `fund4-mult-${n}`,
    label: `Multiplication up to ×${n}`,
    description: n === 0
      ? 'Multiply any number 0–12 by 0.'
      : `Multiply any number 0–12 by a factor from 0 through ${n}.`,
    level: 'A',
    order: n + 1,
    timeLimit: 60,
    problemsPerPage: 8
  });
}

for (let n = 1; n <= 12; n++) {
  STANDARDS.push({
    id: `fund4-div-${n}`,
    label: `Division up to ÷${n}`,
    description: n === 1
      ? 'Divide any number 0–12 by 1.'
      : `Divide using a divisor from 1 through ${n}, no remainders.`,
    level: 'B',
    order: 13 + n,
    timeLimit: 60,
    problemsPerPage: 8
  });
}

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function renameGrade4Math() {
  console.log('Renaming courses/grade4-math...');
  const ref = db.collection('courses').doc(RENAMED_COURSE.id);
  await ref.set({ label: RENAMED_COURSE.label }, { merge: true });
  console.log(`  ✓ courses/${RENAMED_COURSE.id}.label = "${RENAMED_COURSE.label}"`);
}

async function seedNewCourse() {
  console.log('Seeding new course...');
  const ref = db.collection('courses').doc(NEW_COURSE.id);
  await ref.set(NEW_COURSE, { merge: true });
  console.log(`  ✓ Upserted courses/${NEW_COURSE.id} (contentKey: ${NEW_COURSE.contentKey})`);
}

async function seedStandards() {
  console.log('Seeding standards...');
  const batch = db.batch();
  for (const std of STANDARDS) {
    const ref = db.collection('standards').doc(std.id);
    batch.set(ref, { ...std, courseId: NEW_COURSE.id }, { merge: true });
  }
  await batch.commit();
  console.log(`  ✓ Upserted ${STANDARDS.length} standards`);
}

async function main() {
  try {
    await renameGrade4Math();
    await seedNewCourse();
    await seedStandards();
    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();

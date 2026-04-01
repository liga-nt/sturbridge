/**
 * Seed Firestore with:
 *   - courses/grade5-math  (updates contentKey to 'fundamentals-math')
 *   - standards/{id}       (18 standards for levels C and D)
 *
 * Usage: node scripts/seed-fundamentals.mjs
 * Safe to re-run (all writes use set with merge).
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

const COURSE = {
  id: 'grade5-math',
  label: '5th Grade Fundamentals',
  grade: '5',
  subject: 'math',
  contentKey: 'fundamentals-math',
  progressionType: 'mastery',
  schoolId: null
};

// ---------------------------------------------------------------------------
// Standards — Levels C and D (no review rows)
// timeLimit: seconds for mastery attempt (default 60, tune after testing)
// problemsPerPage: problems shown per page (default 8, tune after testing)
// ---------------------------------------------------------------------------

const STANDARDS = [
  // Level C — Multiplication and Division
  {
    id: 'fund-c-mult-3',
    label: 'Multiplication up to ×3',
    description: 'Multiply any single-digit number by 1, 2, or 3.',
    level: 'C',
    order: 1,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-c-mult-5',
    label: 'Multiplication up to ×5',
    description: 'Multiply any single-digit number by 1 through 5.',
    level: 'C',
    order: 2,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-c-mult-7',
    label: 'Multiplication up to ×7',
    description: 'Multiply any single-digit number by 1 through 7.',
    level: 'C',
    order: 3,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-c-mult-9',
    label: 'Multiplication up to ×9',
    description: 'Full times tables: multiply any single-digit number by 1 through 9.',
    level: 'C',
    order: 4,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-c-mult-2x1',
    label: 'Multiplication: 2 Digits × 1 Digit',
    description: 'Multiply a 2-digit number (10–99) by a single-digit number (1–9).',
    level: 'C',
    order: 5,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-c-mult-34x1',
    label: 'Multiplication: 3–4 Digits × 1 Digit',
    description: 'Multiply a 3- or 4-digit number by a single-digit number (1–9).',
    level: 'C',
    order: 6,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-c-div-intro',
    label: 'Introduction to Division',
    description: 'Basic division facts using single-digit divisors, no remainders.',
    level: 'C',
    order: 7,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-c-div-rem',
    label: 'Division with Remainders',
    description: 'Divide whole numbers by a single-digit divisor; interpret the remainder.',
    level: 'C',
    order: 8,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-c-div-2x1',
    label: 'Division: 2 Digits ÷ 1 Digit',
    description: 'Divide a 2-digit number (10–99) by a single-digit divisor (1–9).',
    level: 'C',
    order: 9,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-c-div-3x1',
    label: 'Division: 3 Digits ÷ 1 Digit',
    description: 'Divide a 3-digit number (100–999) by a single-digit divisor (1–9).',
    level: 'C',
    order: 10,
    timeLimit: 60,
    problemsPerPage: 8
  },

  // Level D — Long Division and Fractions
  {
    id: 'fund-d-mult-2x2',
    label: 'Multiplication: 2 Digits × 2 Digits',
    description: 'Multiply a 2-digit number (10–99) by another 2-digit number (10–99).',
    level: 'D',
    order: 11,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-d-mult-3x2',
    label: 'Multiplication: 3 Digits × 2 Digits',
    description: 'Multiply a 3-digit number (100–999) by a 2-digit number (10–99).',
    level: 'D',
    order: 12,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-d-addsub',
    label: 'Addition and Subtraction',
    description: 'Add and subtract multi-digit numbers up to 4 digits with regrouping.',
    level: 'D',
    order: 13,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-d-multdiv',
    label: 'Multiplication and Division',
    description: 'Mixed multiplication and division problems covering 2-digit operands.',
    level: 'D',
    order: 14,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-d-div-2digit',
    label: 'Division by 2-Digit Numbers',
    description: 'Divide whole numbers by a 2-digit divisor (10–99).',
    level: 'D',
    order: 15,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-d-div-quotients',
    label: 'Division: Multi-Digit Quotients',
    description: 'Long division problems that produce quotients of 2 or more digits.',
    level: 'D',
    order: 16,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-d-fractions',
    label: 'Fractions',
    description: 'Add and subtract fractions with the same denominator.',
    level: 'D',
    order: 17,
    timeLimit: 60,
    problemsPerPage: 8
  },
  {
    id: 'fund-d-reduction',
    label: 'Reduction',
    description: 'Simplify fractions to lowest terms by finding the greatest common factor.',
    level: 'D',
    order: 18,
    timeLimit: 60,
    problemsPerPage: 8
  }
];

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedCourse() {
  console.log('Seeding course...');
  const ref = db.collection('courses').doc(COURSE.id);
  await ref.set(COURSE, { merge: true });
  console.log(`  ✓ Upserted courses/${COURSE.id} (contentKey: ${COURSE.contentKey})`);
}

async function seedStandards() {
  console.log('Seeding standards...');
  const batch = db.batch();
  for (const std of STANDARDS) {
    const ref = db.collection('standards').doc(std.id);
    batch.set(ref, { ...std, courseId: COURSE.id }, { merge: true });
  }
  await batch.commit();
  console.log(`  ✓ Upserted ${STANDARDS.length} standards`);
}

async function main() {
  try {
    await seedCourse();
    await seedStandards();
    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();

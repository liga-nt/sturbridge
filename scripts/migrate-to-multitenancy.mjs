/**
 * migrate-to-multitenancy.mjs
 *
 * One-time migration to introduce multi-tenant schema:
 *   - schools/{schoolId}     (creates "default" school)
 *   - courses/{courseId}     (seeds 3 courses)
 *   - standards/*            (adds courseId field to all existing standards)
 *   - classes/*              (adds courseId + schoolId to all existing classes)
 *   - users/*                (adds schoolId to all existing users)
 *   - invites/*              (adds schoolId to all existing invites)
 *
 * Safe to re-run (all writes use set/update with merge where appropriate).
 *
 * Usage: node scripts/migrate-to-multitenancy.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Schools
// ---------------------------------------------------------------------------

const SCHOOLS = [
  {
    id: 'default',
    name: 'Demo School',
    domain: null
  }
];

// ---------------------------------------------------------------------------
// Courses
// Each course maps to a set of standards (by courseId) and a code-side content
// pack (contentKey). contentKey: null means questions live entirely in Firestore.
// progressionType: default engine for new classes using this course.
// ---------------------------------------------------------------------------

const COURSES = [
  {
    id: 'grade4-math',
    label: '4th Grade Standards',
    grade: '4',
    subject: 'math',
    contentKey: 'mcas-grade4-math',   // code-side generator/grader registry key
    progressionType: 'mastery',
    schoolId: null                     // null = available to all schools
  },
  {
    id: 'grade4-fundamentals-math',
    label: '4th Grade Fundamentals',
    grade: '4',
    subject: 'math',
    contentKey: 'fundamentals-math',
    progressionType: 'mastery',
    schoolId: null
  },
  {
    id: 'grade5-math',
    label: '5th Grade Fundamentals',
    grade: '5',
    subject: 'math',
    contentKey: 'mcas-grade5-math',
    progressionType: 'mastery',
    schoolId: null
  },
  {
    id: 'grade7-greek',
    label: '7th Grade Intro to Greek',
    grade: '7',
    subject: 'greek',
    contentKey: null,                  // questions stored in Firestore, no generators yet
    progressionType: 'mastery',
    schoolId: null
  }
];

// ---------------------------------------------------------------------------
// Standards → courseId mapping (grade+subject → courseId)
// ---------------------------------------------------------------------------

function courseIdForStandard(grade, subject) {
  if (grade === '4' && subject === 'math') return 'grade4-math';
  if (grade === '5' && subject === 'math') return 'grade5-math';
  if (grade === '7' && subject === 'greek') return 'grade7-greek';
  return null;
}

// ---------------------------------------------------------------------------
// Classes → courseId mapping (grade+subject → courseId)
// ---------------------------------------------------------------------------

function courseIdForClass(grade, subject) {
  return courseIdForStandard(grade, subject) ?? 'grade4-math';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  console.log('=== Migrating to multi-tenant schema ===\n');

  // 1. Schools
  console.log('--- schools ---');
  for (const school of SCHOOLS) {
    const { id, ...data } = school;
    await db.collection('schools').doc(id).set(data, { merge: true });
    console.log(`  ✓ schools/${id}`);
  }

  // 2. Courses
  console.log('\n--- courses ---');
  for (const course of COURSES) {
    const { id, ...data } = course;
    await db.collection('courses').doc(id).set(data, { merge: true });
    console.log(`  ✓ courses/${id}  (${data.label})`);
  }

  // 3. Standards — add courseId
  console.log('\n--- standards (adding courseId) ---');
  const standardsSnap = await db.collection('standards').get();
  let stdUpdated = 0;
  for (const docSnap of standardsSnap.docs) {
    const data = docSnap.data();
    const courseId = courseIdForStandard(data.grade, data.subject);
    if (courseId && data.courseId !== courseId) {
      await docSnap.ref.update({ courseId });
      stdUpdated++;
    }
  }
  console.log(`  ✓ ${stdUpdated} standards updated (${standardsSnap.size - stdUpdated} already current)`);

  // 4. Classes — add courseId + schoolId
  console.log('\n--- classes (adding courseId + schoolId) ---');
  const classesSnap = await db.collection('classes').get();
  let classUpdated = 0;
  for (const docSnap of classesSnap.docs) {
    const data = docSnap.data();
    const updates = {};
    if (!data.courseId) {
      updates.courseId = courseIdForClass(data.grade, data.subject);
    }
    if (!data.schoolId) {
      updates.schoolId = 'default';
    }
    if (Object.keys(updates).length > 0) {
      await docSnap.ref.update(updates);
      classUpdated++;
      console.log(`  ✓ classes/${docSnap.id}  → courseId:${updates.courseId || data.courseId}`);
    }
  }
  if (classUpdated === 0) console.log('  (all classes already current)');

  // 5. Users — add schoolId
  console.log('\n--- users (adding schoolId) ---');
  const usersSnap = await db.collection('users').get();
  let userUpdated = 0;
  for (const docSnap of usersSnap.docs) {
    if (!docSnap.data().schoolId) {
      await docSnap.ref.update({ schoolId: 'default' });
      userUpdated++;
    }
  }
  console.log(`  ✓ ${userUpdated} users updated`);

  // 6. Invites — add schoolId
  console.log('\n--- invites (adding schoolId) ---');
  const invitesSnap = await db.collection('invites').get();
  let inviteUpdated = 0;
  for (const docSnap of invitesSnap.docs) {
    if (!docSnap.data().schoolId) {
      await docSnap.ref.update({ schoolId: 'default' });
      inviteUpdated++;
    }
  }
  console.log(`  ✓ ${inviteUpdated} invites updated`);

  console.log('\n=== Migration complete ===');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

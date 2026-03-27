/**
 * Seed Firestore with demo data:
 *   - invites/{email}               (3 real users)
 *   - users/{uid}                   (2 mock teachers + 40 mock students)
 *   - classes/{classId}             (2 classes)
 *   - studentProgress/{uid}         (40 students, varied mastery states)
 *   - studentProgress/{uid}/standards/{standardId}  (mastered/streak/attempts)
 *
 * Usage: node scripts/seed-demo.mjs
 * Safe to re-run (all writes are set with merge).
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Standard progression (default ordering, matches seed-firestore.mjs order)
// ---------------------------------------------------------------------------

const PROGRESSION = [
  '4.OA.B.4', '4.OA.A.1', '4.OA.A.2', '4.OA.A.3', '4.OA.C.5',
  '4.NBT.A.1', '4.NBT.A.2', '4.NBT.A.3', '4.NBT.B.4', '4.NBT.B.5', '4.NBT.B.6',
  '4.NF.A.1', '4.NF.A.2', '4.NF.B.3', '4.NF.B.4', '4.NF.C.5', '4.NF.C.6', '4.NF.C.7',
  '4.MD.A.1', '4.MD.A.2', '4.MD.A.3', '4.MD.B.4',
  '4.MD.C.5', '4.MD.C.6', '4.MD.C.7',
  '4.G.A.1', '4.G.A.2', '4.G.A.3'
];

// ---------------------------------------------------------------------------
// Student names
// ---------------------------------------------------------------------------

const CLASS1_NAMES = [
  'Aiden', 'Sofia', 'Marcus', 'Priya', 'Jaylen',
  'Emma', 'Carlos', 'Zoe', 'Tyler', 'Aaliyah',
  'Connor', 'Maya', 'Isaiah', 'Elena', 'Ethan',
  'Jasmine', 'Brandon', 'Nadia', 'Kevin', 'Lily'
];

const CLASS2_NAMES = [
  'Diego', 'Avery', 'Malik', 'Chloe', 'Jordan',
  'Layla', 'Ryan', 'Amara', 'Lucas', 'Destiny',
  'Owen', 'Fatima', 'Dylan', 'Xiomara', 'Samuel',
  'Brianna', 'Caleb', 'Mia', 'Elijah', 'Yara'
];

// ---------------------------------------------------------------------------
// Progress profile builders
// ---------------------------------------------------------------------------

/**
 * Build a studentProgress top-level doc and standards sub-docs.
 * group: 'early' | 'mid' | 'advanced' | 'mixed'
 * offset: 0 for Class 1, 1 for Class 2 (slight variation)
 */
function buildProgress(uid, classId, group, index, offset = 0) {
  let masteredCount, progressionIndex, streakOnCurrent, attemptsOnCurrent;

  if (group === 'early') {
    masteredCount = 0;
    progressionIndex = 0;
    streakOnCurrent = index % 2; // 0 or 1
    attemptsOnCurrent = 2 + index + offset;
  } else if (group === 'mid') {
    masteredCount = 3 + index + offset; // 3–10 mastered, varies nicely
    progressionIndex = masteredCount;
    streakOnCurrent = index % 2;
    attemptsOnCurrent = 4 + index;
  } else if (group === 'advanced') {
    masteredCount = 7 + index + offset;
    progressionIndex = masteredCount;
    streakOnCurrent = 1;
    attemptsOnCurrent = 6 + index;
  } else {
    // mixed: mastered at scattered indices
    const scatterA = [0, 2, 5, 8];
    const scatterB = [0, 1, 4, 7, 10];
    const scatter = index === 0 ? scatterA : scatterB;
    masteredCount = scatter.length;
    progressionIndex = Math.max(...scatter) + 1;
    streakOnCurrent = 0;
    attemptsOnCurrent = 8;
    return buildMixedProgress(uid, classId, scatter, progressionIndex, attemptsOnCurrent);
  }

  // Clamp to valid range
  masteredCount = Math.min(masteredCount, PROGRESSION.length - 3);
  progressionIndex = Math.min(progressionIndex, PROGRESSION.length - 3);

  const activeStandardIds = [
    PROGRESSION[progressionIndex] || PROGRESSION[PROGRESSION.length - 3],
    PROGRESSION[progressionIndex + 1] || PROGRESSION[PROGRESSION.length - 2],
    PROGRESSION[progressionIndex + 2] || PROGRESSION[PROGRESSION.length - 1]
  ];

  const topDoc = {
    activeStandardIds,
    roundRobinIndex: (index * 3 + offset) % 3,
    questionCount: masteredCount * 10 + index * 2 + offset,
    progressionIndex,
    classId
  };

  const standardsDocs = {};
  // Mastered standards
  for (let i = 0; i < masteredCount; i++) {
    standardsDocs[PROGRESSION[i]] = {
      mastered: true,
      streak: 2,
      attempts: 8 + i + offset,
      assistedAttempts: i % 3 === 0 ? 1 : 0,
      questionsSeenIds: [],
      inReviewQueue: false
    };
  }
  // Active standards (in progress)
  for (let i = 0; i < 3; i++) {
    const sid = PROGRESSION[progressionIndex + i];
    if (sid) {
      standardsDocs[sid] = {
        mastered: false,
        streak: i === 0 ? streakOnCurrent : 0,
        attempts: i === 0 ? attemptsOnCurrent : Math.max(0, attemptsOnCurrent - 3),
        assistedAttempts: 0,
        questionsSeenIds: [],
        inReviewQueue: false
      };
    }
  }

  return { topDoc, standardsDocs };
}

function buildMixedProgress(uid, classId, masteredIndices, progressionIndex, attempts) {
  const activeStandardIds = [
    PROGRESSION[progressionIndex] || PROGRESSION[PROGRESSION.length - 3],
    PROGRESSION[progressionIndex + 1] || PROGRESSION[PROGRESSION.length - 2],
    PROGRESSION[progressionIndex + 2] || PROGRESSION[PROGRESSION.length - 1]
  ];

  const topDoc = {
    activeStandardIds,
    roundRobinIndex: 1,
    questionCount: masteredIndices.length * 10 + 4,
    progressionIndex,
    classId
  };

  const standardsDocs = {};
  for (const i of masteredIndices) {
    if (PROGRESSION[i]) {
      standardsDocs[PROGRESSION[i]] = {
        mastered: true,
        streak: 2,
        attempts: attempts + i,
        assistedAttempts: 0,
        questionsSeenIds: [],
        inReviewQueue: false
      };
    }
  }
  for (let i = 0; i < 3; i++) {
    const sid = PROGRESSION[progressionIndex + i];
    if (sid && !masteredIndices.includes(progressionIndex + i)) {
      standardsDocs[sid] = {
        mastered: false,
        streak: 0,
        attempts: 3,
        assistedAttempts: 1,
        questionsSeenIds: [],
        inReviewQueue: false
      };
    }
  }

  return { topDoc, standardsDocs };
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

async function seedInvites() {
  console.log('Seeding invites...');
  const batch = db.batch();

  batch.set(db.collection('invites').doc('npresnall@gmail.com'), {
    role: 'student',
    classIds: ['demo-class-001'],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  batch.set(db.collection('invites').doc('npresnall@planyourrecovery.com'), {
    role: 'admin',
    classIds: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  batch.set(db.collection('invites').doc('ned@lexaudio.app'), {
    role: 'dev',
    classIds: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await batch.commit();
  console.log('  ✓ 3 invites written');
}

async function seedTeachers() {
  console.log('Seeding mock teachers...');
  const batch = db.batch();

  batch.set(db.collection('users').doc('demo-teacher-001'), {
    uid: 'demo-teacher-001',
    displayName: 'Ms. Chen',
    email: 'ms.chen.demo@sturbridge.test',
    role: 'teacher',
    classIds: ['demo-class-001']
  }, { merge: true });

  batch.set(db.collection('users').doc('demo-teacher-002'), {
    uid: 'demo-teacher-002',
    displayName: 'Mr. Rivera',
    email: 'mr.rivera.demo@sturbridge.test',
    role: 'teacher',
    classIds: ['demo-class-002']
  }, { merge: true });

  await batch.commit();
  console.log('  ✓ 2 mock teachers written');
}

async function seedClasses(class1StudentIds, class2StudentIds) {
  console.log('Seeding classes...');
  const batch = db.batch();

  batch.set(db.collection('classes').doc('demo-class-001'), {
    classId: 'demo-class-001',
    name: 'Room 12, Ms. Chen',
    teacherId: 'demo-teacher-001',
    grade: '4',
    subject: 'math',
    studentIds: class1StudentIds,
    standardProgression: PROGRESSION
  }, { merge: true });

  batch.set(db.collection('classes').doc('demo-class-002'), {
    classId: 'demo-class-002',
    name: 'Room 14, Mr. Rivera',
    teacherId: 'demo-teacher-002',
    grade: '4',
    subject: 'math',
    studentIds: class2StudentIds,
    standardProgression: PROGRESSION
  }, { merge: true });

  await batch.commit();
  console.log('  ✓ 2 classes written');
}

async function seedStudents(names, uidPrefix, classId, startIndex, offset) {
  console.log(`Seeding students for ${classId}...`);
  const writer = new BatchWriter(db);
  const uids = [];

  // Group assignments: Early=0..4, Mid=5..12, Advanced=13..17, Mixed=18..19
  const getGroup = (i) => {
    if (i < 5) return 'early';
    if (i < 13) return 'mid';
    if (i < 18) return 'advanced';
    return 'mixed';
  };

  for (let i = 0; i < names.length; i++) {
    const n = startIndex + i;
    const uid = `${uidPrefix}-${String(n).padStart(3, '0')}`;
    uids.push(uid);
    const group = getGroup(i);
    const groupIndex = group === 'early' ? i
      : group === 'mid' ? i - 5
      : group === 'advanced' ? i - 13
      : i - 18;

    // User doc
    writer.set(db.collection('users').doc(uid), {
      uid,
      displayName: names[i],
      email: `${names[i].toLowerCase()}@demo.sturbridge.test`,
      role: 'student',
      classIds: [classId]
    }, { merge: true });

    // Progress
    const { topDoc, standardsDocs } = buildProgress(uid, classId, group, groupIndex, offset);
    writer.set(db.collection('studentProgress').doc(uid), topDoc, { merge: true });

    for (const [standardId, data] of Object.entries(standardsDocs)) {
      writer.set(
        db.collection('studentProgress').doc(uid).collection('standards').doc(standardId),
        data,
        { merge: true }
      );
    }

    await writer.flushIfNeeded();
  }

  await writer.flush();
  console.log(`  ✓ ${names.length} students written (${writer.total} total writes)`);
  return uids;
}

async function main() {
  try {
    await seedInvites();
    await seedTeachers();

    const class1Uids = await seedStudents(CLASS1_NAMES, 'demo-student', 'demo-class-001', 1, 0);
    const class2Uids = await seedStudents(CLASS2_NAMES, 'demo-student', 'demo-class-002', 21, 1);

    await seedClasses(class1Uids, class2Uids);

    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();

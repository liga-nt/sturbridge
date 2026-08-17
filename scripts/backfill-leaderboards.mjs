/**
 * Rebuilds every leaderboards/{classId}_{standardId} doc from the
 * authoritative studentProgress/{uid}/standards/{standardId} data.
 *
 * Needed because updateLeaderboard() used to truncate to the top 5 entries
 * at write time, permanently discarding lower-ranked students from the
 * shared leaderboard doc (their own bestTime was always safe in their own
 * studentProgress doc — just never mirrored). This rebuild restores the
 * full list for every fundamentals-math class from that source of truth.
 *
 * Usage: node scripts/backfill-leaderboards.mjs
 * Safe to re-run — fully overwrites each leaderboard doc from current state.
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const coursesSnap = await db.collection('courses').get();
  const fundamentalsCourseIds = new Set(
    coursesSnap.docs.filter(d => d.data().contentKey === 'fundamentals-math').map(d => d.id)
  );

  const classesSnap = await db.collection('classes').get();
  const classes = classesSnap.docs
    .map(d => ({ classId: d.id, ...d.data() }))
    .filter(c => fundamentalsCourseIds.has(c.courseId));

  console.log(`Found ${classes.length} fundamentals-math class(es) to rebuild.\n`);

  // Existing leaderboard docs are the ground truth for "who has actually
  // played in this class" — class.studentIds and class.standardProgression
  // can both be stale/empty (e.g. rosters not kept in sync, or progression
  // left blank so it falls back to course order), so union them in rather
  // than trusting the class doc alone.
  const leaderboardsSnap = await db.collection('leaderboards').get();
  const uidsByClassStandard = {}; // { classId: { standardId: Set<uid> } }
  for (const d of leaderboardsSnap.docs) {
    const sep = d.id.indexOf('_');
    if (sep === -1) continue;
    const classId = d.id.slice(0, sep);
    const standardId = d.id.slice(sep + 1);
    const uids = (d.data().entries ?? []).map(e => e.uid);
    (uidsByClassStandard[classId] ??= {})[standardId] = new Set(uids);
  }

  let totalDocsWritten = 0;

  for (const cls of classes) {
    let standardIds = cls.standardProgression || [];
    if (standardIds.length === 0) {
      const stdSnap = await db.collection('standards').where('courseId', '==', cls.courseId).get();
      standardIds = stdSnap.docs.map(d => d.id);
    }
    const existingUidsForClass = uidsByClassStandard[cls.classId] || {};
    const rosterUids = new Set(cls.studentIds || []);
    for (const uidSet of Object.values(existingUidsForClass)) {
      for (const uid of uidSet) rosterUids.add(uid);
    }
    const studentIds = [...rosterUids];
    if (studentIds.length === 0 || standardIds.length === 0) continue;

    // Load displayNames once per class
    const userDocs = await Promise.all(studentIds.map(uid => db.collection('users').doc(uid).get()));
    const nameByUid = {};
    userDocs.forEach((snap, i) => {
      nameByUid[studentIds[i]] = snap.exists ? (snap.data().displayName || studentIds[i]) : studentIds[i];
    });

    // Load every student's standard states in one shot
    const statesByUid = {};
    await Promise.all(studentIds.map(async (uid) => {
      const snap = await db.collection('studentProgress').doc(uid).collection('standards').get();
      const map = {};
      snap.forEach(d => { map[d.id] = d.data(); });
      statesByUid[uid] = map;
    }));

    const batch = db.batch();
    let classDocsWritten = 0;

    for (const standardId of standardIds) {
      const entries = studentIds
        .map(uid => {
          const state = statesByUid[uid]?.[standardId];
          if (!state?.mastered || typeof state.bestTime !== 'number') return null;
          return { uid, name: nameByUid[uid], bestTime: state.bestTime };
        })
        .filter(Boolean)
        .sort((a, b) => a.bestTime - b.bestTime);

      if (entries.length === 0) continue;

      const ref = db.collection('leaderboards').doc(`${cls.classId}_${standardId}`);
      batch.set(ref, { entries });
      classDocsWritten++;
    }

    if (classDocsWritten > 0) {
      await batch.commit();
      console.log(`  ✓ ${cls.name || cls.classId}: rebuilt ${classDocsWritten} leaderboard doc(s)`);
      totalDocsWritten += classDocsWritten;
    } else {
      console.log(`  – ${cls.name || cls.classId}: no mastered standards yet, skipped`);
    }
  }

  console.log(`\nDone. ${totalDocsWritten} leaderboard doc(s) rebuilt.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

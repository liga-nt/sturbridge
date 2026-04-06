/**
 * Seed a dev class for the grade7-greek course so that the dev role
 * can access it via the student view.
 *
 * Usage: node scripts/seed-dev-greek-class.mjs
 * Safe to re-run (uses set with merge).
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
    await db.collection('classes').doc('dev-greek-001').set({
        name:             'Dev Greek Class',
        courseId:         'grade7-greek',
        schoolId:         null,
        progressionType:  'linear',
        teacherId:        null,
        studentIds:       [],
        standardProgression: []
    }, { merge: true });

    console.log('Wrote classes/dev-greek-001 (courseId: grade7-greek)');
}

main().catch(e => { console.error(e); process.exit(1); });

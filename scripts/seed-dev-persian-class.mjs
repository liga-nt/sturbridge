/**
 * Seed Firestore for the Persian alphabet course:
 *   - courses/persian-alphabet  (contentKey: 'persian-immersive')
 *   - classes/dev-persian-001   (dev access class)
 *
 * Usage: node scripts/seed-dev-persian-class.mjs
 * Safe to re-run (uses set with merge).
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
    await db.collection('courses').doc('persian-alphabet').set({
        label:       'Persian Alphabet',
        grade:       null,
        subject:     'Persian',
        contentKey:  'persian-immersive',
        schoolId:    null,
    }, { merge: true });

    console.log('Wrote courses/persian-alphabet (contentKey: persian-immersive)');

    await db.collection('classes').doc('dev-persian-001').set({
        name:                'Dev Persian Class',
        courseId:            'persian-alphabet',
        schoolId:            null,
        progressionType:     'none',
        teacherId:           null,
        studentIds:          [],
        standardProgression: []
    }, { merge: true });

    console.log('Wrote classes/dev-persian-001 (courseId: persian-alphabet)');
}

main().catch(e => { console.error(e); process.exit(1); });

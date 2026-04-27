/**
 * Seed Firestore for the Hebrew alphabet course:
 *   - courses/hebrew-alphabet  (contentKey: 'hebrew-immersive', progressionType: 'none')
 *
 * Usage: node scripts/seed-dev-hebrew-class.mjs
 * Safe to re-run (uses set with merge).
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
    await db.collection('courses').doc('hebrew-alphabet').set({
        label:           'Hebrew Alphabet',
        grade:           null,
        subject:         'Hebrew',
        contentKey:      'hebrew-immersive',
        progressionType: 'none',
        schoolId:        null,
    }, { merge: true });

    console.log('Wrote courses/hebrew-alphabet (contentKey: hebrew-immersive, progressionType: none)');
}

main().catch(e => { console.error(e); process.exit(1); });

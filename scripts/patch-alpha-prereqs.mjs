/**
 * Mark all alpha.* standards as pre-covered in story_bible/grade7-greek.
 * These are alphabet prerequisite standards students learn before Chapter 1.
 *
 * Usage: node scripts/patch-alpha-prereqs.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const ALPHA_STANDARD_IDS = [
    'alpha.order',
    'alpha.names',
    'alpha.transliterate_gk_en',
    'alpha.transliterate_en_gk',
    'alpha.case_transform',
    'alpha.adjacent',
];

await db.collection('story_bible').doc('grade7-greek').update({
    'standards.covered': admin.firestore.FieldValue.arrayUnion(...ALPHA_STANDARD_IDS)
});

console.log(`Marked ${ALPHA_STANDARD_IDS.length} alpha standards as pre-covered.`);
process.exit(0);

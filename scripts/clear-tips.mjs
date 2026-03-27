/**
 * Deletes all documents in the tips/ collection.
 * Run this before switching to the questionVariants-based system.
 *
 * Usage: node scripts/clear-tips.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('tips').get();
  if (snap.empty) {
    console.log('tips/ collection is already empty.');
    process.exit(0);
  }

  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log(`Deleted ${snap.size} tip documents.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

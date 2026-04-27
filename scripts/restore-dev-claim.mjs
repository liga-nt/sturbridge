/**
 * Restores dev custom claims for a given email.
 * Usage: node scripts/restore-dev-claim.mjs npresnall@gmail.com
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const email = process.argv[2];
if (!email) { console.error('Usage: node restore-dev-claim.mjs <email>'); process.exit(1); }

const user = await admin.auth().getUserByEmail(email);
await admin.auth().setCustomUserClaims(user.uid, { role: 'dev', classIds: [], schoolId: null });
console.log(`✓ Restored dev claims for ${email} (uid: ${user.uid})`);
console.log('  Sign out and back in (or hard-refresh) to pick up the new token.');

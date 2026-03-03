/**
 * One-time script to grant the dev custom claim to a Firebase user.
 * Usage: node scripts/set-dev-claim.js your@email.com
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const email = process.argv[2];
if (!email) {
    console.error('Usage: node scripts/set-dev-claim.js <email>');
    process.exit(1);
}

admin.auth().getUserByEmail(email)
    .then(user => admin.auth().setCustomUserClaims(user.uid, { role: 'dev' }))
    .then(() => {
        console.log(`✓ Set role: dev for ${email}`);
        console.log('  Sign out and back in to refresh the token.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });

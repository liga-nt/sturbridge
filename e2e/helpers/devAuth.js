// Mints a Firebase custom token for a dedicated e2e-only dev-role account and
// signs a Playwright page in via /e2e-signin, bypassing the Google popup flow
// that browser automation can't drive. Uses the same service account file as
// scripts/seed-demo.mjs, against the real project (no local emulator here).
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const E2E_DEV_UID = 'e2e-dev-bot';

let admin = null;
function getAdmin() {
    if (admin) return admin;
    admin = require('firebase-admin');
    if (!admin.apps.length) {
        const serviceAccount = require(
            path.join(__dirname, '../../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json')
        );
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    return admin;
}

async function mintDevToken() {
    const auth = getAdmin().auth();

    try {
        await auth.getUser(E2E_DEV_UID);
    } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
        await auth.createUser({
            uid: E2E_DEV_UID,
            email: 'e2e-dev-bot@sturbridge.test',
            emailVerified: true,
            displayName: 'E2E Dev Bot'
        });
    }
    // Idempotent — cheap to set on every run, keeps the claim from drifting.
    await auth.setCustomUserClaims(E2E_DEV_UID, { role: 'dev' });
    return auth.createCustomToken(E2E_DEV_UID);
}

export async function signInAsDev(page, { next } = {}) {
    const token = await mintDevToken();
    const url = `/e2e-signin?token=${encodeURIComponent(token)}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
    await page.goto(url);
    await page.waitForURL((u) => !u.pathname.includes('/e2e-signin'), { timeout: 15000 });
}

// src/routes/+layout.js
import { initializeFirebase, auth } from '$lib/firebase/client';
import { session } from '$lib/stores/session';
import { browser } from '$app/environment';
import { onAuthStateChanged } from 'firebase/auth';

export async function load({ url }) {
    if (browser) {
        try {
            initializeFirebase();
            await new Promise((resolve) => {
                let resolved = false;
                onAuthStateChanged(auth, async (currentUser) => {
                    if (currentUser) {
                        const tokenResult = await currentUser.getIdTokenResult(true);
                        session.set({
                            user: currentUser,
                            loggedIn: true,
                            loading: false,
                            role: tokenResult.claims.role ?? null
                        });
                    } else {
                        session.set({
                            user: null,
                            loggedIn: false,
                            loading: false,
                            role: null
                        });
                    }
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                });
            });
        } catch (ex) {
            console.error(ex);
            session.set({
                user: null,
                loggedIn: false,
                loading: false,
                role: null
            });
        }
    }

    return { url: url.pathname };
}

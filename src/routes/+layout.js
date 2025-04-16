// src/routes/+layout.js
import { initializeFirebase, auth } from '$lib/firebase/client';
import { session } from '$lib/stores/session';
import { browser } from '$app/environment';
import { onAuthStateChanged } from 'firebase/auth';

// Remove ssr = false to allow server-side data loading
// export const ssr = false;

export async function load({ url }) {
    // Handle auth only on the client
    if (browser) {
        try {
            initializeFirebase();
            await new Promise((resolve) => {
                const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                    session.set({
                        user: currentUser,
                        loggedIn: !!currentUser,
                        loading: false
                    });
                    unsubscribe();
                    resolve();
                });
            });
        } catch (ex) {
            console.error(ex);
            session.set({
                user: null,
                loggedIn: false,
                loading: false
            });
        }
    }

    return {
        url: url.pathname
    };
}
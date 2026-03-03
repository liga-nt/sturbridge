import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { browser } from '$app/environment';

let app;
let auth;
let functions;

const getConfig = () => ({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
});

export const initializeFirebase = () => {
    if (!browser) return null;

    if (!getApps().length) {
        app = initializeApp(getConfig());
    } else {
        app = getApps()[0];
    }

    auth = getAuth(app);
    functions = getFunctions(app);
    return app;
};

export { auth, functions };

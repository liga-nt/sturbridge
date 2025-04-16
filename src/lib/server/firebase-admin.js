// src/lib/server/firebase-admin.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';
import { join } from 'path';

const serviceAccount = JSON.parse(
    readFileSync(join(process.cwd(), 'clean-read-firebase-adminsdk-fbsvc-73c6658ec5.json'), 'utf8')
);

export const app = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: 'clean-read.firebasestorage.app'
});

export const db = getFirestore();
export const storage = getStorage();
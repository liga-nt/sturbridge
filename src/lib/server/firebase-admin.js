// src/lib/server/firebase-admin.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';
import { join } from 'path';

const serviceAccount = JSON.parse(
    readFileSync(join(process.cwd(), 'sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json'), 'utf8')
);

export const app = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: 'sturbridge.firebasestorage.app'
});

export const db = getFirestore();
export const storage = getStorage();
/**
 * analyze-ch1-audio.mjs
 * Downloads chapter 1 overview segments from Firestore and measures
 * integrated loudness (LUFS) via ffmpeg loudnorm.
 *
 * Usage: node scripts/analyze-ch1-audio.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'sturbridge-e59d9.firebasestorage.app'
});

const db = admin.firestore();

function measureLufs(url) {
    const tmpFile = `/tmp/analyze_${Date.now()}.mp3`;
    try {
        execSync(`curl -s -L "${url}" -o "${tmpFile}"`, { stdio: 'pipe' });
        const out = execSync(
            `ffmpeg -i "${tmpFile}" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`,
            { stdio: 'pipe' }
        ).toString();
        const match = out.match(/"input_i"\s*:\s*"([^"]+)"/);
        return match ? parseFloat(match[1]) : null;
    } catch (e) {
        return null;
    } finally {
        try { unlinkSync(tmpFile); } catch {}
    }
}

async function main() {
    // Find chapter 1 lesson
    const snap = await db.collection('lessons')
        .where('courseId', '==', 'grade7-greek')
        .where('chapter', '==', 1)
        .limit(1)
        .get();

    if (snap.empty) {
        console.error('No chapter 1 lesson found.');
        process.exit(1);
    }

    const lesson = snap.docs[0].data();
    const lessonId = snap.docs[0].id;
    const segments = lesson.overview?.segments ?? [];

    if (!segments.length) {
        console.error('No overview segments found on this lesson.');
        process.exit(1);
    }

    console.log(`Lesson: ${lessonId}  (${segments.length} segments)\n`);
    console.log('idx  speaker    LUFS    text');
    console.log('───  ─────────  ──────  ────────────────────────────────────────────');

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg.audioUrl) {
            console.log(`${String(i).padStart(3)}  ${(seg.speaker ?? '?').padEnd(9)}  (no audio)`);
            continue;
        }
        const lufs = measureLufs(seg.audioUrl);
        const lufsStr = lufs !== null ? `${lufs.toFixed(1)} LUFS` : '  error';
        const preview = seg.text.replace(/\[[^\]]*\]/g, '').trim().slice(0, 50);
        console.log(`${String(i).padStart(3)}  ${(seg.speaker ?? '?').padEnd(9)}  ${lufsStr.padEnd(8)}  ${preview}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });

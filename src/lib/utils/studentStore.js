/**
 * Firestore read/write helpers for student progress.
 *
 * All functions are async and assume Firebase has been initialized.
 * Import db from $lib/firebase/client (browser-only).
 */

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    getDocs,
    onSnapshot,
    serverTimestamp,
    where,
    orderBy,
    query
} from 'firebase/firestore';
import { db } from '$lib/firebase/client';

// ---------------------------------------------------------------------------
// Student state (top-level doc)
// ---------------------------------------------------------------------------

export async function loadStudentState(uid) {
    const snap = await getDoc(doc(db, 'studentProgress', uid));
    return snap.exists() ? snap.data() : null;
}

export async function saveStudentState(uid, state) {
    await setDoc(doc(db, 'studentProgress', uid), state, { merge: true });
}

// ---------------------------------------------------------------------------
// Standard state (subcollection)
// ---------------------------------------------------------------------------

export async function loadStandardState(uid, standardId) {
    const snap = await getDoc(doc(db, 'studentProgress', uid, 'standards', standardId));
    return snap.exists() ? snap.data() : null;
}

export async function saveStandardState(uid, standardId, state) {
    await setDoc(
        doc(db, 'studentProgress', uid, 'standards', standardId),
        state,
        { merge: true }
    );
}

/**
 * Load all standards sub-docs for a student.
 * Returns { [standardId]: standardState }
 */
export async function loadAllStandardStates(uid) {
    const snap = await getDocs(collection(db, 'studentProgress', uid, 'standards'));
    const result = {};
    snap.forEach((d) => { result[d.id] = d.data(); });
    return result;
}

// ---------------------------------------------------------------------------
// Tips
// ---------------------------------------------------------------------------

export async function loadTips(itemId) {
    const snap = await getDoc(doc(db, 'tips', itemId));
    return snap.exists() ? snap.data() : null;
}

// ---------------------------------------------------------------------------
// Leaderboard  (keyed by classId_standardId)
// ---------------------------------------------------------------------------

export function subscribeLeaderboard(classId, standardId, callback) {
    return onSnapshot(
        doc(db, 'leaderboards', `${classId}_${standardId}`),
        snap => callback(snap.exists() ? (snap.data().entries ?? []) : [])
    );
}

export async function updateLeaderboard(classId, standardId, uid, name, bestTime) {
    const ref = doc(db, 'leaderboards', `${classId}_${standardId}`);
    const snap = await getDoc(ref);
    let entries = snap.exists() ? (snap.data().entries ?? []) : [];
    entries = entries.filter(e => e.uid !== uid);
    entries.push({ uid, name, bestTime });
    entries.sort((a, b) => a.bestTime - b.bestTime);
    await setDoc(ref, { entries: entries.slice(0, 5) });
}

// ---------------------------------------------------------------------------
// Class doc
// ---------------------------------------------------------------------------

export async function loadClass(classId) {
    const snap = await getDoc(doc(db, 'classes', classId));
    return snap.exists() ? snap.data() : null;
}

/**
 * Load all class IDs. Used by dev role to access any class without being enrolled.
 */
export async function loadAllClassIds() {
    const snap = await getDocs(collection(db, 'classes'));
    return snap.docs.map(d => d.id);
}

// ---------------------------------------------------------------------------
// Assignment listener (real-time)
// ---------------------------------------------------------------------------

/**
 * Subscribe to live assignment pushes for a class.
 * Calls onAssignment(data) when active=true, onClear() when active=false.
 * Returns unsubscribe function.
 */
export function subscribeAssignment(classId, onAssignment, onClear) {
    return onSnapshot(doc(db, 'assignments', classId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.active) {
            onAssignment(data);
        } else {
            onClear();
        }
    });
}

// ---------------------------------------------------------------------------
// Write assignment response
// ---------------------------------------------------------------------------

export async function writeResponse(classId, uid, responseData) {
    await setDoc(
        doc(db, 'responses', `${classId}_${uid}_${Date.now()}`),
        {
            ...responseData,
            classId,
            studentId: uid,
            submittedAt: serverTimestamp()
        }
    );
}

// ---------------------------------------------------------------------------
// Courses collection
// ---------------------------------------------------------------------------

/**
 * Load all courses as a map { [courseId]: { id, label, grade, subject, ... } }
 */
export async function loadCourses() {
    const snap = await getDocs(collection(db, 'courses'));
    const result = {};
    snap.forEach((d) => { result[d.id] = { id: d.id, ...d.data() }; });
    return result;
}

/**
 * Load a single course doc. Returns null if not found.
 */
export async function loadCourse(courseId) {
    const snap = await getDoc(doc(db, 'courses', courseId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ---------------------------------------------------------------------------
// Standard info (from standards collection)
// ---------------------------------------------------------------------------

export async function loadStandard(standardId) {
    const snap = await getDoc(doc(db, 'standards', standardId));
    return snap.exists() ? snap.data() : null;
}

/**
 * Load all standards as a map { [standardId]: { shortName, description, ... } }
 */
export async function loadAllStandards() {
    const snap = await getDocs(collection(db, 'standards'));
    const result = {};
    snap.forEach((d) => { result[d.id] = d.data(); });
    return result;
}

/**
 * Load standards for a specific course, sorted by `order`.
 * Returns an ordered array of { id, shortName, description, order, ... }
 */
export async function loadStandardsByCourse(courseId) {
    const all = await loadAllStandards();
    return Object.values(all)
        .filter((s) => s.courseId === courseId)
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

// ---------------------------------------------------------------------------
// Lessons (Greek immersive course)
// ---------------------------------------------------------------------------

export async function loadLessons(courseId) {
    const [pubSnap, accSnap] = await Promise.all([
        getDocs(query(collection(db, 'lessons'), where('courseId', '==', courseId), where('status', '==', 'published'))),
        getDocs(query(collection(db, 'lessons'), where('courseId', '==', courseId), where('status', '==', 'accepted')))
    ]);
    const all = [
        ...pubSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        ...accSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    ];
    return all.sort((a, b) => (a.chapter ?? a.order ?? 0) - (b.chapter ?? b.order ?? 0));
}

export async function loadLesson(lessonId) {
    const snap = await getDoc(doc(db, 'lessons', lessonId));
    return snap.exists() ? { lessonId: snap.id, ...snap.data() } : null;
}

export async function loadAllLessonsForCourse(courseId) {
    const snap = await getDocs(
        query(collection(db, 'lessons'), where('courseId', '==', courseId))
    );
    return snap.docs
        .map(d => ({ lessonId: d.id, ...d.data() }))
        .sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
}

export async function savePassageProgress(uid, lessonId, data) {
    await setDoc(
        doc(db, 'studentProgress', uid, 'lessons', lessonId),
        { ...data, savedAt: serverTimestamp() },
        { merge: true }
    );
}

// ---------------------------------------------------------------------------
// Session logs (fundamentals time tracking)
// ---------------------------------------------------------------------------

/**
 * Write a session log entry.
 * data: { date: 'YYYY-MM-DD', standardTimes: { [stdId]: { practiceSec, masterySec } }, sessionTimeLimit }
 */
export async function writeSessionLog(classId, uid, data) {
    const totalSec = Object.values(data.standardTimes)
        .reduce((s, t) => s + (t.practiceSec ?? 0) + (t.masterySec ?? 0), 0);
    const id = `${classId}_${uid}_${Date.now()}`;
    await setDoc(doc(db, 'sessions', id), {
        classId,
        studentId: uid,
        startedAt: serverTimestamp(),
        overtime: totalSec > data.sessionTimeLimit,
        ...data,
    });
}

/**
 * Load all session docs for a class within a date range.
 * weekStart/weekEnd: 'YYYY-MM-DD' strings (inclusive).
 */
export async function loadWeeklySessions(classId, weekStart, weekEnd) {
    const q = query(
        collection(db, 'sessions'),
        where('classId', '==', classId),
        where('date', '>=', weekStart),
        where('date', '<=', weekEnd)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
}

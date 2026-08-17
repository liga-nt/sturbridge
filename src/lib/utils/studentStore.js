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
    addDoc,
    getDocs,
    onSnapshot,
    serverTimestamp,
    where,
    orderBy,
    query
} from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { unpackQuestions } from './quizStore.js';

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
// Variant history (subcollection) — one doc per mastery question a student
// completes, capturing the exact variant shown (not just the item_id
// already tracked in standardState.questionsSeenIds). No pool doc lookup
// is required to read this back: for pool-sourced variants `variantId`
// points at questionVariants/{variantId}, but `variant` is always a full
// standalone snapshot of what was actually shown — including for
// live-generated variants, which have no pool doc / stable id at all.
// ---------------------------------------------------------------------------

// Firestore's JS SDK rejects `undefined` field values; this also drops
// functions/symbols, matching scripts/pregenerate-pool.mjs's same approach
// for persisting generator output.
function sanitize(value) {
    return JSON.parse(JSON.stringify(value));
}

/**
 * @param {string} uid
 * @param {object} entry - { standardId, itemId, variantId, variant, correct, attempts, assisted }
 */
export async function recordVariantSeen(uid, entry) {
    await addDoc(collection(db, 'studentProgress', uid, 'variantHistory'), {
        standardId: entry.standardId,
        itemId: entry.itemId,
        variantId: entry.variantId ?? null,
        variant: sanitize(entry.variant),
        correct: entry.correct,
        attempts: entry.attempts,
        assisted: entry.assisted,
        answeredAt: serverTimestamp()
    });
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

// Stores every student's best time, unbounded — the teacher-configured display
// cap (classDoc.leaderboardSize) is applied at read time so raising it later
// doesn't need already-discarded data back.
export async function updateLeaderboard(classId, standardId, uid, name, bestTime) {
    const ref = doc(db, 'leaderboards', `${classId}_${standardId}`);
    const snap = await getDoc(ref);
    let entries = snap.exists() ? (snap.data().entries ?? []) : [];
    entries = entries.filter(e => e.uid !== uid);
    entries.push({ uid, name, bestTime });
    entries.sort((a, b) => a.bestTime - b.bestTime);
    await setDoc(ref, { entries });
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
// Quiz assignment listener (real-time)
// ---------------------------------------------------------------------------

/**
 * Subscribe to active quiz assignments and find the one (if any) targeting
 * this student. Mirrors the classic "whole/partial collection listener,
 * filtered client-side" pattern already used elsewhere in this codebase —
 * avoids needing a composite index for classId+active. The schoolId filter
 * is required, not just an optimization: Firestore rules only allow a query
 * to succeed if it can prove every possible result satisfies
 * `resource.data.schoolId == schoolId()` from the query's own where clauses —
 * without it, the whole query is denied (not merely filtered) even when the
 * student's own assignment is the only matching document.
 * Calls onActive(quizAssignmentData with .id) when one targets this student,
 * onNone() otherwise. Returns unsubscribe function.
 */
export function subscribeQuizAssignments(uid, classId, schoolId, onActive, onNone) {
    const q = query(
        collection(db, 'quizAssignments'),
        where('schoolId', '==', schoolId),
        where('active', '==', true)
    );
    return onSnapshot(q, (snap) => {
        const matches = snap.docs
            .map((d) => ({ id: d.id, ...d.data(), questions: unpackQuestions(d.data().questions) }))
            .filter((a) => a.classId === classId && (a.targetStudentIds || []).includes(uid));

        if (matches.length === 0) {
            onNone();
            return;
        }
        // If more than one somehow targets this student, most recently assigned wins.
        matches.sort((a, b) => (b.assignedAt?.toMillis?.() ?? 0) - (a.assignedAt?.toMillis?.() ?? 0));
        onActive(matches[0]);
    });
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
 * data: { date: 'YYYY-MM-DD', standardTimes: { [stdId]: { practiceSec, masterySec } },
 *         sessionTimeLimit, questionsAttempted?, correctUnassisted?, correctAssisted? }
 * The question-count fields are optional (default to 0) — only MCAS tracks them.
 */
/**
 * Writes (or, given `sessionId`, re-writes) a session log doc.
 *
 * Previously this only ever fired once, at page exit (beforeunload/onDestroy)
 * — losing an entire visit's practice time whenever that event never fired
 * (mobile Safari's unreliable beforeunload, a crash, a killed tab). Callers
 * now flush repeatedly through a visit reusing the same `sessionId` (each
 * write carries the FULL accumulated standardTimes/question-count
 * snapshot, not a delta, so a later write safely supersedes an earlier one)
 * — pass the id this function returns back in on the next call. Omit
 * `sessionId` for a one-off write with a fresh id.
 *
 * `startedAt` is only set on the doc's first write (tracked via `isFirstWrite`,
 * since the caller — not this function — knows whether it's flushing the
 * same visit again) so it keeps reflecting when the visit began rather than
 * the most recent flush.
 */
export async function writeSessionLog(classId, uid, data, { sessionId = null, isFirstWrite = true } = {}) {
    const totalSec = Object.values(data.standardTimes)
        .reduce((s, t) => s + (t.practiceSec ?? 0) + (t.masterySec ?? 0), 0);
    const id = sessionId ?? `${classId}_${uid}_${Date.now()}`;
    const payload = {
        classId,
        studentId: uid,
        overtime: totalSec > data.sessionTimeLimit,
        questionsAttempted: 0,
        correctUnassisted: 0,
        correctAssisted: 0,
        ...data,
    };
    if (isFirstWrite) payload.startedAt = serverTimestamp();
    await setDoc(doc(db, 'sessions', id), payload, { merge: true });
    return id;
}

/**
 * Sum of active seconds already logged today, across every earlier visit —
 * so a daily timer actually counts down for the *day* instead of resetting
 * to the full limit each time a student reopens the class. studentId filter
 * is required for the query to satisfy Firestore rules (students can only
 * read their own session docs), not just a filter.
 */
export async function loadTodaysSessionTotal(classId, uid, date) {
    const q = query(
        collection(db, 'sessions'),
        where('classId', '==', classId),
        where('studentId', '==', uid),
        where('date', '==', date)
    );
    const snap = await getDocs(q);
    let totalSec = 0;
    snap.docs.forEach((d) => {
        const data = d.data();
        totalSec += Object.values(data.standardTimes ?? {})
            .reduce((s, t) => s + (t.practiceSec ?? 0) + (t.masterySec ?? 0), 0);
    });
    return { totalSec };
}

/**
 * Live session docs for a class within a date range — powers the Gradebook's
 * Practice Log tab so newly-written session docs (students finishing a visit)
 * show up without the teacher having to leave and re-enter the tab or change
 * weeks. weekStart/weekEnd: 'YYYY-MM-DD' strings (inclusive).
 */
export function subscribeWeeklySessions(classId, weekStart, weekEnd, callback) {
    const q = query(
        collection(db, 'sessions'),
        where('classId', '==', classId),
        where('date', '>=', weekStart),
        where('date', '<=', weekEnd)
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => d.data()));
    });
}

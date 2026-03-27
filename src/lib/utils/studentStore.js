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
    serverTimestamp
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
// Class doc
// ---------------------------------------------------------------------------

export async function loadClass(classId) {
    const snap = await getDoc(doc(db, 'classes', classId));
    return snap.exists() ? snap.data() : null;
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
 * Load standards for a specific grade+subject, sorted by `order`.
 * Returns an ordered array of { id, shortName, description, order, ... }
 */
export async function loadStandardsByGradeSubject(grade, subject) {
    const all = await loadAllStandards();
    return Object.values(all)
        .filter((s) => String(s.grade) === String(grade) && s.subject === subject)
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

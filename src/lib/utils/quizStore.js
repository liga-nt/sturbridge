/**
 * Firestore read/write helpers for teacher-built quizzes, quiz assignments,
 * and per-student quiz progress. Quiz results are a separate record from
 * studentProgress (mastery) — nothing in this file touches that collection.
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
    query,
    writeBatch,
    runTransaction
} from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { pickQuestion } from './questionBank.js';
import { pickVariant } from './variantPool.js';

// Firestore rejects an array whose elements are themselves arrays, anywhere
// in a document (e.g. a number_box variant's stimulus_params.rows:
// [[a,b],[c]]) — same "invalid nested entity" issue questionVariants pool
// storage hit. questionData can contain that shape, so every write of a
// questions array (quiz versions AND quizAssignments, which copies a
// version's questions verbatim into a new doc) must JSON-stringify it, and
// every read must parse it back out — encapsulated here so every consumer
// (Svelte pages, studentStore.js) keeps seeing a plain object.
function packQuestions(questions) {
    return questions.map((q) => ({ ...q, questionData: JSON.stringify(q.questionData) }));
}
export function unpackQuestions(questions) {
    return (questions || []).map((q) => ({
        ...q,
        questionData: typeof q.questionData === 'string' ? JSON.parse(q.questionData) : q.questionData
    }));
}

// ---------------------------------------------------------------------------
// Quizzes (reusable, named, versioned)
// ---------------------------------------------------------------------------

/**
 * Create a new quiz with its first version.
 * questions: [{ order, standardId, itemId, questionData }]
 */
export async function createQuiz(name, classId, schoolId, uid, questions) {
    const quizRef = doc(collection(db, 'quizzes'));
    await setDoc(quizRef, {
        name,
        classId,
        schoolId,
        createdBy: uid,
        createdAt: serverTimestamp(),
        currentVersion: 1,
        standardIds: questions.map((q) => q.standardId),
        archived: false
    });
    await setDoc(doc(db, 'quizzes', quizRef.id, 'versions', '1'), {
        version: 1,
        createdAt: serverTimestamp(),
        questions: packQuestions(questions)
    });
    return quizRef.id;
}

/**
 * Regenerate a quiz: same standards, same order, freshly generated variants,
 * saved as a new version. The quiz's currentVersion pointer advances; past
 * versions (and any assignments already made from them) are untouched.
 */
export async function regenerateQuiz(quizId) {
    const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
    if (!quizSnap.exists()) throw new Error('Quiz not found');
    const quiz = quizSnap.data();

    const currentVersionSnap = await getDoc(
        doc(db, 'quizzes', quizId, 'versions', String(quiz.currentVersion))
    );
    const currentQuestions = unpackQuestions(currentVersionSnap.data()?.questions ?? []);

    const newQuestions = await Promise.all(currentQuestions.map(async (q) => {
        const base = pickQuestion(q.standardId, []);
        if (!base) return q; // standard has no question bank entry — keep the old question as a fallback
        const variant = await pickVariant(base.item_id);
        const questionData = variant ? { ...variant, item_id: base.item_id } : { ...base };
        return { order: q.order, standardId: q.standardId, itemId: base.item_id, questionData };
    }));

    const newVersion = quiz.currentVersion + 1;
    await setDoc(doc(db, 'quizzes', quizId, 'versions', String(newVersion)), {
        version: newVersion,
        createdAt: serverTimestamp(),
        questions: packQuestions(newQuestions)
    });
    await updateDoc(doc(db, 'quizzes', quizId), {
        currentVersion: newVersion,
        standardIds: newQuestions.map((q) => q.standardId)
    });
    return newVersion;
}

export async function loadQuizzesForClass(classId, schoolId) {
    const q = query(
        collection(db, 'quizzes'),
        where('classId', '==', classId),
        where('schoolId', '==', schoolId)
    );
    const snap = await getDocs(q);
    return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((quiz) => !quiz.archived && !quiz.deleted);
}

export function subscribeQuizzesForClass(classId, schoolId, callback) {
    // schoolId filter is required, not optional: Firestore only allows a list
    // query to succeed if it can prove every possible result satisfies
    // `resource.data.schoolId == schoolId()` from the query's own where
    // clauses — without it the whole query is denied for any non-dev caller.
    const q = query(
        collection(db, 'quizzes'),
        where('classId', '==', classId),
        where('schoolId', '==', schoolId)
    );
    return onSnapshot(q, (snap) => {
        callback(
            snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((quiz) => !quiz.archived && !quiz.deleted)
        );
    });
}

export async function archiveQuiz(quizId) {
    await updateDoc(doc(db, 'quizzes', quizId), { archived: true, archivedAt: serverTimestamp() });
}

export async function unarchiveQuiz(quizId) {
    await updateDoc(doc(db, 'quizzes', quizId), { archived: false, archivedAt: null });
}

/** Live: archived quizzes for a class — powers the Archive page. */
export function subscribeArchivedQuizzesForClass(classId, schoolId, callback) {
    const q = query(
        collection(db, 'quizzes'),
        where('classId', '==', classId),
        where('schoolId', '==', schoolId)
    );
    return onSnapshot(q, (snap) => {
        callback(
            snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((quiz) => quiz.archived && !quiz.deleted)
                .sort((a, b) => (b.archivedAt?.toMillis?.() ?? 0) - (a.archivedAt?.toMillis?.() ?? 0))
        );
    });
}

/**
 * Soft-delete a quiz and everything downstream of it (every assignment ever
 * made from it, and every student's results for those assignments) — a
 * teacher-facing "this removes it from the gradebook" action. Nothing is
 * actually removed from Firestore: every touched doc is flagged `deleted:
 * true` (and, for any still-active assignment, force-ended too) so a dev can
 * restore the whole tree later by clearing the flag. All read paths below
 * filter `!doc.deleted` so flagged docs simply stop appearing anywhere.
 */
export async function deleteQuizAndResults(quizId) {
    const deletedAt = serverTimestamp();
    const batch = writeBatch(db);
    batch.update(doc(db, 'quizzes', quizId), { deleted: true, deletedAt });

    const assignmentsSnap = await getDocs(
        query(collection(db, 'quizAssignments'), where('quizId', '==', quizId))
    );
    for (const assignmentDoc of assignmentsSnap.docs) {
        batch.update(assignmentDoc.ref, { deleted: true, deletedAt, active: false });

        const progressSnap = await getDocs(
            query(collection(db, 'quizProgress'), where('assignmentId', '==', assignmentDoc.id))
        );
        for (const progressDoc of progressSnap.docs) {
            batch.update(progressDoc.ref, { deleted: true, deletedAt });
        }
    }

    await batch.commit();
}

export async function loadQuizVersion(quizId, version) {
    const snap = await getDoc(doc(db, 'quizzes', quizId, 'versions', String(version)));
    if (!snap.exists()) return null;
    const data = snap.data();
    return { ...data, questions: unpackQuestions(data.questions) };
}

/**
 * All version docs for a quiz, oldest first. Regenerating a quiz never
 * deletes or overwrites a prior version — this lets the UI list every
 * version separately instead of only the current one.
 */
export async function loadQuizVersions(quizId) {
    const snap = await getDocs(collection(db, 'quizzes', quizId, 'versions'));
    return snap.docs
        .map((d) => ({ id: d.id, ...d.data(), questions: unpackQuestions(d.data().questions) }))
        .sort((a, b) => a.version - b.version);
}

// ---------------------------------------------------------------------------
// Quiz assignments (one assign event: quiz -> class or specific students)
// ---------------------------------------------------------------------------

/**
 * Assign a quiz. Copies the given version's questions (defaults to the
 * quiz's current version) into the assignment doc so later quiz edits/
 * regenerations never change an already-assigned instance.
 */
export async function assignQuiz(quiz, classId, schoolId, gradingMode, targetStudentIds, assignedBy, version = quiz.currentVersion) {
    const versionDoc = await loadQuizVersion(quiz.id, version);
    if (!versionDoc) throw new Error('Quiz version not found');

    const assignmentRef = doc(collection(db, 'quizAssignments'));
    await setDoc(assignmentRef, {
        quizId: quiz.id,
        quizName: quiz.name,
        quizVersion: version,
        classId,
        schoolId,
        gradingMode,
        questions: packQuestions(versionDoc.questions),
        targetStudentIds,
        assignedBy,
        assignedAt: serverTimestamp(),
        active: true,
        endedAt: null,
        endedReason: null
    });
    return assignmentRef.id;
}

export function subscribeActiveAssignments(classId, schoolId, callback) {
    const q = query(
        collection(db, 'quizAssignments'),
        where('classId', '==', classId),
        where('schoolId', '==', schoolId),
        where('active', '==', true)
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => !a.deleted));
    });
}

/**
 * Live version of "all assignments for a class" (active or not) — powers the
 * Assignment Results grid so completion/in-progress status updates without
 * the teacher having to leave and re-enter the tab.
 */
export function subscribeQuizAssignmentsForClass(classId, schoolId, callback) {
    const q = query(
        collection(db, 'quizAssignments'),
        where('classId', '==', classId),
        where('schoolId', '==', schoolId)
    );
    return onSnapshot(q, (snap) => {
        callback(
            snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((a) => !a.deleted)
                .sort((a, b) => (b.assignedAt?.toMillis?.() ?? 0) - (a.assignedAt?.toMillis?.() ?? 0))
        );
    });
}

/**
 * End a quiz assignment: mark it inactive, then freeze any student still
 * mid-quiz (their partial answers stand as the permanent record). Students
 * who already finished naturally are left as 'completed'.
 */
export async function endQuizAssignment(assignmentId, schoolId) {
    await updateDoc(doc(db, 'quizAssignments', assignmentId), {
        active: false,
        endedAt: serverTimestamp(),
        endedReason: 'teacher_ended'
    });

    const q = query(
        collection(db, 'quizProgress'),
        where('assignmentId', '==', assignmentId),
        where('schoolId', '==', schoolId),
        where('status', '==', 'in_progress')
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { status: 'frozen' }));
    await batch.commit();
}

/**
 * Permanently delete an assignment (a column in Assignment Results) and every
 * student's progress record for it — e.g. a quiz assigned by mistake that was
 * never meant to count. Unlike endQuizAssignment this can't be undone; any
 * student still mid-quiz just falls back to normal practice, since their
 * client's assignment listener will find nothing active once the doc is gone.
 */
export async function deleteQuizAssignment(assignmentId, schoolId) {
    const q = query(
        collection(db, 'quizProgress'),
        where('assignmentId', '==', assignmentId),
        where('schoolId', '==', schoolId)
    );
    const snap = await getDocs(q);

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'quizAssignments', assignmentId));
    await batch.commit();
}

// ---------------------------------------------------------------------------
// Quiz progress (per-student, permanent record — separate from mastery)
// ---------------------------------------------------------------------------

export function subscribeAssignmentProgress(assignmentId, schoolId, callback) {
    const q = query(
        collection(db, 'quizProgress'),
        where('assignmentId', '==', assignmentId),
        where('schoolId', '==', schoolId)
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted));
    });
}

/**
 * Live version of "all quiz progress docs for a class" — powers the
 * Assignment Results grid (one listener for the whole class rather than one
 * per assignment, since most assignments are historical and will never
 * change again).
 */
export function subscribeProgressForClass(classId, schoolId, callback) {
    const q = query(
        collection(db, 'quizProgress'),
        where('classId', '==', classId),
        where('schoolId', '==', schoolId)
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted));
    });
}

/** Student-side: fetch or lazily create this student's progress doc for an assignment. */
export async function getOrCreateQuizProgress(assignment, uid) {
    const progressId = `${assignment.id}_${uid}`;
    const ref = doc(db, 'quizProgress', progressId);
    const snap = await getDoc(ref);
    if (snap.exists()) return { id: progressId, ...snap.data() };

    const initial = {
        assignmentId: assignment.id,
        quizId: assignment.quizId,
        studentId: uid,
        classId: assignment.classId,
        schoolId: assignment.schoolId,
        gradingMode: assignment.gradingMode,
        status: 'in_progress',
        currentIndex: 0,
        answers: [],
        score: 0,
        total: assignment.questions.length,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null
    };
    await setDoc(ref, initial);
    return { id: progressId, ...initial };
}

/** Student-side: append one answered question's result and advance the index. */
export async function recordQuizAnswer(progressId, answerEntry, newIndex) {
    const ref = doc(db, 'quizProgress', progressId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const answers = [...(data.answers || []), answerEntry];
    const score = answers.filter((a) => a.correct).length;
    await updateDoc(ref, { answers, score, currentIndex: newIndex, updatedAt: serverTimestamp() });
}

/**
 * Student-side: mark a quiz finished, but only if the teacher hasn't already
 * frozen it (compare-and-set via transaction) — an explicit teacher "End
 * Assignment" click wins over a same-instant natural completion.
 * Returns the resulting status ('completed' or whatever it already was).
 */
export async function completeQuizProgressIfInProgress(progressId) {
    const ref = doc(db, 'quizProgress', progressId);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return null;
        const data = snap.data();
        if (data.status !== 'in_progress') return data.status;
        tx.update(ref, { status: 'completed', completedAt: serverTimestamp() });
        return 'completed';
    });
}

/**
 * Pure mastery algorithm — no Firestore calls.
 *
 * Terminology:
 *   studentState  — the top-level studentProgress/{uid} document
 *   standardState — a studentProgress/{uid}/standards/{standardId} document
 */

// ---------------------------------------------------------------------------
// selectNextStandard
// ---------------------------------------------------------------------------

/**
 * Returns the standardId the student should be served next.
 *
 * Side-effects: may mutate studentState (adds 4th review slot at multiples of 10).
 * Caller is responsible for persisting the updated studentState.
 *
 * @param {object} studentState - { activeStandardIds, roundRobinIndex, questionCount, progressionIndex, classId }
 * @param {string[]} classProgression - ordered array of standardIds from classes doc
 * @param {object} masteredMap - { [standardId]: { mastered } } for standards already seen
 * @returns {{ standardId: string, studentState: object }}
 */
export function selectNextStandard(studentState, classProgression, masteredMap = {}) {
    let { activeStandardIds, roundRobinIndex, questionCount } = studentState;

    // Every 10 questions (but not at 0), insert a review standard if possible
    if (questionCount > 0 && questionCount % 10 === 0 && activeStandardIds.length < 4) {
        const masteredOutside = classProgression.find(
            (id) => masteredMap[id]?.mastered && !activeStandardIds.includes(id)
        );
        if (masteredOutside) {
            activeStandardIds = [...activeStandardIds, masteredOutside];
            studentState = { ...studentState, activeStandardIds };
        }
    }

    const idx = roundRobinIndex % activeStandardIds.length;
    const standardId = activeStandardIds[idx];

    return { standardId, studentState };
}

// ---------------------------------------------------------------------------
// updateAfterAnswer
// ---------------------------------------------------------------------------

/**
 * Returns updated { studentState, standardState } after a question is answered.
 *
 * Does NOT handle Firestore writes — caller persists the returned states.
 *
 * @param {object} studentState
 * @param {object} standardState - { mastered, streak, attempts, assistedAttempts, questionsSeenIds, inReviewQueue }
 * @param {string} standardId - the standard just answered
 * @param {boolean} correct
 * @param {boolean} assisted - true if LEARN button was used
 * @param {string[]} classProgression
 * @returns {{ studentState: object, standardState: object }}
 */
export function updateAfterAnswer(studentState, standardState, standardId, correct, assisted, classProgression) {
    let std = { ...standardState };
    let st = { ...studentState };

    std.attempts = (std.attempts || 0) + 1;

    if (correct && !assisted) {
        std.streak = (std.streak || 0) + 1;

        if (std.inReviewQueue) {
            // Passed review — remove from activeStandards, stays mastered
            st.activeStandardIds = st.activeStandardIds.filter((id) => id !== standardId);
            std.inReviewQueue = false;
        } else if (std.streak >= 2 && !std.mastered) {
            // Mastered — remove from active, slide in next standard
            std.mastered = true;
            st.activeStandardIds = st.activeStandardIds.filter((id) => id !== standardId);
            st = slideInNextStandard(st, classProgression);
        }
    } else if (correct && assisted) {
        std.streak = 0;
        std.assistedAttempts = (std.assistedAttempts || 0) + 1;
    } else {
        // Wrong
        std.streak = 0;
        if (std.inReviewQueue) {
            // Failed review — stays in active pool, needs 2-in-a-row again
            std.inReviewQueue = false;
        }
    }

    // Advance round-robin
    st.roundRobinIndex = (st.roundRobinIndex + 1) % st.activeStandardIds.length || 0;
    st.questionCount = (st.questionCount || 0) + 1;

    return { studentState: st, standardState: std };
}

// ---------------------------------------------------------------------------
// slideInNextStandard
// ---------------------------------------------------------------------------

/**
 * After a standard is mastered, add the next unstarted standard from the progression.
 */
function slideInNextStandard(studentState, classProgression) {
    let { activeStandardIds, progressionIndex } = studentState;

    // Find next standard not already active and not already mastered by checking progression
    let nextIndex = progressionIndex;
    while (nextIndex < classProgression.length) {
        const candidate = classProgression[nextIndex];
        if (!activeStandardIds.includes(candidate)) {
            activeStandardIds = [...activeStandardIds, candidate];
            nextIndex++;
            break;
        }
        nextIndex++;
    }

    return { ...studentState, activeStandardIds, progressionIndex: nextIndex };
}

// ---------------------------------------------------------------------------
// buildInitialStudentState
// ---------------------------------------------------------------------------

/**
 * Creates the initial top-level studentProgress doc for a brand-new student.
 */
export function buildInitialStudentState(classId, classProgression) {
    return {
        activeStandardIds: classProgression.slice(0, 3),
        roundRobinIndex: 0,
        questionCount: 0,
        progressionIndex: 3,
        classId
    };
}

// ---------------------------------------------------------------------------
// buildInitialStandardState
// ---------------------------------------------------------------------------

export function buildInitialStandardState() {
    return {
        mastered: false,
        streak: 0,
        attempts: 0,
        assistedAttempts: 0,
        questionsSeenIds: [],
        inReviewQueue: false
    };
}

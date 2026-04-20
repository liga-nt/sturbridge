/**
 * persianFsrs.js
 *
 * FSRS utilities for the Persian poem vocabulary exercise.
 * Wraps ts-fsrs and handles Firestore read/write for card states.
 */

import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs';
import { db } from '$lib/firebase/client';
import {
    collection, doc, getDoc, getDocs,
    setDoc, addDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';

export { Rating, State };

const f = fsrs();

// ── Card state helpers ────────────────────────────────────────────────────────

/**
 * Load all card states for a user + poem from Firestore.
 * Returns a Map<cardId, fsrsCard>.
 */
export async function loadCardStates(uid, poemId) {
    const col = collection(db, 'persianCardStates', uid, 'poems', poemId, 'cards');
    const snap = await getDocs(col);
    const map = new Map();
    snap.forEach(d => {
        const data = d.data();
        map.set(d.id, firestoreToCard(data));
    });
    return map;
}

/**
 * Save a single card state to Firestore after a review.
 */
export async function saveCardState(uid, poemId, cardId, card) {
    const ref = doc(db, 'persianCardStates', uid, 'poems', poemId, 'cards', cardId);
    await setDoc(ref, cardToFirestore(card));
}

/**
 * Append a review log entry.
 */
export async function logReview(uid, poemId, cardId, {
    rating, button, typedInput, latencyMs, totalMs
}) {
    await addDoc(collection(db, 'persianReviewLog'), {
        uid,
        poem_id:     poemId,
        card_id:     cardId,
        rating,
        button,
        typed_input: typedInput,
        latency_ms:  latencyMs,
        total_ms:    totalMs,
        timestamp:   serverTimestamp(),
    });
}

// ── Queue helpers ─────────────────────────────────────────────────────────────

/**
 * Cards whose due date is now or past. Sorted oldest-due first.
 */
export function getDueCards(cardStates, allCards) {
    const now = Date.now();
    return allCards
        .filter(c => {
            const state = cardStates.get(c.id);
            if (!state) return false;
            if (state.state === State.New) return false;
            return state.due.getTime() <= now;
        })
        .sort((a, b) => {
            const da = cardStates.get(a.id).due.getTime();
            const db_ = cardStates.get(b.id).due.getTime();
            return da - db_;
        });
}

/**
 * Cards never seen (no Firestore state yet, i.e. state = New).
 */
export function getNewCards(cardStates, allCards) {
    return allCards.filter(c => !cardStates.has(c.id));
}

/**
 * Next batch of new cards to introduce (up to batchSize).
 * Only called when all prior new cards have graduated out of Learning.
 */
export function getNextBatch(cardStates, allCards, batchSize = 10) {
    const newCards = getNewCards(cardStates, allCards);
    return newCards.slice(0, batchSize);
}

/**
 * Returns true when all cards have been seen at least once and
 * none are in New or Learning state.
 */
export function isFullyAcquired(cardStates, allCards) {
    if (cardStates.size < allCards.length) return false;
    for (const card of allCards) {
        const state = cardStates.get(card.id);
        if (!state) return false;
        if (state.state === State.New || state.state === State.Learning) return false;
    }
    return true;
}

/**
 * How many cards are in Review state (mastered).
 */
export function reviewCount(cardStates, allCards) {
    return allCards.filter(c => cardStates.get(c.id)?.state === State.Review).length;
}

// ── FSRS scheduling ───────────────────────────────────────────────────────────

/**
 * Apply a rating to a card and return the updated card.
 * rating: Rating.Again | Rating.Good | Rating.Easy
 */
export function scheduleCard(card, rating) {
    const now = new Date();
    const result = f.repeat(card ?? createEmptyCard(), now);
    return result[rating].card;
}

/**
 * Create a new empty FSRS card for a word not yet seen.
 */
export function newCard() {
    return createEmptyCard();
}

// ── Serialization ─────────────────────────────────────────────────────────────

function cardToFirestore(card) {
    return {
        due:            Timestamp.fromDate(card.due),
        stability:      card.stability,
        difficulty:     card.difficulty,
        elapsed_days:   card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps:           card.reps,
        lapses:         card.lapses,
        state:          card.state,
        last_review:    card.last_review
                            ? Timestamp.fromDate(card.last_review)
                            : null,
    };
}

function firestoreToCard(data) {
    return {
        due:            data.due?.toDate()         ?? new Date(),
        stability:      data.stability             ?? 0,
        difficulty:     data.difficulty            ?? 0,
        elapsed_days:   data.elapsed_days          ?? 0,
        scheduled_days: data.scheduled_days        ?? 0,
        reps:           data.reps                  ?? 0,
        lapses:         data.lapses                ?? 0,
        state:          data.state                 ?? State.New,
        last_review:    data.last_review?.toDate() ?? null,
    };
}

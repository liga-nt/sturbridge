/**
 * persianFsrs.js — Firestore I/O for Persian poem card states.
 * Pure scheduling logic lives in fsrs.js.
 *
 * Firestore path: persianCardStates/{uid}/poems/{poemId}/cards/{cardId}
 */

import { db } from '$lib/firebase/client';
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  addDoc, serverTimestamp,
} from 'firebase/firestore';
import { cardToFirestore, firestoreToCard, getNewCards } from './fsrs.js';

export { Rating, State, scheduleCard, newCard, getDueCards, getNewCards, isFullyAcquired } from './fsrs.js';

function cardsCol(uid, poemId) {
  return collection(db, 'persianCardStates', uid, 'poems', poemId, 'cards');
}

function cardRef(uid, poemId, cardId) {
  return doc(db, 'persianCardStates', uid, 'poems', poemId, 'cards', cardId);
}

export async function loadCardStates(uid, poemId) {
  const snap = await getDocs(cardsCol(uid, poemId));
  const map = new Map();
  snap.forEach(d => map.set(d.id, firestoreToCard(d.data())));
  return map;
}

export async function saveCardState(uid, poemId, cardId, card) {
  await setDoc(cardRef(uid, poemId, cardId), cardToFirestore(card));
}

export async function deleteCardState(uid, poemId, cardId) {
  await deleteDoc(cardRef(uid, poemId, cardId));
}

export async function logReview(uid, poemId, cardId, { rating, button, typedInput, latencyMs, totalMs }) {
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

// Persian-specific: load the next line's worth of unseen cards
export function getNextBatch(cardStates, allCards, batchSize = 10) {
  return getNewCards(cardStates, allCards).slice(0, batchSize);
}

/**
 * greekFsrs.js — Firestore I/O for Greek vocab card states.
 * Pure scheduling logic lives in fsrs.js.
 *
 * Firestore path: greekCardStates/{uid}/courses/{courseId}/cards/{cardId}
 */

import { db } from '$lib/firebase/client';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { cardToFirestore, firestoreToCard } from './fsrs.js';

export { Rating, State, scheduleCard, newCard, getDueCards, getNewCards, isFullyAcquired } from './fsrs.js';

function cardsCol(uid, courseId) {
  return collection(db, 'greekCardStates', uid, 'courses', courseId, 'cards');
}

function cardRef(uid, courseId, cardId) {
  return doc(db, 'greekCardStates', uid, 'courses', courseId, 'cards', cardId);
}

export async function loadCardStates(uid, courseId) {
  const snap = await getDocs(cardsCol(uid, courseId));
  const map = new Map();
  snap.forEach(d => map.set(d.id, firestoreToCard(d.data())));
  return map;
}

export async function saveCardState(uid, courseId, cardId, card) {
  await setDoc(cardRef(uid, courseId, cardId), cardToFirestore(card));
}

export async function deleteCardState(uid, courseId, cardId) {
  await deleteDoc(cardRef(uid, courseId, cardId));
}

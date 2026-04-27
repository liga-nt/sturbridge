/**
 * fsrs.js — shared pure FSRS scheduling + serialization utilities.
 *
 * Language-specific files (greekFsrs.js, persianFsrs.js) handle Firestore
 * paths and import from here.
 */

import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs';
import { Timestamp } from 'firebase/firestore';

export { Rating, State };

const f = fsrs();

// ── Scheduling ────────────────────────────────────────────────────────────────

export function scheduleCard(card, rating) {
  const now = new Date();
  const result = f.repeat(card ?? createEmptyCard(), now);
  return result[rating].card;
}

export function newCard() {
  return createEmptyCard();
}

// ── Queue helpers ─────────────────────────────────────────────────────────────

export function getDueCards(cardStates, allCards) {
  const now = Date.now();
  return allCards
    .filter(c => {
      const state = cardStates.get(c.id);
      if (!state) return false;
      if (state.state === State.New) return false;
      return state.due.getTime() <= now;
    })
    .sort((a, b) => cardStates.get(a.id).due.getTime() - cardStates.get(b.id).due.getTime());
}

export function getNewCards(cardStates, allCards) {
  return allCards.filter(c => !cardStates.has(c.id));
}

export function isFullyAcquired(cardStates, allCards) {
  if (cardStates.size < allCards.length) return false;
  for (const card of allCards) {
    const state = cardStates.get(card.id);
    if (!state) return false;
    if (state.state === State.New || state.state === State.Learning) return false;
  }
  return true;
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function cardToFirestore(card) {
  return {
    due:            Timestamp.fromDate(card.due),
    stability:      card.stability,
    difficulty:     card.difficulty,
    elapsed_days:   card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps:           card.reps,
    lapses:         card.lapses,
    state:          card.state,
    last_review:    card.last_review ? Timestamp.fromDate(card.last_review) : null,
  };
}

export function firestoreToCard(data) {
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

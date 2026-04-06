/**
 * patch-story-canon.mjs
 *
 * 1. Deletes all lessons for grade7-greek from Firestore
 * 2. Resets story_bible/grade7-greek rolling state (chapterCount, narrative,
 *    characters, vocab, grammar) while preserving any existing fields
 * 3. Seeds the fixed canon (premise, character profiles, arc) into canon{}
 * 4. Pre-marks alpha.* standards as covered (prerequisite knowledge)
 *
 * Usage: node scripts/patch-story-canon.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Canon — fixed story facts, never overwritten by chapter generation
// ---------------------------------------------------------------------------

const CANON = {
    premise:
        'Four young cousins living below the Acropolis in Athens discover that Zeus ' +
        'has gone missing, throwing divine order into chaos. Gods scheme and panic. ' +
        'The children receive a divine map and are told they must visit all the gods ' +
        'to understand what has gone wrong. Each deity reveals their symbols and ' +
        'sphere of influence; some send the children to consult famous mortals for ' +
        'clues. The children travel through time gathering evidence.',

    resolution:
        'Zeus was simply visiting his brother Hades in the underworld and lost track ' +
        'of time. The entire crisis was mortal imagination and divine ambition running ' +
        'unchecked. When the children finally descend into the underworld, they find ' +
        'Zeus laughing and carrying on with Hades.',

    characters: {
        'Φοίβη': {
            english:     'Phoebe',
            age:         13,
            relation:    'older sister of Klēta; cousin of Pallas and Dolios',
            personality: 'The observer. Always notices what others miss. Has a strong moral compass and instinctively knows what is ethically right. Thoughtful before she acts.',
            role:        'moral center, careful watcher',
            patronDeity: 'Apollo',
            gift:        'A spyglass decorated with an image of the sun, given by Apollo. Lets her see the truth in any situation.',
            giftChapter: null
        },
        'Παλλάς': {
            english:     'Pallas',
            age:         13,
            relation:    'older sister of Dolios; cousin of Phoebe and Klēta',
            personality: 'Brave and decisive. Natural leader who acts when others hesitate. Sometimes charges in before fully thinking things through.',
            role:        'leader, protector',
            patronDeity: 'Athena',
            gift:        'A flute from Athena with mysterious properties — its music can calm, persuade, or inspire.',
            giftChapter: null
        },
        'Κλήτα': {
            english:     'Klēta',
            age:         10,
            relation:    'younger sister of Phoebe',
            personality: 'Inventive and practical. Loves making things and solving problems with her hands. Quietly resourceful.',
            role:        'builder, problem-solver',
            patronDeity: 'Hephaestus',
            gift:        'A small hammer from Hephaestus that helps her build whatever tool the group needs next.',
            giftChapter: null
        },
        'Δόλιος': {
            english:     'Dolios',
            age:         10,
            relation:    'younger brother of Pallas',
            personality: 'Charming and quick-witted. Can make anyone laugh. Talks his way into — and out of — trouble with equal ease.',
            role:        'charmer, negotiator',
            patronDeity: 'Hermes',
            gift:        'Winged sandals from Hermes that make him faster and amplify his natural charm and persuasiveness.',
            giftChapter: null
        }
    },

    arc:
        'Act 1 — Athens: The children are carefree below the Acropolis when strange ' +
        'signs begin. Animals behave oddly, offerings go unanswered, adults grow ' +
        'anxious. A mysterious figure gives them a map of the gods and tells them ' +
        'that to find the source of the disturbance they must visit every deity. ' +
        'Act 2 — The Divine Circuit: The children travel through time and across ' +
        'Greece, visiting each Olympian. Every god is distracted by Zeus\'s absence ' +
        'and reacts according to their nature: Ares sees an opportunity; Demeter ' +
        'fears disruption of the seasons; Poseidon stays loyal; Aphrodite begins ' +
        'scheming with Poseidon about ruling together. Along the way gods send the ' +
        'children to consult famous mortals — historical and mythological figures — ' +
        'who provide clues. Each of the four patron deities (Apollo, Athena, ' +
        'Hephaestus, Hermes) eventually gives their gift to the corresponding child, ' +
        'and each gift helps solve a problem in that part of the journey. ' +
        'Act 3 — The Underworld: Following all the threads, the children descend to ' +
        'the underworld and find Zeus laughing with Hades. He simply went to visit ' +
        'his brother. The divine crisis evaporates instantly, leaving only the ' +
        'children — wiser about gods, mortals, and the ancient world — to find ' +
        'their way home.'
};

const ALPHA_STANDARD_IDS = [
    'alpha.order',
    'alpha.names',
    'alpha.transliterate_gk_en',
    'alpha.transliterate_en_gk',
    'alpha.case_transform',
    'alpha.adjacent',
];

// ---------------------------------------------------------------------------
// Delete all lessons for grade7-greek
// ---------------------------------------------------------------------------

async function deleteGreekLessons() {
    const snap = await db.collection('lessons')
        .where('courseId', '==', 'grade7-greek')
        .get();

    if (snap.empty) {
        console.log('No lessons to delete.');
        return;
    }

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`Deleted ${snap.docs.length} lesson(s).`);
}

// ---------------------------------------------------------------------------
// Reset story bible state + write canon
// ---------------------------------------------------------------------------

async function patchStoryBible() {
    const ref = db.collection('story_bible').doc('grade7-greek');

    await ref.set({
        // Rolling state — reset to zero
        chapterCount: 0,
        narrative: {
            timePeriod:       null,
            location:         null,
            summary:          null,
            activeCharacters: []
        },
        characters: {},
        standards: {
            covered:    ALPHA_STANDARD_IDS,
            reinforced: {}
        },
        vocab:    { introduced: {} },
        grammar:  { introduced: {} },

        // Fixed canon — written once, never overwritten by generation
        canon: CANON
    }, { merge: true });

    console.log('Reset story bible state and wrote canon.');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
    try {
        await deleteGreekLessons();
        await patchStoryBible();
        console.log('\nDone. Ready to generate Chapter 1 from scratch.');
    } catch (e) {
        console.error('Patch failed:', e);
        process.exit(1);
    }
}

main();

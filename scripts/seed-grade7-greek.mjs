/**
 * Seed Firestore for the grade7-greek course:
 *   - courses/grade7-greek
 *   - standards/{standardId}  (244 NGE standards)
 *   - story_bible/grade7-greek  (initial empty document)
 *
 * Usage: node scripts/seed-grade7-greek.mjs
 * Safe to re-run (all writes are set with merge).
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Parse nge_standards.json (has JS // comment lines — strip before parse)
// ---------------------------------------------------------------------------

const rawText = fs.readFileSync(new URL('../data/Greek/nge_standards.json', import.meta.url), 'utf8');
const cleaned = rawText.replace(/\/\/.*/g, '');
const ngeData = JSON.parse(cleaned);
const standards = ngeData.standards;

console.log(`Parsed ${standards.length} NGE standards.`);

// ---------------------------------------------------------------------------
// Course document
// ---------------------------------------------------------------------------

async function seedCourse() {
    await db.collection('courses').doc('grade7-greek').set({
        label: 'Greek 7',
        grade: 7,
        subject: 'Greek',
        contentKey: 'greek-immersive',
        progressionType: 'linear',
        schoolId: null
    }, { merge: true });
    console.log('Wrote courses/grade7-greek');
}

// ---------------------------------------------------------------------------
// Standards
// ---------------------------------------------------------------------------

// Domain → human-readable label for shortName
const DOMAIN_LABELS = {
    alpha:  'Alphabet',
    geo:    'Geography',
    hist:   'History',
    myth:   'Mythology',
    morph:  'Morphology',
    syn:    'Syntax',
    deriv:  'Derivation',
    read:   'Reading'
};

function makeShortName(standard) {
    // Use the last part of the ID as a base, humanized
    const parts = standard.id.split('.');
    const last = parts[parts.length - 1];
    // Convert snake_case to Title Case
    return last
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

async function seedStandards() {
    const batch = db.batch();
    let count = 0;

    for (let i = 0; i < standards.length; i++) {
        const s = standards[i];
        const ref = db.collection('standards').doc(s.id);
        batch.set(ref, {
            shortName: makeShortName(s),
            description: s.description,
            grade: 7,
            subject: 'Greek',
            courseId: 'grade7-greek',
            domain: s.domain ?? s.id.split('.')[0],
            introduced_in: s.introduced_in ?? null,
            type: s.type ?? null,
            order: i + 1
        }, { merge: true });
        count++;

        // Firestore batch limit is 500
        if (count % 490 === 0) {
            await batch.commit();
            console.log(`Committed batch of ${count} standards...`);
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
    }

    console.log(`Wrote ${standards.length} standards to Firestore.`);
}

// ---------------------------------------------------------------------------
// Story Bible — fixed canon + initial rolling state
// ---------------------------------------------------------------------------

const STORY_CANON = {
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

async function seedStoryBible() {
    const ref = db.collection('story_bible').doc('grade7-greek');
    const snap = await ref.get();
    if (snap.exists) {
        console.log('story_bible/grade7-greek already exists — skipping init.');
        return;
    }

    await ref.set({
        courseId:     'grade7-greek',
        chapterCount: 0,
        canon:        STORY_CANON,
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
        grammar:  { introduced: {} }
    });
    console.log('Initialized story_bible/grade7-greek.');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
    try {
        await seedCourse();
        await seedStandards();
        await seedStoryBible();
        console.log('\nDone. grade7-greek course seeded successfully.');
    } catch (e) {
        console.error('Seed failed:', e);
        process.exit(1);
    }
}

main();

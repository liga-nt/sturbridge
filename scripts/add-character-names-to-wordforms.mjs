/**
 * Add the four story character names to word_forms.json
 * so the grammar panel shows a paradigm when they're hovered.
 *
 * Usage: node scripts/add-character-names-to-wordforms.mjs
 */

import fs from 'fs';

const FILES = [
    'data/Greek/word_forms.json',
    'functions/data/Greek/word_forms.json'
];

// Each entry: [form, dict_entry, short_def, morph, paradigm_key]
const ENTRIES = [
    // ── Φοίβη — 1st decl. fem. η-type ────────────────────────────────────────
    ['Φοίβη',  'Φοίβη', 'Phoebe (observer; patron: Apollo)',    'noun.fem.sg.nom', '1st_declension_feminine_eta'],
    ['Φοίβης', 'Φοίβη', 'Phoebe',                               'noun.fem.sg.gen', '1st_declension_feminine_eta'],
    ['Φοίβῃ',  'Φοίβη', 'Phoebe',                               'noun.fem.sg.dat', '1st_declension_feminine_eta'],
    ['Φοίβην', 'Φοίβη', 'Phoebe',                               'noun.fem.sg.acc', '1st_declension_feminine_eta'],

    // ── Κλειώ — contracted fem. (Muse of history) ────────────────────────────
    ['Κλειώ',   'Κλειώ', '11-year-old, sister of Phoebe; Muse of history, meaning famous', 'noun.fem.sg.nom', null],
    ['Κλειοῦς', 'Κλειώ', '11-year-old, sister of Phoebe; Muse of history, meaning famous', 'noun.fem.sg.gen', null],
    ['Κλειοῖ',  'Κλειώ', '11-year-old, sister of Phoebe; Muse of history, meaning famous', 'noun.fem.sg.dat', null],

    // ── Παλλάς — 3rd decl. (no paradigm template yet) ────────────────────────
    ['Παλλάς',   'Παλλάς', 'Pallas (leader; patron: Athena)',   'noun.masc.sg.nom', null],
    ['Παλλάντος','Παλλάς', 'Pallas',                            'noun.masc.sg.gen', null],
    ['Παλλάντι', 'Παλλάς', 'Pallas',                            'noun.masc.sg.dat', null],
    ['Παλλάντα', 'Παλλάς', 'Pallas',                            'noun.masc.sg.acc', null],
    ['Παλλάς',   'Παλλάς', 'Pallas',                            'noun.masc.sg.voc', null],

    // ── Δόλιος — 2nd decl. masc. ─────────────────────────────────────────────
    ['Δόλιος', 'Δόλιος', 'Dolios (charmer; patron: Hermes)',    'noun.masc.sg.nom', '2nd_declension_masculine'],
    ['Δολίου', 'Δόλιος', 'Dolios',                              'noun.masc.sg.gen', '2nd_declension_masculine'],
    ['Δολίῳ',  'Δόλιος', 'Dolios',                              'noun.masc.sg.dat', '2nd_declension_masculine'],
    ['Δόλιον', 'Δόλιος', 'Dolios',                              'noun.masc.sg.acc', '2nd_declension_masculine'],
    ['Δόλιε',  'Δόλιος', 'Dolios',                              'noun.masc.sg.voc', '2nd_declension_masculine'],
];

for (const filePath of FILES) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let added = 0;
    for (const [form, dict_entry, short_def, morph, paradigm_key] of ENTRIES) {
        if (!data[form]) {
            data[form] = { dict_entry, short_def, morph, vocab_tier: null, standard_refs: [], paradigm_key };
            added++;
        }
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`${filePath}: added ${added} entries`);
}

console.log('Done.');

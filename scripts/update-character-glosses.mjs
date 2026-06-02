/**
 * update-character-glosses.mjs
 *
 * Updates the four story character names in:
 *   - functions/data/Greek/word_forms.json  (local)
 *   - Firestore word_glosses/grade7-greek   (live)
 *
 * Changes:
 *   - New shortDefs for Φοίβη, Παλλάς, Δόλιος
 *   - Παλλάς morph gender corrected to fem
 *   - Κλήτα entries removed; Κλειώ entries added
 *
 * Usage: node scripts/update-character-glosses.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const require = createRequire(import.meta.url);
const serviceAccount = require('../sturbridge-e59d9-firebase-adminsdk-fbsvc-6a7604b3c2.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ── New / updated entries ─────────────────────────────────────────────────────

const UPDATED = {
    'Φοίβη':   { dictEntry: 'Φοίβη',   shortDef: '13-year-old, sister of Kleio; epithet of Apollo meaning bright or radiant',       morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'nom' }, paradigmKey: '1st_declension_feminine_eta', vocabTier: null, standard_refs: [] },
    'Φοίβης':  { dictEntry: 'Φοίβη',   shortDef: '13-year-old, sister of Kleio; epithet of Apollo meaning bright or radiant',       morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'gen' }, paradigmKey: '1st_declension_feminine_eta', vocabTier: null, standard_refs: [] },
    'Φοίβῃ':   { dictEntry: 'Φοίβη',   shortDef: '13-year-old, sister of Kleio; epithet of Apollo meaning bright or radiant',       morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'dat' }, paradigmKey: '1st_declension_feminine_eta', vocabTier: null, standard_refs: [] },
    'Φοίβην':  { dictEntry: 'Φοίβη',   shortDef: '13-year-old, sister of Kleio; epithet of Apollo meaning bright or radiant',       morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'acc' }, paradigmKey: '1st_declension_feminine_eta', vocabTier: null, standard_refs: [] },

    'Κλειώ':   { dictEntry: 'Κλειώ',   shortDef: '11-year-old, sister of Phoebe; Muse of history, meaning famous',                  morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'nom' }, paradigmKey: null, vocabTier: null, standard_refs: [] },
    'Κλειοῦς': { dictEntry: 'Κλειώ',   shortDef: '11-year-old, sister of Phoebe; Muse of history, meaning famous',                  morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'gen' }, paradigmKey: null, vocabTier: null, standard_refs: [] },
    'Κλειοῖ':  { dictEntry: 'Κλειώ',   shortDef: '11-year-old, sister of Phoebe; Muse of history, meaning famous',                  morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'dat' }, paradigmKey: null, vocabTier: null, standard_refs: [] },

    'Παλλάς':   { dictEntry: 'Παλλάς', shortDef: '13-year-old, sister of Dolios; epithet of Athena meaning brandisher or maiden',   morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'nom' }, paradigmKey: null, vocabTier: null, standard_refs: [] },
    'Παλλάντος':{ dictEntry: 'Παλλάς', shortDef: '13-year-old, sister of Dolios; epithet of Athena meaning brandisher or maiden',   morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'gen' }, paradigmKey: null, vocabTier: null, standard_refs: [] },
    'Παλλάντι': { dictEntry: 'Παλλάς', shortDef: '13-year-old, sister of Dolios; epithet of Athena meaning brandisher or maiden',   morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'dat' }, paradigmKey: null, vocabTier: null, standard_refs: [] },
    'Παλλάντα': { dictEntry: 'Παλλάς', shortDef: '13-year-old, sister of Dolios; epithet of Athena meaning brandisher or maiden',   morph: { pos: 'noun', gender: 'fem',  number: 'sg', case: 'acc' }, paradigmKey: null, vocabTier: null, standard_refs: [] },

    'Δόλιος':  { dictEntry: 'Δόλιος',  shortDef: '11-year-old, brother of Pallas; epithet of Hermes meaning crafty or wily',        morph: { pos: 'noun', gender: 'masc', number: 'sg', case: 'nom' }, paradigmKey: '2nd_declension_masculine', vocabTier: null, standard_refs: [] },
    'Δολίου':  { dictEntry: 'Δόλιος',  shortDef: '11-year-old, brother of Pallas; epithet of Hermes meaning crafty or wily',        morph: { pos: 'noun', gender: 'masc', number: 'sg', case: 'gen' }, paradigmKey: '2nd_declension_masculine', vocabTier: null, standard_refs: [] },
    'Δολίῳ':   { dictEntry: 'Δόλιος',  shortDef: '11-year-old, brother of Pallas; epithet of Hermes meaning crafty or wily',        morph: { pos: 'noun', gender: 'masc', number: 'sg', case: 'dat' }, paradigmKey: '2nd_declension_masculine', vocabTier: null, standard_refs: [] },
    'Δόλιον':  { dictEntry: 'Δόλιος',  shortDef: '11-year-old, brother of Pallas; epithet of Hermes meaning crafty or wily',        morph: { pos: 'noun', gender: 'masc', number: 'sg', case: 'acc' }, paradigmKey: '2nd_declension_masculine', vocabTier: null, standard_refs: [] },
    'Δόλιε':   { dictEntry: 'Δόλιος',  shortDef: '11-year-old, brother of Pallas; epithet of Hermes meaning crafty or wily',        morph: { pos: 'noun', gender: 'masc', number: 'sg', case: 'voc' }, paradigmKey: '2nd_declension_masculine', vocabTier: null, standard_refs: [] },
};

const REMOVE = ['Κλήτα', 'Κλήτης', 'Κλήτῃ', 'Κλήτην'];

// ── Update local word_forms file ──────────────────────────────────────────────

const filePath = path.join(__dirname, '../functions/data/Greek/word_forms.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

for (const key of REMOVE) delete data[key];
for (const [key, val] of Object.entries(UPDATED)) data[key] = val;

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log(`Updated ${filePath}`);

// ── Update Firestore ──────────────────────────────────────────────────────────

const glossRef = db.collection('word_glosses').doc('grade7-greek');
const dotKeys = {};

for (const key of REMOVE) {
    dotKeys[`forms.${key}`] = admin.firestore.FieldValue.delete();
}
for (const [key, val] of Object.entries(UPDATED)) {
    dotKeys[`forms.${key}`] = val;
}

await glossRef.set({ forms: {} }, { merge: true });
await glossRef.update(dotKeys);
console.log('Updated Firestore word_glosses/grade7-greek');

process.exit(0);

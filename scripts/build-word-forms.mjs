/**
 * build-word-forms.mjs
 * Generates data/Greek/word_forms.json from data/Greek/nge_vocabulary.json.
 * Every NGE vocabulary word → all declined/conjugated surface forms with morph annotation.
 *
 * Usage: node scripts/build-word-forms.mjs
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const vocab = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/Greek/nge_vocabulary.json'), 'utf8')
);

// ---------------------------------------------------------------------------
// Unicode accent utilities
// ---------------------------------------------------------------------------

const ACUTE = '\u0301';
const GRAVE = '\u0300';
const CIRCUMFLEX = '\u0342';
const ROUGH = '\u0314';
const SMOOTH = '\u0313';
const IOTA_SUB = '\u0345';
const DIAERESIS = '\u0308';

function stripAccents(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

function hasAccent(s) {
    const nfd = s.normalize('NFD');
    return nfd.includes(ACUTE) || nfd.includes(GRAVE) || nfd.includes(CIRCUMFLEX);
}

// Return syllables as array of strings (each containing one vowel nucleus)
const VOWELS_RE = /[αεηιουω]/gi;
const DIPHTHONG_RE = /αι|αυ|ει|ευ|ηυ|οι|ου|υι/gi;

function countSyllables(s) {
    const stripped = stripAccents(s).toLowerCase();
    // Count vowel clusters (diphthongs = 1 syllable)
    let count = 0;
    let i = 0;
    while (i < stripped.length) {
        if ('αεηιουω'.includes(stripped[i])) {
            // Check for diphthong
            if (i + 1 < stripped.length && 'αεηιουω'.includes(stripped[i + 1])) {
                // Possible diphthong
                const di = stripped.slice(i, i + 2);
                if (['αι','αυ','ει','ευ','ηυ','οι','ου','υι'].includes(di)) {
                    count++;
                    i += 2;
                    continue;
                }
            }
            count++;
        }
        i++;
    }
    return count;
}

// Is the ultima (last syllable) long?
function isUltimaLong(s) {
    const stripped = stripAccents(s).toLowerCase();
    // Find last vowel cluster
    let i = stripped.length - 1;
    while (i >= 0 && !'αεηιουω'.includes(stripped[i])) i--;
    if (i < 0) return false;
    const v = stripped[i];
    // Check for diphthong ending (except final αι, οι are treated as SHORT for accent)
    if (i > 0 && 'αεηιουω'.includes(stripped[i - 1])) {
        const di = stripped.slice(i - 1, i + 1);
        if (['αι','αυ','ει','ευ','ηυ','οι','ου','υι'].includes(di)) {
            // αι and οι at word-end count as short
            if (di === 'αι' || di === 'οι') return false;
            return true;
        }
    }
    return 'ηω'.includes(v);
}

// Apply recessive accent to a word (for verbs)
// Rules: accent as far back as possible. If ultima long → penult max. Otherwise → antepenult (if 3+ syllables).
function recessiveAccent(s) {
    const nfd = s.normalize('NFD');
    // Strip existing accent marks (acute, grave, circumflex)
    let noAcc = nfd.replace(/[\u0300\u0301\u0342]/g, '').normalize('NFC');
    return accentSyllable(noAcc, isUltimaLong(noAcc) ? 1 : 2);
}

// Accent the Nth syllable from end (0=ultima, 1=penult, 2=antepenult).
// Uses acute on short vowel, circumflex on long penult when ultima is short.
function accentSyllable(s, fromEnd) {
    const nsylls = countSyllables(s);
    if (nsylls === 0) return s;
    const target = Math.min(fromEnd, nsylls - 1);

    const nfd = s.normalize('NFD');
    // Find vowel nuclei from right
    let syllCount = -1;
    let accentPos = -1;

    // Walk from right to find the target syllable's vowel
    for (let i = nfd.length - 1; i >= 0; i--) {
        const c = nfd[i];
        if ('αεηιουω'.includes(c.normalize('NFC').toLowerCase())) {
            // Skip if it's part of a diphthong we already counted
            syllCount++;
            if (syllCount === target) {
                accentPos = i;
                break;
            }
        }
    }

    if (accentPos < 0) return s;

    // Insert acute after the vowel at accentPos
    const arr = [...nfd];
    // Remove any existing accent at this position
    let insertAt = accentPos + 1;
    // If followed by an iota subscript or diaeresis, skip past them
    while (insertAt < arr.length && [IOTA_SUB, DIAERESIS].includes(arr[insertAt])) {
        insertAt++;
    }
    arr.splice(insertAt, 0, ACUTE);
    return arr.join('').normalize('NFC');
}

// ---------------------------------------------------------------------------
// Noun/adjective accent helpers — "persistent" accent
// ---------------------------------------------------------------------------

// Identify which syllable from end the accent is on (0=ultima, 1=penult, 2=antepenult)
function accentPosition(s) {
    const nfd = s.normalize('NFD');
    let syllFromEnd = 0;
    let foundAccent = false;

    for (let i = nfd.length - 1; i >= 0; i--) {
        const c = nfd[i];
        if ([ACUTE, GRAVE, CIRCUMFLEX].includes(c)) {
            foundAccent = true;
            break;
        }
        if ('αεηιουω'.includes(nfd[i].normalize('NFC').toLowerCase())) {
            syllFromEnd++;
        }
    }
    return foundAccent ? syllFromEnd : -1;
}

// Given a nominative form with known accent position, apply to a new case form.
// Simplified: same syllable from end, type determined by vowel length.
function applyPersistentAccent(caseForm, nomAccentPos, forceUltimaCircumflex = false) {
    const stripped = stripAccents(caseForm);
    if (!stripped) return caseForm;

    const nsylls = countSyllables(stripped);
    let target = Math.min(nomAccentPos, nsylls - 1);

    if (forceUltimaCircumflex) {
        // Gen/dat plural of 1st/2nd decl always has circumflex on ultima
        const nfd = stripped.normalize('NFD');
        // Find ultima vowel and add circumflex
        for (let i = nfd.length - 1; i >= 0; i--) {
            if ('αεηιουω'.includes(nfd[i])) {
                const arr = [...nfd];
                arr.splice(i + 1, 0, CIRCUMFLEX);
                return arr.join('').normalize('NFC');
            }
        }
    }

    return accentSyllable(stripped, target);
}

// ---------------------------------------------------------------------------
// Standard refs + paradigm key helpers
// ---------------------------------------------------------------------------

function verbStandardRefs(conjugation) {
    if (conjugation === 'mi') return ['morph.verb.eimi'];
    if (conjugation === 'epsilon_contract') return ['morph.verb.epsilon_contract_present'];
    if (conjugation === 'alpha_contract') return ['morph.verb.alpha_contract_present'];
    if (conjugation === 'deponent') return ['morph.verb.present_indicative_active'];
    if (conjugation === 'impersonal') return ['morph.verb.present_indicative_active'];
    return ['morph.verb.present_indicative_active'];
}

function verbParadigmKey(conjugation, dictEntry) {
    if (dictEntry === 'εἰμί') return 'eimi_present_indicative_active';
    if (conjugation === 'epsilon_contract') return 'epsilon_contract_present_indicative_active';
    if (conjugation === 'alpha_contract') return 'alpha_contract_present_indicative_active';
    return 'omega_verb_present_indicative_active';
}

function shortDef(definition) {
    return definition.split(/[,;]/)[0].trim().slice(0, 45);
}

// ---------------------------------------------------------------------------
// Output dictionary
// ---------------------------------------------------------------------------

const dict = {};

function add(surfaceForm, entry) {
    const key = surfaceForm.trim();
    if (!key) return;
    // Last entry wins for duplicate forms
    dict[key] = entry;
}

// ---------------------------------------------------------------------------
// HARDCODED: Definite article
// ---------------------------------------------------------------------------

const ARTICLE_FORMS = [
    // masc sg
    ['ὁ',   'art.masc.sg.nom'], ['τοῦ', 'art.masc.sg.gen'],
    ['τῷ',  'art.masc.sg.dat'], ['τόν', 'art.masc.sg.acc'],
    // fem sg
    ['ἡ',   'art.fem.sg.nom'],  ['τῆς', 'art.fem.sg.gen'],
    ['τῇ',  'art.fem.sg.dat'],  ['τήν', 'art.fem.sg.acc'],
    // neut sg
    ['τό',  'art.neut.sg.nom'], ['τοῦ', 'art.neut.sg.gen'],
    ['τῷ',  'art.neut.sg.dat'],
    // masc pl
    ['οἱ',  'art.masc.pl.nom'], ['τῶν', 'art.masc.pl.gen'],
    ['τοῖς','art.masc.pl.dat'], ['τούς','art.masc.pl.acc'],
    // fem pl
    ['αἱ',  'art.fem.pl.nom'],  ['τῶν', 'art.fem.pl.gen'],
    ['ταῖς','art.fem.pl.dat'],  ['τάς', 'art.fem.pl.acc'],
    // neut pl
    ['τά',  'art.neut.pl.nom'], ['τῶν', 'art.neut.pl.gen'],
    ['τοῖς','art.neut.pl.dat'],
];
for (const [form, morph] of ARTICLE_FORMS) {
    add(form, {
        dict_entry: 'ὁ ἡ τό', short_def: 'the', morph,
        vocab_tier: null, standard_refs: ['morph.article.definite_all_genders'],
        paradigm_key: 'definite_article'
    });
}

// ---------------------------------------------------------------------------
// HARDCODED: εἰμί
// ---------------------------------------------------------------------------

const EIMI_FORMS = [
    ['εἰμί',  'verb.pres.indic.act.1sg'], ['εἶ',    'verb.pres.indic.act.2sg'],
    ['ἐστί',  'verb.pres.indic.act.3sg'], ['ἐστίν', 'verb.pres.indic.act.3sg'],
    ['ἐσμέν', 'verb.pres.indic.act.1pl'], ['ἐστέ',  'verb.pres.indic.act.2pl'],
    ['εἰσί',  'verb.pres.indic.act.3pl'], ['εἰσίν', 'verb.pres.indic.act.3pl'],
    ['εἶναι', 'verb.pres.inf.act'],
];
for (const [form, morph] of EIMI_FORMS) {
    add(form, {
        dict_entry: 'εἰμί', short_def: 'be, exist', morph,
        vocab_tier: 'intro', standard_refs: ['morph.verb.eimi'],
        paradigm_key: 'eimi_present_indicative_active'
    });
}

// ---------------------------------------------------------------------------
// HARDCODED: Personal pronouns
// ---------------------------------------------------------------------------

const PRONOUN_FORMS = [
    // 1st person sg
    ['ἐγώ','pron.personal.1.sg.nom','ἐγώ','I','beginning'],
    ['ἐμοῦ','pron.personal.1.sg.gen','ἐγώ','I','beginning'],
    ['μου','pron.personal.1.sg.gen','ἐγώ','I','beginning'],
    ['ἐμοί','pron.personal.1.sg.dat','ἐγώ','I','beginning'],
    ['μοι','pron.personal.1.sg.dat','ἐγώ','I','beginning'],
    ['ἐμέ','pron.personal.1.sg.acc','ἐγώ','I','beginning'],
    ['με','pron.personal.1.sg.acc','ἐγώ','I','beginning'],
    // 1st person pl
    ['ἡμεῖς','pron.personal.1.pl.nom','ἐγώ','I','beginning'],
    ['ἡμῶν','pron.personal.1.pl.gen','ἐγώ','I','beginning'],
    ['ἡμῖν','pron.personal.1.pl.dat','ἐγώ','I','beginning'],
    ['ἡμᾶς','pron.personal.1.pl.acc','ἐγώ','I','beginning'],
    // 2nd person sg
    ['σύ','pron.personal.2.sg.nom','σύ','you','beginning'],
    ['σοῦ','pron.personal.2.sg.gen','σύ','you','beginning'],
    ['σου','pron.personal.2.sg.gen','σύ','you','beginning'],
    ['σοί','pron.personal.2.sg.dat','σύ','you','beginning'],
    ['σοι','pron.personal.2.sg.dat','σύ','you','beginning'],
    ['σέ','pron.personal.2.sg.acc','σύ','you','beginning'],
    ['σε','pron.personal.2.sg.acc','σύ','you','beginning'],
    // 2nd person pl
    ['ὑμεῖς','pron.personal.2.pl.nom','σύ','you','beginning'],
    ['ὑμῶν','pron.personal.2.pl.gen','σύ','you','beginning'],
    ['ὑμῖν','pron.personal.2.pl.dat','σύ','you','beginning'],
    ['ὑμᾶς','pron.personal.2.pl.acc','σύ','you','beginning'],
];
for (const [form, morph, dictEntry, def, tier] of PRONOUN_FORMS) {
    add(form, {
        dict_entry: dictEntry, short_def: def, morph,
        vocab_tier: tier, standard_refs: ['morph.pronoun.personal_1st_2nd'],
        paradigm_key: dictEntry === 'ἐγώ' ? 'pronoun_personal_1st' : 'pronoun_personal_2nd'
    });
}

// αὐτός
const AUTOS_TABLE = {
    masc: {
        sg: { nom:'αὐτός', gen:'αὐτοῦ', dat:'αὐτῷ', acc:'αὐτόν', voc:'αὐτέ' },
        pl:  { nom:'αὐτοί', gen:'αὐτῶν', dat:'αὐτοῖς', acc:'αὐτούς', voc:'αὐτοί' }
    },
    fem: {
        sg: { nom:'αὐτή', gen:'αὐτῆς', dat:'αὐτῇ', acc:'αὐτήν', voc:'αὐτή' },
        pl:  { nom:'αὐταί', gen:'αὐτῶν', dat:'αὐταῖς', acc:'αὐτάς', voc:'αὐταί' }
    },
    neut: {
        sg: { nom:'αὐτό', gen:'αὐτοῦ', dat:'αὐτῷ', acc:'αὐτό', voc:'αὐτό' },
        pl:  { nom:'αὐτά', gen:'αὐτῶν', dat:'αὐτοῖς', acc:'αὐτά', voc:'αὐτά' }
    }
};
for (const [gender, nums] of Object.entries(AUTOS_TABLE)) {
    for (const [num, cases] of Object.entries(nums)) {
        for (const [cas, form] of Object.entries(cases)) {
            add(form, {
                dict_entry: 'αὐτός', short_def: 'self; he/she/it',
                morph: `pron.autos.${gender}.${num}.${cas}`,
                vocab_tier: 'beginning', standard_refs: ['morph.pronoun.autos_oblique'],
                paradigm_key: 'pronoun_autos'
            });
        }
    }
}

// ὅς relative pronoun
const HOS_TABLE = {
    masc: {
        sg: { nom:'ὅς', gen:'οὗ', dat:'ᾧ', acc:'ὅν' },
        pl:  { nom:'οἵ', gen:'ὧν', dat:'οἷς', acc:'οὕς' }
    },
    fem: {
        sg: { nom:'ἥ', gen:'ἧς', dat:'ᾗ', acc:'ἥν' },
        pl:  { nom:'αἵ', gen:'ὧν', dat:'αἷς', acc:'ἅς' }
    },
    neut: {
        sg: { nom:'ὅ', gen:'οὗ', dat:'ᾧ', acc:'ὅ' },
        pl:  { nom:'ἅ', gen:'ὧν', dat:'οἷς', acc:'ἅ' }
    }
};
for (const [gender, nums] of Object.entries(HOS_TABLE)) {
    for (const [num, cases] of Object.entries(nums)) {
        for (const [cas, form] of Object.entries(cases)) {
            add(form, {
                dict_entry: 'ὅς', short_def: 'who, which',
                morph: `pron.relative.${gender}.${num}.${cas}`,
                vocab_tier: 'intermediate', standard_refs: ['morph.pronoun.relative_hos'],
                paradigm_key: 'pronoun_relative_hos'
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Verb generation
// ---------------------------------------------------------------------------

// Detect contract type from nominative form (1sg pres act)
function detectConjType(greek) {
    const stripped = stripAccents(greek).toLowerCase();
    if (stripped.endsWith('εω') || stripped.endsWith('εις') && false) {
        // The dict entry is the uncontracted 1sg: e.g. καλέω
        return 'epsilon_contract';
    }
    if (stripped.endsWith('αω')) return 'alpha_contract';
    return 'omega';
}

// Get present stem from 1sg (remove -ω or contracted ending)
function getVerbStem(greek, conjType) {
    const stripped = stripAccents(greek).toLowerCase();
    if (conjType === 'epsilon_contract') {
        // e.g. καλέω → stem = καλε (remove ω but keep ε)
        if (stripped.endsWith('εω')) {
            return greek.normalize('NFD').replace(/[ωΩ][\u0300-\u036f]*/g, '').normalize('NFC')
                .replace(/[ωΩ]$/, '');
        }
    }
    if (conjType === 'alpha_contract') {
        if (stripped.endsWith('αω')) {
            return greek.replace(/[ωΩ][\u0300-\u036f]*$/g, '').replace(/[ωΩ]$/, '');
        }
    }
    // Standard omega: remove -ω
    // Strip accents, remove last ω, then get stem from original
    const base = greek.normalize('NFD');
    // Find last omega
    const omegaIdx = [...base].reverse().findIndex(c => c === 'ω' || c === 'Ω');
    if (omegaIdx < 0) return greek;
    const actualIdx = base.length - 1 - omegaIdx;
    return base.slice(0, actualIdx).normalize('NFC');
}

// Generate omega verb present indicative active forms
function genOmegaForms(stem) {
    // Endings for thematic omega verbs (recessive accent applied to full form)
    return [
        [stem + 'ω',    'verb.pres.indic.act.1sg'],
        [stem + 'εις',  'verb.pres.indic.act.2sg'],
        [stem + 'ει',   'verb.pres.indic.act.3sg'],
        [stem + 'ομεν', 'verb.pres.indic.act.1pl'],
        [stem + 'ετε',  'verb.pres.indic.act.2pl'],
        [stem + 'ουσι', 'verb.pres.indic.act.3pl'],
        [stem + 'ουσιν','verb.pres.indic.act.3pl'],
        [stem + 'ειν',  'verb.pres.inf.act'],
    ].map(([f, m]) => [recessiveAccent(f), m]);
}

// Epsilon contract: stem ends in ε, contractions applied
function genEpsilonContractForms(stem) {
    // stem already includes the ε (e.g. "καλε")
    return [
        [stem.replace(/ε$/, 'ῶ'),       'verb.pres.indic.act.1sg'],  // ε+ω → ω (circumflex)
        [stem.replace(/ε$/, 'εῖς'),     'verb.pres.indic.act.2sg'],  // ε+εις → εῖς
        [stem.replace(/ε$/, 'εῖ'),      'verb.pres.indic.act.3sg'],  // ε+ει → εῖ
        [stem.replace(/ε$/, 'οῦμεν'),   'verb.pres.indic.act.1pl'],  // ε+ομεν → οῦμεν
        [stem.replace(/ε$/, 'εῖτε'),    'verb.pres.indic.act.2pl'],  // ε+ετε → εῖτε
        [stem.replace(/ε$/, 'οῦσι'),    'verb.pres.indic.act.3pl'],  // ε+ουσι → οῦσι
        [stem.replace(/ε$/, 'οῦσιν'),   'verb.pres.indic.act.3pl'],
        [stem.replace(/ε$/, 'εῖν'),     'verb.pres.inf.act'],        // ε+ειν → εῖν
    ];
}

// Alpha contract forms
function genAlphaContractForms(stem) {
    // stem ends in α
    return [
        [stem.replace(/[αά]$/, 'ῶ'),    'verb.pres.indic.act.1sg'],
        [stem.replace(/[αά]$/, 'ᾷς'),   'verb.pres.indic.act.2sg'],
        [stem.replace(/[αά]$/, 'ᾷ'),    'verb.pres.indic.act.3sg'],
        [stem.replace(/[αά]$/, 'ῶμεν'), 'verb.pres.indic.act.1pl'],
        [stem.replace(/[αά]$/, 'ᾶτε'),  'verb.pres.indic.act.2pl'],
        [stem.replace(/[αά]$/, 'ῶσι'),  'verb.pres.indic.act.3pl'],
        [stem.replace(/[αά]$/, 'ῶσιν'), 'verb.pres.indic.act.3pl'],
        [stem.replace(/[αά]$/, 'ᾶν'),   'verb.pres.inf.act'],
    ];
}

// Deponent: present middle indicative
function genDeponentForms(stem) {
    return [
        [stem + 'ομαι',  'verb.pres.indic.mid.1sg'],
        [stem + 'ει',    'verb.pres.indic.mid.2sg'],
        [stem + 'εται',  'verb.pres.indic.mid.3sg'],
        [stem + 'όμεθα', 'verb.pres.indic.mid.1pl'],
        [stem + 'εσθε',  'verb.pres.indic.mid.2pl'],
        [stem + 'ονται', 'verb.pres.indic.mid.3pl'],
        [stem + 'εσθαι', 'verb.pres.inf.mid'],
    ].map(([f, m]) => [recessiveAccent(f), m]);
}

function processVerb(entry) {
    const { greek, conjugation, definition, introduced } = entry;
    const tier = introduced;
    const def = shortDef(definition);

    if (greek === 'εἰμί') return; // already hardcoded

    // Determine effective conjugation type
    let conjType = conjugation;
    if (conjugation === 'omega') {
        const strippedGreek = stripAccents(greek).toLowerCase();
        if (strippedGreek.endsWith('εω')) conjType = 'epsilon_contract';
        else if (strippedGreek.endsWith('αω')) conjType = 'alpha_contract';
    }

    const stdRefs = verbStandardRefs(conjType === 'omega' ? 'omega' : conjType);
    const paradigmKey = verbParadigmKey(conjType, greek);

    let forms = [];

    if (conjugation === 'mi') {
        // Only εἰμί is hardcoded; other mi-verbs — just add the base form
        add(greek, {
            dict_entry: greek, short_def: def, morph: 'verb.pres.indic.act.1sg',
            vocab_tier: tier, standard_refs: stdRefs, paradigm_key: null
        });
        return;
    }

    if (conjugation === 'impersonal') {
        // δεῖ, δοκεῖ etc — just add the single form
        add(greek, {
            dict_entry: greek, short_def: def, morph: 'verb.pres.indic.act.3sg',
            vocab_tier: tier, standard_refs: stdRefs, paradigm_key: null
        });
        return;
    }

    const stem = getVerbStem(greek, conjType);

    if (conjugation === 'deponent') {
        // Deponent: middle forms; some have -ομαι directly
        // Detect stem: if greek ends in -ομαι, stem = greek minus -ομαι
        const strippedGreek = stripAccents(greek).toLowerCase();
        let depStem = stem;
        if (strippedGreek.endsWith('ομαι')) {
            // stem = everything before -ομαι
            const baseNFD = greek.normalize('NFD');
            const suffixLen = 'ομαι'.length; // 4 chars but NFD may differ
            // Simple: remove last 4 chars (ομαι) from stripped, find in original
            depStem = stripAccents(greek).slice(0, -4);
            // Recover accented stem from original
            depStem = greek.slice(0, greek.length - 4);
        }
        forms = genDeponentForms(depStem);
    } else if (conjType === 'epsilon_contract') {
        forms = genEpsilonContractForms(stem);
    } else if (conjType === 'alpha_contract') {
        forms = genAlphaContractForms(stem);
    } else {
        // Standard omega
        forms = genOmegaForms(stem);
    }

    for (const [form, morph] of forms) {
        add(form, {
            dict_entry: greek, short_def: def, morph,
            vocab_tier: tier, standard_refs: stdRefs, paradigm_key: paradigmKey
        });
    }
}

// ---------------------------------------------------------------------------
// Noun generation
// ---------------------------------------------------------------------------

function nounStandardRefs(declension) {
    if (declension === '1st') return ['morph.noun.1st_decl'];
    if (declension === '2nd' || declension === '2nd irregular' || declension === '2nd contracted') return ['morph.noun.2nd_decl'];
    return ['morph.noun.3rd_decl_recognition'];
}

function nounParadigmKey(declension, gender) {
    if (declension === '1st') return gender === 'm' ? '2nd_declension_masculine' : '1st_declension_feminine_eta';
    if (declension === '2nd') {
        if (gender === 'n') return '2nd_declension_neuter';
        return '2nd_declension_masculine';
    }
    return null;
}

// Get the stem for a 1st declension noun from nominative + genitive ending
function get1stDeclStem(nom, genEnding) {
    // genitive ending is like '-ης', '-ας', '-ῆς', '-ᾶς'
    // Sometimes it's the full genitive
    if (genEnding.startsWith('-')) {
        // Relative ending — strip -η/-α from nominative to get stem
        const strippedNom = stripAccents(nom).toLowerCase();
        if (strippedNom.endsWith('η')) return nom.slice(0, -1);
        if (strippedNom.endsWith('α')) return nom.slice(0, -1);
        if (strippedNom.endsWith('ης')) return nom.slice(0, -2);  // e.g. some ms
        if (strippedNom.endsWith('ας')) return nom.slice(0, -2);
        return nom;
    }
    // It's the full genitive: strip the genitive ending
    const strippedGen = stripAccents(genEnding).toLowerCase();
    if (strippedGen.endsWith('ης')) return nom; // use nom as base
    return nom;
}

// 1st declension feminine endings
const FIRST_DECL_ETA = {
    sg: { nom: 'η', gen: 'ης', dat: 'ῃ', acc: 'ην', voc: 'η' },
    pl: { nom: 'αι', gen: 'ῶν', dat: 'αις', acc: 'ας', voc: 'αι' }
};
const FIRST_DECL_ALPHA = {
    sg: { nom: 'α', gen: 'ας', dat: 'ᾳ', acc: 'αν', voc: 'α' },
    pl: { nom: 'αι', gen: 'ῶν', dat: 'αις', acc: 'ας', voc: 'αι' }
};

// 2nd declension masculine
const SECOND_DECL_MASC = {
    sg: { nom: 'ος', gen: 'ου', dat: 'ῳ', acc: 'ον', voc: 'ε' },
    pl: { nom: 'οι', gen: 'ων', dat: 'οις', acc: 'ους', voc: 'οι' }
};
// 2nd declension neuter
const SECOND_DECL_NEUT = {
    sg: { nom: 'ον', gen: 'ου', dat: 'ῳ', acc: 'ον', voc: 'ον' },
    pl: { nom: 'α', gen: 'ων', dat: 'οις', acc: 'α', voc: 'α' }
};

function process1stDeclNoun(entry) {
    const { greek, gender, genitive, definition, introduced } = entry;
    const tier = introduced;
    const def = shortDef(definition);
    const stdRefs = ['morph.noun.1st_decl'];

    // Determine stem
    const strippedNom = stripAccents(greek).toLowerCase();
    let stem, endings, isAlphaType;

    // Detect η-type vs α-type from genitive
    const strippedGen = genitive ? stripAccents(genitive).toLowerCase() : '';
    if (strippedGen.endsWith('ης') || strippedGen === '-ης' || strippedGen === '-ῆς') {
        isAlphaType = false;
    } else if (strippedGen.endsWith('ας') || strippedGen === '-ας' || strippedGen === '-ᾶς') {
        isAlphaType = true;
    } else {
        // Default: if nom ends in η → η-type, else α-type
        isAlphaType = strippedNom.endsWith('α');
    }

    endings = isAlphaType ? FIRST_DECL_ALPHA : FIRST_DECL_ETA;
    const nomEnding = isAlphaType ? 'α' : 'η';

    // Get stem by removing nom ending
    if (strippedNom.endsWith(nomEnding)) {
        stem = greek.slice(0, greek.length - 1);
    } else if (strippedNom.endsWith('η')) {
        stem = greek.slice(0, greek.length - 1);
        isAlphaType = false;
        endings = FIRST_DECL_ETA;
    } else {
        // Can't parse — just add nominative
        add(greek, { dict_entry: greek, short_def: def, morph: `noun.${gender === 'm' ? 'masc' : 'fem'}.sg.nom`,
            vocab_tier: tier, standard_refs: stdRefs, paradigm_key: isAlphaType ? '1st_declension_feminine_alpha' : '1st_declension_feminine_eta' });
        return;
    }

    const paradigmKey = isAlphaType ? '1st_declension_feminine_alpha' : '1st_declension_feminine_eta';
    const genderMorph = gender === 'm' ? 'masc' : 'fem';
    const nomAccPos = accentPosition(greek);

    for (const [num, cases] of Object.entries(endings)) {
        for (const [cas, ending] of Object.entries(cases)) {
            const rawForm = stem + ending;
            // Apply persistent accent (gen/dat pl get circumflex on ultima)
            const forceCirc = (cas === 'gen' || cas === 'dat') && num === 'pl';
            const form = applyPersistentAccent(rawForm, nomAccPos, forceCirc);
            add(form, {
                dict_entry: greek, short_def: def,
                morph: `noun.${genderMorph}.${num}.${cas}`,
                vocab_tier: tier, standard_refs: stdRefs, paradigm_key: paradigmKey
            });
        }
    }
}

function process2ndDeclNoun(entry) {
    const { greek, gender, definition, introduced } = entry;
    const tier = introduced;
    const def = shortDef(definition);
    const stdRefs = ['morph.noun.2nd_decl'];
    const isNeut = gender === 'n';
    const endings = isNeut ? SECOND_DECL_NEUT : SECOND_DECL_MASC;
    const paradigmKey = isNeut ? '2nd_declension_neuter' : '2nd_declension_masculine';
    const genderMorph = isNeut ? 'neut' : (gender === 'f' ? 'fem' : 'masc');

    // Stem: remove -ος or -ον
    const strippedNom = stripAccents(greek).toLowerCase();
    let stem;
    if (strippedNom.endsWith('ος')) stem = greek.slice(0, -2);
    else if (strippedNom.endsWith('ον')) stem = greek.slice(0, -2);
    else { stem = greek.slice(0, -2); } // best guess

    const nomAccPos = accentPosition(greek);

    for (const [num, cases] of Object.entries(endings)) {
        for (const [cas, ending] of Object.entries(cases)) {
            const rawForm = stem + ending;
            const forceCirc = (cas === 'gen' || cas === 'dat') && num === 'pl';
            const form = applyPersistentAccent(rawForm, nomAccPos, forceCirc);
            add(form, {
                dict_entry: greek, short_def: def,
                morph: `noun.${genderMorph}.${num}.${cas}`,
                vocab_tier: tier, standard_refs: stdRefs, paradigm_key: paradigmKey
            });
        }
    }
}

function process3rdDeclNoun(entry) {
    const { greek, gender, genitive, definition, introduced } = entry;
    const tier = introduced;
    const def = shortDef(definition);
    const stdRefs = ['morph.noun.3rd_decl_recognition'];
    const genderMorph = gender === 'f' ? 'fem' : (gender === 'n' ? 'neut' : 'masc');

    // For 3rd decl: at minimum add the nominative
    add(greek, {
        dict_entry: greek, short_def: def, morph: `noun.${genderMorph}.sg.nom`,
        vocab_tier: tier, standard_refs: stdRefs, paradigm_key: null
    });

    // Try to derive stem from genitive
    if (!genitive) return;

    let gen = genitive;
    // If genitive is relative (starts with -), replace the ending
    if (gen.startsWith('-')) {
        // e.g., '-ότος' on εἰκός → stem = εἰκ + οτ
        const genEnding = stripAccents(gen.slice(1)).toLowerCase();
        const nomStripped = stripAccents(greek).toLowerCase();
        // Find the stem by removing the nom ending
        // Common 3rd decl nom endings: -ς, -ρ, -ν, -ξ, -ψ
        let nomEnding = '';
        for (const e of ['ης','ος','ις','υς','ας','εις','ους','ων','ες']) {
            if (nomStripped.endsWith(e)) { nomEnding = e; break; }
        }
        if (nomEnding) {
            const stem = greek.slice(0, -nomEnding.length);
            // Build genitive full form
            gen = stem + gen.slice(1);
        } else {
            return;
        }
    }

    // Get stem from genitive by removing -ος ending
    const genStripped = stripAccents(gen).toLowerCase();
    let stem3;
    if (genStripped.endsWith('ος')) stem3 = gen.slice(0, -2);
    else if (genStripped.endsWith('ους')) stem3 = gen.slice(0, -3);  // -εως type
    else return;

    // Common 3rd decl endings (simplified, not all types)
    const cases3 = [
        [`${stem3}ος`, `noun.${genderMorph}.sg.gen`],
        [`${stem3}ι`,  `noun.${genderMorph}.sg.dat`],
        [`${stem3}α`,  `noun.${genderMorph}.sg.acc`],
        [`${stem3}ες`, `noun.${genderMorph}.pl.nom`],
        [`${stem3}ων`, `noun.${genderMorph}.pl.gen`],
        [`${stem3}σι`, `noun.${genderMorph}.pl.dat`],
        [`${stem3}ας`, `noun.${genderMorph}.pl.acc`],
    ];

    const nomAccPos = accentPosition(greek);
    for (const [rawForm, morph] of cases3) {
        const form = applyPersistentAccent(rawForm, nomAccPos, false);
        add(form, {
            dict_entry: greek, short_def: def, morph,
            vocab_tier: tier, standard_refs: stdRefs, paradigm_key: null
        });
    }
}

function processNoun(entry) {
    const decl = entry.declension;
    if (decl === '1st') return process1stDeclNoun(entry);
    if (decl === '2nd' || decl === '2nd irregular' || decl === '2nd contracted') return process2ndDeclNoun(entry);
    if (decl === '3rd' || decl === '3rd irregular') return process3rdDeclNoun(entry);
    // Unknown: just add nominative
    add(entry.greek, {
        dict_entry: entry.greek, short_def: shortDef(entry.definition),
        morph: 'noun.masc.sg.nom', vocab_tier: entry.introduced,
        standard_refs: [], paradigm_key: null
    });
}

// ---------------------------------------------------------------------------
// Adjective generation (2-1-2)
// ---------------------------------------------------------------------------

function process212Adjective(entry) {
    const { greek, endings: endField, definition, introduced } = entry;
    const tier = introduced;
    const def = shortDef(definition);
    const stdRefs = ['morph.adjective.1st_2nd_decl'];
    const paradigmKey = '2_1_2_adjective';

    // Greek = masc nom (e.g. ἀγαθός)
    // endField = e.g. "-ή -όν" or "-η -ον"
    // Stem = masc nom minus -ος
    const strippedMasc = stripAccents(greek).toLowerCase();
    if (!strippedMasc.endsWith('ος')) {
        add(greek, { dict_entry: greek, short_def: def, morph: 'adj.masc.sg.nom',
            vocab_tier: tier, standard_refs: stdRefs, paradigm_key: paradigmKey });
        return;
    }
    const stem = greek.slice(0, -2);
    const nomAccPos = accentPosition(greek);

    // Determine fem nom ending (-η or -α)
    let femNomEnd = 'η';
    if (endField) {
        const parts = endField.trim().split(/\s+/);
        if (parts[0]) {
            const fe = stripAccents(parts[0].replace('-', '')).toLowerCase();
            if (fe === 'α' || fe === 'α') femNomEnd = 'α';
        }
    }
    const femEndings = femNomEnd === 'α' ? FIRST_DECL_ALPHA : FIRST_DECL_ETA;

    // Masculine forms (2nd decl)
    for (const [num, cases] of Object.entries(SECOND_DECL_MASC)) {
        for (const [cas, ending] of Object.entries(cases)) {
            const forceCirc = (cas === 'gen' || cas === 'dat') && num === 'pl';
            const form = applyPersistentAccent(stem + ending, nomAccPos, forceCirc);
            add(form, { dict_entry: greek, short_def: def, morph: `adj.masc.${num}.${cas}`,
                vocab_tier: tier, standard_refs: stdRefs, paradigm_key: paradigmKey });
        }
    }

    // Feminine forms (1st decl)
    for (const [num, cases] of Object.entries(femEndings)) {
        for (const [cas, ending] of Object.entries(cases)) {
            const forceCirc = (cas === 'gen' || cas === 'dat') && num === 'pl';
            const form = applyPersistentAccent(stem + ending, nomAccPos, forceCirc);
            add(form, { dict_entry: greek, short_def: def, morph: `adj.fem.${num}.${cas}`,
                vocab_tier: tier, standard_refs: stdRefs, paradigm_key: paradigmKey });
        }
    }

    // Neuter forms (2nd decl neuter)
    for (const [num, cases] of Object.entries(SECOND_DECL_NEUT)) {
        for (const [cas, ending] of Object.entries(cases)) {
            const forceCirc = (cas === 'gen' || cas === 'dat') && num === 'pl';
            const form = applyPersistentAccent(stem + ending, nomAccPos, forceCirc);
            add(form, { dict_entry: greek, short_def: def, morph: `adj.neut.${num}.${cas}`,
                vocab_tier: tier, standard_refs: stdRefs, paradigm_key: paradigmKey });
        }
    }
}

function processAdjective(entry) {
    const pattern = entry.declension_pattern;
    if (pattern === '2-1-2') return process212Adjective(entry);
    // For other patterns, just add the nominative
    add(entry.greek, {
        dict_entry: entry.greek, short_def: shortDef(entry.definition),
        morph: 'adj.masc.sg.nom', vocab_tier: entry.introduced,
        standard_refs: ['morph.adjective.1st_2nd_decl'], paradigm_key: null
    });
}

// ---------------------------------------------------------------------------
// Simple POS (conjunctions, prepositions, adverbs, particles, etc.)
// ---------------------------------------------------------------------------

const POS_MORPH = {
    conjunction: 'conj', preposition: 'prep', adverb: 'adv',
    particle: 'particle', interjection: 'interj', numeral: 'numeral',
    prefix: 'prefix', article: 'art.masc.sg.nom'
};

function processSimple(entry) {
    const morph = POS_MORPH[entry.pos] ?? entry.pos;
    add(entry.greek, {
        dict_entry: entry.greek, short_def: shortDef(entry.definition),
        morph, vocab_tier: entry.introduced, standard_refs: [], paradigm_key: null
    });
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let skipped = [];

for (const entry of vocab.entries) {
    try {
        switch (entry.pos) {
            case 'verb':        processVerb(entry); break;
            case 'noun':        processNoun(entry); break;
            case 'adjective':   processAdjective(entry); break;
            case 'pronoun':
                // Key pronouns hardcoded above; just add nominative for others
                if (!['αὐτός','ὅς','ἐγώ','σύ'].includes(entry.greek)) {
                    add(entry.greek, {
                        dict_entry: entry.greek, short_def: shortDef(entry.definition),
                        morph: 'pron.masc.sg.nom', vocab_tier: entry.introduced,
                        standard_refs: [], paradigm_key: null
                    });
                }
                break;
            default:            processSimple(entry); break;
        }
    } catch (e) {
        skipped.push({ greek: entry.greek, error: e.message });
    }
}

// ---------------------------------------------------------------------------
// Second pass: also index by accent-stripped form (fallback for accent mismatches)
// This ensures lookup succeeds even when generated accent placement is imperfect.
// The tokenizer should try exact match first, then stripped-accent match.
// ---------------------------------------------------------------------------

const dictStripped = {};
for (const [form, entry] of Object.entries(dict)) {
    const stripped = stripAccents(form);
    if (stripped !== form && !dictStripped[stripped]) {
        dictStripped[stripped] = entry;
    }
}

// Merge stripped index as secondary entries (only where no exact match exists)
for (const [stripped, entry] of Object.entries(dictStripped)) {
    if (!dict[stripped]) {
        dict[stripped] = entry;
    }
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outPath = path.join(ROOT, 'data/Greek/word_forms.json');
fs.writeFileSync(outPath, JSON.stringify(dict, null, 2), 'utf8');

const count = Object.keys(dict).length;
console.log(`Wrote ${count} word forms to ${outPath}`);
if (skipped.length > 0) {
    console.log(`\nSkipped (${skipped.length}):`);
    for (const s of skipped) console.log(`  ${s.greek}: ${s.error}`);
}

#!/usr/bin/env node
/**
 * gen-greek-grammar.mjs
 *
 * Generates voice-ready Grammar Lessons for "The Aporia of the Children."
 * For morphology standards: conceptual intro + full paradigm narration + examples.
 * For reading/skill standards: conceptual explanation + examples, no paradigm.
 *
 * Output: saves to Firestore as lesson.grammar.text (+ optionally .audioUrl + .alignment)
 *
 * Usage:
 *   node scripts/gen-greek-grammar.mjs --chapter ch_01_athens
 *   node scripts/gen-greek-grammar.mjs --chapter ch_01_athens --audio
 *   node scripts/gen-greek-grammar.mjs --chapter ch_01_athens --dry-run
 *   node scripts/gen-greek-grammar.mjs --all [--skip-existing] [--audio]
 */

import Anthropic from '@anthropic-ai/sdk';
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
    storageBucket: 'sturbridge-e59d9.firebasestorage.app'
});
const db = admin.firestore();

const MODEL        = 'claude-opus-4-7';
const MAX_TOKENS   = 2500;
const NARRATOR_ID  = '62eXAzXYsxMOUszcxeJ4';
const ELEVEN_KEY   = process.env.ELEVEN_LABS_API_KEY;

const CURRICULUM_PATH = path.join(__dirname, '../data/Greek/chapter_curriculum.json');

// ---------------------------------------------------------------------------
// Paradigm data for each morphology standard (hardcoded — stable Ancient Greek)
// Provided to Claude so it can narrate forms accurately.
// ---------------------------------------------------------------------------
const PARADIGMS = {
    'lang.morph.article_all_genders': {
        name: 'the definite article (ὁ, ἡ, τό)',
        intro: 'The definite article is the Greek word for "the." Unlike English, Greek changes the form of "the" to match the gender, case, and number of the noun it modifies.',
        table: [
            {
                gender: 'masculine',
                forms: [
                    { case: 'nominative singular', greek: 'ὁ', meaning: 'the (subject)' },
                    { case: 'genitive singular',   greek: 'τοῦ', meaning: 'of the' },
                    { case: 'dative singular',     greek: 'τῷ', meaning: 'to/for/with the' },
                    { case: 'accusative singular', greek: 'τόν', meaning: 'the (direct object)' },
                    { case: 'nominative plural',   greek: 'οἱ', meaning: 'the (subjects)' },
                    { case: 'genitive plural',     greek: 'τῶν', meaning: 'of the' },
                    { case: 'dative plural',       greek: 'τοῖς', meaning: 'to/for/with the' },
                    { case: 'accusative plural',   greek: 'τούς', meaning: 'the (direct objects)' },
                ]
            },
            {
                gender: 'feminine',
                forms: [
                    { case: 'nominative singular', greek: 'ἡ', meaning: 'the (subject)' },
                    { case: 'genitive singular',   greek: 'τῆς', meaning: 'of the' },
                    { case: 'dative singular',     greek: 'τῇ', meaning: 'to/for/with the' },
                    { case: 'accusative singular', greek: 'τήν', meaning: 'the (direct object)' },
                    { case: 'nominative plural',   greek: 'αἱ', meaning: 'the (subjects)' },
                    { case: 'genitive plural',     greek: 'τῶν', meaning: 'of the' },
                    { case: 'dative plural',       greek: 'ταῖς', meaning: 'to/for/with the' },
                    { case: 'accusative plural',   greek: 'τάς', meaning: 'the (direct objects)' },
                ]
            },
            {
                gender: 'neuter',
                forms: [
                    { case: 'nominative singular', greek: 'τό', meaning: 'the (subject/object)' },
                    { case: 'genitive singular',   greek: 'τοῦ', meaning: 'of the' },
                    { case: 'dative singular',     greek: 'τῷ', meaning: 'to/for/with the' },
                    { case: 'accusative singular', greek: 'τό', meaning: 'the (subject/object)' },
                    { case: 'nominative plural',   greek: 'τά', meaning: 'the (subjects/objects)' },
                    { case: 'genitive plural',     greek: 'τῶν', meaning: 'of the' },
                    { case: 'dative plural',       greek: 'τοῖς', meaning: 'to/for/with the' },
                    { case: 'accusative plural',   greek: 'τά', meaning: 'the (subjects/objects)' },
                ]
            }
        ]
    },

    'lang.morph.noun_2nd_decl': {
        name: '2nd declension nouns',
        intro: 'Second declension nouns are mostly masculine nouns ending in -ος and neuter nouns ending in -ον. They follow a predictable pattern of endings that you add to the stem.',
        table: [
            {
                gender: 'masculine (using λόγος — "word")',
                forms: [
                    { case: 'nominative singular', greek: 'λόγος', ending: '-ος', meaning: 'word (subject)' },
                    { case: 'genitive singular',   greek: 'λόγου', ending: '-ου', meaning: 'of the word' },
                    { case: 'dative singular',     greek: 'λόγῳ',  ending: '-ῳ',  meaning: 'to/for/with the word' },
                    { case: 'accusative singular', greek: 'λόγον', ending: '-ον', meaning: 'word (direct object)' },
                    { case: 'nominative plural',   greek: 'λόγοι', ending: '-οι', meaning: 'words (subjects)' },
                    { case: 'genitive plural',     greek: 'λόγων', ending: '-ων', meaning: 'of the words' },
                    { case: 'dative plural',       greek: 'λόγοις', ending: '-οις', meaning: 'to/for/with the words' },
                    { case: 'accusative plural',   greek: 'λόγους', ending: '-ους', meaning: 'words (direct objects)' },
                ]
            },
            {
                gender: 'neuter (using ἔργον — "work")',
                forms: [
                    { case: 'nominative/accusative singular', greek: 'ἔργον', ending: '-ον', meaning: 'work (subject or object)' },
                    { case: 'genitive singular',   greek: 'ἔργου', ending: '-ου', meaning: 'of the work' },
                    { case: 'dative singular',     greek: 'ἔργῳ',  ending: '-ῳ',  meaning: 'to/for/with the work' },
                    { case: 'nominative/accusative plural', greek: 'ἔργα', ending: '-α', meaning: 'works (subjects or objects)' },
                    { case: 'genitive plural',     greek: 'ἔργων', ending: '-ων', meaning: 'of the works' },
                    { case: 'dative plural',       greek: 'ἔργοις', ending: '-οις', meaning: 'to/for/with the works' },
                ]
            }
        ]
    },

    'lang.morph.noun_1st_decl': {
        name: '1st declension nouns',
        intro: 'First declension nouns are mostly feminine nouns ending in -η or -α. They follow their own predictable set of endings, different from the second declension.',
        table: [
            {
                gender: 'feminine η-stem (using ψυχή — "soul")',
                forms: [
                    { case: 'nominative singular', greek: 'ψυχή', ending: '-η', meaning: 'soul (subject)' },
                    { case: 'genitive singular',   greek: 'ψυχῆς', ending: '-ης', meaning: 'of the soul' },
                    { case: 'dative singular',     greek: 'ψυχῇ', ending: '-ῃ', meaning: 'to/for/with the soul' },
                    { case: 'accusative singular', greek: 'ψυχήν', ending: '-ην', meaning: 'soul (direct object)' },
                    { case: 'nominative plural',   greek: 'ψυχαί', ending: '-αι', meaning: 'souls (subjects)' },
                    { case: 'genitive plural',     greek: 'ψυχῶν', ending: '-ων', meaning: 'of the souls' },
                    { case: 'dative plural',       greek: 'ψυχαῖς', ending: '-αις', meaning: 'to/for/with the souls' },
                    { case: 'accusative plural',   greek: 'ψυχάς', ending: '-ας', meaning: 'souls (direct objects)' },
                ]
            },
            {
                gender: 'feminine α-stem after ε, ι, ρ (using γῆ — "earth")',
                forms: [
                    { case: 'nominative singular', greek: 'γῆ', ending: '-η', meaning: 'earth (subject)' },
                    { case: 'genitive singular',   greek: 'γῆς', ending: '-ης', meaning: 'of the earth' },
                    { case: 'dative singular',     greek: 'γῇ', ending: '-ῃ', meaning: 'to/for/with the earth' },
                    { case: 'accusative singular', greek: 'γῆν', ending: '-ην', meaning: 'earth (direct object)' },
                ]
            }
        ]
    },

    'lang.morph.verb_present_indicative_active': {
        name: 'present indicative active verbs',
        intro: 'Greek verbs change their endings to show who is doing the action — first, second, or third person — and whether it is one person (singular) or more than one (plural). You do not need a separate word for "I" or "you" because the ending carries that information.',
        table: [
            {
                label: 'using λύω — "I loosen / release"',
                forms: [
                    { person: 'first person singular',  greek: 'λύω',       ending: '-ω',      meaning: 'I loosen' },
                    { person: 'second person singular', greek: 'λύεις',     ending: '-εις',    meaning: 'you loosen' },
                    { person: 'third person singular',  greek: 'λύει',      ending: '-ει',     meaning: 'he / she / it loosens' },
                    { person: 'first person plural',    greek: 'λύομεν',    ending: '-ομεν',   meaning: 'we loosen' },
                    { person: 'second person plural',   greek: 'λύετε',     ending: '-ετε',    meaning: 'you all loosen' },
                    { person: 'third person plural',    greek: 'λύουσι',    ending: '-ουσι',   meaning: 'they loosen' },
                ]
            }
        ]
    },

    'lang.morph.adjective_1st_2nd_decl': {
        name: '1st and 2nd declension adjectives',
        intro: 'Greek adjectives agree with the nouns they describe in gender, case, and number. An adjective like καλός follows the 2nd declension in the masculine, the 1st declension in the feminine, and the 2nd declension neuter pattern for neuter nouns.',
        table: [
            {
                gender: 'masculine (using καλός — "beautiful")',
                forms: [
                    { case: 'nominative singular', greek: 'καλός', meaning: 'beautiful (masc. subject)' },
                    { case: 'genitive singular',   greek: 'καλοῦ', meaning: 'of the beautiful' },
                    { case: 'dative singular',     greek: 'καλῷ',  meaning: 'to/for the beautiful' },
                    { case: 'accusative singular', greek: 'καλόν', meaning: 'beautiful (masc. object)' },
                    { case: 'nominative plural',   greek: 'καλοί', meaning: 'beautiful (masc. pl. subjects)' },
                    { case: 'genitive plural',     greek: 'καλῶν', meaning: 'of the beautiful' },
                    { case: 'dative plural',       greek: 'καλοῖς', meaning: 'to/for the beautiful' },
                    { case: 'accusative plural',   greek: 'καλούς', meaning: 'beautiful (masc. pl. objects)' },
                ]
            },
            {
                gender: 'feminine (using καλή)',
                forms: [
                    { case: 'nominative singular', greek: 'καλή', meaning: 'beautiful (fem. subject)' },
                    { case: 'genitive singular',   greek: 'καλῆς', meaning: 'of the beautiful' },
                    { case: 'dative singular',     greek: 'καλῇ',  meaning: 'to/for the beautiful' },
                    { case: 'accusative singular', greek: 'καλήν', meaning: 'beautiful (fem. object)' },
                    { case: 'nominative plural',   greek: 'καλαί', meaning: 'beautiful (fem. pl. subjects)' },
                    { case: 'genitive plural',     greek: 'καλῶν', meaning: 'of the beautiful' },
                    { case: 'dative plural',       greek: 'καλαῖς', meaning: 'to/for the beautiful' },
                    { case: 'accusative plural',   greek: 'καλάς', meaning: 'beautiful (fem. pl. objects)' },
                ]
            },
            {
                gender: 'neuter (using καλόν)',
                forms: [
                    { case: 'nominative/accusative singular', greek: 'καλόν', meaning: 'beautiful (neuter)' },
                    { case: 'genitive singular',   greek: 'καλοῦ', meaning: 'of the beautiful' },
                    { case: 'dative singular',     greek: 'καλῷ',  meaning: 'to/for the beautiful' },
                    { case: 'nominative/accusative plural', greek: 'καλά', meaning: 'beautiful (neuter plural)' },
                    { case: 'genitive plural',     greek: 'καλῶν', meaning: 'of the beautiful' },
                    { case: 'dative plural',       greek: 'καλοῖς', meaning: 'to/for the beautiful' },
                ]
            }
        ]
    },

    'lang.morph.verb_epsilon_contract': {
        name: 'epsilon contract verbs',
        intro: 'Some Greek verbs have a stem ending in epsilon (ε). When you add the regular endings, the ε contracts — merges — with the vowel of the ending, producing a longer vowel. The pattern is completely regular once you know the rules.',
        table: [
            {
                label: 'using ποιέω → ποιῶ — "I make / do"',
                forms: [
                    { person: 'first person singular',  greek: 'ποιῶ',      contraction: 'ε+ω → ω',   meaning: 'I make' },
                    { person: 'second person singular', greek: 'ποιεῖς',    contraction: 'ε+εις → εῖς', meaning: 'you make' },
                    { person: 'third person singular',  greek: 'ποιεῖ',     contraction: 'ε+ει → εῖ', meaning: 'he / she / it makes' },
                    { person: 'first person plural',    greek: 'ποιοῦμεν',  contraction: 'ε+ομεν → οῦμεν', meaning: 'we make' },
                    { person: 'second person plural',   greek: 'ποιεῖτε',   contraction: 'ε+ετε → εῖτε', meaning: 'you all make' },
                    { person: 'third person plural',    greek: 'ποιοῦσι',   contraction: 'ε+ουσι → οῦσι', meaning: 'they make' },
                ]
            }
        ]
    },

    'lang.morph.verb_infinitive_active': {
        name: 'the present active infinitive',
        intro: 'The infinitive is the basic form of a verb — "to do something." In Greek, the present active infinitive is formed by adding a single ending to the verb stem.',
        table: [
            {
                label: 'infinitive endings',
                forms: [
                    { type: 'regular verb',         greek: 'λύειν',   ending: '-ειν',  meaning: 'to loosen / to release' },
                    { type: 'epsilon contract verb', greek: 'ποιεῖν',  ending: '-εῖν',  meaning: 'to make / to do' },
                    { type: 'irregular — to be',    greek: 'εἶναι',   ending: 'irregular', meaning: 'to be' },
                ]
            }
        ]
    }
};

// ---------------------------------------------------------------------------
// Reading/skill standards — no paradigm, just context for the lesson
// ---------------------------------------------------------------------------
const READING_SKILLS = {
    'lang.reading.prepositional_phrases': {
        name: 'reading prepositional phrases',
        description: 'How Greek prepositions work with specific cases to express location, direction, separation, and other relationships. Each preposition governs one or more cases, and the case chosen changes the meaning.'
    },
    'lang.reading.adjectives': {
        name: 'reading adjectives in Greek sentences',
        description: 'How to identify adjective-noun agreement by matching gender, case, and number endings. An adjective does not always sit directly next to its noun — you identify the pair by form, not position.'
    },
    'lang.reading.sentences': {
        name: 'reading Greek sentences',
        description: 'Greek word order is flexible — the verb often comes first. How to identify the subject (nominative), verb, and direct object (accusative) in a Greek sentence regardless of word order, using case endings as guides.'
    },
    'lang.reading.passage': {
        name: 'reading a Greek passage',
        description: 'Strategies for reading multiple connected Greek sentences: identifying connecting words (καί, ἀλλά, δέ), tracking subjects across sentences, and using context to confirm morphological choices.'
    }
};

// ---------------------------------------------------------------------------
// System prompt — cached across all chapters
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You write Grammar Lessons for "The Aporia of the Children," a Greek language course for 7th graders preparing for the National Greek Exam.

VOICE FIRST: This text will be read aloud using ElevenLabs text-to-speech with synchronized word-level highlighting. Write entirely in natural spoken English — complete sentences, no markdown headers, no bullet lists. ElevenLabs v3 handles Greek diacritics and polytonic characters correctly, so write every Greek form with full diacritics exactly as given.

PAUSE SYNTAX: Insert [short pause] between major concept transitions and between each individual paradigm form listing. This gives listeners time to process each form before moving to the next.

STRUCTURE for morphology standards:
1. Conceptual introduction — explain what this grammatical feature is and why it matters in Greek.
2. Full paradigm narration — read every form in natural spoken order, one at a time, stating the form name, the Greek, and its English meaning for each. For example: "In the nominative singular, we have ὁ — that means 'the,' used when the noun is the subject. [short pause] In the genitive singular, we have τοῦ — that means 'of the.' [short pause]"
3. Two or three examples drawn from the chapter's Greek sentences, pointing out the form in context.

STRUCTURE for reading/skill standards:
1. Conceptual introduction — explain the reading skill and why it matters.
2. Walk through two or three of the chapter's sentences using the skill, narrating the reasoning aloud.
3. A brief summary of what to watch for.

AUDIENCE: 7th graders. Keep the language warm, clear, and direct. Avoid jargon unless you immediately explain it.`;

// ---------------------------------------------------------------------------
// Build the alignment array from ElevenLabs character-level data
// ---------------------------------------------------------------------------
function buildAlignmentFromCharData(alignmentData) {
    const chars  = alignmentData.characters;
    const starts = alignmentData.character_start_times_seconds;
    const ends   = alignmentData.character_end_times_seconds;

    const alignment = [];
    let wordStart = -1;
    let inBracket = false;

    for (let i = 0; i <= chars.length; i++) {
        const ch = i < chars.length ? chars[i] : null;

        if (!inBracket && ch === '[') {
            if (wordStart !== -1) {
                alignment.push({ word: chars.slice(wordStart, i).join(''), start: starts[wordStart], end: ends[i - 1] });
                wordStart = -1;
            }
            inBracket = true;
            continue;
        }
        if (inBracket) {
            if (ch === ']') inBracket = false;
            continue;
        }

        const isWord = ch !== null && !/\s/.test(ch);
        if (isWord && wordStart === -1) {
            wordStart = i;
        } else if (!isWord && wordStart !== -1) {
            alignment.push({ word: chars.slice(wordStart, i).join(''), start: starts[wordStart], end: ends[i - 1] });
            wordStart = -1;
        }
    }
    return alignment;
}

// ---------------------------------------------------------------------------
// Firebase Storage upload
// ---------------------------------------------------------------------------
async function uploadAudio(storagePath, audioBuffer) {
    const bucket = admin.storage().bucket();
    const file   = bucket.file(storagePath);
    await file.save(audioBuffer, { contentType: 'audio/mpeg' });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

// ---------------------------------------------------------------------------
// ElevenLabs TTS with timestamps
// ---------------------------------------------------------------------------
async function ttsWithTimestamps(text) {
    const resp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${NARRATOR_ID}/with-timestamps`,
        {
            method: 'POST',
            headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                model_id: 'eleven_v3',
                voice_settings: { stability: 0.8, similarity_boost: 0.75, style: 0.3 },
                language_code: 'en'
            })
        }
    );
    if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`);
    return await resp.json(); // { audio_base64, alignment: { characters, ... } }
}

// ---------------------------------------------------------------------------
// Build Claude user prompt for a chapter
// ---------------------------------------------------------------------------
function buildGrammarBrief(chapter, lessonDoc) {
    const lines = [];

    lines.push(`Write a grammar lesson for Chapter ${chapter.chapter_id}.`);
    lines.push('');

    // Grammar standards
    const morphStandards   = chapter.grammar.filter(id => PARADIGMS[id]);
    const readingStandards = chapter.grammar.filter(id => READING_SKILLS[id]);

    if (morphStandards.length > 0) {
        lines.push('## Grammar standards to teach in this lesson:');
        for (const id of morphStandards) {
            const p = PARADIGMS[id];
            lines.push(`- **${p.name}**: ${p.intro}`);
            lines.push('');
            lines.push(`  Full paradigm forms to narrate:`);
            for (const group of p.table) {
                const label = group.gender ?? group.label ?? '';
                lines.push(`  ${label}:`);
                for (const f of group.forms) {
                    const name   = f.case ?? f.person ?? f.type ?? '';
                    const ending = f.ending ? ` (ending: ${f.ending})` : '';
                    const contra = f.contraction ? ` [${f.contraction}]` : '';
                    lines.push(`    • ${name}: ${f.greek}${ending}${contra} — ${f.meaning}`);
                }
                lines.push('');
            }
        }
    }

    if (readingStandards.length > 0) {
        lines.push('## Reading/skill standards to teach in this lesson:');
        for (const id of readingStandards) {
            const r = READING_SKILLS[id];
            lines.push(`- **${r.name}**: ${r.description}`);
        }
        lines.push('');
    }

    // Story context
    const overviewText = lessonDoc?.overview?.text ?? '';
    if (overviewText) {
        // Take first 2 sentences as context
        const sentences = overviewText.split(/(?<=[.!?])\s+/);
        const context   = sentences.slice(0, 2).join(' ');
        lines.push('## Story context for this chapter:');
        lines.push(context);
        lines.push('');
    }

    // Greek practice sentences from the chapter
    const greekSentences = (chapter.greek ?? '').split('\n').filter(Boolean);
    if (greekSentences.length > 0) {
        lines.push('## Greek practice sentences from this chapter (use 2–3 as examples):');
        for (const s of greekSentences) {
            lines.push(`  ${s}`);
        }
        lines.push('');
        lines.push('(Translations are not provided — you know this vocabulary well enough to translate accurately for 7th graders.)');
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Find Firestore lesson document for a chapter_id
// ---------------------------------------------------------------------------
async function findLesson(chapterId) {
    const snap = await db.collection('lessons')
        .where('chapter_id', '==', chapterId)
        .where('courseId', '==', 'grade7-greek')
        .limit(1)
        .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { lessonId: doc.id, ...doc.data() };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const args       = process.argv.slice(2);
    const doAll      = args.includes('--all');
    const skipExist  = args.includes('--skip-existing');
    const doAudio    = args.includes('--audio');
    const dryRun     = args.includes('--dry-run');
    const chapterArg = args.find(a => !a.startsWith('--'));

    if (!doAll && !chapterArg) {
        console.log('Usage:');
        console.log('  node scripts/gen-greek-grammar.mjs --chapter ch_01_athens [--audio] [--dry-run]');
        console.log('  node scripts/gen-greek-grammar.mjs --all [--skip-existing] [--audio]');
        process.exit(0);
    }

    const curriculum = JSON.parse(fs.readFileSync(CURRICULUM_PATH, 'utf-8'));

    // Filter chapters that have grammar standards
    const chapters = curriculum.filter(ch => {
        if (!ch.grammar || ch.grammar.length === 0) return false;
        if (doAll) return true;
        return ch.chapter_id === chapterArg;
    });

    if (chapters.length === 0) {
        if (chapterArg) {
            const ch = curriculum.find(c => c.chapter_id === chapterArg);
            if (!ch) {
                console.error(`Chapter not found: ${chapterArg}`);
            } else {
                console.log(`Chapter ${chapterArg} has no grammar standards — nothing to generate.`);
            }
        } else {
            console.log('No chapters with grammar standards found.');
        }
        process.exit(0);
    }

    const client = new Anthropic();

    for (const chapter of chapters) {
        console.log(`\n── ${chapter.chapter_id} ──`);
        console.log(`   Standards: ${chapter.grammar.join(', ')}`);

        // Find Firestore lesson
        const lessonDoc = await findLesson(chapter.chapter_id);
        if (!lessonDoc) {
            console.warn(`   ⚠ No Firestore lesson found for ${chapter.chapter_id} — skipping.`);
            continue;
        }
        console.log(`   Lesson ID: ${lessonDoc.lessonId}`);

        if (skipExist && lessonDoc.grammar?.text) {
            console.log(`   skip (grammar.text exists)`);
            continue;
        }

        // Build prompt
        const userPrompt = buildGrammarBrief(chapter, lessonDoc);

        if (dryRun) {
            console.log('\n── SYSTEM PROMPT ──');
            console.log(SYSTEM_PROMPT);
            console.log('\n── USER PROMPT ──');
            console.log(userPrompt);
            console.log('\n(dry-run: no Firestore writes)');
            continue;
        }

        // Generate with Claude
        console.log('   Calling Claude Opus...');
        let grammarText;
        try {
            const response = await client.messages.create({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
                messages: [{ role: 'user', content: userPrompt }]
            });
            grammarText = response.content[0].text;
            const words = grammarText.split(/\s+/).length;
            const cached = response.usage.cache_read_input_tokens ?? 0;
            console.log(`   ✓ Claude: ${words} words | cache_read: ${cached}`);
        } catch (err) {
            console.error(`   ✗ Claude failed: ${err.message}`);
            if (!doAll) process.exit(1);
            continue;
        }

        // Save grammar.text to Firestore
        const updateData = {
            'grammar.text':        grammarText,
            'grammar.standardIds': chapter.grammar,
            updatedAt:             admin.firestore.FieldValue.serverTimestamp()
        };

        if (doAudio) {
            console.log('   Calling ElevenLabs...');
            try {
                const data      = await ttsWithTimestamps(grammarText);
                const audioBuf  = Buffer.from(data.audio_base64, 'base64');
                const audioUrl  = await uploadAudio(
                    `greek/lessons/${lessonDoc.lessonId}/grammar_en.mp3`,
                    audioBuf
                );
                const alignment = buildAlignmentFromCharData(data.alignment);
                updateData['grammar.audioUrl']  = audioUrl + `?v=${Date.now()}`;
                updateData['grammar.alignment'] = alignment;
                console.log(`   ✓ Audio: ${alignment.length} words aligned`);
            } catch (err) {
                console.error(`   ✗ ElevenLabs failed: ${err.message}`);
                if (!doAll) process.exit(1);
                // Save text even if audio fails
            }
        }

        await db.collection('lessons').doc(lessonDoc.lessonId).update(updateData);
        console.log(`   ✓ Saved to Firestore (${lessonDoc.lessonId})`);
    }

    console.log('\nDone.');
    process.exit(0);
}

main();

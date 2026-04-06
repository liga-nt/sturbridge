const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

// Word forms dictionary for Greek annotation (Step 2)
let wordForms = {};
try {
    wordForms = JSON.parse(fs.readFileSync(
        path.join(__dirname, 'data', 'Greek', 'word_forms.json'), 'utf8'
    ));
} catch (e) {
    console.warn('word_forms.json not found — all words will go through Claude annotation');
}

// NGE vocabulary list for Step 1 prompt — formatted compactly by tier
let ngeVocabPrompt = '';
try {
    const ngeData = JSON.parse(fs.readFileSync(
        path.join(__dirname, 'data', 'Greek', 'nge_vocabulary.json'), 'utf8'
    ));
    const entries = ngeData.entries ?? [];
    const byTier = { intro: [], beginning: [], intermediate: [], prose: [] };
    for (const e of entries) {
        if (byTier[e.introduced]) byTier[e.introduced].push(`${e.greek} — ${e.definition}`);
    }
    ngeVocabPrompt = [
        'NGE Vocabulary (use these words; prefer earlier tiers for lower grammar levels):',
        '',
        'INTRO: ' + byTier.intro.join(' | '),
        'BEGINNING: ' + byTier.beginning.join(' | '),
        'INTERMEDIATE: ' + byTier.intermediate.join(' | '),
        'PROSE: ' + byTier.prose.join(' | '),
    ].join('\n');
} catch (e) {
    console.warn('nge_vocabulary.json not found — Claude will choose vocabulary freely');
}

initializeApp();

/**
 * activateAccount — called by the client after Google sign-in.
 * Looks up invites/{email}, sets the custom role claim, writes users/{uid}.
 */
exports.activateAccount = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const { uid, token } = request.auth;
    const email = token.email;

    if (!email) {
        throw new HttpsError('invalid-argument', 'No email on token.');
    }

    const db = getFirestore();
    const auth = getAuth();

    // Check for a pending invite first — invite always takes precedence over
    // existing claims (handles re-assignment and reused email addresses).
    const inviteSnap = await db.collection('invites').doc(email).get();
    if (!inviteSnap.exists) {
        // No invite — return existing claims if present, otherwise pending
        if (token.role) {
            return { role: token.role, classIds: token.classIds || [] };
        }
        return { status: 'pending' };
    }

    const invite = inviteSnap.data();
    const { role, classIds = [], schoolId = 'default' } = invite;

    // Set custom claim
    await auth.setCustomUserClaims(uid, { role, classIds, schoolId });

    // Write user doc
    await db.collection('users').doc(uid).set({
        uid,
        email,
        displayName: token.name || email,
        role,
        classIds,
        schoolId
    }, { merge: true });

    // Add student to class studentIds if applicable
    if (role === 'student' && classIds.length > 0) {
        for (const classId of classIds) {
            const classRef = db.collection('classes').doc(classId);
            const classSnap = await classRef.get();
            if (classSnap.exists) {
                const existing = classSnap.data().studentIds || [];
                if (!existing.includes(uid)) {
                    await classRef.update({ studentIds: [...existing, uid] });
                }
            }
        }
    }

    // Delete invite
    await db.collection('invites').doc(email).delete();

    return { role, classIds };
});

/**
 * revokeAccess — dev-only. Clears a user's custom claims and marks their
 * Firestore user doc role as null. Their current token stays valid until
 * expiry (~1hr), but Firestore rules deny access immediately since rules
 * check the token, not the user doc.
 */
exports.revokeAccess = onCall(async (request) => {
    if (request.auth?.token?.role !== 'dev') {
        throw new HttpsError('permission-denied', 'Only dev can revoke access.');
    }
    const { uid } = request.data;
    if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');

    const db = getFirestore();
    const auth = getAuth();
    await auth.setCustomUserClaims(uid, {});
    await db.collection('users').doc(uid).update({ role: null });
    return { success: true };
});

const db = getFirestore();

exports.generateQuestions = onCall(
    { secrets: ['ANTHROPIC_API_KEY'] },
    async (request) => {
        // Enforce dev role via custom claim
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only the dev role can generate questions.');
        }

        const { standardId, difficulty = 'standard', count = 10 } = request.data;

        if (!standardId) {
            throw new HttpsError('invalid-argument', 'standardId is required.');
        }

        // Fetch the prompt document for this standard
        const promptDoc = await db.collection('prompts').doc(standardId).get();
        if (!promptDoc.exists) {
            throw new HttpsError('not-found', `No prompt found for standard: ${standardId}. Add one in /dev/prompts.`);
        }
        const prompt = promptDoc.data();

        // Build the message to Claude
        const userMessage = [
            prompt.systemPrompt,
            prompt.fewShotExamples || '',
            prompt.schemaInstructions || '',
            `Generate ${count} questions with difficulty level: "${difficulty}".`,
            `Return ONLY a valid JSON array of ${count} question objects. No prose, no markdown fences.`,
            `Each object must match this schema exactly:`,
            `{`,
            `  "questionText": "string",`,
            `  "visual": { "type": "string", "params": {} } | null,`,
            `  "options": [`,
            `    { "id": "A", "text": "string", "isCorrect": false, "feedback": "string" },`,
            `    { "id": "B", "text": "string", "isCorrect": true,  "feedback": "string" },`,
            `    { "id": "C", "text": "string", "isCorrect": false, "feedback": "string" },`,
            `    { "id": "D", "text": "string", "isCorrect": false, "feedback": "string" }`,
            `  ],`,
            `  "difficulty": "${difficulty}"`,
            `}`
        ].filter(Boolean).join('\n');

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const message = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 8000,
            messages: [{ role: 'user', content: userMessage }]
        });

        // Parse the JSON array Claude returns
        let questions;
        try {
            questions = JSON.parse(message.content[0].text);
        } catch {
            throw new HttpsError(
                'internal',
                'AI returned invalid JSON. Check the prompt and try again.'
            );
        }

        if (!Array.isArray(questions)) {
            throw new HttpsError('internal', 'AI response was not a JSON array.');
        }

        // Write each question to Firestore as pending
        const batch = db.batch();
        const questionIds = [];

        for (const q of questions) {
            const ref = db.collection('questions').doc();
            batch.set(ref, {
                ...q,
                standardId,
                status: 'pending',
                generatedAt: Timestamp.now(),
                reviewedAt: null,
                promptVersion: prompt.version ?? '1'
            });
            questionIds.push(ref.id);
        }

        await batch.commit();

        return { questionIds, count: questionIds.length };
    }
);

// ---------------------------------------------------------------------------
// Greek Lesson Generation helpers
// ---------------------------------------------------------------------------

/**
 * Strip markdown fences from a Claude response before JSON.parse.
 */
function stripFences(text) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

/**
 * normalizeAncientGreekForModern — convert polytonic Greek to modern
 * pronunciation conventions suitable for ElevenLabs TTS.
 */
function normalizeAncientGreekForModern(text) {
    const nfd = text.normalize('NFD');
    const ancientMarks = new Set([0x0313, 0x0314, 0x0345]); // smooth/rough breathing, iota subscript

    let result = '';
    for (const char of nfd) {
        const code = char.codePointAt(0);
        if (code === 0x0300) {          // combining grave → acute
            result += '\u0301';
        } else if (code === 0x0342) {   // combining circumflex → acute
            result += '\u0301';
        } else if (code >= 0x0300 && code <= 0x036F) {
            // Other combining diacritical mark — keep only if not an ancient-only mark
            if (!ancientMarks.has(code)) result += char;
        } else {
            result += char;
        }
    }

    result = result.normalize('NFC');

    // Iotacism
    result = result.replace(/οί/g, 'ί').replace(/οι/g, 'ι');
    result = result.replace(/εί/g, 'ί').replace(/ει/g, 'ι');
    result = result.replace(/αί/g, 'έ').replace(/αι/g, 'ε');

    return result;
}

/**
 * buildGreekTimepoints — map ElevenLabs Greek audio alignment to per-word start/end times.
 * Returns { [sentPos]: { start, end } }
 */
function buildGreekTimepoints(alignment, words) {
    const charText = alignment.characters.join('');
    let lastPosition = 0;
    const timepoints = {};

    for (const word of [...words].sort((a, b) => a.sentPos - b.sentPos)) {
        const searchText = normalizeAncientGreekForModern(word.text)
            .replace('·', ':').replace(';', '?');
        const startIdx = charText.indexOf(searchText, lastPosition);
        if (startIdx === -1) {
            console.warn(`Greek timepoint miss: "${searchText}"`);
            continue;
        }
        const endIdx = startIdx + searchText.length - 1;
        timepoints[word.sentPos] = {
            start: alignment.character_start_times_seconds[startIdx],
            end:   alignment.character_end_times_seconds[endIdx]
        };
        lastPosition = endIdx + 1;
    }
    return timepoints;
}

/**
 * buildEngTimepoints — map ElevenLabs English audio alignment back to Greek sentPos.
 * Finds each English word's timing, then maps to Greek sentPos via engSentPos so that
 * Greek words highlight when their aligned English word is spoken.
 * Returns { [sentPos]: { start, end } }
 */
function buildEngTimepoints(alignment, englishText, words) {
    const charText = alignment.characters.join('');
    const engWords = englishText.trim().split(/\s+/);

    // Map English word position (1-indexed) → {start, end}
    const engPositionTimes = {};
    let lastPosition = 0;
    for (let i = 0; i < engWords.length; i++) {
        const searchText = engWords[i].replace(/[.,;:!?'"()]/g, '');
        if (!searchText) continue;
        const startIdx = charText.indexOf(searchText, lastPosition);
        if (startIdx === -1) {
            console.warn(`English timepoint miss: "${searchText}"`);
            continue;
        }
        const endIdx = startIdx + searchText.length - 1;
        engPositionTimes[i + 1] = {
            start: alignment.character_start_times_seconds[startIdx],
            end:   alignment.character_end_times_seconds[endIdx]
        };
        lastPosition = endIdx + 1;
    }

    // Map Greek sentPos → English timing via engSentPos
    const timepoints = {};
    for (const word of words) {
        if (word.engSentPos != null && engPositionTimes[word.engSentPos]) {
            timepoints[word.sentPos] = engPositionTimes[word.engSentPos];
        }
    }
    return timepoints;
}

/**
 * uploadAudio — base64-encoded MP3 → Firebase Storage → public URL.
 */
async function uploadAudio(lessonId, sentNum, lang, audioBase64) {
    const buffer = Buffer.from(audioBase64, 'base64');
    const storage = getStorage();
    const bucket = storage.bucket();
    const filePath = `greek/lessons/${lessonId}/s${sentNum}_${lang}.mp3`;
    const file = bucket.file(filePath);
    await file.save(buffer, { contentType: 'audio/mpeg' });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

/**
 * mergeStoryBible — apply a storyBibleDelta onto the existing bible object.
 * Pure function; returns the mutated bible.
 */
function mergeStoryBible(bible, delta, annotatedWords) {
    bible.chapterCount = delta.chapter;
    bible.narrative = delta.narrative;

    for (const char of delta.characters_upsert ?? []) {
        if (bible.characters[char.greek]) {
            const c = bible.characters[char.greek];
            c.lastChapter = delta.chapter;
            if (!c.chaptersIn.includes(delta.chapter)) c.chaptersIn.push(delta.chapter);
        } else {
            bible.characters[char.greek] = {
                ...char,
                firstChapter: delta.chapter,
                lastChapter: delta.chapter,
                chaptersIn: [delta.chapter]
            };
        }
    }

    for (const name of delta.narrative.activeCharacters ?? []) {
        const c = bible.characters[name];
        if (c && !c.chaptersIn.includes(delta.chapter)) {
            c.lastChapter = delta.chapter;
            c.chaptersIn.push(delta.chapter);
        }
    }

    for (const s of delta.standards_covered ?? []) {
        if (!bible.standards.covered.includes(s)) bible.standards.covered.push(s);
        bible.standards.reinforced[s] ??= [];
        bible.standards.reinforced[s].push(delta.chapter);
    }

    for (const g of delta.grammar_introduced ?? []) {
        bible.grammar.introduced[g.key] ??= { chapter: delta.chapter, label: g.label };
    }

    for (const word of annotatedWords) {
        if (word.vocab_tier && !bible.vocab.introduced[word.dict_entry]) {
            bible.vocab.introduced[word.dict_entry] = { chapter: delta.chapter, tier: word.vocab_tier };
        }
    }

    return bible;
}

/**
 * resolveParadigmKey — deterministic fallback for words whose paradigm_key is
 * still null after the word-forms dict lookup.
 */
function resolveParadigmKey(word) {
    const { morph, dict_entry } = word;
    if (!morph) return null;

    if (morph.startsWith('art.')) return 'definite_article';

    if (morph.startsWith('verb.pres.indic.act')) {
        if (dict_entry === 'εἰμί') return 'eimi_present_indicative_active';
        // Simple heuristic: epsilon/alpha contracts end in -έω / -άω in dict entry
        if (dict_entry && dict_entry.endsWith('έω')) return 'epsilon_contract_present_indicative_active';
        if (dict_entry && dict_entry.endsWith('άω')) return 'alpha_contract_present_indicative_active';
        return 'omega_verb_present_indicative_active';
    }

    if (morph.startsWith('noun.masc')) return '2nd_declension_masculine';
    if (morph.startsWith('noun.neut')) return '2nd_declension_neuter';
    if (morph.startsWith('noun.fem')) {
        // -η vs -α type: rough heuristic on dict entry ending
        if (dict_entry && dict_entry.endsWith('α')) return '1st_declension_feminine_alpha';
        return '1st_declension_feminine_eta';
    }

    if (morph.startsWith('adj.')) return '2_1_2_adjective';

    return null;
}

/**
 * Build a numbered English string: "the(1) boy(2) went(3) to(4) the(5) market(6)"
 * Returns { numbered, positionMap } where positionMap is { 1: "the", 2: "boy", ... }
 */
function numberEngTranslation(english) {
    const words = english.trim().split(/\s+/);
    const positionMap = {};
    const numbered = words.map((w, i) => {
        positionMap[i + 1] = w;
        return `${w}(${i + 1})`;
    }).join(' ');
    return { numbered, positionMap };
}

/**
 * computeEngAlignment — deterministic preEng/postEng computation.
 * Mirrors align.py lines 1799–1832: uses a positionMap built from the numbered
 * translation so words between aligned positions are assigned to preEng, and
 * trailing words after the last aligned position go to postEng only.
 *
 * positionMap: { 1: "the", 2: "boy", 3: "went", ... }
 */
function computeEngAlignment(sentence, positionMap) {
    // words with a numeric engSentPos, sorted ascending
    const aligned = sentence.words
        .filter(w => w.engSentPos != null)
        .sort((a, b) => a.engSentPos - b.engSentPos);

    if (aligned.length === 0) return;

    // Build entries_by_position: { pos: [word, ...] }
    const entriesByPos = {};
    for (const w of aligned) {
        const pos = w.engSentPos;
        if (!entriesByPos[pos]) entriesByPos[pos] = [];
        entriesByPos[pos].push(w);
        // Assign the English surface word from the map
        if (positionMap[pos]) w.english = positionMap[pos];
    }

    // Sort each position group by sentPos
    for (const group of Object.values(entriesByPos)) {
        group.sort((a, b) => a.sentPos - b.sentPos);
    }

    const alignedPositions = Object.keys(entriesByPos).map(Number).sort((a, b) => a - b);
    const maxPos = Math.max(...Object.keys(positionMap).map(Number));

    for (let i = 0; i < alignedPositions.length; i++) {
        const currentPos = alignedPositions[i];
        const nextPos = alignedPositions[i + 1] ?? null;
        const group = entriesByPos[currentPos];
        const firstInGroup = group[0];
        const lastInGroup  = group[group.length - 1];

        // ALL words in the group get the English surface word.
        // The student view deduplicates at render time.
        group.forEach(w => { w.english = positionMap[currentPos] ?? ''; });

        if (i === 0) {
            // preEng on the FIRST word of the first group
            const beforeWords = [];
            for (let p = 1; p < currentPos; p++) {
                if (positionMap[p]) beforeWords.push(positionMap[p]);
            }
            if (beforeWords.length) firstInGroup.preEng = beforeWords.join(' ');
        }

        if (nextPos != null) {
            // preEng on the FIRST word of the next group
            const betweenWords = [];
            for (let p = currentPos + 1; p < nextPos; p++) {
                if (positionMap[p]) betweenWords.push(positionMap[p]);
            }
            if (betweenWords.length) entriesByPos[nextPos][0].preEng = betweenWords.join(' ');
        }

        if (i === alignedPositions.length - 1) {
            // postEng on the LAST word of the last group
            const afterWords = [];
            for (let p = currentPos + 1; p <= maxPos; p++) {
                if (positionMap[p]) afterWords.push(positionMap[p]);
            }
            if (afterWords.length) lastInGroup.postEng = afterWords.join(' ');
        }
    }
}

// ---------------------------------------------------------------------------
// Function 1: generateGreekLesson (Steps 1–6)
// ---------------------------------------------------------------------------

exports.generateGreekLesson = onCall(
    { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can generate Greek lessons.');
        }

        const {
            storyBibleId,
            grammarLevel = 'intro',
            sentenceCount = 6,
            chapter,
            directorsNote = null,
            lessonId: existingLessonId = null,
            refinementFeedback = null
        } = request.data;

        if (!storyBibleId) throw new HttpsError('invalid-argument', 'storyBibleId is required.');
        if (!chapter)      throw new HttpsError('invalid-argument', 'chapter is required.');

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const isRefinement = !!(existingLessonId && refinementFeedback);

        // ------------------------------------------------------------------
        // Step 1 — Generate Greek narrative [Claude]
        // Full prompt on initial generation; light prompt on refinement.
        // ------------------------------------------------------------------
        const bibleSnap = await db.collection('story_bible').doc(storyBibleId).get();
        if (!bibleSnap.exists) throw new HttpsError('not-found', `story_bible/${storyBibleId} not found.`);
        const bible = bibleSnap.data();
        const { canon, ...rollingState } = bible;

        const step1SystemPrompt = [
            'You are an expert author of Ancient Greek pedagogical texts in the Athenaze tradition.',
            'You write immersive, continuous narratives following a Greek family across generations.',
            'Sentences begin simply (articles, εἰμί, 2nd declension nouns) and grow gradually.',
            'Prefer NGE (New Greek English) core vocabulary; gloss anything beyond it.',
            'Every sentence must be grammatically correct Ancient Greek (Attic dialect).',
            'Return ONLY valid JSON — no prose, no markdown fences.'
        ].join('\n');

        let step1UserPrompt;

        if (isRefinement) {
            // Light refinement prompt — just canon + existing sentences + feedback
            const existingSnap = await db.collection('lessons').doc(existingLessonId).get();
            const existingLesson = existingSnap.data();
            const existingSentences = (existingLesson.sentences ?? [])
                .map((s, i) => `${i + 1}. ${s.greek}${s.english ? `  (${s.english})` : ''}`)
                .join('\n');

            step1UserPrompt = [
                'CANON — character and story facts:',
                JSON.stringify(canon, null, 2),
                '',
                `Current Chapter ${chapter} sentences:`,
                existingSentences,
                '',
                `Feedback: ${refinementFeedback}`,
                '',
                'Revise the sentences as requested. Return ALL sentences (revised and unchanged).',
                'Keep the title unless the feedback asks to change it.',
                'Return ONLY valid JSON:',
                '{ "sentences": [{ "num": 0, "greek": "..." }], "title": "..." }'
            ].join('\n');
        } else {
            // Full generation prompt
            step1UserPrompt = [
                'CANON — fixed story facts that never change:',
                JSON.stringify(canon, null, 2),
                '',
                'CURRENT STATE — what has happened so far:',
                JSON.stringify(rollingState, null, 2),
                '',
                ngeVocabPrompt,
                '',
                `Grammar level: ${grammarLevel}`,
                ...(directorsNote ? [`Director's note for this chapter: ${directorsNote}`] : []),
                `Write approximately ${sentenceCount} Greek sentences for chapter ${chapter}.`,
                '',
                'Return JSON with this exact shape:',
                '{',
                '  "sentences": [{ "num": 0, "greek": "ὁ Ζεύς ἐστι βασιλεύς." }],',
                '  "title": "Ζεύς καὶ Ἥρα",',
                '  "story_bible_delta": {',
                '    "chapter": <number>,',
                '    "narrative": { "timePeriod": "...", "location": "...", "summary": "...", "activeCharacters": ["..."] },',
                '    "characters_upsert": [{ "greek": "Κλέων", "english": "Kleon", "role": "merchant", "description": "..." }],',
                '    "standards_covered": ["geo.athens", "myth.deity.zeus"],',
                '    "grammar_introduced": [{ "key": "verb_pres_indic_act", "label": "Present Indicative Active" }]',
                '  }',
                '}',
                'standards_covered must contain only content standards (myth.*, geo.*, hist.*) — NOT morph or syntax.'
            ].join('\n');
        }

        const step1Msg = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 8192,
            system: step1SystemPrompt,
            messages: [{ role: 'user', content: step1UserPrompt }]
        });

        let step1Result;
        try {
            step1Result = JSON.parse(stripFences(step1Msg.content[0].text));
        } catch {
            throw new HttpsError('internal', 'Step 1: Claude returned invalid JSON.');
        }

        const { sentences: rawSentences, title, story_bible_delta: storyBibleDelta } = step1Result;

        // ------------------------------------------------------------------
        // Step 2 — Tokenize + annotate (dict + Claude batch for misses)
        // ------------------------------------------------------------------
        const PUNCT_RE = /[.,;:·?]/g;
        const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');

        // Build annotated word skeletons for every sentence
        for (const sent of rawSentences) {
            const tokens = sent.greek.split(/\s+/);
            sent.words = tokens.map((text, idx) => {
                const bare = text.replace(PUNCT_RE, '');
                const entry = wordForms[bare] || wordForms[text] || wordForms[stripAccents(bare)] || null;
                return {
                    sentPos: idx,
                    text,
                    dict_entry:          entry ? entry.dict_entry          : null,
                    short_def:           entry ? entry.short_def           : null,
                    morph:               entry ? entry.morph               : null,
                    vocab_tier:          entry ? entry.vocab_tier          : null,
                    standard_refs:       entry ? (entry.standard_refs || []) : [],
                    syntax_standard_refs: [],
                    paradigm_key:        entry ? (entry.paradigm_key || null) : null,
                    engSentPos:          null
                };
            });
        }

        // Collect tokens that missed the dict
        const misses = [];
        const missSet = new Set();
        for (const sent of rawSentences) {
            for (const word of sent.words) {
                if (!word.dict_entry) {
                    const bare = word.text.replace(PUNCT_RE, '');
                    if (!missSet.has(bare)) {
                        missSet.add(bare);
                        misses.push({ text: bare, originalText: word.text });
                    }
                }
            }
        }

        // One Claude batch call for all unknown tokens
        if (misses.length > 0) {
            const step2Prompt = [
                'Annotate each Ancient Greek token. Return ONLY a JSON array — no prose, no fences.',
                '',
                'Morph tag schema:',
                '  verb.{tense}.indic.act.{person}{number}   e.g. verb.pres.indic.act.3sg',
                '  noun.{gender}.{number}.{case}             e.g. noun.masc.sg.nom',
                '  adj.{gender}.{number}.{case}',
                '  art.{gender}.{number}.{case}',
                '  pron.{type}.{gender}.{number}.{case}',
                '  conj | prep | adv | particle | interj',
                '',
                'For each token provide: text, dict_entry (lexicon headword), short_def (≤5 words),',
                'morph (tag from schema), vocab_tier ("intro"|"core"|"advanced"|null),',
                'standard_refs (array of morph standard IDs, may be empty), paradigm_key (or null).',
                '',
                'Tokens to annotate:',
                JSON.stringify(misses.map(m => m.text))
            ].join('\n');

            const step2Msg = await client.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 4096,
                messages: [{ role: 'user', content: step2Prompt }]
            });

            let claudeAnnotations;
            try {
                claudeAnnotations = JSON.parse(stripFences(step2Msg.content[0].text));
            } catch {
                throw new HttpsError('internal', 'Step 2: Claude returned invalid JSON for unknown tokens.');
            }

            // Build lookup by text
            const annotationMap = {};
            for (const ann of claudeAnnotations) {
                annotationMap[ann.text] = ann;
            }

            // Back-fill misses in every sentence
            for (const sent of rawSentences) {
                for (const word of sent.words) {
                    if (!word.dict_entry) {
                        const bare = word.text.replace(PUNCT_RE, '');
                        const ann = annotationMap[bare];
                        if (ann) {
                            word.dict_entry    = ann.dict_entry    || null;
                            word.short_def     = ann.short_def     || null;
                            word.morph         = ann.morph         || null;
                            word.vocab_tier    = ann.vocab_tier    || null;
                            word.standard_refs = ann.standard_refs || [];
                            word.paradigm_key  = ann.paradigm_key  || null;
                        }
                    }
                }
            }
        }

        // ------------------------------------------------------------------
        // Step 3 — Syntax annotation [Claude]
        // ------------------------------------------------------------------
        const synStandardsSnap = await db.collection('standards')
            .where('courseId', '==', bible.courseId)
            .get();
        const synStandards = synStandardsSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => s.id.startsWith('syn'));

        if (synStandards.length > 0) {
            const step3Prompt = [
                'You are a Greek syntax expert. For each sentence, identify syntactic constructions',
                'and tag the KEY word of each construction by adding its standard ID to syntax_standard_refs.',
                'Use ONLY standard IDs from the provided list. Return ONLY JSON — no prose, no fences.',
                '',
                'Available syntax standards:',
                JSON.stringify(synStandards.map(s => ({ id: s.id, description: s.description }))),
                '',
                'Sentences with annotated words:',
                JSON.stringify(rawSentences.map(s => ({ num: s.num, greek: s.greek, words: s.words }))),
                '',
                'Return: [{ "num": 0, "words": [{ "sentPos": 0, "syntax_standard_refs": [...] }] }]',
                'Only include words that have at least one syntax_standard_ref.'
            ].join('\n');

            const step3Msg = await client.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 4096,
                messages: [{ role: 'user', content: step3Prompt }]
            });

            let syntaxResult;
            try {
                syntaxResult = JSON.parse(stripFences(step3Msg.content[0].text));
            } catch {
                throw new HttpsError('internal', 'Step 3: Claude returned invalid JSON for syntax annotation.');
            }

            // Merge syntax_standard_refs back
            for (const sentResult of syntaxResult) {
                const sent = rawSentences.find(s => s.num === sentResult.num);
                if (!sent) continue;
                for (const wResult of sentResult.words ?? []) {
                    const word = sent.words.find(w => w.sentPos === wResult.sentPos);
                    if (word) word.syntax_standard_refs = wResult.syntax_standard_refs || [];
                }
            }
        }

        // ------------------------------------------------------------------
        // Step 4 — Translate [Claude] (alignment deferred to alignGreekLesson)
        // ------------------------------------------------------------------
        const step4Prompt = [
            'For each Greek sentence, provide a smooth English translation.',
            'Return ONLY a JSON array — no prose, no fences.',
            '',
            'Sentences:',
            JSON.stringify(rawSentences.map(s => ({ num: s.num, greek: s.greek }))),
            '',
            'Return format: [{ "num": 0, "english": "Zeus is the king." }]'
        ].join('\n');

        const step4Msg = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [{ role: 'user', content: step4Prompt }]
        });

        let translationResult;
        try {
            translationResult = JSON.parse(stripFences(step4Msg.content[0].text));
        } catch {
            throw new HttpsError('internal', 'Step 4: Claude returned invalid JSON for translation.');
        }

        for (const tResult of translationResult) {
            const sent = rawSentences.find(s => s.num === tResult.num);
            if (sent) sent.english = tResult.english;
        }

        // ------------------------------------------------------------------
        // Step 5 — Paradigm key assignment [deterministic fallback]
        // ------------------------------------------------------------------
        for (const sent of rawSentences) {
            for (const word of sent.words) {
                if (!word.paradigm_key) {
                    word.paradigm_key = resolveParadigmKey(word);
                }
            }
        }

        // ------------------------------------------------------------------
        // Final assembly + Firestore save
        // ------------------------------------------------------------------
        const allWords = rawSentences.flatMap(s => s.words);

        const allStandardIds = new Set(storyBibleDelta.standards_covered ?? []);
        for (const word of allWords) {
            for (const s of word.standard_refs || [])        allStandardIds.add(s);
            for (const s of word.syntax_standard_refs || []) allStandardIds.add(s);
        }

        const seenVocab = new Set();
        const vocabList = [];
        for (const word of allWords) {
            if (word.vocab_tier && !seenVocab.has(word.dict_entry)) {
                seenVocab.add(word.dict_entry);
                vocabList.push({ dict_entry: word.dict_entry, short_def: word.short_def, vocab_tier: word.vocab_tier });
            }
        }

        const lessonId = existingLessonId || randomUUID();

        await db.collection('lessons').doc(lessonId).set({
            courseId:        bible.courseId,
            chapter,
            standardIds:     [...allStandardIds],
            title,
            status:          'draft',
            storyBibleDelta,
            sentences:       rawSentences,
            vocab_list:      vocabList,
            updatedAt:       Timestamp.now()
        });

        return { lessonId };
    }
);

// ---------------------------------------------------------------------------
// Function 2: alignGreekLesson — engSentPos + preEng/postEng [Claude + deterministic]
// ---------------------------------------------------------------------------

exports.alignGreekLesson = onCall(
    { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 120 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can align Greek lessons.');
        }

        const { lessonId } = request.data;
        if (!lessonId) throw new HttpsError('invalid-argument', 'lessonId is required.');

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const lessonSnap = await db.collection('lessons').doc(lessonId).get();
        if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
        const lesson = lessonSnap.data();
        const sentences = lesson.sentences;

        // Build numbered translations for each sentence (used in prompt + post-processing)
        const sentenceMeta = sentences.map(s => {
            const { numbered, positionMap } = numberEngTranslation(s.english);
            const numberedGreek = s.words
                .slice()
                .sort((a, b) => a.sentPos - b.sentPos)
                .map(w => `${w.text}(${w.sentPos})`)
                .join(' ');
            return { num: s.num, numberedGreek, numberedEng: numbered, positionMap };
        });

        // engSentPos via Claude — both texts are numbered so Claude picks explicit positions
        const alignPrompt = [
            'For each Greek sentence, assign engSentPos for each word.',
            'engSentPos is the number shown in parentheses next to the English word it aligns to.',
            'Every Greek word that has a clear English counterpart gets a numeric engSentPos.',
            'Greek words with no English equivalent (e.g. articles absorbed into a proper noun, dropped particles) get engSentPos: null.',
            'Each Greek word aligns to exactly one English position. Multiple Greek words may share the same position.',
            'Include EVERY word in the alignments array.',
            'Return ONLY a JSON array — no prose, no fences.',
            '',
            'Sentences:',
            JSON.stringify(sentenceMeta.map(m => ({
                num: m.num,
                greek_numbered: m.numberedGreek,
                english_numbered: m.numberedEng,
                words: sentences.find(s => s.num === m.num).words.map(w => ({
                    sentPos: w.sentPos, text: w.text, morph: w.morph
                }))
            }))),
            '',
            'Return: [{ "num": 0, "alignments": [{ "sentPos": 1, "engSentPos": null }, { "sentPos": 2, "engSentPos": 3 }] }]'
        ].join('\n');

        const alignMsg = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [{ role: 'user', content: alignPrompt }]
        });

        let alignResult;
        try {
            alignResult = JSON.parse(stripFences(alignMsg.content[0].text));
        } catch {
            throw new HttpsError('internal', 'Align: Claude returned invalid JSON for engSentPos.');
        }

        // Merge engSentPos
        for (const aResult of alignResult) {
            const sent = sentences.find(s => s.num === aResult.num);
            if (!sent) continue;
            for (const align of aResult.alignments ?? []) {
                const word = sent.words.find(w => w.sentPos === align.sentPos);
                if (word) word.engSentPos = align.engSentPos ?? null;
            }
        }

        // Compute preEng/postEng deterministically using the position maps
        for (const sent of sentences) {
            const meta = sentenceMeta.find(m => m.num === sent.num);
            computeEngAlignment(sent, meta.positionMap);
        }

        // Mark all sentences as needing audio
        for (const sent of sentences) {
            sent.audioGenerated = false;
        }

        await db.collection('lessons').doc(lessonId).update({
            sentences,
            status:    'aligned',
            updatedAt: Timestamp.now()
        });

        return { sentences };
    }
);

// ---------------------------------------------------------------------------
// Function 3: generateGreekAudio (Steps 7–8)
// ---------------------------------------------------------------------------

exports.generateGreekAudio = onCall(
    { secrets: ['ELEVENLABS_API_KEY'], timeoutSeconds: 120 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can generate Greek audio.');
        }

        const { lessonId, sentenceIndex } = request.data;
        if (!lessonId)              throw new HttpsError('invalid-argument', 'lessonId is required.');
        if (sentenceIndex == null)  throw new HttpsError('invalid-argument', 'sentenceIndex is required.');

        // Load sentence from Firestore
        const lessonSnap = await db.collection('lessons').doc(lessonId).get();
        if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
        const lesson = lessonSnap.data();
        const sent = lesson.sentences[sentenceIndex];
        if (!sent) throw new HttpsError('invalid-argument', `Sentence ${sentenceIndex} not found.`);

        // Skip if already generated and not dirty
        if (sent.audioGenerated === true) {
            return { lessonId, sentenceIndex, skipped: true };
        }

        const VOICE_ID = '62eXAzXYsxMOUszcxeJ4'; // David
        const elevenKey = process.env.ELEVENLABS_API_KEY;
        const TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`;

        // Step 7 — ElevenLabs TTS
        const normalizedGreek = normalizeAncientGreekForModern(sent.greek);

        const greekResp = await fetch(TTS_URL, {
            method: 'POST',
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: normalizedGreek,
                model_id: 'eleven_turbo_v2_5',
                voice_settings: { stability: 0.8, similarity_boost: 0.7, style: 0.3 },
                previous_text: sent.english,
                language_code: 'el'
            })
        });
        if (!greekResp.ok) throw new HttpsError('internal', `ElevenLabs Greek TTS failed: ${greekResp.status}`);
        const greekData = await greekResp.json();

        const engResp = await fetch(TTS_URL, {
            method: 'POST',
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: sent.english,
                model_id: 'eleven_turbo_v2_5',
                voice_settings: { stability: 0.8, similarity_boost: 0.7, style: 0.3 },
                language_code: 'en'
            })
        });
        if (!engResp.ok) throw new HttpsError('internal', `ElevenLabs English TTS failed: ${engResp.status}`);
        const engData = await engResp.json();

        // Step 8 — Timepoints + upload
        const greekTimepoints = buildGreekTimepoints(greekData.alignment, sent.words);
        const engTimepoints   = buildEngTimepoints(engData.alignment, sent.english, sent.words);

        const [greekUrl, engUrl] = await Promise.all([
            uploadAudio(lessonId, sent.num, 'greek',   greekData.audio_base64),
            uploadAudio(lessonId, sent.num, 'english', engData.audio_base64)
        ]);

        // Reload sentences array and update the element — Firestore does not support
        // dot-notation updates on array elements (it silently converts to a map).
        const freshSnap = await db.collection('lessons').doc(lessonId).get();
        const freshSentences = freshSnap.data().sentences;
        freshSentences[sentenceIndex] = {
            ...freshSentences[sentenceIndex],
            greek_audio_url:   greekUrl,
            english_audio_url: engUrl,
            timepoints:        { greek: greekTimepoints, english: engTimepoints },
            audioGenerated:    true
        };
        await db.collection('lessons').doc(lessonId).update({
            sentences:  freshSentences,
            updatedAt:  Timestamp.now()
        });

        return { lessonId, sentenceIndex, greekUrl, engUrl, skipped: false };
    }
);

// ---------------------------------------------------------------------------
// Function 3: acceptGreekLesson — write draft + merge story bible
// ---------------------------------------------------------------------------

exports.acceptGreekLesson = onCall(async (request) => {
    if (request.auth?.token?.role !== 'dev') {
        throw new HttpsError('permission-denied', 'Only dev can accept Greek lessons.');
    }

    const { lessonId, storyBibleId } = request.data;
    if (!lessonId)     throw new HttpsError('invalid-argument', 'lessonId is required.');
    if (!storyBibleId) throw new HttpsError('invalid-argument', 'storyBibleId is required.');

    // Load lesson from Firestore
    const lessonSnap = await db.collection('lessons').doc(lessonId).get();
    if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
    const lessonDoc = lessonSnap.data();

    // Fetch story bible and merge
    const bibleSnap = await db.collection('story_bible').doc(storyBibleId).get();
    if (!bibleSnap.exists) throw new HttpsError('not-found', `story_bible/${storyBibleId} not found.`);
    const bible = bibleSnap.data();

    const allAnnotatedWords = (lessonDoc.sentences || []).flatMap(s => s.words || []);
    const delta = lessonDoc.storyBibleDelta;

    const bibleWrites = [
        db.collection('lessons').doc(lessonId).update({ status: 'accepted', updatedAt: Timestamp.now() })
    ];

    if (delta) {
        const updatedBible = mergeStoryBible(bible, delta, allAnnotatedWords);
        bibleWrites.push(db.collection('story_bible').doc(storyBibleId).set(updatedBible));
    }

    await Promise.all(bibleWrites);

    return { lessonId, status: 'accepted' };
});

// ---------------------------------------------------------------------------
// Function 5: recomputeStoryBible
// Called after a lesson is deleted. Resets rolling state and replays all
// remaining accepted lessons' storyBibleDeltas in chapter order.
// ---------------------------------------------------------------------------

const ALPHA_STANDARD_IDS = [
    'alpha.order',
    'alpha.names',
    'alpha.transliterate_gk_en',
    'alpha.transliterate_en_gk',
    'alpha.case_transform',
    'alpha.adjacent',
];

exports.recomputeStoryBible = onCall(async (request) => {
    if (request.auth?.token?.role !== 'dev') {
        throw new HttpsError('permission-denied', 'Only dev can recompute the story bible.');
    }

    const { storyBibleId } = request.data;
    if (!storyBibleId) throw new HttpsError('invalid-argument', 'storyBibleId is required.');

    // Load current bible (to preserve canon)
    const bibleSnap = await db.collection('story_bible').doc(storyBibleId).get();
    if (!bibleSnap.exists) throw new HttpsError('not-found', `story_bible/${storyBibleId} not found.`);
    const currentBible = bibleSnap.data();

    // Load all accepted lessons for this course, sorted by chapter
    const lessonsSnap = await db.collection('lessons')
        .where('courseId', '==', 'grade7-greek')
        .where('status', '==', 'accepted')
        .get();

    const lessons = lessonsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));

    // Start from a clean rolling state, preserving only the fixed canon
    const bible = {
        courseId:     currentBible.courseId,
        canon:        currentBible.canon,
        chapterCount: 0,
        narrative: {
            timePeriod:       null,
            location:         null,
            summary:          null,
            activeCharacters: []
        },
        characters: {},
        standards: {
            covered:    [...ALPHA_STANDARD_IDS],
            reinforced: {}
        },
        vocab:    { introduced: {} },
        grammar:  { introduced: {} }
    };

    // Replay each accepted lesson in chapter order
    for (const lesson of lessons) {
        const delta = lesson.storyBibleDelta;
        if (!delta) continue;
        const words = (lesson.sentences ?? []).flatMap(s => s.words ?? []);
        mergeStoryBible(bible, delta, words);
    }

    await db.collection('story_bible').doc(storyBibleId).set(bible);

    return { chaptersReplayed: lessons.length };
});

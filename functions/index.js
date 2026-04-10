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

// Firestore glosses cache — loaded once per instance, merged into wordForms
let glossesLoaded = false;
async function ensureGlossesLoaded(courseId = 'grade7-greek') {
    if (glossesLoaded) return;
    try {
        const db = getFirestore();
        const snap = await db.collection('word_glosses').doc(courseId).get();
        if (snap.exists) {
            Object.assign(wordForms, snap.data().forms ?? {});
        }
        glossesLoaded = true;
    } catch (e) {
        console.warn('Failed to load word_glosses from Firestore:', e.message);
    }
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
    if (!morph || typeof morph !== 'object') return null;
    const { pos, tense, mood, voice, gender } = morph;

    if (pos === 'art') return 'definite_article';

    if (pos === 'verb' && tense === 'pres' && mood === 'indic' && voice === 'act') {
        if (dict_entry === 'εἰμί') return 'eimi_present_indicative_active';
        if (dict_entry && dict_entry.endsWith('έω')) return 'epsilon_contract_present_indicative_active';
        if (dict_entry && dict_entry.endsWith('άω')) return 'alpha_contract_present_indicative_active';
        return 'omega_verb_present_indicative_active';
    }

    if (pos === 'noun') {
        if (gender === 'masc') return '2nd_declension_masculine';
        if (gender === 'neut') return '2nd_declension_neuter';
        if (gender === 'fem') {
            if (dict_entry && dict_entry.endsWith('α')) return '1st_declension_feminine_alpha';
            return '1st_declension_feminine_eta';
        }
    }

    if (pos === 'adj') return '2_1_2_adjective';

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
// Shared helper: annotateGreekSentences (Steps 2–3–5)
// Fills in dict_entry/morph/syntax/paradigm on an array of sentence objects
// that already have a `words` array (from tokenization or retokenization).
// Only tokens with null dict_entry are sent to Claude for annotation.
// ---------------------------------------------------------------------------

const PUNCT_RE_SHARED = /[.,;:·?!]/g;
const stripAccentsShared = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');

async function annotateGreekSentences(sentences, client, courseId) {
    await ensureGlossesLoaded(courseId);
    // ── Step 2: dict lookup + Claude batch for misses ──────────────────────
    const misses = [];
    const missSet = new Set();
    for (const sent of sentences) {
        for (const word of sent.words) {
            if (!word.dict_entry) {
                const bare = word.text.replace(PUNCT_RE_SHARED, '');
                const entry = wordForms[bare] || wordForms[word.text] || wordForms[stripAccentsShared(bare)] || null;
                if (entry) {
                    word.dict_entry    = entry.dict_entry;
                    word.short_def     = entry.short_def;
                    word.morph         = entry.morph;
                    word.vocab_tier    = entry.vocab_tier;
                    word.paradigm_key  = entry.paradigm_key  || null;
                } else if (!missSet.has(bare) && bare) {
                    missSet.add(bare);
                    misses.push({ text: bare });
                }
            }
        }
    }

    if (misses.length > 0) {
        const step2Prompt = [
            'Annotate each Ancient Greek token. Return ONLY a JSON array — no prose, no fences.',
            '',
            'For morph, return a JSON object with these fields (omit inapplicable fields):',
            '  pos: "noun" | "verb" | "adj" | "art" | "pron" | "prep" | "conj" | "adv" | "interj" | "particle" | "prefix"',
            '  For nouns/adj/art:  gender ("masc"|"fem"|"neut"), number ("sg"|"pl"), case ("nom"|"gen"|"dat"|"acc"|"voc")',
            '  For verbs:          tense ("pres"|"imperf"|"fut"|"aor"|"perf"), mood ("indic"|"subj"|"opt"|"imper"|"inf"), voice ("act"|"mid"|"pass"), person ("1"|"2"|"3"), number ("sg"|"pl") — omit person/number for infinitives',
            '  For pronouns:       subtype ("personal"|"autos"|"relative"|"other"), plus gender/number/case or person/number/case',
            '  For uninflected:    only pos is needed',
            '',
            'For each token provide: text, dict_entry (nominative sg for nouns, 1st sg pres act indic for verbs),',
            'short_def (≤5 words), morph (object per schema above),',
            'vocab_tier ("intro"|"beginning"|"intermediate"|"prose"|null), paradigm_key (or null).',
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
            throw new HttpsError('internal', 'Annotate Step 2: Claude returned invalid JSON.');
        }

        const annotationMap = {};
        for (const ann of claudeAnnotations) annotationMap[ann.text] = ann;

        for (const sent of sentences) {
            for (const word of sent.words) {
                if (!word.dict_entry) {
                    const bare = word.text.replace(PUNCT_RE_SHARED, '');
                    const ann = annotationMap[bare];
                    if (ann) {
                        word.dict_entry    = ann.dict_entry    || null;
                        word.short_def     = ann.short_def     || null;
                        word.morph         = ann.morph         || null;
                        word.vocab_tier    = ann.vocab_tier    || null;
                        word.paradigm_key  = ann.paradigm_key  || null;
                    }
                }
            }
        }
    }

    // ── Step 5: paradigm key assignment (deterministic fallback) ───────────
    for (const sent of sentences) {
        for (const word of sent.words) {
            if (!word.paradigm_key) word.paradigm_key = resolveParadigmKey(word);
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
                '    "characters_upsert": [{ "greek": "Κλέων", "english": "Kleon", "role": "merchant", "description": "..." }]',
                '  }',
                '}'
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
        // Step 2 — Tokenize (build word skeletons)
        // ------------------------------------------------------------------
        for (const sent of rawSentences) {
            sent.words = sent.greek.split(/\s+/).map((text, idx) => ({
                sentPos: idx, text,
                dict_entry: null, short_def: null, morph: null,
                vocab_tier: null, paradigm_key: null, engSentPos: null
            }));
        }

        // Steps 2b–3–5: annotation via shared helper
        await annotateGreekSentences(rawSentences, client, bible.courseId);

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
        // Final assembly + Firestore save
        // ------------------------------------------------------------------
        const allWords = rawSentences.flatMap(s => s.words);

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
            standardIds:     [],
            title,
            status:          'draft',
            storyBibleDelta:  storyBibleDelta ?? null,
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
    { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 300 },
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

        // ── Annotate first (Steps 2–3–5) ──────────────────────────────────
        // Ensures all words have morph/syntax/paradigm regardless of how they
        // were created (initial generation, manual edit, or lightweight refine).
        await annotateGreekSentences(sentences, client, lesson.courseId);

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
            'Align each Greek word to the single best engSentPos available.',
            'Greek words with no English equivalent (e.g. articles, particles) should be aligned to the engSentPos of the Greek word they modify.',
            'For example, all definite articles align to the English noun they modify. Postpositive particles align to the English equivalent of the preceding Greek word.',
            'Every Greek word must be aligned. engSentPos: null is not allowed.',
            'Multiple Greek words may share the same engSentPos.',
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
            'Return: [{ "num": 0, "alignments": [{ "sentPos": 0, "engSentPos": 2 }, { "sentPos": 1, "engSentPos": 2 }, { "sentPos": 2, "engSentPos": 3 }] }]'
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

        // Rebuild vocab_list from freshly annotated words
        const seenVocab = new Set();
        const vocabList = [];
        for (const sent of sentences) {
            for (const word of sent.words ?? []) {
                if (word.vocab_tier && word.dict_entry && !seenVocab.has(word.dict_entry)) {
                    seenVocab.add(word.dict_entry);
                    vocabList.push({ dict_entry: word.dict_entry, short_def: word.short_def, vocab_tier: word.vocab_tier });
                }
            }
        }

        await db.collection('lessons').doc(lessonId).update({
            sentences,
            vocab_list: vocabList,
            status:    'aligned',
            updatedAt: Timestamp.now()
        });

        return { sentences };
    }
);

// ---------------------------------------------------------------------------
// Function 2b: refineGreekLesson — lightweight draft revision (one Claude call)
// ---------------------------------------------------------------------------

exports.refineGreekLesson = onCall(
    { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 120 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can refine Greek lessons.');
        }

        const { lessonId, feedback } = request.data;
        if (!lessonId) throw new HttpsError('invalid-argument', 'lessonId is required.');
        if (!feedback?.trim()) throw new HttpsError('invalid-argument', 'feedback is required.');

        const lessonSnap = await db.collection('lessons').doc(lessonId).get();
        if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
        const lesson = lessonSnap.data();

        const sentenceList = (lesson.sentences ?? [])
            .map((s, i) => `${i + 1}. ${s.greek}  (${s.english ?? ''})`)
            .join('\n');

        const prompt = [
            'These are Ancient Greek sentences with their English translations:',
            sentenceList,
            '',
            `Feedback: ${feedback.trim()}`,
            '',
            'Revise the sentences as requested. Return ALL sentences (revised and unchanged).',
            'Keep the title unless the feedback asks to change it.',
            'Return ONLY valid JSON — no prose, no fences:',
            '{ "title": "...", "sentences": [{ "num": 0, "greek": "...", "english": "..." }] }'
        ].join('\n');

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }]
        });

        let result;
        try {
            result = JSON.parse(stripFences(msg.content[0].text));
        } catch {
            throw new HttpsError('internal', 'Refine: Claude returned invalid JSON.');
        }

        // Retokenize with basic word objects — annotation happens at Align time
        const sentences = result.sentences.map(s => ({
            num: s.num,
            greek: s.greek,
            english: s.english ?? '',
            words: (s.greek ?? '').trim().split(/\s+/).filter(Boolean).map((text, idx) => ({
                sentPos: idx, text,
                dict_entry: null, short_def: null, morph: null,
                vocab_tier: null, paradigm_key: null, engSentPos: null
            })),
            audioGenerated: false
        }));

        await db.collection('lessons').doc(lessonId).update({
            sentences,
            title: result.title ?? lesson.title,
            status: 'draft',
            updatedAt: Timestamp.now()
        });

        return { lessonId, sentences, title: result.title ?? lesson.title };
    }
);

// ---------------------------------------------------------------------------
// Function 2c: translateToGreek — single-sentence Greek suggestion (Haiku)
// ---------------------------------------------------------------------------

exports.translateToGreek = onCall(
    { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 30 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can use translateToGreek.');
        }

        const { english, context, vocabWords } = request.data;
        if (!english?.trim()) throw new HttpsError('invalid-argument', 'english is required.');

        const prompt = [
            'Translate the following English sentence into Ancient Greek (Attic dialect).',
            'Use simple vocabulary appropriate for beginning Greek learners (NGE intro/beginning tier if possible).',
            vocabWords?.length
                ? `You MUST use the following vocabulary words (in appropriate inflected forms) in your translation: ${vocabWords.join(', ')}`
                : '',
            context ? `Surrounding story context (for consistency):\n${context}` : '',
            '',
            `English: ${english.trim()}`,
            '',
            'Return ONLY valid JSON — no prose, no fences: { "greek": "..." }'
        ].filter(Boolean).join('\n');

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 256,
            messages: [{ role: 'user', content: prompt }]
        });

        let result;
        try {
            result = JSON.parse(stripFences(msg.content[0].text));
        } catch {
            throw new HttpsError('internal', 'translateToGreek: Claude returned invalid JSON.');
        }

        return { greek: result.greek };
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
// Function 3c: generateOverviewAudio
// English-only TTS for overview or map description, with word-level alignment.
// part: 'overview' | 'map'  (default 'overview')
// Reads lesson.{part}.text (overview) or lesson.{part}.description (map).
// Saves: lesson.{part}.audioUrl, lesson.{part}.alignment
// ---------------------------------------------------------------------------

exports.generateOverviewAudio = onCall(
    { secrets: ['ELEVENLABS_API_KEY'], timeoutSeconds: 120 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can generate audio.');
        }
        const { lessonId, part = 'overview' } = request.data;
        if (!lessonId) throw new HttpsError('invalid-argument', 'lessonId is required.');
        if (!['overview', 'map'].includes(part)) throw new HttpsError('invalid-argument', 'part must be overview or map.');

        const lessonSnap = await db.collection('lessons').doc(lessonId).get();
        if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
        const lesson = lessonSnap.data();
        const partData = lesson[part] ?? {};
        const text = part === 'map' ? (partData.description ?? '') : (partData.text ?? '');
        if (!text.trim()) throw new HttpsError('invalid-argument', `lessons/${lessonId}.${part} has no text.`);

        const VOICE_ID = '62eXAzXYsxMOUszcxeJ4'; // David
        const elevenKey = process.env.ELEVENLABS_API_KEY;
        const TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`;

        const resp = await fetch(TTS_URL, {
            method: 'POST',
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                model_id: 'eleven_turbo_v2_5',
                voice_settings: { stability: 0.8, similarity_boost: 0.7, style: 0.3 },
                language_code: 'en'
            })
        });
        if (!resp.ok) throw new HttpsError('internal', `ElevenLabs TTS failed: ${resp.status}`);
        const data = await resp.json();

        // Build word-level timepoints from ElevenLabs character alignment
        const chars = data.alignment.characters;
        const starts = data.alignment.character_start_times_seconds;
        const ends   = data.alignment.character_end_times_seconds;
        const fullText = chars.join('');
        const wordRe = /\S+/g;
        const alignment = [];
        let match;
        while ((match = wordRe.exec(fullText)) !== null) {
            const s = match.index;
            const e = s + match[0].length - 1;
            if (s < starts.length && e < ends.length) {
                alignment.push({ word: match[0], start: starts[s], end: ends[e] });
            }
        }

        // Upload audio (reuse uploadAudio helper pattern)
        const audioUrl = await uploadAudio(lessonId, part, 'en', data.audio_base64);

        await db.collection('lessons').doc(lessonId).update({
            [`${part}.audioUrl`]:   audioUrl,
            [`${part}.alignment`]:  alignment,
            updatedAt:              Timestamp.now()
        });

        return { lessonId, part, audioUrl };
    }
);

// ---------------------------------------------------------------------------
// Function 3b: generateImagePrompt — create a scene prompt for image generation
// Runs concurrently with audio generation; saves prompt to lesson doc.
// ---------------------------------------------------------------------------

exports.generateImagePrompt = onCall(
    { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 60 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can generate image prompts.');
        }

        const { lessonId, storyBibleId = 'grade7-greek' } = request.data;
        if (!lessonId) throw new HttpsError('invalid-argument', 'lessonId is required.');

        const [lessonSnap, bibleSnap] = await Promise.all([
            db.collection('lessons').doc(lessonId).get(),
            db.collection('story_bible').doc(storyBibleId).get()
        ]);

        if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
        const lesson = lessonSnap.data();
        const bible = bibleSnap.exists ? bibleSnap.data() : {};

        // Build passage summary (English translations)
        const passage = (lesson.sentences ?? [])
            .map(s => s.english)
            .filter(Boolean)
            .join(' ');

        // Build character sketches for active characters
        const activeNames = lesson.storyBibleDelta?.narrative?.activeCharacters ?? [];
        const characters = bible.characters ?? {};
        const charLines = activeNames
            .map(name => {
                const c = Object.values(characters).find(
                    ch => ch.english === name || ch.greek === name
                );
                if (!c) return `- ${name}`;
                return `- ${c.english ?? name} (${c.greek ?? ''}): ${c.description ?? c.role ?? ''}`;
            })
            .join('\n');

        const location = lesson.storyBibleDelta?.narrative?.location
            ?? bible.narrative?.location
            ?? 'ancient Athens';

        const prompt = [
            'You are writing a scene description for an AI image generator.',
            'The character reference images and art style are already provided separately — do NOT describe character appearance, clothing, or art style.',
            'Focus ONLY on: what is happening in the scene, where it takes place, and the mood or emotion.',
            '',
            `Title: ${lesson.title ?? ''}`,
            `Location: ${location}`,
            '',
            'Passage (English):',
            passage,
            '',
            charLines ? `Characters present:\n${charLines}` : '',
            '',
            'Write a concise scene description (2–4 sentences) covering:',
            '- The specific action or moment depicted',
            '- The setting and any important environmental details',
            '- The emotional tone of the scene',
            'Do NOT mention art style, character appearance, clothing, or colors.',
            'Output only the scene description, no preamble.',
        ].filter(Boolean).join('\n');

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }]
        });

        const imagePrompt = msg.content[0].text.trim();

        await db.collection('lessons').doc(lessonId).update({ image_prompt: imagePrompt });

        return { image_prompt: imagePrompt };
    }
);

// ---------------------------------------------------------------------------
// Function 3c: acceptGreekLesson — write draft + merge story bible
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

/**
 * glossGreekWords — two-step pipeline for unrecognized Greek surface forms.
 *
 * Step 1 — Morph-tag: identify dict_entry, morph, short_def for each token.
 * Step 2 — Generate forms: for each unique (dict_entry, tense/mood/voice group),
 *           generate all paradigm forms with correct diacritics.
 *
 * Stored entries are canonical (accented forms only — no stripped duplicates).
 * The frontend builds a runtime stripped-key fallback map on load.
 */
exports.glossGreekWords = onCall(
    { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 180 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can gloss Greek words.');
        }

        const { tokens, courseId = 'grade7-greek' } = request.data;
        if (!Array.isArray(tokens) || tokens.length === 0) {
            throw new HttpsError('invalid-argument', 'tokens array is required.');
        }

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        function stripFences(text) {
            return text.replace(/^```[a-z]*\s*/m, '').replace(/\s*```$/m, '').trim();
        }

        // ── Step 1: Morph-tag all tokens ────────────────────────────────────
        const morphPrompt = `You are a Greek morphological analyzer for a learner app.
For each surface form, return its morphological analysis.

Return a JSON array — one object per input form:
[
  {
    "form": "<input surface form>",
    "dict_entry": "<canonical headword: nom sg for nouns/adj, 1sg pres act indic for verbs, full polytonic diacritics>",
    "short_def": "<3–5 word English definition>",
    "morph": {
      "pos": "noun"|"verb"|"adj"|"art"|"pron"|"prep"|"conj"|"adv"|"particle"|"interj",
      // Nouns/adj/art/pron: "gender" ("masc"|"fem"|"neut"), "number" ("sg"|"pl"), "case" ("nom"|"gen"|"dat"|"acc"|"voc")
      // Verbs: "tense" ("pres"|"imperf"|"fut"|"aor"|"perf"), "mood" ("indic"|"subj"|"opt"|"imper"|"inf"),
      //        "voice" ("act"|"mid"|"pass"|"mp"), "person" ("1"|"2"|"3"), "number" ("sg"|"pl") — omit person/number for inf
      // Pronouns: also "subtype" ("personal"|"autos"|"relative"|"other")
      // Uninflected: only "pos"
    }
  }
]

Surface forms to analyze: ${tokens.join(', ')}

Return only valid JSON, no explanation.`;

        const morphMsg = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            messages: [{ role: 'user', content: morphPrompt }]
        });

        let tagged;
        try {
            tagged = JSON.parse(stripFences(morphMsg.content[0].text));
            if (!Array.isArray(tagged)) throw new Error('not an array');
        } catch (e) {
            throw new HttpsError('internal', `Morph-tag step failed: ${e.message}`);
        }

        // ── Validate morph tags ─────────────────────────────────────────────
        const VALID_POS    = new Set(['noun','verb','adj','art','pron','prep','conj','adv','particle','interj','prefix','numeral']);
        const VALID_GENDER = new Set(['masc','fem','neut']);
        const VALID_NUMBER = new Set(['sg','pl']);
        const VALID_CASE   = new Set(['nom','gen','dat','acc','voc']);
        const VALID_TENSE  = new Set(['pres','imperf','fut','aor','perf','plup']);
        const VALID_MOOD   = new Set(['indic','subj','opt','imper','inf']);
        const VALID_VOICE  = new Set(['act','mid','pass','mp']);
        const VALID_PERSON = new Set(['1','2','3']);
        const UNINFLECTED  = new Set(['prep','conj','adv','particle','interj','prefix','numeral']);

        function validateMorph(m) {
            if (!m || typeof m !== 'object') return 'missing morph';
            if (!VALID_POS.has(m.pos)) return `invalid pos: ${m.pos}`;
            if (UNINFLECTED.has(m.pos)) return null;
            if (m.pos === 'verb') {
                if (!VALID_TENSE.has(m.tense)) return `invalid tense: ${m.tense}`;
                if (!VALID_VOICE.has(m.voice)) return `invalid voice: ${m.voice}`;
                if (m.mood !== 'inf') {
                    if (!VALID_MOOD.has(m.mood))   return `invalid mood: ${m.mood}`;
                    if (!VALID_PERSON.has(m.person)) return `invalid person: ${m.person}`;
                    if (!VALID_NUMBER.has(m.number)) return `invalid number: ${m.number}`;
                }
                return null;
            }
            if (!VALID_GENDER.has(m.gender)) return `invalid gender: ${m.gender}`;
            if (!VALID_NUMBER.has(m.number)) return `invalid number: ${m.number}`;
            if (!VALID_CASE.has(m.case))     return `invalid case: ${m.case}`;
            return null;
        }

        // Group tagged tokens by (dict_entry, paradigm_group)
        // paradigm_group = tense.mood.voice for verbs, 'decl' for everything else
        const groups = new Map(); // key → { dict_entry, short_def, morph, paradigm_group }
        const skipped = [];

        for (const item of tagged) {
            const { form, dict_entry, short_def, morph } = item;
            if (!dict_entry || !morph) { skipped.push(form); continue; }
            const err = validateMorph(morph);
            if (err) { skipped.push(`${form}(${err})`); continue; }
            if (UNINFLECTED.has(morph.pos)) continue; // no forms to generate

            let paradigmGroup;
            if (morph.pos === 'verb') {
                const moodKey = morph.mood === 'inf' ? 'indic' : morph.mood;
                paradigmGroup = `${morph.tense}.${moodKey}.${morph.voice}`;
            } else {
                paradigmGroup = morph.pos; // 'noun', 'adj', 'art', 'pron'
            }

            const key = `${dict_entry}|${paradigmGroup}`;
            if (!groups.has(key)) {
                groups.set(key, { dict_entry, short_def, morph, paradigmGroup });
            }
        }

        // ── Step 2: Generate forms for each group ───────────────────────────
        function formPromptFor(dict_entry, morph, paradigmGroup) {
            const { pos, tense, mood, voice, gender, number: num } = morph;

            if (pos === 'verb') {
                const t = { pres:'Present', imperf:'Imperfect', aor:'Aorist', fut:'Future', perf:'Perfect' }[tense] ?? tense;
                const mo = paradigmGroup.includes('indic') ? 'Indicative'
                         : paradigmGroup.includes('subj')  ? 'Subjunctive'
                         : paradigmGroup.includes('opt')   ? 'Optative'
                         : 'Indicative';
                const v = { act:'Active', mid:'Middle', pass:'Passive', mp:'Middle/Passive' }[voice] ?? voice;
                return `Return ONLY a JSON array of form objects — no prose, no fences.
Generate exactly 7 forms for the Ancient Greek verb: ${dict_entry}
Forms: ${t} ${mo} ${v} (1sg 2sg 3sg 1pl 2pl 3pl) + ${t} ${v} infinitive.
Use correct Greek diacritics (recessive accent on finite forms).
Finite: {"form":"<Greek>","morph":{"pos":"verb","tense":"${tense}","mood":"indic","voice":"${voice}","person":"<1|2|3>","number":"<sg|pl>"}}
Infinitive: {"form":"<Greek>","morph":{"pos":"verb","tense":"${tense}","mood":"inf","voice":"${voice}"}}`;
            }

            if (pos === 'noun') {
                const g = { masc:'masculine', fem:'feminine', neut:'neuter' }[gender] ?? gender;
                return `Return ONLY a JSON array of form objects — no prose, no fences.
Generate exactly 10 forms for the Ancient Greek noun: ${dict_entry} (${g})
Forms: nom/gen/dat/acc/voc × singular/plural. Use correct diacritics.
Schema: {"form":"<Greek>","morph":{"pos":"noun","gender":"${gender}","number":"<sg|pl>","case":"<nom|gen|dat|acc|voc>"}}`;
            }

            if (pos === 'adj') {
                return `Return ONLY a JSON array of form objects — no prose, no fences.
Generate exactly 30 forms for the Ancient Greek adjective: ${dict_entry}
Forms: nom/gen/dat/acc/voc × sg/pl × masc/fem/neut. Use correct diacritics.
Schema: {"form":"<Greek>","morph":{"pos":"adj","gender":"<masc|fem|neut>","number":"<sg|pl>","case":"<nom|gen|dat|acc|voc>"}}`;
            }

            if (pos === 'pron') {
                return `Return ONLY a JSON array of form objects — no prose, no fences.
Generate all standard inflected forms for: ${dict_entry} (pronoun). Use correct diacritics.
Schema: {"form":"<Greek>","morph":{"pos":"pron","subtype":"<personal|autos|relative|other>",<gender or person>,"number":"<sg|pl>","case":"<nom|gen|dat|acc|voc>"}}`;
            }

            if (pos === 'art') {
                return `Return ONLY a JSON array of form objects — no prose, no fences.
Generate all 24 forms of the Greek definite article (no vocative).
Schema: {"form":"<Greek>","morph":{"pos":"art","gender":"<masc|fem|neut>","number":"<sg|pl>","case":"<nom|gen|dat|acc>"}}`;
            }

            return null;
        }

        function expectedCount(pos) {
            if (pos === 'verb') return 7;
            if (pos === 'noun') return 10;
            if (pos === 'adj')  return 30;
            if (pos === 'art')  return 24;
            return null; // pron: variable
        }

        // ── Resolve paradigm_key from morph (for storage) ───────────────────
        function resolveParadigmKeyFromMorph(morph, dict_entry) {
            const { pos, tense, mood, voice, gender } = morph;
            if (pos === 'art') return 'definite_article';
            if (pos === 'adj') return '2_1_2_adjective';
            if (pos === 'verb') {
                if (tense !== 'pres') return null; // non-present: data-driven, no static paradigm needed
                if (dict_entry === 'εἰμί') return 'eimi_present_indicative_active';
                if (dict_entry?.endsWith('έω')) return 'epsilon_contract_present_indicative_active';
                if (dict_entry?.endsWith('άω')) return 'alpha_contract_present_indicative_active';
                return 'omega_verb_present_indicative_active';
            }
            if (pos === 'noun') {
                if (gender === 'masc') return '2nd_declension_masculine';
                if (gender === 'neut') return '2nd_declension_neuter';
                return null; // fem: need more info
            }
            if (pos === 'pron') {
                if (dict_entry === 'ἐγώ') return 'pronoun_personal_1st';
                if (dict_entry === 'σύ')  return 'pronoun_personal_2nd';
                if (dict_entry?.startsWith('αὐτ')) return 'pronoun_autos';
                if (dict_entry?.startsWith('ὅς') || dict_entry?.startsWith('ὅ')) return 'pronoun_relative_hos';
            }
            return null;
        }

        const formMap = {};
        const added   = {};

        for (const [, group] of groups) {
            const { dict_entry, short_def, morph, paradigmGroup } = group;
            const prompt = formPromptFor(dict_entry, morph, paradigmGroup);
            if (!prompt) continue;

            let forms;
            try {
                const msg = await client.messages.create({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 2048,
                    messages: [{ role: 'user', content: prompt }]
                });
                forms = JSON.parse(stripFences(msg.content[0].text));
                if (!Array.isArray(forms)) throw new Error('not an array');
            } catch (e) {
                console.warn(`Form generation failed for ${dict_entry}: ${e.message}`);
                continue;
            }

            // Validate form count (warn only — don't discard partial results)
            const exp = expectedCount(morph.pos);
            if (exp !== null && forms.length !== exp) {
                console.warn(`${dict_entry}: expected ${exp} forms, got ${forms.length}`);
            }

            const pkey = resolveParadigmKeyFromMorph(morph, dict_entry);

            for (const { form, morph: formMorph } of forms) {
                if (!form || !formMorph) continue;
                formMap[form] = {
                    dict_entry,
                    short_def: short_def ?? '',
                    paradigm_key: pkey,
                    morph: formMorph,
                    vocab_tier: null
                };
            }

            added[dict_entry] = { dict_entry, short_def: short_def ?? '', vocab_tier: null };
        }

        if (Object.keys(formMap).length === 0) {
            return { glossed: added, formCount: 0, skipped };
        }

        // Persist to Firestore (canonical forms only — no stripped duplicates)
        const glossRef = db.collection('word_glosses').doc(courseId);
        const dotKeys  = {};
        for (const [k, v] of Object.entries(formMap)) {
            dotKeys[`forms.${k}`] = v;
        }
        await glossRef.set({ forms: {} }, { merge: true });
        await glossRef.update(dotKeys);

        return { glossed: added, formCount: Object.keys(formMap).length, skipped };
    }
);

// ---------------------------------------------------------------------------
// generateGreekImage — call OpenAI image API, return b64_json
// ---------------------------------------------------------------------------

exports.generateGreekImage = onCall(
    { secrets: ['OPENAI_API_KEY'], timeoutSeconds: 120 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can generate images.');
        }

        const { prompt, characterImageUrls = [] } = request.data;
        if (!prompt?.trim()) throw new HttpsError('invalid-argument', 'prompt is required.');

        const apiKey = process.env.OPENAI_API_KEY;

        // If character images provided, use edits endpoint so style is driven by the reference images
        if (characterImageUrls.length > 0) {
            const { FormData, Blob } = require('formdata-node');
            const form = new FormData();
            form.append('model', 'gpt-image-1');
            form.append('prompt', prompt.trim());
            form.append('size', '1024x1024');

            for (const url of characterImageUrls) {
                try {
                    let buf;
                    if (url.startsWith('data:')) {
                        // data: URL — decode base64 directly
                        const base64 = url.split(',')[1];
                        buf = Buffer.from(base64, 'base64');
                    } else {
                        const res = await globalThis.fetch(url);
                        if (!res.ok) continue;
                        buf = Buffer.from(await res.arrayBuffer());
                    }
                    form.append('image[]', new Blob([buf], { type: 'image/png' }), 'character.png');
                } catch (e) {
                    console.warn('Failed to fetch character image:', url.slice(0, 60), e.message);
                }
            }

            const response = await globalThis.fetch('https://api.openai.com/v1/images/edits', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}` },
                body: form
            });
            const data = await response.json();
            if (!response.ok) throw new HttpsError('internal', data.error?.message ?? 'Image edits failed');
            return { b64_json: data.data[0].b64_json };
        }

        // Text-only generations
        const response = await globalThis.fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-image-1',
                prompt: prompt.trim(),
                size: '1024x1024',
                response_format: 'b64_json'
            })
        });
        const data = await response.json();
        if (!response.ok) throw new HttpsError('internal', data.error?.message ?? 'Image generation failed');
        return { b64_json: data.data[0].b64_json };
    }
);

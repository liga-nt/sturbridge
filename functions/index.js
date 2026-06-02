const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const { randomUUID, createHash } = require('crypto');

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
let ngeTierByDictEntry = {}; // { dictEntry → 'intro'|'beginning'|'intermediate'|'prose' }
try {
    const ngeData = JSON.parse(fs.readFileSync(
        path.join(__dirname, 'data', 'Greek', 'nge_vocabulary.json'), 'utf8'
    ));
    const entries = ngeData.entries ?? [];
    const byTier = { intro: [], beginning: [], intermediate: [], prose: [] };
    for (const e of entries) {
        if (byTier[e.introduced]) byTier[e.introduced].push(`${e.greek} — ${e.definition}`);
        if (e.greek && e.introduced) ngeTierByDictEntry[e.greek] = e.introduced;
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
function mergeStoryBible(bible, delta, introVocabScan) {
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

    for (const word of introVocabScan ?? []) {
        if (word.vocabTier === 'intro' && word.dictEntry && !bible.vocab.introduced[word.dictEntry]) {
            bible.vocab.introduced[word.dictEntry] = { chapter: delta.chapter, tier: 'intro' };
        }
    }

    return bible;
}

/**
 * resolveParadigmKey — deterministic fallback for words whose paradigmKey is
 * still null after the word-forms dict lookup.
 */
function resolveParadigmKey(word) {
    const { morph, dictEntry } = word;
    if (!morph || typeof morph !== 'object') return null;
    const { pos, tense, mood, voice, gender } = morph;

    if (pos === 'art') return 'definite_article';

    if (pos === 'verb' && tense === 'pres' && mood === 'indic' && voice === 'act') {
        if (dictEntry === 'εἰμί') return 'eimi_present_indicative_active';
        if (dictEntry && dictEntry.endsWith('έω')) return 'epsilon_contract_present_indicative_active';
        if (dictEntry && dictEntry.endsWith('άω')) return 'alpha_contract_present_indicative_active';
        return 'omega_verb_present_indicative_active';
    }

    if (pos === 'noun') {
        if (gender === 'masc') return '2nd_declension_masculine';
        if (gender === 'neut') return '2nd_declension_neuter';
        if (gender === 'fem') {
            if (dictEntry && dictEntry.endsWith('α')) return '1st_declension_feminine_alpha';
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
// Fills in dictEntry/morph/syntax/paradigm on an array of sentence objects
// that already have a `words` array (from tokenization or retokenization).
// Only tokens with null dictEntry are sent to Claude for annotation.
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
            if (!word.dictEntry) {
                const bare = word.text.replace(PUNCT_RE_SHARED, '');
                const entry = wordForms[bare] || wordForms[word.text] || wordForms[stripAccentsShared(bare)] || null;
                if (entry) {
                    word.dictEntry    = entry.dictEntry;
                    word.shortDef     = entry.shortDef;
                    word.morph         = entry.morph;
                    word.vocabTier    = entry.vocabTier;
                    word.paradigmKey  = entry.paradigmKey  || null;
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
            'For each token provide: text, dictEntry (nominative sg for nouns, 1st sg pres act indic for verbs),',
            'shortDef (≤5 words), morph (object per schema above),',
            'vocabTier ("intro"|"beginning"|"intermediate"|"prose"|null), paradigmKey (or null).',
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
                if (!word.dictEntry) {
                    const bare = word.text.replace(PUNCT_RE_SHARED, '');
                    const ann = annotationMap[bare];
                    if (ann) {
                        word.dictEntry    = ann.dictEntry    || null;
                        word.shortDef     = ann.shortDef     || null;
                        word.morph         = ann.morph         || null;
                        word.vocabTier    = ann.vocabTier    || null;
                        word.paradigmKey  = ann.paradigmKey  || null;
                    }
                }
            }
        }
    }

    // ── Step 5: paradigm key assignment (deterministic fallback) ───────────
    for (const sent of sentences) {
        for (const word of sent.words) {
            if (!word.paradigmKey) word.paradigmKey = resolveParadigmKey(word);
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
                dictEntry: null, shortDef: null, morph: null,
                vocabTier: null, paradigmKey: null, engSentPos: null
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
            if (word.vocabTier && !seenVocab.has(word.dictEntry)) {
                seenVocab.add(word.dictEntry);
                vocabList.push({ dictEntry: word.dictEntry, shortDef: word.shortDef, vocabTier: word.vocabTier });
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
                if (word.vocabTier && word.dictEntry && !seenVocab.has(word.dictEntry)) {
                    seenVocab.add(word.dictEntry);
                    vocabList.push({ dictEntry: word.dictEntry, shortDef: word.shortDef, vocabTier: word.vocabTier });
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
                dictEntry: null, shortDef: null, morph: null,
                vocabTier: null, paradigmKey: null, engSentPos: null
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
                text: normalizedGreek.replace(/\s*$/, ' [short pause]'),
                model_id: 'eleven_v3',
                voice_settings: { stability: 0.8, similarity_boost: 0.7, style: 0.3 },
                language_code: 'el'
            })
        });
        if (!greekResp.ok) throw new HttpsError('internal', `ElevenLabs Greek TTS failed: ${greekResp.status}`);
        const greekData = await greekResp.json();

        const engResp = await fetch(TTS_URL, {
            method: 'POST',
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: sent.english.replace(/\s*$/, ' [short pause]'),
                model_id: 'eleven_v3',
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
// English TTS for overview or map description, with word-level alignment.
// part: 'overview' | 'map'  (default 'overview')
// If overview.taggedText exists, uses multi-voice text-to-dialogue endpoint.
// Otherwise falls back to single-voice text-to-speech.
// Saves: lesson.{part}.audioUrl, lesson.{part}.alignment
// ---------------------------------------------------------------------------

// Character voice IDs for the Greek course — defaults, overridden by courses/grade7-greek.voices
const DEFAULT_GREEK_VOICES = {
    narrator: '62eXAzXYsxMOUszcxeJ4',
    dolios:   'bTrXJpbeuC5KgriLhQeC',
    pallas:   'iukn3a1vSSNFmdi5NZS4',
    kleta:    'n7Wi4g1bhpw4Bs8HK5ph',
    phoebe:   'wJqPPQ618aTW29mptyoc',
    plato:    ''
};

async function getGreekVoices() {
    const snap = await db.collection('courses').doc('grade7-greek').get();
    const stored = snap.exists ? snap.data()?.voices : null;
    return stored ? { ...DEFAULT_GREEK_VOICES, ...stored } : DEFAULT_GREEK_VOICES;
}

function greekVoiceSettings(speaker) {
    const isKid = speaker !== 'narrator';
    return { stability: 0.8, similarity_boost: 0.75, style: 0.3, use_speaker_boost: isKid };
}

function parseTaggedText(taggedText) {
    const segments = [];
    const regex = /<(\w+)>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = regex.exec(taggedText)) !== null) {
        const text = m[2].trim();
        if (text) segments.push({ speaker: m[1].toLowerCase(), text });
    }
    return segments;
}

// Split text that exceeds ElevenLabs' 5000-char limit into roughly equal chunks.
// Each iteration targets the midpoint of the remaining text, then searches ±25%
// for a natural break: paragraph > sentence boundary > space.
function splitLongText(text, maxLen = 4800) {
    if (text.length <= maxLen) return [text];
    const chunks = [];
    let remaining = text;
    while (remaining.length > maxLen) {
        const numLeft = Math.ceil(remaining.length / maxLen);
        const target  = Math.ceil(remaining.length / numLeft);
        const slack   = Math.floor(target * 0.25);
        let splitAt   = -1;

        // Priority 1: paragraph break nearest to target
        for (let d = 0; d <= slack && splitAt < 0; d++) {
            for (const i of [target - d, target + d]) {
                if (i < 2 || i >= remaining.length) continue;
                if (remaining[i - 1] === '\n' && remaining[i - 2] === '\n') { splitAt = i; break; }
            }
        }
        // Priority 2: sentence boundary nearest to target
        for (let d = 0; d <= slack && splitAt < 0; d++) {
            for (const i of [target - d, target + d]) {
                if (i < 1 || i >= remaining.length) continue;
                if (/[.!?]/.test(remaining[i - 1]) && /\s/.test(remaining[i])) { splitAt = i; break; }
            }
        }
        // Fallback: nearest space
        if (splitAt < 0) {
            splitAt = remaining.lastIndexOf(' ', target + slack);
            if (splitAt < 0) splitAt = target;
        }

        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

// Expand any parsed segment whose text exceeds the TTS limit into multiple same-speaker chunks.
function expandSegments(segments) {
    return segments.flatMap(s => splitLongText(s.text).map(chunk => ({ speaker: s.speaker, text: chunk })));
}

// Stable filename based on content — prevents position-shift collisions when segments are reordered.
function segContentHash(speaker, text) {
    return createHash('sha1').update(`${speaker}::${text}`).digest('hex').slice(0, 12);
}

function buildAlignmentFromCharData(alignmentData) {
    const chars  = alignmentData.characters;
    const starts = alignmentData.character_start_times_seconds;
    const ends   = alignmentData.character_end_times_seconds;
    const fullText = chars.join('');
    const wordRe = /\S+/g;
    const alignment = [];
    let m;
    while ((m = wordRe.exec(fullText)) !== null) {
        const s = m.index;
        const e = s + m[0].length - 1;
        if (s < starts.length && e < ends.length && !/^\[.*\]$/.test(m[0])) {
            alignment.push({ word: m[0], start: starts[s], end: ends[e] });
        }
    }
    return alignment;
}



// ---------------------------------------------------------------------------
// regenerateOverviewSpeaker — re-generate audio for one speaker's segments.
// Re-parses overview.text so edits to that speaker's lines are picked up.
// Other speakers' segments are left unchanged.
// ---------------------------------------------------------------------------

exports.regenerateOverviewSpeaker = onCall(
    { secrets: ['ELEVENLABS_API_KEY'], timeoutSeconds: 300 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can regenerate audio.');
        }
        const { lessonId, speaker } = request.data;
        if (!lessonId) throw new HttpsError('invalid-argument', 'lessonId is required.');
        if (!speaker)  throw new HttpsError('invalid-argument', 'speaker is required.');

        const lessonSnap = await db.collection('lessons').doc(lessonId).get();
        if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
        const lesson = lessonSnap.data();

        const existing = lesson.overview?.segments;
        if (!existing?.length) throw new HttpsError('failed-precondition', 'No segments found. Generate all audio first.');

        const rawText = lesson.overview?.text ?? '';
        const parsed  = expandSegments(parseTaggedText(rawText));
        if (!parsed.length) throw new HttpsError('failed-precondition', 'overview.text has no voice tags.');
        if (parsed.length !== existing.length) throw new HttpsError('failed-precondition',
            `Segment count mismatch (stored ${existing.length}, parsed ${parsed.length}). Regenerate all audio first.`);

        const elevenKey = process.env.ELEVENLABS_API_KEY;
        const voices    = await getGreekVoices();
        const voiceId   = voices[speaker] ?? voices.narrator;
        const updated   = [...existing];
        let   count     = 0;

        for (let i = 0; i < parsed.length; i++) {
            if (parsed[i].speaker !== speaker) continue;

            const text = parsed[i].text.replace(/\s*$/, ' [short pause]');
            const resp = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
                {
                    method: 'POST',
                    headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text,
                        model_id: 'eleven_v3',
                        voice_settings: greekVoiceSettings(speaker),
                        language_code: 'en'
                    })
                }
            );
            if (!resp.ok) {
                const err = await resp.text();
                throw new HttpsError('internal', `ElevenLabs TTS failed for segment ${i}: ${resp.status} ${err}`);
            }
            const data = await resp.json();
            const buf  = Buffer.from(data.audio_base64, 'base64');

            const segPath = `greek/lessons/${lessonId}/overview_seg_${segContentHash(speaker, text)}_${speaker}.mp3`;
            const segFile = getStorage().bucket().file(segPath);
            await segFile.save(buf, { contentType: 'audio/mpeg', metadata: { cacheControl: 'no-cache, no-store' } });
            await segFile.makePublic();
            const segUrl = `https://storage.googleapis.com/${getStorage().bucket().name}/${segPath}?v=${Date.now()}`;

            updated[i] = {
                ...updated[i],
                text,
                audioUrl:  segUrl,
                alignment: buildAlignmentFromCharData(data.alignment)
            };
            count++;
        }

        await db.collection('lessons').doc(lessonId).update({
            'overview.segments': updated,
            updatedAt: Timestamp.now()
        });

        return { lessonId, speaker, regenerated: count };
    }
);

// ---------------------------------------------------------------------------
// regenerateOverviewSegment — re-generate audio for a single segment by index.
// ---------------------------------------------------------------------------

exports.regenerateOverviewSegment = onCall(
    { secrets: ['ELEVENLABS_API_KEY'], timeoutSeconds: 120 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can regenerate audio.');
        }
        const { lessonId, segmentIndex } = request.data;
        if (!lessonId)           throw new HttpsError('invalid-argument', 'lessonId is required.');
        if (segmentIndex == null) throw new HttpsError('invalid-argument', 'segmentIndex is required.');

        const [lessonSnap, voices] = await Promise.all([
            db.collection('lessons').doc(lessonId).get(),
            getGreekVoices()
        ]);
        if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
        const lesson = lessonSnap.data();

        const rawText = lesson.overview?.text ?? '';
        const parsed  = expandSegments(parseTaggedText(rawText));
        if (!parsed.length) throw new HttpsError('failed-precondition', 'No voice tags found in overview.text.');
        if (segmentIndex >= parsed.length) throw new HttpsError('invalid-argument', `segmentIndex ${segmentIndex} out of range.`);

        // Build merged array using content matching so gaps before this index don't corrupt positions.
        const existingCache = {};
        for (const s of (lesson.overview?.segments ?? [])) {
            if (s.text && s.audioUrl) existingCache[`${s.speaker}::${s.text}`] = s;
        }
        const merged = parsed.map(seg => {
            const cached = existingCache[`${seg.speaker}::${seg.text}`];
            return cached ?? { speaker: seg.speaker, text: seg.text, audioUrl: null, alignment: null };
        });

        const seg       = parsed[segmentIndex];
        const voiceId   = voices[seg.speaker] ?? voices.narrator;
        const elevenKey = process.env.ELEVENLABS_API_KEY;

        const resp = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
            { method: 'POST', headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: seg.text.replace(/\s*$/, ' [short pause]'), model_id: 'eleven_v3',
                  voice_settings: greekVoiceSettings(seg.speaker), language_code: 'en' }) }
        );
        if (!resp.ok) {
            const err = await resp.text();
            throw new HttpsError('internal', `ElevenLabs TTS failed: ${resp.status} ${err}`);
        }
        const data = await resp.json();
        const buf  = Buffer.from(data.audio_base64, 'base64');

        const segPath = `greek/lessons/${lessonId}/overview_seg_${segContentHash(seg.speaker, seg.text)}_${seg.speaker}.mp3`;
        const segFile = getStorage().bucket().file(segPath);
        await segFile.save(buf, { contentType: 'audio/mpeg', metadata: { cacheControl: 'no-cache, no-store' } });
        await segFile.makePublic();
        const segUrl = `https://storage.googleapis.com/${getStorage().bucket().name}/${segPath}?v=${Date.now()}`;

        merged[segmentIndex] = { speaker: seg.speaker, text: seg.text, audioUrl: segUrl, alignment: buildAlignmentFromCharData(data.alignment) };

        await db.collection('lessons').doc(lessonId).update({
            'overview.segments': merged,
            updatedAt: Timestamp.now()
        });

        return { lessonId, segmentIndex, speaker: seg.speaker, audioUrl: segUrl };
    }
);

exports.generateOverviewAudio = onCall(
    { secrets: ['ELEVENLABS_API_KEY'], timeoutSeconds: 540 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can generate audio.');
        }
        const { lessonId, part = 'overview' } = request.data;
        if (!lessonId) throw new HttpsError('invalid-argument', 'lessonId is required.');
        if (!['overview', 'map'].includes(part)) throw new HttpsError('invalid-argument', 'part must be overview or map.');

        const [lessonSnap, voices] = await Promise.all([
            db.collection('lessons').doc(lessonId).get(),
            getGreekVoices()
        ]);
        if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
        const lesson = lessonSnap.data();
        const partData = lesson[part] ?? {};
        const elevenKey = process.env.ELEVENLABS_API_KEY;

        const rawText = part === 'map' ? (partData.description ?? '') : (partData.text ?? '');
        if (!rawText.trim()) throw new HttpsError('invalid-argument', `lessons/${lessonId}.${part} has no text.`);

        const hasVoiceTags = part === 'overview' && /<\w+>[\s\S]*?<\/\w+>/i.test(rawText);

        let audioBase64, alignment;

        if (hasVoiceTags) {
            // ── Multi-voice: one TTS call per segment, stored independently ──────
            const segments = expandSegments(parseTaggedText(rawText));
            if (!segments.length) throw new HttpsError('invalid-argument', 'No parseable voice tags found in overview.text.');

            // Build exact-match cache from existing stored segments (keyed by speaker::text).
            // A segment whose text or speaker changed gets re-voiced; unchanged segments are reused.
            const existingCache = {};
            for (const s of (lesson.overview?.segments ?? [])) {
                if (s.text && s.audioUrl && s.audioUrl.includes(segContentHash(s.speaker, s.text)))
                    existingCache[`${s.speaker}::${s.text}`] = s;
            }

            const segmentMeta = [];
            let generated = 0, reused = 0;

            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const cacheKey = `${seg.speaker}::${seg.text}`;

                if (existingCache[cacheKey]) {
                    const cached = existingCache[cacheKey];
                    segmentMeta.push({ speaker: seg.speaker, text: seg.text, audioUrl: cached.audioUrl, alignment: cached.alignment });
                    reused++;
                    continue;
                }

                const voiceId = voices[seg.speaker] ?? voices.narrator;
                const resp = await fetch(
                    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
                    { method: 'POST', headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: seg.text.replace(/\s*$/, ' [short pause]'), model_id: 'eleven_v3',
                          voice_settings: greekVoiceSettings(seg.speaker), language_code: 'en' }) }
                );
                if (!resp.ok) {
                    const err = await resp.text();
                    throw new HttpsError('internal', `ElevenLabs TTS failed for segment ${i} (${seg.speaker}): ${resp.status} ${err}`);
                }
                const data = await resp.json();
                const buf  = Buffer.from(data.audio_base64, 'base64');

                const segPath = `greek/lessons/${lessonId}/overview_seg_${segContentHash(seg.speaker, seg.text)}_${seg.speaker}.mp3`;
                const segFile = getStorage().bucket().file(segPath);
                await segFile.save(buf, { contentType: 'audio/mpeg', metadata: { cacheControl: 'no-cache, no-store' } });
                await segFile.makePublic();
                const segUrl = `https://storage.googleapis.com/${getStorage().bucket().name}/${segPath}?v=${Date.now()}`;

                segmentMeta.push({ speaker: seg.speaker, text: seg.text, audioUrl: segUrl, alignment: buildAlignmentFromCharData(data.alignment) });
                generated++;
            }

            await db.collection('lessons').doc(lessonId).update({
                'overview.segments': segmentMeta,
                'overview.audioUrl':  FieldValue.delete(),
                'overview.alignment': FieldValue.delete(),
                updatedAt: Timestamp.now()
            });

            // Delete orphaned segment audio files no longer referenced by any segment.
            const activePaths = new Set(segmentMeta.map(s => {
                const m = s.audioUrl.split('?')[0].match(/storage\.googleapis\.com\/[^/]+\/(.+)/);
                return m ? m[1] : null;
            }).filter(Boolean));
            const bucket = getStorage().bucket();
            const [files] = await bucket.getFiles({ prefix: `greek/lessons/${lessonId}/overview_seg_` });
            await Promise.all(files
                .filter(f => !activePaths.has(f.name))
                .map(f => f.delete())
            );

            return { lessonId, part, segmentCount: segmentMeta.length, generated, reused };

        } else {
            // ── Single-voice path (map, or untagged overview) ─────────────────
            const VOICE_ID = voices.narrator;
            const resp = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`,
                {
                    method: 'POST',
                    headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: rawText,
                        model_id: 'eleven_v3',
                        voice_settings: greekVoiceSettings('narrator'),
                        language_code: 'en'
                    })
                }
            );
            if (!resp.ok) throw new HttpsError('internal', `ElevenLabs TTS failed: ${resp.status}`);
            const data = await resp.json();
            audioBase64 = data.audio_base64;
            alignment   = buildAlignmentFromCharData(data.alignment);
        }

        const audioUrl = (await uploadAudio(lessonId, part, 'en', audioBase64)) + `?v=${Date.now()}`;

        await db.collection('lessons').doc(lessonId).update({
            [`${part}.audioUrl`]:  audioUrl,
            [`${part}.alignment`]: alignment,
            updatedAt:             Timestamp.now()
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

    const delta = lessonDoc.storyBibleDelta;
    const introVocab = (lessonDoc.sentences ?? [])
        .flatMap(s => s.words ?? [])
        .filter(w => w.dictEntry && (w.vocabTier === 'intro' || ngeTierByDictEntry[w.dictEntry] === 'intro'))
        .reduce((acc, w) => {
            if (!acc.find(x => x.dictEntry === w.dictEntry))
                acc.push({ dictEntry: w.dictEntry, vocabTier: 'intro' });
            return acc;
        }, []);

    const bibleWrites = [
        db.collection('lessons').doc(lessonId).update({ status: 'accepted', updatedAt: Timestamp.now() })
    ];

    if (delta) {
        mergeStoryBible(bible, delta, introVocab);
    } else {
        // Story 2.0 chapter — no narrative delta, just record vocab
        for (const word of introVocab) {
            if (!bible.vocab.introduced[word.dictEntry]) {
                bible.vocab.introduced[word.dictEntry] = { chapter: lessonDoc.chapter, tier: 'intro' };
            }
        }
    }
    bibleWrites.push(db.collection('story_bible').doc(storyBibleId).set(bible));

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
        const introVocabScan = (lesson.sentences ?? [])
            .flatMap(s => s.words ?? [])
            .filter(w => w.dictEntry && (w.vocabTier === 'intro' || ngeTierByDictEntry[w.dictEntry] === 'intro'))
            .reduce((acc, w) => {
                if (!acc.find(x => x.dictEntry === w.dictEntry))
                    acc.push({ dictEntry: w.dictEntry, vocabTier: 'intro' });
                return acc;
            }, []);

        const delta = lesson.storyBibleDelta;
        if (delta) {
            mergeStoryBible(bible, delta, introVocabScan);
        } else {
            // Story 2.0 chapter — no narrative delta, just record vocab
            for (const word of introVocabScan) {
                if (!bible.vocab.introduced[word.dictEntry]) {
                    bible.vocab.introduced[word.dictEntry] = { chapter: lesson.chapter, tier: 'intro' };
                }
            }
        }
    }

    await db.collection('story_bible').doc(storyBibleId).set(bible);

    return { chaptersReplayed: lessons.length };
});

/**
 * glossGreekWords — two-step pipeline for unrecognized Greek surface forms.
 *
 * Step 1 — Morph-tag: identify dictEntry, morph, shortDef for each token.
 * Step 2 — Generate forms: for each unique (dictEntry, tense/mood/voice group),
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
    "dictEntry": "<canonical headword: nom sg for nouns/adj, 1sg pres act indic for verbs, full polytonic diacritics>",
    "shortDef": "<3–5 word English definition>",
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

        // Group tagged tokens by (dictEntry, paradigm_group)
        // paradigm_group = tense.mood.voice for verbs, 'decl' for everything else
        const groups = new Map(); // key → { dictEntry, shortDef, morph, paradigm_group }
        const skipped = [];

        for (const item of tagged) {
            const { form, dictEntry, shortDef, morph } = item;
            if (!dictEntry || !morph) { skipped.push(form); continue; }
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

            const key = `${dictEntry}|${paradigmGroup}`;
            if (!groups.has(key)) {
                groups.set(key, { dictEntry, shortDef, morph, paradigmGroup });
            }
        }

        // ── Step 2: Generate forms for each group ───────────────────────────
        function formPromptFor(dictEntry, morph, paradigmGroup) {
            const { pos, tense, mood, voice, gender, number: num } = morph;

            if (pos === 'verb') {
                const t = { pres:'Present', imperf:'Imperfect', aor:'Aorist', fut:'Future', perf:'Perfect' }[tense] ?? tense;
                const mo = paradigmGroup.includes('indic') ? 'Indicative'
                         : paradigmGroup.includes('subj')  ? 'Subjunctive'
                         : paradigmGroup.includes('opt')   ? 'Optative'
                         : 'Indicative';
                const v = { act:'Active', mid:'Middle', pass:'Passive', mp:'Middle/Passive' }[voice] ?? voice;
                return `Return ONLY a JSON array of form objects — no prose, no fences.
Generate exactly 7 forms for the Ancient Greek verb: ${dictEntry}
Forms: ${t} ${mo} ${v} (1sg 2sg 3sg 1pl 2pl 3pl) + ${t} ${v} infinitive.
Use correct Greek diacritics (recessive accent on finite forms).
Finite: {"form":"<Greek>","morph":{"pos":"verb","tense":"${tense}","mood":"indic","voice":"${voice}","person":"<1|2|3>","number":"<sg|pl>"}}
Infinitive: {"form":"<Greek>","morph":{"pos":"verb","tense":"${tense}","mood":"inf","voice":"${voice}"}}`;
            }

            if (pos === 'noun') {
                const g = { masc:'masculine', fem:'feminine', neut:'neuter' }[gender] ?? gender;
                return `Return ONLY a JSON array of form objects — no prose, no fences.
Generate all forms for the Ancient Greek noun: ${dictEntry} (${g})
Include the standard paradigm (nom/gen/dat/acc/voc × sg/pl). Also include any attested alternate forms (e.g. irregular genitives, contracted forms, place-name variants, poetic forms) — mark each alternate with "alt":true.
Schema: {"form":"<Greek>","morph":{"pos":"noun","gender":"${gender}","number":"<sg|pl>","case":"<nom|gen|dat|acc|voc>"},"alt":<true|false>}`;
            }

            if (pos === 'adj') {
                return `Return ONLY a JSON array of form objects — no prose, no fences.
Generate exactly 30 forms for the Ancient Greek adjective: ${dictEntry}
Forms: nom/gen/dat/acc/voc × sg/pl × masc/fem/neut. Use correct diacritics.
Schema: {"form":"<Greek>","morph":{"pos":"adj","gender":"<masc|fem|neut>","number":"<sg|pl>","case":"<nom|gen|dat|acc|voc>"}}`;
            }

            if (pos === 'pron') {
                return `Return ONLY a JSON array of form objects — no prose, no fences.
Generate all standard inflected forms for: ${dictEntry} (pronoun). Use correct diacritics.
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
            if (pos === 'noun') return null; // variable: standard 10 + any alternates
            if (pos === 'adj')  return 30;
            if (pos === 'art')  return 24;
            return null; // pron: variable
        }

        // ── Resolve paradigmKey from morph (for storage) ───────────────────
        function resolveParadigmKeyFromMorph(morph, dictEntry) {
            const { pos, tense, mood, voice, gender } = morph;
            if (pos === 'art') return 'definite_article';
            if (pos === 'adj') return '2_1_2_adjective';
            if (pos === 'verb') {
                if (tense !== 'pres') return null; // non-present: data-driven, no static paradigm needed
                if (dictEntry === 'εἰμί') return 'eimi_present_indicative_active';
                if (dictEntry?.endsWith('έω')) return 'epsilon_contract_present_indicative_active';
                if (dictEntry?.endsWith('άω')) return 'alpha_contract_present_indicative_active';
                return 'omega_verb_present_indicative_active';
            }
            if (pos === 'noun') {
                if (gender === 'masc') return '2nd_declension_masculine';
                if (gender === 'neut') return '2nd_declension_neuter';
                return null; // fem: need more info
            }
            if (pos === 'pron') {
                if (dictEntry === 'ἐγώ') return 'pronoun_personal_1st';
                if (dictEntry === 'σύ')  return 'pronoun_personal_2nd';
                if (dictEntry?.startsWith('αὐτ')) return 'pronoun_autos';
                if (dictEntry?.startsWith('ὅς') || dictEntry?.startsWith('ὅ')) return 'pronoun_relative_hos';
            }
            return null;
        }

        const formMap = {};
        const added   = {};

        for (const [, group] of groups) {
            const { dictEntry, shortDef, morph, paradigmGroup } = group;
            const prompt = formPromptFor(dictEntry, morph, paradigmGroup);
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
                console.warn(`Form generation failed for ${dictEntry}: ${e.message}`);
                continue;
            }

            // Validate form count (warn only — don't discard partial results)
            const exp = expectedCount(morph.pos);
            if (exp !== null && forms.length !== exp) {
                console.warn(`${dictEntry}: expected ${exp} forms, got ${forms.length}`);
            }

            const pkey = resolveParadigmKeyFromMorph(morph, dictEntry);

            for (const { form, morph: formMorph, alt } of forms) {
                if (!form || !formMorph) continue;
                formMap[form] = {
                    dictEntry,
                    shortDef: shortDef ?? '',
                    paradigmKey: alt ? null : pkey,
                    morph: formMorph,
                    vocabTier: null,
                    ...(alt ? { alt: true } : {})
                };
            }

            added[dictEntry] = { dictEntry, shortDef: shortDef ?? '', vocabTier: null };
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

exports.generateOverviewVideo = onCall(
    { secrets: ['HEYGEN_API_KEY'], timeoutSeconds: 600 },
    async (request) => {
        if (request.auth?.token?.role !== 'dev') {
            throw new HttpsError('permission-denied', 'Only dev can generate avatar videos.');
        }

        const {
            lessonId,
            avatarId = '0435024d17b94649a452e67c9affbf68'
        } = request.data;
        if (!lessonId) throw new HttpsError('invalid-argument', 'lessonId is required.');

        const lessonSnap = await db.collection('lessons').doc(lessonId).get();
        if (!lessonSnap.exists) throw new HttpsError('not-found', `lessons/${lessonId} not found.`);
        const lesson = lessonSnap.data();

        const audioUrl = lesson.overview?.audioUrl;
        if (!audioUrl) throw new HttpsError('failed-precondition', 'No overview audio found — generate audio first.');

        const alignment = lesson.overview?.alignment ?? [];
        const videoStartOffset = alignment[0]?.start ?? 0;

        const heygenKey = process.env.HEYGEN_API_KEY;

        // Pass the public audio URL directly — avoids the multipart upload entirely
        const generateResp = await fetch('https://api.heygen.com/v2/video/generate', {
            method: 'POST',
            headers: { 'X-Api-Key': heygenKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_inputs: [{
                    character: {
                        type: 'avatar',
                        avatar_id: avatarId,
                        avatar_style: 'normal'
                    },
                    voice: {
                        type: 'audio',
                        audio_url: audioUrl
                    }
                }],
                dimension: { width: 1280, height: 720 }
            })
        });
        if (!generateResp.ok) {
            const errText = await generateResp.text();
            throw new HttpsError('internal', `HeyGen generate failed ${generateResp.status}: ${errText}`);
        }
        const generateData = await generateResp.json();
        const videoId = generateData.data?.video_id;
        if (!videoId) throw new HttpsError('internal', `HeyGen generate returned no video_id: ${JSON.stringify(generateData)}`);

        // Step 4 — Poll for completion (10s intervals, max 9 min)
        let videoUrl = null;
        for (let i = 0; i < 54; i++) {
            await new Promise(r => setTimeout(r, 10000));
            const statusResp = await fetch(
                `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
                { headers: { 'X-Api-Key': heygenKey } }
            );
            if (!statusResp.ok) continue;
            const statusData = await statusResp.json();
            const status = statusData.data?.status;
            if (status === 'completed') { videoUrl = statusData.data.video_url; break; }
            if (status === 'failed') throw new HttpsError('internal', `HeyGen video failed: ${JSON.stringify(statusData.data)}`);
        }
        if (!videoUrl) throw new HttpsError('deadline-exceeded', 'HeyGen video timed out after 9 minutes.');

        // Step 5 — Save to Firestore
        await db.collection('lessons').doc(lessonId).update({
            'overview.videoUrl':         videoUrl,
            'overview.videoStartOffset': videoStartOffset,
            updatedAt:                   Timestamp.now()
        });

        return { lessonId, videoUrl, videoStartOffset };
    }
);

<script>
    import { onMount, onDestroy, getContext } from 'svelte';
    import { get } from 'svelte/store';
    import { page } from '$app/stores';
    import { session } from '$lib/stores/session';
    import { pickVariant } from '$lib/utils/variantPool.js';
    import { collection, getDocs } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';
    import { gradeQuestion, formatCorrectAnswer } from '$lib/utils/grading.js';
    import {
        selectNextStandard,
        updateAfterAnswer,
        buildInitialStudentState,
        buildInitialStandardState
    } from '$lib/utils/mastery.js';
    import {
        loadStudentState,
        saveStudentState,
        saveStandardState,
        recordVariantSeen,
        subscribeQuizAssignments,
        writeSessionLog,
        loadTodaysSessionTotal
    } from '$lib/utils/studentStore.js';
    import {
        getOrCreateQuizProgress,
        recordQuizAnswer,
        completeQuizProgressIfInProgress
    } from '$lib/utils/quizStore.js';
    import { fillTemplate, extractParams, loadFeedbackTemplate, findAudioUrl, findAudioSegment } from '$lib/utils/feedback.js';
    import { createAudioSequencePlayer } from '$lib/utils/audioSequencePlayer.js';
    import { instructionTextForQuestion } from '$lib/utils/staticInstructions.js';
    import { pickQuestion, byItemId, ITEM_STANDARD } from '$lib/utils/questionBank.js';

    import AudioText from '$lib/components/questions/AudioText.svelte';
    import MultipleChoice from '$lib/components/questions/MultipleChoice.svelte';
    import MultiPart from '$lib/components/questions/MultiPart.svelte';
    import ShortAnswer from '$lib/components/questions/ShortAnswer.svelte';
    import MultipleSelect from '$lib/components/questions/MultipleSelect.svelte';
    import NumberLinePlot from '$lib/components/questions/NumberLinePlot.svelte';
    import InlineChoice from '$lib/components/questions/InlineChoice.svelte';
    import TrueFalseTable from '$lib/components/questions/TrueFalseTable.svelte';
    import ProtractorDragDrop from '$lib/components/questions/ProtractorDragDrop.svelte';
    import DragDropInequality from '$lib/components/questions/DragDropInequality.svelte';
    import FractionModel from '$lib/components/questions/FractionModel.svelte';
    import DragDropMatch from '$lib/components/questions/DragDropMatch.svelte';
    import DragDropLinePlot from '$lib/components/questions/DragDropLinePlot.svelte';
    import CategorySort from '$lib/components/questions/CategorySort.svelte';
    import ReportBugButton from '$lib/components/ReportBugButton.svelte';

    // ── Context ────────────────────────────────────────────────────────────────
    const ctx = getContext('student');
    const standardStates = ctx.standardStates; // writable store

    // Local mirror of the store — updates reactively via subscription
    let allStandardStates = {};
    const unsubStates = standardStates.subscribe(s => { allStandardStates = s; });

    // ── State ──────────────────────────────────────────────────────────────────
    let loading = true;
    let error = null;

    let uid;
    let classDoc;
    let isTester = false;
    let allStandardsInfo = {};

    // Persisted state
    let studentState = null;

    // Current question
    let standardId = null;
    let standardInfo = null;
    let baseQuestion = null;
    let question = null;
    let answer = null;

    // Hint flow
    let attempt = 0;
    let assisted = false;
    let feedbackTemplate = null;
    let currentTip = null;
    let feedback = null;
    let revealed = false;
    let revealedAnswer = null;
    let multiPartWaiting = false; // last part answered wrong/revealed — wait for student to click Next

    // Pregenerated audio (scripts/pregenerate-audio.mjs) for the currently
    // shown tip/reveal text, played through the same toggling, word-highlighted
    // player as the question itself (createAudioSequencePlayer + AudioText).
    // Tip and reveal are never shown at once (currentTip is nulled the same
    // tick revealed flips true — see handleSubmit), so one player covers both.
    function playAudio(url) {
        if (url) new Audio(url).play();
    }
    let revealText = null;
    const feedbackPlayer = createAudioSequencePlayer();
    let feedbackSegments = []; // [{fieldKey: 'tip'|'reveal', text, audioUrl, alignment}]
    $: feedbackAlignment = feedbackSegments[0]?.alignment ?? null;
    $: feedbackAudioUrl = feedbackSegments[0]?.audioUrl ?? null;

    async function loadFeedbackAudio(kind, text) {
        if (!text) {
            feedbackSegments = [];
            feedbackPlayer.setSegments([]);
            return;
        }
        const seg = await findAudioSegment(text);
        feedbackSegments = [{ fieldKey: kind, text, audioUrl: seg?.url ?? null, alignment: seg?.alignment ?? null }];
        feedbackPlayer.setSegments(feedbackSegments);
    }
    $: loadFeedbackAudio('tip', currentTip);
    $: revealText = (revealed && feedbackTemplate?.reveal) ? fillTemplate(feedbackTemplate.reveal, extractParams(question)) : null;
    $: loadFeedbackAudio('reveal', revealText);

    // ── Dev language-audit panel ──────────────────────────────────────────────
    // Dev-only: show every tip + the reveal at once, up front, regardless of
    // attempt/answer state — this is a read-through pass over the language
    // itself. Single-part items get one tip1/tip2/reveal; multi_part items
    // get the same three per part, since each part has its own template.
    $: devAuditMode = $session.role === 'dev';
    $: auditParams = question ? extractParams(question) : {};
    $: isMultiPart = question?.answer_type === 'multi_part';

    $: auditTip1   = devAuditMode && !isMultiPart && feedbackTemplate?.tip1   ? fillTemplate(feedbackTemplate.tip1, auditParams)   : null;
    $: auditTip2   = devAuditMode && !isMultiPart && feedbackTemplate?.tip2   ? fillTemplate(feedbackTemplate.tip2, auditParams)   : null;
    $: auditReveal = devAuditMode && !isMultiPart && feedbackTemplate?.reveal ? fillTemplate(feedbackTemplate.reveal, auditParams) : null;
    let auditTip1AudioUrl = null;
    let auditTip2AudioUrl = null;
    let auditRevealAudioUrl = null;
    $: findAudioUrl(auditTip1).then((url) => auditTip1AudioUrl = url);
    $: findAudioUrl(auditTip2).then((url) => auditTip2AudioUrl = url);
    $: findAudioUrl(auditReveal).then((url) => auditRevealAudioUrl = url);

    $: auditParts = (devAuditMode && isMultiPart && Array.isArray(question?.parts))
        ? question.parts.map((part) => {
            const partTemplate = feedbackTemplate?.parts?.[part.label];
            return {
                label: part.label,
                text: part.question_text ?? part.text ?? null,
                math_expression: part.math_expression ?? null,
                tip1: partTemplate?.tip1 ? fillTemplate(partTemplate.tip1, auditParams) : null,
                tip2: partTemplate?.tip2 ? fillTemplate(partTemplate.tip2, auditParams) : null,
                reveal: partTemplate?.reveal ? fillTemplate(partTemplate.reveal, auditParams) : null,
            };
        })
        : [];
    let auditPartAudioUrls = {}; // { [label]: { tip1, tip2, reveal } }
    async function loadAuditPartAudio(parts) {
        const entries = await Promise.all(parts.map(async (p) => {
            const [tip1, tip2, reveal] = await Promise.all(
                [p.tip1, p.tip2, p.reveal].map((t) => findAudioUrl(t))
            );
            return [p.label, { tip1, tip2, reveal }];
        }));
        auditPartAudioUrls = Object.fromEntries(entries);
    }
    $: if (auditParts.length) {
        loadAuditPartAudio(auditParts);
    } else {
        auditPartAudioUrls = {};
    }

    // Read-the-question audio: one play/pause button plays stimulus_intro →
    // math_expression → question_text back to back, with the currently-
    // spoken word highlighted in place (AudioText.svelte). Only wired for
    // single-part questions — multi_part has its own general-setup + per-part
    // players in MultiPart.svelte.
    const questionPlayer = createAudioSequencePlayer();
    let questionSegments = [];   // [{ fieldKey, text, audioUrl, alignment }]
    let audioByField = {};       // { [fieldKey]: { alignment } } — lookup for AudioText props
    $: activeField = $questionPlayer.activeFieldKey;
    $: playerCurrentTime = $questionPlayer.currentTime;
    $: hasQuestionAudio = questionSegments.some((s) => s.audioUrl);
    $: questionAudioProps = Object.fromEntries(
        questionSegments.map((s) => [s.fieldKey, { alignment: s.alignment, active: activeField === s.fieldKey }])
    );

    async function loadQuestionAudio(q) {
        if (!q || q.answer_type === 'multi_part') {
            questionSegments = [];
            audioByField = {};
            questionPlayer.setSegments([]);
            return;
        }
        const fields = [
            ['stimulus_intro', q.stimulus_intro],
            ...(Array.isArray(q.stimulus_list) ? q.stimulus_list.map((item, i) => [`stimulus_list_${i}`, item]) : []),
            ['math_expression', q.math_expression],
            ['question_text', q.question_text],
            ['instruction', q.instruction],
            ['instruction2', q.instruction2],
            ['answer_instruction', instructionTextForQuestion(q)]
        ].filter(([, text]) => !!text);

        const segs = await Promise.all(fields.map(async ([fieldKey, text]) => {
            const seg = await findAudioSegment(text);
            return { fieldKey, text, audioUrl: seg?.url ?? null, alignment: seg?.alignment ?? null };
        }));
        questionSegments = segs;
        audioByField = Object.fromEntries(segs.map((s) => [s.fieldKey, s]));
        questionPlayer.setSegments(segs);
    }

    // MC option elimination
    let activeOptions = null;

    // Bumped on every new question to force the answer component to remount
    // — these components keep their own internal selection state (e.g.
    // MultipleChoice's `selected`), which otherwise survives prop updates
    // and leaks into the next question.
    let questionKey = 0;

    // Quiz interrupt — a teacher-assigned quiz locks the student in until
    // finished or the teacher ends it. Entirely separate from mastery.
    let quizActive = false;
    let quizAssignment = null;   // { id, quizName, gradingMode, questions, ... }
    let quizProgress = null;     // { id, currentIndex, answers, status, ... }
    let quizIndex = 0;
    let switchingQuestion = false;

    let unsubscribeQuizAssignments = null;

    // ── Daily timer (optional, per-class) ────────────────────────────────────
    // Ported from student/fundamentals' session timer: counts down, then
    // counts up as overage past the limit; pauses after 10s of no activity;
    // banks active time per standard. Flushed periodically (not just once at
    // page exit — beforeunload doesn't reliably fire on mobile Safari, a
    // crash, or a killed tab, which used to lose an entire visit's time) to
    // one stable per-visit doc, re-written with the full accumulated
    // snapshot each time via writeSessionLog's sessionId/merge support.
    // Entirely separate from the quiz interrupt above — paused while a quiz
    // is active (that's tracked via quizProgress instead, not the daily
    // practice total).
    let dailyTimerEnabled = false;
    let dailyTimerSeconds = 600;
    let standardTimes = {};        // { [standardId]: { practiceSec, masterySec } } — masterySec always 0 here, kept for shape parity with writeSessionLog/Practice Log
    let sessionActive = false;
    let stintStartMs = null;
    let stintStandardId = null;
    let isIdle = false;
    let lastActivityMs = Date.now();
    let sessionDisplayInterval = null;
    let sessionDisplaySec = 0;
    let baseTodaySec = 0;   // active seconds already logged today, from earlier visits
    let questionsAttemptedToday = 0;
    let correctUnassistedToday = 0;
    let correctAssistedToday = 0;
    let sessionDocId = null;       // reused across every flush this visit, once assigned
    let sessionLogFirstWrite = true;
    let lastFlushMs = 0;

    // Counts toward the Practice Log regardless of whether the question was
    // answered during normal practice or a quiz assignment (help-mode or strict).
    function recordAttempt(correct, assisted) {
        questionsAttemptedToday++;
        if (correct) {
            if (assisted) correctAssistedToday++;
            else correctUnassistedToday++;
        }
    }

    function onActivity() {
        lastActivityMs = Date.now();
        if (isIdle) resumeStint();
    }

    function startStint() {
        if (!dailyTimerEnabled || quizActive) return;
        stintStartMs = Date.now();
        stintStandardId = standardId;
        sessionActive = true;
        isIdle = false;
    }

    function pauseStint(markIdle = false) {
        if (stintStartMs && stintStandardId) {
            const elapsed = (Date.now() - stintStartMs) / 1000;
            if (!standardTimes[stintStandardId]) {
                standardTimes[stintStandardId] = { practiceSec: 0, masterySec: 0 };
            }
            standardTimes[stintStandardId].practiceSec += elapsed;
        }
        stintStartMs = null;
        isIdle = markIdle;
    }

    function resumeStint() {
        startStint();
    }

    function formatTime(s) {
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    async function saveDailySession() {
        const totalSec = Object.values(standardTimes)
            .reduce((s, t) => s + (t.practiceSec ?? 0) + (t.masterySec ?? 0), 0);
        if (!sessionActive || totalSec < 5) return;
        const roundedTimes = {};
        for (const [id, t] of Object.entries(standardTimes)) {
            roundedTimes[id] = { practiceSec: Math.round(t.practiceSec), masterySec: Math.round(t.masterySec) };
        }
        const date = new Date().toISOString().slice(0, 10);
        try {
            sessionDocId = await writeSessionLog(classDoc.classId, uid, {
                date,
                standardTimes: roundedTimes,
                sessionTimeLimit: dailyTimerSeconds,
                questionsAttempted: questionsAttemptedToday,
                correctUnassisted: correctUnassistedToday,
                correctAssisted: correctAssistedToday
            }, { sessionId: sessionDocId, isFirstWrite: sessionLogFirstWrite });
            sessionLogFirstWrite = false;
        } catch (e) {
            console.error('Error saving daily session log:', e);
        }
    }

    function handleBeforeUnload() {
        pauseStint();
        saveDailySession();
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    onMount(async () => {
        try {
            uid      = ctx.uid;
            classDoc = ctx.classDoc;
            isTester = ctx.isTester;
            allStandardsInfo = Object.fromEntries(ctx.standards.map(s => [s.id, s]));
            dailyTimerEnabled = classDoc?.dailyTimerEnabled ?? false;
            dailyTimerSeconds = classDoc?.dailyTimerSeconds ?? 600;

            studentState = await loadStudentState(uid);
            if (!studentState) {
                studentState = buildInitialStudentState(classDoc.classId, classDoc.standardProgression);
                await saveStudentState(uid, studentState);
            }

            unsubscribeQuizAssignments = subscribeQuizAssignments(
                uid,
                classDoc.classId,
                classDoc.schoolId,
                (assignment) => { onQuizActive(assignment); },
                () => { if (quizActive) exitQuizToMastery(); }
            );

            if (isDevAuditNav()) {
                await loadAuditItemIds();
                auditIndex = 0;
                await loadAuditQuestion(auditIndex);
            } else {
                await loadNextQuestion();
            }

            if (dailyTimerEnabled) {
                const today = new Date().toISOString().slice(0, 10);
                try {
                    const priorToday = await loadTodaysSessionTotal(classDoc.classId, uid, today);
                    baseTodaySec = priorToday.totalSec;
                } catch (e) {
                    console.error('Error loading today\'s prior session time:', e);
                }

                startStint();
                sessionDisplayInterval = setInterval(() => {
                    if (Date.now() - lastActivityMs > 10_000 && !isIdle) pauseStint(true);
                    const elapsed = stintStartMs ? (Date.now() - stintStartMs) / 1000 : 0;
                    const base = Object.values(standardTimes)
                        .reduce((s, t) => s + (t.practiceSec ?? 0) + (t.masterySec ?? 0), 0);
                    sessionDisplaySec = Math.round(baseTodaySec + base + (isIdle ? 0 : elapsed));

                    // Periodic durability flush — bounds how much practice time can
                    // ever be lost to an unclean exit to ~30s, instead of the whole visit.
                    if (Date.now() - lastFlushMs > 30_000) {
                        lastFlushMs = Date.now();
                        saveDailySession();
                    }
                }, 1000);
                window.addEventListener('beforeunload', handleBeforeUnload);
            }
        } catch (e) {
            console.error(e);
            error = 'Failed to load. Please refresh.';
        } finally {
            loading = false;
        }
    });

    onDestroy(() => {
        unsubStates();
        questionPlayer.destroy();
        feedbackPlayer.destroy();
        if (unsubscribeQuizAssignments) unsubscribeQuizAssignments();
        if (sessionDisplayInterval) clearInterval(sessionDisplayInterval);
        if (dailyTimerEnabled) {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            pauseStint();
            saveDailySession();
        }
    });

    // ── Question loading ───────────────────────────────────────────────────────

    async function onQuizActive(assignment) {
        if (quizActive && quizAssignment?.id === assignment.id) return; // already on this one
        quizAssignment = assignment;
        quizActive = true;
        pauseStint(); // daily timer tracks self-practice only, not quiz-taking
        question = null; // avoid a stale, still-submittable question during the await below
        switchingQuestion = true;

        try {
            const progress = await getOrCreateQuizProgress(assignment, uid);
            quizProgress = progress;
            quizIndex = progress.currentIndex;

            if (progress.status !== 'in_progress') {
                // Already finished or frozen (e.g. resumed after the fact) — nothing left to do.
                exitQuizToMastery();
                return;
            }
            await loadCurrentQuestion_quiz();
        } catch (e) {
            // Never strand the student on "Loading your next question…" —
            // fall back to normal practice if the quiz can't be loaded.
            console.error('Error loading quiz assignment:', e);
            exitQuizToMastery();
        }
    }

    // Ends the current quiz on this client and returns to mastery practice.
    // Nulling `question` immediately avoids leaving the quiz's last question on
    // screen during the (async) gap before the next mastery question is ready.
    function exitQuizToMastery() {
        quizActive = false;
        quizAssignment = null;
        quizProgress = null;
        quizIndex = 0;
        question = null;
        switchingQuestion = true;
        loadNextQuestion();
    }

    async function advance() {
        if (quizActive) {
            await advanceToNextQuizQuestion();
        } else if (isDevAuditNav()) {
            await auditSkip();
        } else {
            await loadNextQuestion();
        }
    }

    async function advanceToNextQuizQuestion() {
        quizIndex++;
        if (quizIndex >= quizAssignment.questions.length) {
            try { await completeQuizProgressIfInProgress(quizProgress.id); } catch (e) { console.error(e); }
            exitQuizToMastery();
        } else {
            await loadCurrentQuestion_quiz();
        }
    }

    async function loadNextQuestion() {
        if (quizActive) return;
        const progression = classDoc?.standardProgression || [];

        const { standardId: nextStd, studentState: updatedSt } = selectNextStandard(
            studentState,
            progression,
            allStandardStates
        );

        if (updatedSt !== studentState) {
            studentState = updatedSt;
            try { await saveStudentState(uid, studentState); } catch (e) { console.error(e); }
        }

        if (quizActive) return; // a quiz arrived while we were awaiting above

        pauseStint();
        if (dailyTimerEnabled) { lastFlushMs = Date.now(); saveDailySession(); }
        standardId = nextStd;
        startStint();
        standardInfo = allStandardsInfo[standardId] || { shortName: standardId };

        const seenIds = allStandardStates[standardId]?.questionsSeenIds || [];
        baseQuestion = pickQuestion(standardId, seenIds);
        if (!baseQuestion) { error = 'No questions available.'; return; }

        const variant = await pickVariant(baseQuestion.item_id);
        const nextQuestion = variant
            ? { ...variant, item_id: baseQuestion.item_id }
            : { ...baseQuestion };

        const nextFeedbackTemplate = await loadFeedbackTemplate(baseQuestion.item_id);

        if (quizActive) return; // a quiz arrived while we were awaiting above

        question = nextQuestion;
        feedbackTemplate = nextFeedbackTemplate;
        switchingQuestion = false;
        resetQuestionState();
        await loadQuestionAudio(question);
    }

    // ── Dev language-audit walk ───────────────────────────────────────────────
    // Dev browsing as themselves (not impersonating via ?studentId=) isn't
    // testing mastery progression — they're reading through every pooled
    // item's language once. The normal Skip (loadNextQuestion, mastery-driven)
    // just cycles the 2-3 standards currently active in studentState and never
    // progresses, since Skip never actually masters anything. This instead
    // marches linearly through every item that has a pool entry, once each.
    let auditItemIds = [];
    let auditIndex = 0;

    async function loadAuditItemIds() {
        const snap = await getDocs(collection(db, 'questionVariants'));
        const ids = new Set();
        snap.forEach((d) => ids.add(d.data().item_id));
        auditItemIds = [...ids].sort((a, b) => {
            const stdA = ITEM_STANDARD[a] ?? '';
            const stdB = ITEM_STANDARD[b] ?? '';
            return stdA === stdB ? a.localeCompare(b) : stdA.localeCompare(stdB);
        });
    }

    async function loadAuditQuestion(index) {
        const itemId = auditItemIds[index];
        if (!itemId) return;

        baseQuestion = byItemId[itemId] ?? null;
        standardId = ITEM_STANDARD[itemId] ?? null;
        standardInfo = allStandardsInfo[standardId] || { shortName: standardId ?? itemId };

        const variant = await pickVariant(itemId);
        question = variant ? { ...variant, item_id: itemId } : { ...baseQuestion };
        feedbackTemplate = await loadFeedbackTemplate(itemId);

        switchingQuestion = false;
        resetQuestionState();
        await loadQuestionAudio(question);
    }

    function isDevAuditNav() {
        return $session.role === 'dev' && !$page.url.searchParams.get('studentId');
    }

    async function auditSkip() {
        auditIndex = (auditIndex + 1) % auditItemIds.length;
        await loadAuditQuestion(auditIndex);
    }

    async function auditBack() {
        auditIndex = (auditIndex - 1 + auditItemIds.length) % auditItemIds.length;
        await loadAuditQuestion(auditIndex);
    }

    async function loadCurrentQuestion_quiz() {
        const q = quizAssignment.questions[quizIndex];
        standardId = q.standardId;
        standardInfo = allStandardsInfo[standardId] || { shortName: standardId };
        question = q.questionData;
        if (question) feedbackTemplate = await loadFeedbackTemplate(question.item_id);
        switchingQuestion = false;
        resetQuestionState();
        await loadQuestionAudio(question);
    }

    function resetQuestionState() {
        attempt = 0;
        assisted = false;
        currentTip = null;
        feedback = null;
        revealed = false;
        revealedAnswer = null;
        feedbackSegments = [];
        feedbackPlayer.setSegments([]);
        activeOptions = null;
        answer = null;
        multiPartWaiting = false;
        questionKey++;
    }

    // ── Hint flow ──────────────────────────────────────────────────────────────

    async function handleLearn() {
        assisted = true;
        currentTip = fillTemplate(feedbackTemplate?.tip1 ?? null, extractParams(question));
    }

    async function handleSubmit() {
        if (!question || answer === null || answer === '') return;
        if (revealed) return;

        if (quizActive && quizAssignment.gradingMode === 'quiz') {
            return handleSubmitQuizMode();
        }

        const answers = question.answer_type === 'multi_part' ? answer : { answer };
        const result = gradeQuestion(answers, question);
        const correct = result.score === result.total;

        if (correct) {
            feedback = { correct: true };
            try {
                if (quizActive) {
                    const entry = {
                        order: quizIndex, itemId: question.item_id, standardId,
                        correct: true, attempts: attempt + 1, assisted, answeredAt: Date.now()
                    };
                    await recordQuizAnswer(quizProgress.id, entry, quizIndex + 1);
                } else {
                    const currentStdState = allStandardStates[standardId] || buildInitialStandardState();
                    const seenIds = [...(currentStdState.questionsSeenIds || [])];
                    if (question.item_id && !seenIds.includes(question.item_id)) seenIds.push(question.item_id);

                    const progression = classDoc?.standardProgression || [];
                    const { studentState: newSt, standardState: newStd } = updateAfterAnswer(
                        studentState,
                        { ...currentStdState, questionsSeenIds: seenIds },
                        standardId, true, assisted, progression
                    );
                    studentState = newSt;
                    standardStates.update(s => ({ ...s, [standardId]: newStd }));
                    await saveStudentState(uid, studentState);
                    await saveStandardState(uid, standardId, newStd);
                    await recordVariantSeen(uid, {
                        standardId, itemId: question.item_id, variantId: question._variantId ?? null,
                        variant: question, correct: true, attempts: attempt + 1, assisted
                    });
                }
            } catch (e) {
                console.error('Error saving progress:', e);
            }
            recordAttempt(true, assisted);

            currentTip = null;
            setTimeout(() => advance(), 1500);

        } else {
            attempt++;
            // assisted: tip1 was already shown via "Learn", so wrong attempts give tip2 then reveal.
            // unassisted: wrong attempts walk the full tip1 -> tip2 -> reveal ladder.
            const params = extractParams(question);
            if (assisted) {
                currentTip = attempt === 1
                    ? fillTemplate(feedbackTemplate?.tip2 ?? null, params)
                    : null;
                revealed = attempt >= 2;
            } else {
                currentTip = attempt === 1
                    ? fillTemplate(feedbackTemplate?.tip1 ?? null, params)
                    : attempt === 2
                        ? fillTemplate(feedbackTemplate?.tip2 ?? null, params)
                        : null;
                revealed = attempt >= 3;
            }

            if (revealed) {
                revealedAnswer = formatCorrectAnswer(question);

                try {
                    if (quizActive) {
                        const entry = {
                            order: quizIndex, itemId: question.item_id, standardId,
                            correct: false, attempts: attempt, assisted, answeredAt: Date.now()
                        };
                        await recordQuizAnswer(quizProgress.id, entry, quizIndex + 1);
                    } else {
                        const currentStdState = allStandardStates[standardId] || buildInitialStandardState();
                        const progression = classDoc?.standardProgression || [];
                        const { studentState: newSt, standardState: newStd } = updateAfterAnswer(
                            studentState, currentStdState, standardId, false, false, progression
                        );
                        studentState = newSt;
                        standardStates.update(s => ({ ...s, [standardId]: newStd }));
                        await saveStudentState(uid, studentState);
                        await saveStandardState(uid, standardId, newStd);
                        await recordVariantSeen(uid, {
                            standardId, itemId: question.item_id, variantId: question._variantId ?? null,
                            variant: question, correct: false, attempts: attempt, assisted: false
                        });
                    }
                } catch (e) { console.error(e); }
                recordAttempt(false, false);
                // No auto-advance here — student clicks "Next Question" once
                // they've read/listened to the explanation (see revealed block below).
            } else {
                if (question?.answer_type === 'multiple_choice' && question.answer_options) {
                    eliminateMCOption();
                }
                answer = null;
                const { tick } = await import('svelte');
                await tick();
            }
        }
    }

    // Strict single-attempt grading for quiz-mode assignments — no hints, no
    // retries, grades once and moves on regardless of right/wrong.
    async function handleSubmitQuizMode() {
        if (!question || answer === null || answer === '') return;

        const answers = question.answer_type === 'multi_part' ? answer : { answer };
        const result = gradeQuestion(answers, question);
        const correct = result.score === result.total;

        feedback = { correct };
        try {
            const entry = {
                order: quizIndex, itemId: question.item_id, standardId,
                correct, attempts: 1, assisted: false, answeredAt: Date.now()
            };
            await recordQuizAnswer(quizProgress.id, entry, quizIndex + 1);
        } catch (e) {
            console.error('Error recording quiz answer:', e);
        }
        recordAttempt(correct, false);

        setTimeout(() => advanceToNextQuizQuestion(), 1500);
    }

    async function handleMultiPartComplete(event) {
        const { allCorrect, anyAssisted } = event.detail;
        try {
            if (quizActive) {
                const entry = {
                    order: quizIndex, itemId: question.item_id, standardId,
                    correct: allCorrect, attempts: 1, assisted: anyAssisted, answeredAt: Date.now()
                };
                await recordQuizAnswer(quizProgress.id, entry, quizIndex + 1);
            } else {
                const currentStdState = allStandardStates[standardId] || buildInitialStandardState();
                const seenIds = [...(currentStdState.questionsSeenIds || [])];
                if (question.item_id && !seenIds.includes(question.item_id)) seenIds.push(question.item_id);
                const progression = classDoc?.standardProgression || [];
                const { studentState: newSt, standardState: newStd } = updateAfterAnswer(
                    studentState,
                    { ...currentStdState, questionsSeenIds: seenIds },
                    standardId, allCorrect, anyAssisted, progression
                );
                studentState = newSt;
                standardStates.update(s => ({ ...s, [standardId]: newStd }));
                await saveStudentState(uid, studentState);
                await saveStandardState(uid, standardId, newStd);
                await recordVariantSeen(uid, {
                    standardId, itemId: question.item_id, variantId: question._variantId ?? null,
                    variant: question, correct: allCorrect, attempts: 1, assisted: anyAssisted
                });
            }
        } catch (e) { console.error('Error saving multi-part progress:', e); }
        recordAttempt(allCorrect, anyAssisted);
        if (allCorrect || quizActive) {
            setTimeout(() => advance(), 1500);
        } else {
            // A part was revealed wrong — wait for the student to click
            // "Next Question" so they have time to read/listen to the explanation.
            multiPartWaiting = true;
        }
    }

    async function handleNext() {
        await advance();
    }

    function eliminateMCOption() {
        if (!question?.answer_options) return;
        const correct = question.correct_answer;
        const current = activeOptions ?? question.answer_options.map(o => o.letter);
        const wrongs = current.filter(l => l !== correct && l !== getSelectedLetter());
        if (wrongs.length === 0) return;
        const toRemove = wrongs[Math.floor(Math.random() * wrongs.length)];
        activeOptions = current.filter(l => l !== toRemove);
    }

    function getSelectedLetter() {
        return typeof answer === 'string' ? answer : null;
    }

    function filteredOptions(options) {
        if (!activeOptions) return options;
        return options.filter(o => activeOptions.includes(o.letter));
    }

    // progressionIndex is an internal pointer (how many standards have ever
    // entered the active pool — starts at 3 since new students begin with 3
    // standards active at once) and isn't meaningful shown to students/parents
    // as "which standard am I on." Display the mastered count + 1 instead, so
    // a brand-new student reads as "Standard 1 of 28".
    $: progressionTotal = classDoc?.standardProgression?.length ?? 28;
    $: masteredCount = (classDoc?.standardProgression || []).filter(id => allStandardStates[id]?.mastered).length;
    $: progressionIndex = Math.min(masteredCount + 1, progressionTotal);
    $: progressPercent = Math.round((masteredCount / progressionTotal) * 100);
    $: strictQuizMode = quizActive && quizAssignment?.gradingMode === 'quiz';
</script>

<svelte:window on:keydown={onActivity} on:mousedown={onActivity} on:touchstart={onActivity} />

<div class="min-h-screen bg-gray-100 flex flex-col items-center py-8 px-4">

    {#if loading}
        <div class="flex items-center justify-center h-64">
            <p class="text-gray-400">Loading your questions...</p>
        </div>

    {:else if error}
        <div class="max-w-lg w-full bg-white rounded-lg p-8 text-center shadow">
            <p class="text-red-600">{error}</p>
        </div>

    {:else if question}
        <!-- Progress bar -->
        <div class="w-full max-w-2xl mb-4">
            {#if quizActive}
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Question {quizIndex + 1} of {quizAssignment.questions.length}</span>
                    <span>{quizAssignment.quizName}</span>
                </div>
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        class="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style="width: {Math.round((quizIndex / quizAssignment.questions.length) * 100)}%"
                    ></div>
                </div>
                <p class="text-xs text-indigo-600 mt-1 font-medium">
                    {quizAssignment.gradingMode === 'quiz' ? 'Quiz' : 'Practice quiz'} from your teacher
                </p>
            {:else}
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Standard {progressionIndex} of {progressionTotal}</span>
                    <span class="flex items-center gap-3">
                        {#if dailyTimerEnabled}
                            {@const remaining = dailyTimerSeconds - sessionDisplaySec}
                            <span class="font-mono
                                {remaining < 0 ? 'text-amber-600 font-semibold' :
                                 isIdle ? 'text-gray-400' : 'text-gray-500'}">
                                {#if isIdle}
                                    Paused
                                {:else if remaining >= 0}
                                    {formatTime(remaining)} left
                                {:else}
                                    +{formatTime(-remaining)} over
                                {/if}
                            </span>
                        {/if}
                        <span>{standardInfo?.shortName || standardId}</span>
                    </span>
                </div>
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        class="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style="width: {progressPercent}%"
                    ></div>
                </div>
            {/if}
        </div>

        {#if $session.role === 'dev'}
            <div class="w-full max-w-2xl bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm">
                <div class="flex items-center justify-between mb-2">
                    <p class="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                        Dev language audit
                        {#if auditItemIds.length}
                            <span class="font-normal normal-case text-amber-600">— item {auditIndex + 1} of {auditItemIds.length}</span>
                        {/if}
                    </p>
                    {#if !quizActive}
                        <div class="flex gap-2">
                            {#if isDevAuditNav() && auditItemIds.length}
                                <button on:click={auditBack}
                                    class="px-3 py-1 text-xs font-medium text-amber-800 bg-white border border-amber-300 rounded hover:bg-amber-100 transition-colors">
                                    Back
                                </button>
                            {/if}
                            <button on:click={() => isDevAuditNav() ? auditSkip() : loadNextQuestion()}
                                class="px-3 py-1 text-xs font-medium text-amber-800 bg-white border border-amber-300 rounded hover:bg-amber-100 transition-colors">
                                Skip
                            </button>
                        </div>
                    {/if}
                </div>
                <p class="text-xs text-amber-700 mb-3">
                    Item: <span class="font-mono">{question.item_id}</span>
                    · Variant: <span class="font-mono">{question._variantId ?? 'live-generated (no pool doc)'}</span>
                </p>

                <div class="flex items-start gap-2 mb-2">
                    <span class="font-medium text-amber-900 shrink-0">Problem:</span>
                    <span class="flex-1">{question.question_text ?? '(no question_text)'}</span>
                    {#if hasQuestionAudio}
                        <button on:click={() => questionPlayer.toggle()} title={$questionPlayer.playing ? 'Pause' : 'Play audio'} class="text-amber-700 hover:text-amber-900 shrink-0">
                            {$questionPlayer.playing ? '⏸' : '▶'}
                        </button>
                    {/if}
                </div>

                {#if isMultiPart}
                    {#if !feedbackTemplate}
                        <p class="text-amber-700 italic">No questionTemplates doc for this item yet.</p>
                    {:else}
                        <div class="space-y-3">
                            {#each auditParts as p (p.label)}
                                <div class="border-t border-amber-200 pt-2">
                                    <p class="font-semibold text-amber-900 mb-1">
                                        Part {p.label}{#if p.text}: <span class="font-normal">{p.text}</span>{/if}
                                    </p>
                                    {#if p.math_expression}
                                        <p class="text-amber-700 mb-1">{p.math_expression}</p>
                                    {/if}
                                    <div class="space-y-1">
                                        <div class="flex items-start gap-2">
                                            <span class="font-medium text-amber-900 shrink-0">Tip 1:</span>
                                            <span class="flex-1">{p.tip1 ?? '(none)'}</span>
                                            {#if auditPartAudioUrls[p.label]?.tip1}
                                                <button on:click={() => playAudio(auditPartAudioUrls[p.label].tip1)} title="Play audio" class="text-amber-700 hover:text-amber-900 shrink-0">▶</button>
                                            {/if}
                                        </div>
                                        <div class="flex items-start gap-2">
                                            <span class="font-medium text-amber-900 shrink-0">Tip 2:</span>
                                            <span class="flex-1">{p.tip2 ?? '(none)'}</span>
                                            {#if auditPartAudioUrls[p.label]?.tip2}
                                                <button on:click={() => playAudio(auditPartAudioUrls[p.label].tip2)} title="Play audio" class="text-amber-700 hover:text-amber-900 shrink-0">▶</button>
                                            {/if}
                                        </div>
                                        <div class="flex items-start gap-2">
                                            <span class="font-medium text-amber-900 shrink-0">Reveal:</span>
                                            <span class="flex-1">{p.reveal ?? '(none)'}</span>
                                            {#if auditPartAudioUrls[p.label]?.reveal}
                                                <button on:click={() => playAudio(auditPartAudioUrls[p.label].reveal)} title="Play audio" class="text-amber-700 hover:text-amber-900 shrink-0">▶</button>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                {:else if !feedbackTemplate}
                    <p class="text-amber-700 italic">No questionTemplates doc for this item yet.</p>
                {:else}
                    <div class="space-y-2">
                        <div class="flex items-start gap-2">
                            <span class="font-medium text-amber-900 shrink-0">Tip 1:</span>
                            <span class="flex-1">{auditTip1 ?? '(none)'}</span>
                            {#if auditTip1AudioUrl}
                                <button on:click={() => playAudio(auditTip1AudioUrl)} title="Play audio" class="text-amber-700 hover:text-amber-900 shrink-0">▶</button>
                            {/if}
                        </div>
                        <div class="flex items-start gap-2">
                            <span class="font-medium text-amber-900 shrink-0">Tip 2:</span>
                            <span class="flex-1">{auditTip2 ?? '(none)'}</span>
                            {#if auditTip2AudioUrl}
                                <button on:click={() => playAudio(auditTip2AudioUrl)} title="Play audio" class="text-amber-700 hover:text-amber-900 shrink-0">▶</button>
                            {/if}
                        </div>
                        <div class="flex items-start gap-2">
                            <span class="font-medium text-amber-900 shrink-0">Reveal:</span>
                            <span class="flex-1">{auditReveal ?? '(none)'}</span>
                            {#if auditRevealAudioUrl}
                                <button on:click={() => playAudio(auditRevealAudioUrl)} title="Play audio" class="text-amber-700 hover:text-amber-900 shrink-0">▶</button>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Question card -->
        <div class="w-full max-w-2xl bg-[#e9e9e9] rounded-lg overflow-hidden shadow">
            {#if hasQuestionAudio}
                <div class="flex justify-end px-4 pt-3">
                    <button
                        on:click={() => questionPlayer.toggle()}
                        class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full hover:bg-indigo-100 transition-colors"
                        title={$questionPlayer.playing ? 'Pause' : 'Listen to the question'}
                    >
                        <span>{$questionPlayer.playing ? '⏸' : '▶'}</span>
                        <span>{$questionPlayer.playing ? 'Pause' : 'Listen'}</span>
                    </button>
                </div>
            {/if}
            <div class="p-4">
                {#key questionKey}
                {#if question.answer_type === 'multiple_choice'}
                    <MultipleChoice
                        stimulus_intro={question.stimulus_intro ?? null}
                        stimulus_list={question.stimulus_list ?? null}
                        stimulus_type={question.stimulus_type ?? null}
                        stimulus_params={question.stimulus_params ?? null}
                        question_text={question.question_text}
                        math_expression={question.math_expression ?? null}
                        answer_options={filteredOptions(question.answer_options ?? [])}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'multi_part'}
                    <MultiPart
                        question_text={question.question_text}
                        stimulus_list={question.stimulus_list ?? null}
                        stimulus_type={question.stimulus_type ?? null}
                        stimulus_params={question.stimulus_params ?? null}
                        parts={question.parts}
                        layout={question.layout ?? null}
                        {feedbackTemplate}
                        {question}
                        bind:value={answer}
                        on:complete={handleMultiPartComplete}
                    />
                {:else if question.answer_type === 'short_answer'}
                    <ShortAnswer
                        stimulus_intro={question.stimulus_intro ?? null}
                        stimulus_type={question.stimulus_type ?? null}
                        stimulus_params={question.stimulus_params ?? null}
                        math_expression={question.math_expression ?? null}
                        question_text={question.question_text}
                        input_widget={question.input_widget ?? 'text'}
                        answer_suffix={question.answer_suffix ?? null}
                        input_width={question.input_width ?? '60px'}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'multiple_select'}
                    <MultipleSelect
                        stimulus_intro={question.stimulus_intro ?? null}
                        stimulus_type={question.stimulus_type ?? null}
                        stimulus_params={question.stimulus_params ?? null}
                        question_text={question.question_text}
                        math_expression={question.math_expression ?? null}
                        answer_options={question.answer_options ?? []}
                        select_count={question.select_count}
                        layout={question.layout ?? null}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'number_line_plot'}
                    <NumberLinePlot
                        question_text={question.question_text}
                        stimulus_params={question.stimulus_params ?? {}}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'true_false_table'}
                    <TrueFalseTable
                        question_text={question.question_text}
                        statements={question.statements ?? []}
                        column_label={question.column_label ?? 'Statement'}
                        true_label={question.true_label ?? 'True'}
                        false_label={question.false_label ?? 'False'}
                        stimulus_intro={question.stimulus_intro ?? null}
                        stimulus_type={question.stimulus_type ?? null}
                        instruction={question.instruction ?? null}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'inline_choice'}
                    <InlineChoice
                        stimulus_intro={question.stimulus_intro ?? null}
                        stimulus_list={question.stimulus_list ?? null}
                        question_text={question.question_text}
                        stimulus_type={question.stimulus_type ?? null}
                        stimulus_params={question.stimulus_params ?? null}
                        instruction={question.instruction ?? null}
                        sentences={question.sentences ?? []}
                        dropdowns={question.dropdowns ?? []}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'protractor_drag_drop'}
                    <ProtractorDragDrop
                        question_text={question.question_text}
                        stimulus_params={question.stimulus_params}
                        answer_options={question.answer_options ?? []}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'drag_drop_inequality'}
                    <DragDropInequality
                        question_text={question.question_text}
                        instruction2={question.instruction2 ?? ''}
                        tiles={question.tiles ?? []}
                        rows={question.rows ?? []}
                        correct_answer={question.correct_answer ?? {}}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'drag_drop_match'}
                    <DragDropMatch
                        question_text={question.question_text}
                        instruction={question.instruction ?? ''}
                        tiles={question.tiles ?? []}
                        rows={question.rows ?? []}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'fraction_model'}
                    <FractionModel
                        question_text={question.question_text}
                        math_expression={question.math_expression ?? null}
                        instruction={question.instruction ?? null}
                        numerator={question.model_params?.numerator ?? 1}
                        denominator={question.model_params?.denominator ?? 4}
                        models={question.models ?? null}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'category_sort'}
                    <CategorySort
                        question_text={question.question_text}
                        tiles={question.tiles ?? []}
                        categories={question.categories ?? []}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'drag_drop_line_plot'}
                    <DragDropLinePlot
                        stimulus_intro={question.stimulus_intro ?? null}
                        question_text={question.question_text}
                        math_expression={question.math_expression ?? null}
                        stimulus_params={question.stimulus_params ?? {}}
                        audio={questionAudioProps}
                        currentTime={playerCurrentTime}
                        bind:value={answer}
                    />
                {:else}
                    <div class="bg-white rounded p-4 text-gray-400 italic text-sm">
                        Question type not yet supported: {question.answer_type}
                    </div>
                {/if}
                {/key}
            </div>

            {#if !revealed && question.answer_type !== 'multi_part'}
                <div class="bg-[#d4d4d4] px-4 py-3 flex items-center justify-between gap-4">
                    {#if feedbackTemplate && !assisted && !strictQuizMode}
                        <button on:click={handleLearn}
                            class="px-4 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 transition-colors">
                            LEARN
                        </button>
                    {:else}
                        <div></div>
                    {/if}
                    <div class="flex items-center gap-3">
                        <button on:mousedown|preventDefault on:click={handleSubmit}
                            class="px-6 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
                            Submit
                        </button>
                    </div>
                </div>
            {:else if revealed || multiPartWaiting}
                <div class="bg-[#d4d4d4] px-4 py-3 flex items-center justify-end">
                    <button on:click={handleNext}
                        class="px-6 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
                        {quizActive ? 'Return' : 'Next Question'}
                    </button>
                </div>
            {/if}
        </div>

        {#if feedback?.correct}
            <div class="w-full max-w-2xl mt-3">
                <div class="rounded-lg px-4 py-3 text-sm font-medium bg-green-100 text-green-800">
                    Moving on...
                </div>
            </div>
        {:else if strictQuizMode && feedback && feedback.correct === false}
            <div class="w-full max-w-2xl mt-3">
                <div class="rounded-lg px-4 py-3 text-sm font-medium bg-red-100 text-red-800">
                    Incorrect. Moving on...
                </div>
            </div>
        {/if}

        {#if currentTip && !feedback?.correct}
            <div class="w-full max-w-2xl mt-3">
                <div class="rounded-lg px-4 py-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 flex items-start gap-2">
                    <span class="flex-1">
                        <AudioText text={currentTip} alignment={feedbackAlignment} active={$feedbackPlayer.activeFieldKey === 'tip'} currentTime={$feedbackPlayer.currentTime} />
                    </span>
                    {#if feedbackAudioUrl}
                        <button on:click={() => feedbackPlayer.toggle()} title={$feedbackPlayer.playing ? 'Pause' : 'Play audio'} class="text-amber-700 hover:text-amber-900 shrink-0">
                            {$feedbackPlayer.playing ? '⏸' : '▶'}
                        </button>
                    {/if}
                </div>
            </div>
        {/if}

        {#if revealed}
            <div class="w-full max-w-2xl mt-2">
                <div class="rounded-lg px-4 py-3 text-sm bg-blue-50 text-blue-900 border border-blue-200 flex items-start gap-2">
                    {#if revealText}
                        <span class="flex-1">
                            <AudioText text={revealText} alignment={feedbackAlignment} active={$feedbackPlayer.activeFieldKey === 'reveal'} currentTime={$feedbackPlayer.currentTime} />
                        </span>
                        {#if feedbackAudioUrl}
                            <button on:click={() => feedbackPlayer.toggle()} title={$feedbackPlayer.playing ? 'Pause' : 'Play audio'} class="text-blue-700 hover:text-blue-900 shrink-0">
                                {$feedbackPlayer.playing ? '⏸' : '▶'}
                            </button>
                        {/if}
                    {:else}
                        <span class="flex-1">The answer is {revealedAnswer}. We'll come back to this one.</span>
                    {/if}
                </div>
            </div>
        {/if}

    {:else}
        <div class="flex items-center justify-center h-64">
            <p class="text-gray-400">{switchingQuestion ? 'Loading your next question…' : 'No questions available.'}</p>
        </div>
    {/if}

    {#if isTester && question}
        <ReportBugButton variantId={question._variantId ?? null} />
    {/if}
</div>

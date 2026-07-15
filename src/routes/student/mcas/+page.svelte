<script>
    import { onMount, onDestroy, getContext } from 'svelte';
    import { get } from 'svelte/store';
    import { session } from '$lib/stores/session';
    import { generate } from '$lib/utils/generators.js';
    import { gradeQuestion } from '$lib/utils/grading.js';
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
        subscribeAssignment,
        writeResponse
    } from '$lib/utils/studentStore.js';
    import { fillTemplate, extractParams, loadFeedbackTemplate } from '$lib/utils/feedback.js';
    import { pickQuestion, ITEM_YEAR } from '$lib/utils/questionBank.js';

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

    // MC option elimination
    let activeOptions = null;

    // Assignment interrupt
    let assignmentActive = false;
    let assignmentQuestion = null;
    let assignmentStandardId = null;
    let isDemo = false;

    let unsubscribeAssignment = null;

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    onMount(async () => {
        try {
            uid      = ctx.uid;
            classDoc = ctx.classDoc;
            allStandardsInfo = Object.fromEntries(ctx.standards.map(s => [s.id, s]));

            studentState = await loadStudentState(uid);
            if (!studentState) {
                studentState = buildInitialStudentState(classDoc.classId, classDoc.standardProgression);
                await saveStudentState(uid, studentState);
            }

            unsubscribeAssignment = subscribeAssignment(
                classDoc.classId,
                (data) => {
                    assignmentActive = true;
                    assignmentStandardId = data.standardId || null;
                    isDemo = data.demo === true;
                    const q = pickQuestion(assignmentStandardId, []);
                    if (q) {
                        assignmentQuestion = generate(q.item_id) || q;
                        assignmentQuestion = { ...assignmentQuestion, item_id: q.item_id };
                    }
                    resetQuestionState();
                    if (assignmentActive && assignmentQuestion) {
                        loadCurrentQuestion_assignment();
                    }
                },
                () => {
                    if (assignmentActive) {
                        assignmentActive = false;
                        assignmentQuestion = null;
                        loadNextQuestion();
                    }
                }
            );

            await loadNextQuestion();
        } catch (e) {
            console.error(e);
            error = 'Failed to load. Please refresh.';
        } finally {
            loading = false;
        }
    });

    onDestroy(() => {
        unsubStates();
        if (unsubscribeAssignment) unsubscribeAssignment();
    });

    // ── Question loading ───────────────────────────────────────────────────────

    async function loadNextQuestion() {
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

        standardId = nextStd;
        standardInfo = allStandardsInfo[standardId] || { shortName: standardId };

        const seenIds = allStandardStates[standardId]?.questionsSeenIds || [];
        baseQuestion = pickQuestion(standardId, seenIds);
        if (!baseQuestion) { error = 'No questions available.'; return; }

        const variant = generate(baseQuestion.item_id);
        question = variant
            ? { ...variant, item_id: baseQuestion.item_id }
            : { ...baseQuestion };

        feedbackTemplate = await loadFeedbackTemplate(baseQuestion.item_id);
        resetQuestionState();
    }

    async function loadCurrentQuestion_assignment() {
        standardId = assignmentStandardId;
        standardInfo = allStandardsInfo[standardId] || { shortName: standardId };
        question = assignmentQuestion;
        if (question) feedbackTemplate = await loadFeedbackTemplate(question.item_id);
        resetQuestionState();
    }

    function resetQuestionState() {
        attempt = 0;
        assisted = false;
        currentTip = null;
        feedback = null;
        revealed = false;
        revealedAnswer = null;
        activeOptions = null;
        answer = null;
    }

    // ── Hint flow ──────────────────────────────────────────────────────────────

    async function handleLearn() {
        assisted = true;
        currentTip = fillTemplate(feedbackTemplate?.tip1 ?? null, extractParams(question));
    }

    async function handleSubmit() {
        if (!question || answer === null || answer === '') return;
        if (revealed) return;

        const answers = question.answer_type === 'multi_part' ? answer : { answer };
        const result = gradeQuestion(answers, question);
        const correct = result.score === result.total;

        if (correct) {
            feedback = { correct: true };
            try {
                const currentStdState = allStandardStates[standardId] || buildInitialStandardState();
                const seenIds = [...(currentStdState.questionsSeenIds || [])];
                if (question.item_id && !seenIds.includes(question.item_id)) seenIds.push(question.item_id);

                if (!assignmentActive || !isDemo) {
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
                }

                if (assignmentActive) {
                    await writeResponse(classDoc.classId, uid, {
                        questionId: question.item_id, standardId,
                        correct: true, assisted, attempt: attempt + 1, demo: isDemo
                    });
                }
            } catch (e) {
                console.error('Error saving progress:', e);
            }

            currentTip = null;
            setTimeout(async () => {
                if (assignmentActive) { assignmentActive = false; assignmentQuestion = null; }
                await loadNextQuestion();
            }, 1500);

        } else {
            attempt++;
            currentTip = attempt === 1
                ? fillTemplate(feedbackTemplate ? (assisted ? feedbackTemplate.tip2 : feedbackTemplate.tip1) : null, extractParams(question))
                : null;

            if (attempt >= 2) {
                revealed = true;
                revealedAnswer = formatCorrectAnswer(question);

                try {
                    if (!assignmentActive || !isDemo) {
                        const currentStdState = allStandardStates[standardId] || buildInitialStandardState();
                        const progression = classDoc?.standardProgression || [];
                        const { studentState: newSt, standardState: newStd } = updateAfterAnswer(
                            studentState, currentStdState, standardId, false, false, progression
                        );
                        studentState = newSt;
                        standardStates.update(s => ({ ...s, [standardId]: newStd }));
                        await saveStudentState(uid, studentState);
                        await saveStandardState(uid, standardId, newStd);
                    }
                } catch (e) { console.error(e); }

                setTimeout(async () => {
                    if (assignmentActive) { assignmentActive = false; assignmentQuestion = null; }
                    await loadNextQuestion();
                }, 4000);
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

    function fillAnswer(correct) {
        if (!question) return;
        const q = question;
        if (correct) {
            if (q.answer_type === 'multi_part') {
                answer = Object.fromEntries((q.parts || []).map(p => [p.label, p.correct_answer ?? '']));
            } else {
                answer = q.correct_answer;
            }
        } else {
            if (q.answer_type === 'multiple_choice') {
                const letters = (q.answer_options || []).map(o => o.letter);
                answer = letters.find(l => l !== q.correct_answer) ?? 'A';
            } else if (q.answer_type === 'multiple_select') {
                const letters = (q.answer_options || []).map(o => o.letter);
                const wrong = letters.filter(l => !(q.correct_answer || '').split(',').includes(l));
                answer = (wrong[0] ?? letters[0]);
            } else if (q.answer_type === 'multi_part') {
                answer = Object.fromEntries((q.parts || []).map(p => [p.label, '']));
            } else if (q.answer_type === 'true_false_table') {
                answer = (q.statements || []).map(() => 'False').join(',');
            } else {
                answer = '0';
            }
        }
    }

    async function handleMultiPartComplete(event) {
        const { allCorrect, anyAssisted } = event.detail;
        try {
            const currentStdState = allStandardStates[standardId] || buildInitialStandardState();
            const seenIds = [...(currentStdState.questionsSeenIds || [])];
            if (question.item_id && !seenIds.includes(question.item_id)) seenIds.push(question.item_id);
            if (!assignmentActive || !isDemo) {
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
            }
        } catch (e) { console.error('Error saving multi-part progress:', e); }
        setTimeout(async () => {
            if (assignmentActive) { assignmentActive = false; assignmentQuestion = null; }
            await loadNextQuestion();
        }, 1500);
    }

    async function handleNext() {
        if (assignmentActive) { assignmentActive = false; assignmentQuestion = null; }
        await loadNextQuestion();
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

    function formatCorrectAnswer(q) {
        if (!q) return '';
        const ca = q.correct_answer;
        if (typeof ca === 'string') {
            if (q.answer_type === 'multiple_choice' || q.answer_type === 'protractor_drag_drop') {
                const opt = q.answer_options?.find(o => o.letter === ca);
                return opt ? `${ca}: ${opt.text}` : ca;
            }
            return ca;
        }
        if (typeof ca === 'object' && ca !== null) {
            return Object.entries(ca).map(([k, v]) => `Part ${k}: ${v}`).join(' · ');
        }
        return String(ca);
    }

    $: progressionIndex = studentState?.progressionIndex ?? 0;
    $: progressionTotal = classDoc?.standardProgression?.length ?? 28;
    $: progressPercent = Math.round((progressionIndex / progressionTotal) * 100);
</script>

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
            <div class="flex justify-between text-xs text-gray-500 mb-1">
                <span>Standard {progressionIndex} of {progressionTotal}</span>
                <span>{standardInfo?.shortName || standardId}</span>
            </div>
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    class="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style="width: {progressPercent}%"
                ></div>
            </div>
            {#if assignmentActive}
                <p class="text-xs text-indigo-600 mt-1 font-medium">Class question from your teacher</p>
            {/if}
        </div>

        <!-- Question card -->
        <div class="w-full max-w-2xl bg-[#e9e9e9] rounded-lg overflow-hidden shadow">
            <div class="p-4">
                {#if question.answer_type === 'multiple_choice'}
                    <MultipleChoice
                        stimulus_intro={question.stimulus_intro ?? null}
                        stimulus_list={question.stimulus_list ?? null}
                        stimulus_type={question.stimulus_type ?? null}
                        stimulus_params={question.stimulus_params ?? null}
                        question_text={question.question_text}
                        math_expression={question.math_expression ?? null}
                        answer_options={filteredOptions(question.answer_options ?? [])}
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
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'number_line_plot'}
                    <NumberLinePlot
                        question_text={question.question_text}
                        stimulus_params={question.stimulus_params ?? {}}
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
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'inline_choice'}
                    <InlineChoice
                        stimulus_intro={question.stimulus_intro ?? null}
                        question_text={question.question_text}
                        stimulus_type={question.stimulus_type ?? null}
                        stimulus_params={question.stimulus_params ?? null}
                        instruction={question.instruction ?? null}
                        sentences={question.sentences ?? []}
                        dropdowns={question.dropdowns ?? []}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'protractor_drag_drop'}
                    <ProtractorDragDrop
                        question_text={question.question_text}
                        stimulus_params={question.stimulus_params}
                        answer_options={question.answer_options ?? []}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'drag_drop_inequality'}
                    <DragDropInequality
                        question_text={question.question_text}
                        instruction2={question.instruction2 ?? ''}
                        tiles={question.tiles ?? []}
                        rows={question.rows ?? []}
                        correct_answer={question.correct_answer ?? {}}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'drag_drop_match'}
                    <DragDropMatch
                        question_text={question.question_text}
                        instruction={question.instruction ?? ''}
                        tiles={question.tiles ?? []}
                        rows={question.rows ?? []}
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
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'category_sort'}
                    <CategorySort
                        question_text={question.question_text}
                        tiles={question.tiles ?? []}
                        categories={question.categories ?? []}
                        bind:value={answer}
                    />
                {:else if question.answer_type === 'drag_drop_line_plot'}
                    <DragDropLinePlot
                        stimulus_intro={question.stimulus_intro ?? null}
                        question_text={question.question_text}
                        math_expression={question.math_expression ?? null}
                        stimulus_params={question.stimulus_params ?? {}}
                        bind:value={answer}
                    />
                {:else}
                    <div class="bg-white rounded p-4 text-gray-400 italic text-sm">
                        Question type not yet supported: {question.answer_type}
                    </div>
                {/if}
            </div>

            {#if !revealed && question.answer_type !== 'multi_part'}
                <div class="bg-[#d4d4d4] px-4 py-3 flex items-center justify-between gap-4">
                    {#if feedbackTemplate && !assisted}
                        <button on:click={handleLearn}
                            class="px-4 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 transition-colors">
                            LEARN
                        </button>
                    {:else}
                        <div></div>
                    {/if}
                    <div class="flex items-center gap-3">
                        {#if $session.role === 'dev'}
                            {#if baseQuestion}
                                <span class="text-xs text-gray-500">{ITEM_YEAR[baseQuestion.item_id] ?? ''}</span>
                            {/if}
                            <button on:click={() => fillAnswer(true)}
                                class="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 border border-green-300 rounded hover:bg-green-200">
                                ✓ Fill Right
                            </button>
                            <button on:click={() => fillAnswer(false)}
                                class="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 border border-red-300 rounded hover:bg-red-200">
                                ✗ Fill Wrong
                            </button>
                            <button on:click={loadNextQuestion}
                                class="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                                Skip
                            </button>
                        {/if}
                        <button on:mousedown|preventDefault on:click={handleSubmit}
                            class="px-6 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
                            Submit
                        </button>
                    </div>
                </div>
            {:else if revealed}
                <div class="bg-[#d4d4d4] px-4 py-3 flex items-center justify-end">
                    <button on:click={handleNext}
                        class="px-6 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
                        {assignmentActive ? 'Return' : 'Next Question'}
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
        {/if}

        {#if currentTip && !feedback?.correct}
            <div class="w-full max-w-2xl mt-3">
                <div class="rounded-lg px-4 py-3 text-sm bg-amber-50 text-amber-800 border border-amber-200">
                    {currentTip}
                </div>
            </div>
        {/if}

        {#if revealed}
            <div class="w-full max-w-2xl mt-2">
                <div class="rounded-lg px-4 py-3 text-sm bg-blue-50 text-blue-900 border border-blue-200">
                    {#if feedbackTemplate?.reveal}
                        {fillTemplate(feedbackTemplate.reveal, extractParams(question))}
                    {:else}
                        The answer is {revealedAnswer}. We'll come back to this one.
                    {/if}
                </div>
            </div>
        {/if}

    {:else}
        <div class="flex items-center justify-center h-64">
            <p class="text-gray-400">No questions available.</p>
        </div>
    {/if}
</div>

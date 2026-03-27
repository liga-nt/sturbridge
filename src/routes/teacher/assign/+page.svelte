<script>
    import { onMount, onDestroy } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { loadClass, loadAllStandards } from '$lib/utils/studentStore.js';
    import { generate } from '$lib/utils/generators.js';
    import { pickQuestion } from '$lib/utils/questionBank.js';
    import {
        doc, getDoc, getDocs, collection, setDoc, updateDoc,
        onSnapshot, serverTimestamp
    } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    import MultipleChoice from '$lib/components/questions/MultipleChoice.svelte';
    import MultiPart from '$lib/components/questions/MultiPart.svelte';
    import ShortAnswer from '$lib/components/questions/ShortAnswer.svelte';
    import MultipleSelect from '$lib/components/questions/MultipleSelect.svelte';
    import TrueFalseTable from '$lib/components/questions/TrueFalseTable.svelte';
    import InlineChoice from '$lib/components/questions/InlineChoice.svelte';
    import NumberLinePlot from '$lib/components/questions/NumberLinePlot.svelte';
    import ProtractorDragDrop from '$lib/components/questions/ProtractorDragDrop.svelte';

    let loading = true;
    let error = null;

    let classId = null;
    let classDoc = null;
    let students = [];
    let allStandardsInfo = {};
    let standardsList = [];   // ordered [{ id, shortName }]

    // Selection
    let selectedStandardId = '';
    let previewQuestion = null;
    let previewKey = 0;

    // Assignment state
    let assignmentActive = false;
    let assignmentDoc = null;
    let responses = {};  // { uid: { correct, displayName, submittedAt } }
    let unsubAssignment = null;
    let unsubResponses = null;

    // Demo push
    let selectedStudentId = '';
    let showStudentDropdown = false;

    onMount(async () => {
        try {
            classId = $page.url.searchParams.get('classId');
            if (!classId) {
                const uid = $session.user?.uid;
                const userSnap = await getDoc(doc(db, 'users', uid));
                const userData = userSnap.exists() ? userSnap.data() : null;

                if ($session.role === 'admin' || $session.role === 'dev') {
                    const classesSna = await getDocs(collection(db, 'classes'));
                    classId = classesSna.docs[0]?.id;
                } else {
                    classId = userData?.classIds?.[0];
                }
            }
            if (!classId) { error = 'No class assigned.'; loading = false; return; }

            classDoc = await loadClass(classId);
            allStandardsInfo = await loadAllStandards();
            standardsList = (classDoc?.standardProgression || []).map((id) => ({
                id,
                shortName: allStandardsInfo[id]?.shortName || id
            }));

            if (standardsList.length > 0) {
                selectedStandardId = standardsList[0].id;
            }

            // Load students
            const studentIds = classDoc?.studentIds || [];
            const studentDocs = await Promise.all(
                studentIds.map((sid) =>
                    getDoc(doc(db, 'users', sid)).then((s) =>
                        s.exists() ? { uid: s.id, ...s.data() } : { uid: sid, displayName: sid }
                    )
                )
            );
            students = studentDocs.sort((a, b) =>
                (a.displayName || '').localeCompare(b.displayName || '')
            );

            // Subscribe to live assignment doc
            unsubAssignment = onSnapshot(doc(db, 'assignments', classId), (snap) => {
                if (snap.exists()) {
                    assignmentDoc = snap.data();
                    assignmentActive = assignmentDoc.active === true;
                } else {
                    assignmentDoc = null;
                    assignmentActive = false;
                }
            });

            // Subscribe to responses
            unsubResponses = onSnapshot(collection(db, 'responses'), (snap) => {
                snap.docChanges().forEach((change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        const d = change.doc.data();
                        if (d.classId === classId) {
                            const student = students.find((s) => s.uid === d.studentId);
                            responses = {
                                ...responses,
                                [d.studentId]: {
                                    correct: d.correct,
                                    assisted: d.assisted,
                                    displayName: student?.displayName || d.studentId,
                                    submittedAt: d.submittedAt
                                }
                            };
                        }
                    }
                });
            });

        } catch (e) {
            console.error(e);
            error = 'Failed to load.';
        } finally {
            loading = false;
        }
    });

    onDestroy(() => {
        if (unsubAssignment) unsubAssignment();
        if (unsubResponses) unsubResponses();
    });

    function generatePreview() {
        const base = pickQuestion(selectedStandardId, []);
        if (!base) { previewQuestion = null; return; }
        const variant = generate(base.item_id);
        previewQuestion = variant
            ? { ...variant, item_id: base.item_id }
            : { ...base };
        previewKey++;
    }

    async function assignToClass(isDemo = false) {
        if (!previewQuestion) return;
        responses = {};
        await setDoc(doc(db, 'assignments', classId), {
            active: true,
            mode: 'class',
            targetStudentId: null,
            questionId: previewQuestion.item_id,
            standardId: selectedStandardId,
            assignedAt: serverTimestamp(),
            demo: isDemo
        });
    }

    async function sendToStudent(isDemo = false) {
        if (!previewQuestion || !selectedStudentId) return;
        responses = {};
        await setDoc(doc(db, 'assignments', classId), {
            active: true,
            mode: 'individual',
            targetStudentId: selectedStudentId,
            questionId: previewQuestion.item_id,
            standardId: selectedStandardId,
            assignedAt: serverTimestamp(),
            demo: isDemo
        });
        showStudentDropdown = false;
    }

    async function endAssignment() {
        await updateDoc(doc(db, 'assignments', classId), { active: false });
        responses = {};
    }

    $: responseList = Object.values(responses).sort((a, b) =>
        (a.displayName || '').localeCompare(b.displayName || '')
    );
    $: responseCount = responseList.length;
    $: correctCount = responseList.filter((r) => r.correct).length;
</script>

<div class="max-w-4xl">
    <h1 class="text-xl font-semibold text-gray-800 mb-6">Assign Question</h1>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <!-- Left: controls -->
            <div class="space-y-4">
                <!-- Standard selector -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1" for="std-select">Standard</label>
                    <select
                        id="std-select"
                        bind:value={selectedStandardId}
                        class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    >
                        {#each standardsList as std}
                            <option value={std.id}>{std.shortName} ({std.id})</option>
                        {/each}
                    </select>
                </div>

                <button
                    on:click={generatePreview}
                    class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors"
                >
                    Generate Preview
                </button>

                <!-- Assignment buttons -->
                {#if previewQuestion}
                    <div class="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                        {#if assignmentActive}
                            <button
                                on:click={endAssignment}
                                class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
                            >
                                End Assignment
                            </button>
                        {:else}
                            <button
                                on:click={() => assignToClass(false)}
                                class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
                            >
                                Send to Class
                            </button>
                            <!-- Send to student dropdown -->
                            <div class="relative">
                                <button
                                    on:click={() => (showStudentDropdown = !showStudentDropdown)}
                                    class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                                >
                                    Send to Student ▾
                                </button>
                                {#if showStudentDropdown}
                                    <div class="absolute top-full left-0 mt-1 w-48 bg-white rounded shadow-lg border border-gray-200 z-20 max-h-48 overflow-y-auto">
                                        {#each students as student}
                                            <button
                                                on:click={() => {
                                                    selectedStudentId = student.uid;
                                                    sendToStudent(true);
                                                }}
                                                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
                                            >
                                                {student.displayName || student.uid}
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/if}

                <!-- Live status -->
                {#if assignmentActive}
                    <div class="bg-green-50 border border-green-200 rounded p-3 text-sm">
                        <p class="font-medium text-green-700 mb-2">
                            Assignment active — {assignmentDoc?.demo ? 'Demo mode' : 'Counts toward mastery'}
                            {#if assignmentDoc?.mode === 'individual'}
                                · Individual student
                            {/if}
                        </p>
                        <p class="text-green-600">{responseCount} / {students.length} responded · {correctCount} correct</p>
                    </div>
                {/if}

                <!-- Response tiles -->
                {#if responseList.length > 0}
                    <div>
                        <p class="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Responses</p>
                        <div class="flex flex-wrap gap-2">
                            {#each responseList as resp}
                                <div class="px-3 py-1.5 rounded text-xs font-medium
                                    {resp.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}">
                                    {resp.displayName}
                                    {resp.correct ? '✓' : '✗'}
                                    {#if resp.assisted}<span class="opacity-60 ml-0.5" title="Used hint">💡</span>{/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Right: question preview -->
            <div>
                {#if previewQuestion}
                    <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Preview</p>
                    {#key previewKey}
                        <div class="bg-[#e9e9e9] rounded p-4">
                            {#if previewQuestion.answer_type === 'multiple_choice'}
                                <MultipleChoice
                                    stimulus_intro={previewQuestion.stimulus_intro ?? null}
                                    stimulus_list={previewQuestion.stimulus_list ?? null}
                                    stimulus_type={previewQuestion.stimulus_type ?? null}
                                    stimulus_params={previewQuestion.stimulus_params ?? null}
                                    question_text={previewQuestion.question_text}
                                    math_expression={previewQuestion.math_expression ?? null}
                                    answer_options={previewQuestion.answer_options ?? []}
                                />
                            {:else if previewQuestion.answer_type === 'multi_part'}
                                <MultiPart
                                    question_text={previewQuestion.question_text}
                                    stimulus_list={previewQuestion.stimulus_list ?? null}
                                    stimulus_type={previewQuestion.stimulus_type ?? null}
                                    stimulus_params={previewQuestion.stimulus_params ?? null}
                                    parts={previewQuestion.parts}
                                    layout={previewQuestion.layout ?? null}
                                />
                            {:else if previewQuestion.answer_type === 'short_answer'}
                                <ShortAnswer
                                    stimulus_intro={previewQuestion.stimulus_intro ?? null}
                                    stimulus_type={previewQuestion.stimulus_type ?? null}
                                    stimulus_params={previewQuestion.stimulus_params ?? null}
                                    math_expression={previewQuestion.math_expression ?? null}
                                    question_text={previewQuestion.question_text}
                                    input_widget={previewQuestion.input_widget ?? 'text'}
                                    answer_suffix={previewQuestion.answer_suffix ?? null}
                                />
                            {:else if previewQuestion.answer_type === 'multiple_select'}
                                <MultipleSelect
                                    stimulus_intro={previewQuestion.stimulus_intro ?? null}
                                    question_text={previewQuestion.question_text}
                                    math_expression={previewQuestion.math_expression ?? null}
                                    answer_options={previewQuestion.answer_options ?? []}
                                    select_count={previewQuestion.select_count}
                                />
                            {:else if previewQuestion.answer_type === 'true_false_table'}
                                <TrueFalseTable
                                    question_text={previewQuestion.question_text}
                                    statements={previewQuestion.statements ?? []}
                                />
                            {:else if previewQuestion.answer_type === 'inline_choice'}
                                <InlineChoice
                                    stimulus_intro={previewQuestion.stimulus_intro ?? null}
                                    question_text={previewQuestion.question_text}
                                    stimulus_type={previewQuestion.stimulus_type ?? null}
                                    stimulus_params={previewQuestion.stimulus_params ?? null}
                                    instruction={previewQuestion.instruction ?? null}
                                    sentences={previewQuestion.sentences ?? []}
                                    dropdowns={previewQuestion.dropdowns ?? []}
                                />
                            {:else if previewQuestion.answer_type === 'number_line_plot'}
                                <NumberLinePlot
                                    question_text={previewQuestion.question_text}
                                    stimulus_params={previewQuestion.stimulus_params ?? {}}
                                />
                            {:else if previewQuestion.answer_type === 'protractor_drag_drop'}
                                <ProtractorDragDrop
                                    question_text={previewQuestion.question_text}
                                    stimulus_params={previewQuestion.stimulus_params}
                                    answer_options={previewQuestion.answer_options ?? []}
                                />
                            {:else}
                                <p class="text-sm text-gray-400 italic">Preview not available for: {previewQuestion.answer_type}</p>
                            {/if}
                        </div>
                    {/key}
                {:else}
                    <div class="bg-gray-100 rounded p-8 text-center text-gray-400 text-sm">
                        Select a standard and click Generate Preview
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>

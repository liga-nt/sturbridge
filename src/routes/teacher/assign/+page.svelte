<script>
    import { onMount, onDestroy } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { loadClass, loadAllStandards, loadCourse } from '$lib/utils/studentStore.js';
    import { pickVariant } from '$lib/utils/variantPool.js';
    import { pickQuestion } from '$lib/utils/questionBank.js';
    import { generateRangeProblems } from '$lib/utils/fundamentals.js';
    import {
        createQuiz,
        subscribeQuizzesForClass,
        loadQuizVersions,
        regenerateQuiz,
        archiveQuiz,
        assignQuiz,
        subscribeActiveAssignments,
        subscribeAssignmentProgress,
        endQuizAssignment
    } from '$lib/utils/quizStore.js';
    import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    import QuizQuestionPreview from '$lib/components/QuizQuestionPreview.svelte';
    import QuizPreviewModal from '$lib/components/QuizPreviewModal.svelte';

    let loading = true;
    let error = null;

    let classId = null;
    let classDoc = null;
    let course = null;
    let students = [];
    let allStandardsInfo = {};
    let standardsList = [];   // ordered [{ id, shortName }]

    $: isFundamentals = course?.contentKey === 'fundamentals-math';

    // Derive from the class being managed, not the caller's own claim — when
    // a dev/admin is impersonating a teacher, $session.schoolId is the dev's
    // own (often null) school, not the class's, and would silently stamp
    // quizzes/quizAssignments with the wrong schoolId (or null), making them
    // invisible to real students since reads are schoolId-scoped.
    $: schoolId = classDoc?.schoolId ?? $session.schoolId;
    $: uid = $session.user?.uid;

    // ── Builder: pick a standard, preview, add to queue ─────────────────────
    let selectedStandardId = '';
    let previewQuestion = null;
    let previewKey = 0;
    let queue = [];  // [{ order, standardId, itemId, questionData }]

    let showSaveModal = false;
    let quizNameInput = '';
    let saving = false;

    // ── Fundamentals builder (range-based, no item bank) ────────────────────
    let fundOperation = 'mult';   // 'mult' | 'div'
    let fundTableMin = 4;
    let fundTableMax = 4;
    let fundCount = 5;
    let fundSample = null;

    function refreshFundSample() {
        const min = Math.min(fundTableMin, fundTableMax);
        const max = Math.max(fundTableMin, fundTableMax);
        fundSample = generateRangeProblems({ operation: fundOperation, tableMin: min, tableMax: max, count: 1 })[0];
    }

    function fundTopicLabel(operation, min, max) {
        const symbol = operation === 'div' ? '÷' : '×';
        const range = min === max ? `${symbol}${min}` : `${symbol}${min}–${symbol}${max}`;
        return `${range} facts`;
    }

    function addFundamentalsToQueue() {
        const min = Math.min(fundTableMin, fundTableMax);
        const max = Math.max(fundTableMin, fundTableMax);
        const count = Math.max(1, fundCount);
        const label = fundTopicLabel(fundOperation, min, max);
        const standardId = min === max
            ? `fund4-${fundOperation}-t${min}`
            : `fund4-${fundOperation}-t${min}-${max}`;
        const problems = generateRangeProblems({ operation: fundOperation, tableMin: min, tableMax: max, count });
        const newEntries = problems.map((problem) => ({
            order: queue.length,
            standardId,
            itemId: null,
            questionData: { ...problem, kind: 'fundamentals', correct_answer: problem.answer, label }
        }));
        queue = [...queue, ...newEntries].map((q, i) => ({ ...q, order: i }));
    }

    // ── Saved quizzes ────────────────────────────────────────────────────────
    let quizzes = [];
    let unsubQuizzes = null;
    let versionRows = [];      // flattened: one row per (quiz, version) so regenerating keeps old versions visible
    let versionRowsToken = 0;  // guards against a slow fetch clobbering a newer one

    // ── Assign panel ─────────────────────────────────────────────────────────
    let assigningQuiz = null;
    let assigningVersion = null;
    let gradingMode = 'quiz';       // 'quiz' | 'help'
    let targetMode = 'class';       // 'class' | 'individual'
    let selectedTargetIds = [];
    let assigning = false;

    // ── Active assignments ───────────────────────────────────────────────────
    let activeAssignments = [];
    let progressByAssignment = {};  // { [assignmentId]: progress[] }
    let unsubActiveAssignments = null;
    let progressUnsubs = {};        // { [assignmentId]: unsubFn }

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
            course = classDoc?.courseId ? await loadCourse(classDoc.courseId) : null;
            allStandardsInfo = await loadAllStandards();
            standardsList = (classDoc?.standardProgression || []).map((id) => ({
                id,
                shortName: allStandardsInfo[id]?.shortName || id
            }));

            if (standardsList.length > 0) {
                selectedStandardId = standardsList[0].id;
            }
            if (course?.contentKey === 'fundamentals-math') {
                refreshFundSample();
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

            unsubQuizzes = subscribeQuizzesForClass(classId, classDoc.schoolId, (list) => {
                quizzes = list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
                rebuildVersionRows(quizzes);
            });

            unsubActiveAssignments = subscribeActiveAssignments(classId, classDoc.schoolId, (list) => {
                activeAssignments = list.sort((a, b) => (b.assignedAt?.toMillis?.() ?? 0) - (a.assignedAt?.toMillis?.() ?? 0));
                syncProgressSubscriptions(activeAssignments);
            });

        } catch (e) {
            console.error(e);
            error = 'Failed to load.';
        } finally {
            loading = false;
        }
    });

    onDestroy(() => {
        if (unsubQuizzes) unsubQuizzes();
        if (unsubActiveAssignments) unsubActiveAssignments();
        Object.values(progressUnsubs).forEach((fn) => fn());
    });

    function syncProgressSubscriptions(assignments) {
        const ids = new Set(assignments.map((a) => a.id));
        for (const id of Object.keys(progressUnsubs)) {
            if (!ids.has(id)) {
                progressUnsubs[id]();
                delete progressUnsubs[id];
                const { [id]: _, ...rest } = progressByAssignment;
                progressByAssignment = rest;
            }
        }
        for (const a of assignments) {
            if (!progressUnsubs[a.id]) {
                progressUnsubs[a.id] = subscribeAssignmentProgress(a.id, schoolId, (progress) => {
                    progressByAssignment = { ...progressByAssignment, [a.id]: progress };
                });
            }
        }
    }

    async function generatePreview() {
        const base = pickQuestion(selectedStandardId, []);
        if (!base) { previewQuestion = null; return; }
        const variant = await pickVariant(base.item_id);
        previewQuestion = variant
            ? { ...variant, item_id: base.item_id }
            : { ...base };
        previewKey++;
    }

    // A fresh preview is required before adding to the queue — switching standards invalidates it.
    function onStandardChange() {
        previewQuestion = null;
    }

    function addToQueue() {
        if (!previewQuestion) return;
        queue = [...queue, {
            order: queue.length,
            standardId: selectedStandardId,
            itemId: previewQuestion.item_id,
            questionData: previewQuestion
        }];
        previewQuestion = null;
    }

    function removeFromQueue(index) {
        queue = queue.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i }));
    }

    function moveQueueItem(index, dir) {
        const target = index + dir;
        if (target < 0 || target >= queue.length) return;
        const copy = [...queue];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        queue = copy.map((q, i) => ({ ...q, order: i }));
    }

    function openSaveModal() {
        quizNameInput = '';
        showSaveModal = true;
    }

    async function saveQuiz() {
        if (!quizNameInput.trim() || queue.length === 0) return;
        saving = true;
        try {
            await createQuiz(quizNameInput.trim(), classId, schoolId, uid, queue);
            queue = [];
            showSaveModal = false;
        } catch (e) {
            console.error(e);
        } finally {
            saving = false;
        }
    }

    // Expands each quiz doc into one row per saved version, newest quiz first
    // and newest version first within a quiz, so regenerating adds a row
    // instead of replacing the existing one.
    async function rebuildVersionRows(quizList) {
        const token = ++versionRowsToken;
        const rows = (await Promise.all(
            quizList.map(async (quiz) => {
                const versions = await loadQuizVersions(quiz.id);
                return versions.map((v) => ({
                    key: `${quiz.id}_v${v.version}`,
                    quiz,
                    version: v.version,
                    // v.questions holds { order, standardId, itemId, questionData }
                    // wrappers (same shape assignQuiz snapshots into quizAssignments,
                    // and what the student quiz player reads via q.questionData) —
                    // unwrap so the preview gets the actual question object.
                    questions: (v.questions || []).map((q) => q.questionData),
                    questionCount: (v.questions || []).length,
                    isLatest: v.version === quiz.currentVersion
                }));
            })
        )).flat();
        rows.sort((a, b) =>
            (b.quiz.createdAt?.toMillis?.() ?? 0) - (a.quiz.createdAt?.toMillis?.() ?? 0)
            || b.version - a.version
        );
        if (token === versionRowsToken) versionRows = rows;
    }

    async function handleRegenerate(quiz) {
        if (!confirm(`Regenerate "${quiz.name}"? This creates a new version with fresh random variants for the same standards.`)) return;
        await regenerateQuiz(quiz.id);
    }

    async function handleArchive(quiz) {
        if (!confirm(`Archive "${quiz.name}"? It will no longer be assignable, but past results stay on the record.`)) return;
        await archiveQuiz(quiz.id);
    }

    function openAssignPanel(quiz, version = quiz.currentVersion) {
        assigningQuiz = quiz;
        assigningVersion = version;
        gradingMode = 'quiz';
        targetMode = 'class';
        selectedTargetIds = [];
    }

    function closeAssignPanel() {
        assigningQuiz = null;
        assigningVersion = null;
    }

    // ── Saved-quiz click-through preview ─────────────────────────────────────
    let previewingRow = null;  // { quiz, version, questions }

    function openQuizPreview(row) {
        previewingRow = row;
    }

    function closeQuizPreview() {
        previewingRow = null;
    }

    function toggleTargetStudent(sid) {
        selectedTargetIds = selectedTargetIds.includes(sid)
            ? selectedTargetIds.filter((id) => id !== sid)
            : [...selectedTargetIds, sid];
    }

    async function confirmAssign() {
        if (!assigningQuiz) return;
        const targetIds = targetMode === 'class' ? (classDoc.studentIds || []) : selectedTargetIds;
        if (targetIds.length === 0) return;
        assigning = true;
        try {
            await assignQuiz(assigningQuiz, classId, schoolId, gradingMode, targetIds, uid, assigningVersion);
            closeAssignPanel();
        } catch (e) {
            console.error(e);
        } finally {
            assigning = false;
        }
    }

    async function handleEndAssignment(assignmentId) {
        await endQuizAssignment(assignmentId, schoolId);
    }

    function summarize(assignment) {
        const progress = progressByAssignment[assignment.id] || [];
        const completed = progress.filter((p) => p.status === 'completed').length;
        const inProgress = progress.filter((p) => p.status === 'in_progress').length;
        const frozen = progress.filter((p) => p.status === 'frozen').length;
        const total = assignment.targetStudentIds.length;
        return { completed, inProgress, frozen, total, notStarted: Math.max(0, total - progress.length) };
    }

    function studentName(sid) {
        return students.find((s) => s.uid === sid)?.displayName || sid;
    }
</script>

<div class="max-w-4xl">
    <h1 class="text-xl font-semibold text-gray-800 mb-6">Assign</h1>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <!-- ── Build a quiz ─────────────────────────────────────────────────── -->
        <section class="mb-8">
            <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Build a Quiz</h2>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="space-y-4">
                    {#if isFundamentals}
                        <div>
                            <p class="block text-sm font-medium text-gray-700 mb-1">Operation</p>
                            <div class="flex gap-2">
                                <button
                                    on:click={() => { fundOperation = 'mult'; refreshFundSample(); }}
                                    class="flex-1 px-3 py-2 text-sm font-medium rounded border {fundOperation === 'mult' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}"
                                >Multiplication</button>
                                <button
                                    on:click={() => { fundOperation = 'div'; refreshFundSample(); }}
                                    class="flex-1 px-3 py-2 text-sm font-medium rounded border {fundOperation === 'div' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}"
                                >Division</button>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-3">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1" for="fund-min">Table (from)</label>
                                <input
                                    id="fund-min" type="number" min="0" max="12"
                                    bind:value={fundTableMin} on:change={refreshFundSample}
                                    class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1" for="fund-max">Table (to)</label>
                                <input
                                    id="fund-max" type="number" min="0" max="12"
                                    bind:value={fundTableMax} on:change={refreshFundSample}
                                    class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1" for="fund-count"># Questions</label>
                                <input
                                    id="fund-count" type="number" min="1" max="50"
                                    bind:value={fundCount}
                                    class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                />
                            </div>
                        </div>

                        <button
                            on:click={addFundamentalsToQueue}
                            class="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 transition-colors"
                        >
                            Add to Quiz
                        </button>
                    {:else}
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1" for="std-select">Standard</label>
                            <select
                                id="std-select"
                                bind:value={selectedStandardId}
                                on:change={onStandardChange}
                                class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                            >
                                {#each standardsList as std}
                                    <option value={std.id}>{std.shortName} ({std.id})</option>
                                {/each}
                            </select>
                        </div>

                        <div class="flex gap-2">
                            <button
                                on:click={generatePreview}
                                class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors"
                            >
                                Generate Preview
                            </button>
                            <button
                                on:click={addToQueue}
                                disabled={!previewQuestion}
                                class="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-40 transition-colors"
                            >
                                Add to Quiz
                            </button>
                        </div>
                        {#if !previewQuestion}
                            <p class="text-xs text-gray-400 italic">Generate a preview before adding it to the quiz.</p>
                        {/if}
                    {/if}

                    <!-- Queue -->
                    {#if queue.length > 0}
                        <div class="border-t border-gray-200 pt-3">
                            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                                Quiz Queue ({queue.length})
                            </p>
                            <ol class="space-y-1 max-h-64 overflow-y-auto">
                                {#each queue as q, i (q.order)}
                                    <li class="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
                                        <span class="text-gray-400 w-5 text-right">{i + 1}.</span>
                                        <span class="flex-1 text-gray-700">
                                            {q.questionData?.label || allStandardsInfo[q.standardId]?.shortName || q.standardId}
                                        </span>
                                        <button on:click={() => moveQueueItem(i, -1)} disabled={i === 0} class="text-gray-400 hover:text-indigo-600 disabled:opacity-30 px-1">▲</button>
                                        <button on:click={() => moveQueueItem(i, 1)} disabled={i === queue.length - 1} class="text-gray-400 hover:text-indigo-600 disabled:opacity-30 px-1">▼</button>
                                        <button on:click={() => removeFromQueue(i)} class="text-gray-400 hover:text-red-600 px-1">✕</button>
                                    </li>
                                {/each}
                            </ol>
                            <button
                                on:click={openSaveModal}
                                class="mt-3 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
                            >
                                Save as Quiz
                            </button>
                        </div>
                    {/if}
                </div>

                <!-- Preview -->
                <div>
                    {#if isFundamentals}
                        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Sample</p>
                        {#if fundSample}
                            <QuizQuestionPreview question={{ kind: 'fundamentals', ...fundSample, correct_answer: fundSample.answer }} />
                        {/if}
                        <p class="text-xs text-gray-400 italic mt-2">
                            Each problem is generated fresh — "Add to Quiz" creates {fundCount} question{fundCount === 1 ? '' : 's'} from this range right away.
                        </p>
                    {:else if previewQuestion}
                        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Preview</p>
                        {#key previewKey}
                            <QuizQuestionPreview question={previewQuestion} />
                        {/key}
                    {:else}
                        <div class="bg-gray-100 rounded p-8 text-center text-gray-400 text-sm">
                            Select a standard and click Generate Preview
                        </div>
                    {/if}
                </div>
            </div>
        </section>

        <!-- ── Saved quizzes ────────────────────────────────────────────────── -->
        <section class="mb-8">
            <div class="flex items-center justify-between mb-3">
                <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Saved Quizzes</h2>
                <a href="/teacher/assign/archive{$page.url.search}" class="text-xs text-indigo-600 hover:text-indigo-800">
                    View Archived Quizzes →
                </a>
            </div>
            {#if versionRows.length === 0}
                <p class="text-sm text-gray-400 italic">No saved quizzes yet — build one above.</p>
            {:else}
                <div class="space-y-2">
                    {#each versionRows as row (row.key)}
                        <div class="flex items-center justify-between bg-white border border-gray-200 rounded px-4 py-3">
                            <div>
                                <p class="text-sm font-medium text-gray-800">
                                    {row.quiz.name}
                                    {#if !row.isLatest}<span class="text-gray-400 font-normal">— older version</span>{/if}
                                </p>
                                <p class="text-xs text-gray-400">
                                    v{row.version} · {row.questionCount} question{row.questionCount === 1 ? '' : 's'}
                                </p>
                            </div>
                            <div class="flex gap-2">
                                <button on:click={() => openQuizPreview(row)} class="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Preview</button>
                                <button on:click={() => openAssignPanel(row.quiz, row.version)} class="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700">Assign</button>
                                {#if row.isLatest}
                                    <button on:click={() => handleRegenerate(row.quiz)} class="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Regenerate</button>
                                    <button on:click={() => handleArchive(row.quiz)} class="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-red-600">Archive</button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </section>

        <!-- ── Active assignments ───────────────────────────────────────────── -->
        <section>
            <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Active Assignments</h2>
            {#if activeAssignments.length === 0}
                <p class="text-sm text-gray-400 italic">Nothing currently assigned.</p>
            {:else}
                <div class="space-y-2">
                    {#each activeAssignments as assignment (assignment.id)}
                        {@const stats = summarize(assignment)}
                        <div class="bg-green-50 border border-green-200 rounded p-3 text-sm">
                            <div class="flex items-center justify-between">
                                <p class="font-medium text-green-800">
                                    {assignment.quizName}
                                    <span class="text-xs font-normal text-green-600 ml-1">
                                        ({assignment.gradingMode === 'quiz' ? 'Quiz mode' : 'Help mode'}
                                        · {assignment.targetStudentIds.length === students.length ? 'Whole class' : `${assignment.targetStudentIds.length} student${assignment.targetStudentIds.length === 1 ? '' : 's'}`})
                                    </span>
                                </p>
                                <button on:click={() => handleEndAssignment(assignment.id)} class="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700">
                                    End Assignment
                                </button>
                            </div>
                            <p class="text-green-700 mt-1">
                                {stats.completed} completed · {stats.inProgress} in progress · {stats.notStarted} not started
                                {#if stats.frozen > 0}· {stats.frozen} left undone{/if}
                            </p>
                        </div>
                    {/each}
                </div>
            {/if}
        </section>
    {/if}
</div>

<!-- ── Saved-quiz preview modal ─────────────────────────────────────────── -->
{#if previewingRow}
    <QuizPreviewModal
        title={`${previewingRow.quiz.name} (v${previewingRow.version})`}
        questions={previewingRow.questions}
        on:close={closeQuizPreview}
    />
{/if}

<!-- ── Save quiz modal ──────────────────────────────────────────────────── -->
{#if showSaveModal}
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30" on:click={() => (showSaveModal = false)} on:keydown={(e) => e.key === 'Escape' && (showSaveModal = false)} role="dialog" aria-modal="true" tabindex="-1">
        <div class="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" on:click|stopPropagation on:keydown|stopPropagation role="presentation">
            <h3 class="text-sm font-semibold text-gray-800 mb-3">Save Quiz</h3>
            <input
                type="text"
                bind:value={quizNameInput}
                placeholder="Quiz name"
                class="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-4"
            />
            <div class="flex justify-end gap-2">
                <button on:click={() => (showSaveModal = false)} class="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                <button on:click={saveQuiz} disabled={saving || !quizNameInput.trim()} class="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- ── Assign panel ─────────────────────────────────────────────────────── -->
{#if assigningQuiz}
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30" on:click={closeAssignPanel} on:keydown={(e) => e.key === 'Escape' && closeAssignPanel()} role="dialog" aria-modal="true" tabindex="-1">
        <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4" on:click|stopPropagation on:keydown|stopPropagation role="presentation">
            <h3 class="text-sm font-semibold text-gray-800 mb-4">Assign "{assigningQuiz.name}" (v{assigningVersion})</h3>

            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Grading Mode</p>
            <div class="flex gap-2 mb-4">
                <button
                    on:click={() => (gradingMode = 'quiz')}
                    class="flex-1 px-3 py-2 text-sm font-medium rounded border {gradingMode === 'quiz' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}"
                >
                    Quiz <span class="block text-[10px] font-normal opacity-80">Single attempt, no hints</span>
                </button>
                <button
                    on:click={() => (gradingMode = 'help')}
                    class="flex-1 px-3 py-2 text-sm font-medium rounded border {gradingMode === 'help' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}"
                >
                    Help <span class="block text-[10px] font-normal opacity-80">Hints + 2 attempts, like practice</span>
                </button>
            </div>

            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Assign To</p>
            <div class="flex gap-2 mb-3">
                <button
                    on:click={() => (targetMode = 'class')}
                    class="flex-1 px-3 py-2 text-sm font-medium rounded border {targetMode === 'class' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}"
                >
                    Whole Class
                </button>
                <button
                    on:click={() => (targetMode = 'individual')}
                    class="flex-1 px-3 py-2 text-sm font-medium rounded border {targetMode === 'individual' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}"
                >
                    Select Students
                </button>
            </div>

            {#if targetMode === 'individual'}
                <div class="max-h-40 overflow-y-auto border border-gray-200 rounded mb-4 divide-y divide-gray-100">
                    {#each students as student}
                        <label class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selectedTargetIds.includes(student.uid)} on:change={() => toggleTargetStudent(student.uid)} />
                            {student.displayName || student.uid}
                        </label>
                    {/each}
                </div>
            {/if}

            <div class="flex justify-end gap-2">
                <button on:click={closeAssignPanel} class="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                <button
                    on:click={confirmAssign}
                    disabled={assigning || (targetMode === 'individual' && selectedTargetIds.length === 0)}
                    class="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                >
                    {assigning ? 'Assigning…' : 'Assign'}
                </button>
            </div>
        </div>
    </div>
{/if}

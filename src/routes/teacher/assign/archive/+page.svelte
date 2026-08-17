<script>
    import { onMount, onDestroy } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { loadClass } from '$lib/utils/studentStore.js';
    import {
        subscribeArchivedQuizzesForClass,
        unarchiveQuiz,
        deleteQuizAndResults,
        loadQuizVersion
    } from '$lib/utils/quizStore.js';
    import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    import QuizPreviewModal from '$lib/components/QuizPreviewModal.svelte';

    let loading = true;
    let error = null;

    let classId = null;
    let classDoc = null;
    $: schoolId = classDoc?.schoolId ?? $session.schoolId;

    let archivedQuizzes = [];
    let unsubArchived = null;

    let unarchivingId = null;
    let deletingId = null;
    let previewingQuiz = null; // { quiz, questions }

    onMount(async () => {
        try {
            classId = $page.url.searchParams.get('classId');
            if (!classId) {
                const uid = $session.user?.uid;
                if ($session.role === 'admin' || $session.role === 'dev') {
                    const classesSna = await getDocs(collection(db, 'classes'));
                    classId = classesSna.docs[0]?.id;
                } else {
                    const userSnap = await getDoc(doc(db, 'users', uid));
                    classId = userSnap.exists() ? userSnap.data()?.classIds?.[0] : null;
                }
            }
            if (!classId) { error = 'No class assigned.'; loading = false; return; }

            classDoc = await loadClass(classId);
            if (!classDoc) { error = 'Class not found.'; loading = false; return; }

            unsubArchived = subscribeArchivedQuizzesForClass(classId, schoolId, (list) => {
                archivedQuizzes = list;
                loading = false;
            });
        } catch (e) {
            console.error(e);
            error = 'Failed to load archived quizzes.';
            loading = false;
        }
    });

    onDestroy(() => {
        if (unsubArchived) unsubArchived();
    });

    async function handleUnarchive(quiz) {
        if (!confirm(`Unarchive "${quiz.name}"? It will show up in Saved Quizzes again and can be assigned.`)) return;
        unarchivingId = quiz.id;
        try {
            await unarchiveQuiz(quiz.id);
        } catch (e) {
            console.error(e);
            alert('Failed to unarchive: ' + e.message);
        } finally {
            unarchivingId = null;
        }
    }

    async function handleDelete(quiz) {
        if (!confirm(`Delete "${quiz.name}"? This will remove the quiz and its results from your gradebook.`)) return;
        deletingId = quiz.id;
        try {
            await deleteQuizAndResults(quiz.id);
        } catch (e) {
            console.error(e);
            alert('Failed to delete: ' + e.message);
        } finally {
            deletingId = null;
        }
    }

    async function openPreview(quiz) {
        const versionDoc = await loadQuizVersion(quiz.id, quiz.currentVersion);
        previewingQuiz = {
            quiz,
            questions: (versionDoc?.questions || []).map((q) => q.questionData)
        };
    }

    function closePreview() {
        previewingQuiz = null;
    }
</script>

<div class="max-w-3xl">
    <div class="flex items-center gap-4 mb-6">
        <a href="/teacher/assign{$page.url.search}" class="text-sm text-indigo-600 hover:text-indigo-800">← Back to Assign</a>
    </div>

    <h1 class="text-xl font-semibold text-gray-800 mb-1">Archived Quizzes</h1>
    <p class="text-sm text-gray-500 mb-6">{classDoc?.name ?? ''}</p>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else if archivedQuizzes.length === 0}
        <p class="text-sm text-gray-400 italic">No archived quizzes.</p>
    {:else}
        <div class="space-y-2">
            {#each archivedQuizzes as quiz (quiz.id)}
                <div class="flex items-center justify-between bg-white border border-gray-200 rounded px-4 py-3">
                    <div>
                        <p class="text-sm font-medium text-gray-800">{quiz.name}</p>
                        <p class="text-xs text-gray-400">
                            v{quiz.currentVersion} · {(quiz.standardIds || []).length} question{(quiz.standardIds || []).length === 1 ? '' : 's'}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button on:click={() => openPreview(quiz)} class="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Preview</button>
                        <button
                            on:click={() => handleUnarchive(quiz)}
                            disabled={unarchivingId === quiz.id}
                            class="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                        >{unarchivingId === quiz.id ? 'Unarchiving…' : 'Unarchive'}</button>
                        <button
                            on:click={() => handleDelete(quiz)}
                            disabled={deletingId === quiz.id}
                            class="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
                        >{deletingId === quiz.id ? 'Deleting…' : 'Delete'}</button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

{#if previewingQuiz}
    <QuizPreviewModal
        title={`${previewingQuiz.quiz.name} (v${previewingQuiz.quiz.currentVersion})`}
        questions={previewingQuiz.questions}
        on:close={closePreview}
    />
{/if}

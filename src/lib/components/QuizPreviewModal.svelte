<script>
    // Click-through quiz question preview — shared by the Saved Quizzes list
    // and the Archive page, so both get the same wide/scrollable modal and
    // Prev/Next behavior for free.
    import { createEventDispatcher } from 'svelte';
    import QuizQuestionPreview from './QuizQuestionPreview.svelte';

    export let title;
    export let questions = [];

    const dispatch = createEventDispatcher();
    let index = 0;

    function prev() {
        if (index > 0) index--;
    }

    function next() {
        if (index < questions.length - 1) index++;
    }

    function close() {
        dispatch('close');
    }
</script>

<div
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
    on:click={close}
    on:keydown={(e) => {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') prev();
        else if (e.key === 'ArrowRight') next();
    }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
>
    <div
        class="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col"
        on:click|stopPropagation
        on:keydown|stopPropagation
        role="presentation"
    >
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h3 class="text-sm font-semibold text-gray-800">{title}</h3>
            <button on:click={close} class="text-xs text-gray-400 hover:text-gray-600">Close</button>
        </div>

        <div class="overflow-y-auto px-6 py-4 flex-1 min-h-0">
            {#if questions.length === 0}
                <p class="text-sm text-gray-400 italic">This version has no questions.</p>
            {:else}
                {#key index}
                    <QuizQuestionPreview question={questions[index]} />
                {/key}
            {/if}
        </div>

        {#if questions.length > 0}
            <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
                <button
                    on:click={prev}
                    disabled={index === 0}
                    class="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
                >← Prev</button>
                <span class="text-xs text-gray-500">Question {index + 1} of {questions.length}</span>
                <button
                    on:click={next}
                    disabled={index === questions.length - 1}
                    class="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
                >Next →</button>
            </div>
        {/if}
    </div>
</div>

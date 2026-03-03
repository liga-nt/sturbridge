<script>
    import { functions } from '$lib/firebase/client';
    import { httpsCallable } from 'firebase/functions';

    let standardId = '';
    let difficulty = 'standard';
    let count = 10;

    let status = 'idle'; // idle | loading | success | error
    let result = null;
    let errorMessage = '';

    async function handleGenerate() {
        if (!standardId.trim()) return;

        status = 'loading';
        result = null;
        errorMessage = '';

        try {
            const generateQuestions = httpsCallable(functions, 'generateQuestions');
            const response = await generateQuestions({
                standardId: standardId.trim(),
                difficulty,
                count
            });
            result = response.data;
            status = 'success';
        } catch (e) {
            errorMessage = e.message;
            status = 'error';
        }
    }
</script>

<div class="max-w-xl">
    <h1 class="text-2xl font-bold mb-2">Generate Questions</h1>
    <p class="text-gray-500 mb-8">Calls the AI pipeline and writes questions to Firestore with <code class="bg-gray-100 px-1 rounded">status: "pending"</code>. Review them in the <a href="/dev/review" class="text-indigo-600 hover:underline">Review queue</a>.</p>

    <div class="bg-white rounded-lg shadow p-6 space-y-5">
        <div>
            <label for="standardId" class="block text-sm font-medium text-gray-700 mb-1">
                Standard ID
            </label>
            <input
                id="standardId"
                type="text"
                bind:value={standardId}
                placeholder="e.g. C1b"
                class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
        </div>

        <div>
            <label for="difficulty" class="block text-sm font-medium text-gray-700 mb-1">
                Difficulty
            </label>
            <select
                id="difficulty"
                bind:value={difficulty}
                class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
                <option value="diagnostic">Diagnostic</option>
                <option value="standard">Standard</option>
                <option value="advanced">Advanced</option>
            </select>
        </div>

        <div>
            <label for="count" class="block text-sm font-medium text-gray-700 mb-1">
                Number of questions
            </label>
            <select
                id="count"
                bind:value={count}
                class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
            </select>
        </div>

        <button
            on:click={handleGenerate}
            disabled={status === 'loading' || !standardId.trim()}
            class="w-full rounded bg-indigo-600 py-2 px-4 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {status === 'loading' ? 'Generating...' : `Generate ${count} Questions`}
        </button>
    </div>

    {#if status === 'loading'}
        <div class="mt-6 bg-white rounded-lg shadow p-6">
            <p class="text-gray-500 text-sm">Calling AI pipeline — this may take 15–30 seconds...</p>
            <div class="mt-3 h-1 bg-gray-200 rounded overflow-hidden">
                <div class="h-full bg-indigo-500 animate-pulse w-full"></div>
            </div>
        </div>
    {/if}

    {#if status === 'success'}
        <div class="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
            <p class="font-medium text-green-800 mb-1">Generated {result.questionIds.length} questions</p>
            <p class="text-green-700 text-sm mb-3">All saved to Firestore with <code class="bg-green-100 px-1 rounded">status: "pending"</code>.</p>
            <a
                href="/dev/review"
                class="inline-block rounded bg-green-700 text-white text-sm px-4 py-2 hover:bg-green-800"
            >
                Go to Review Queue →
            </a>
        </div>
    {/if}

    {#if status === 'error'}
        <div class="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p class="font-medium text-red-800 mb-1">Generation failed</p>
            <p class="text-red-700 text-sm">{errorMessage}</p>
        </div>
    {/if}
</div>

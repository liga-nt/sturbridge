<script>
    import { onMount } from 'svelte';
    import { db } from '$lib/firebase/client';
    import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
    import { loadCourses } from '$lib/utils/studentStore.js';

    let courses = [];
    let selectedCourseId = '';
    let standards = [];   // full standard docs for selected course
    let drafts = {};      // { [id]: { timeLimit, problemsPerPage } }
    let saving = false;
    let saved = false;
    let error = null;

    onMount(async () => {
        const all = await loadCourses();
        courses = Object.values(all).sort((a, b) => a.label.localeCompare(b.label));
        if (courses.length) {
            selectedCourseId = courses[0].id;
            await loadStandards();
        }
    });

    async function loadStandards() {
        standards = [];
        drafts = {};
        if (!selectedCourseId) return;
        const snap = await getDocs(collection(db, 'standards'));
        standards = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => s.courseId === selectedCourseId)
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        for (const s of standards) {
            drafts[s.id] = {
                timeLimit:      s.timeLimit      ?? 60,
                problemsPerPage: s.problemsPerPage ?? 8
            };
        }
    }

    async function saveAll() {
        saving = true;
        saved  = false;
        error  = null;
        try {
            await Promise.all(
                standards.map(s =>
                    setDoc(doc(db, 'standards', s.id), {
                        timeLimit:      Number(drafts[s.id].timeLimit),
                        problemsPerPage: Number(drafts[s.id].problemsPerPage)
                    }, { merge: true })
                )
            );
            // Update local copies so display stays in sync
            standards = standards.map(s => ({ ...s, ...drafts[s.id] }));
            saved = true;
            setTimeout(() => saved = false, 2500);
        } catch (e) {
            error = e.message;
        } finally {
            saving = false;
        }
    }

    $: hasFundamentals = standards.some(s => s.timeLimit !== undefined || s.problemsPerPage !== undefined);
</script>

<div class="max-w-3xl">
    <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold text-gray-800">Standard Defaults</h1>
        <div class="flex items-center gap-3">
            <select
                bind:value={selectedCourseId}
                on:change={loadStandards}
                class="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700"
            >
                {#each courses as course}
                    <option value={course.id}>{course.label}</option>
                {/each}
            </select>
        </div>
    </div>

    {#if !standards.length}
        <p class="text-gray-400 text-sm">No standards found for this course.</p>

    {:else}
        <p class="text-xs text-gray-400 mb-4">
            These are global defaults. Teachers can override per class.
        </p>

        <div class="bg-white rounded-lg shadow overflow-hidden">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="text-left px-4 py-2.5 font-medium text-gray-600">Standard</th>
                        <th class="text-center px-4 py-2.5 font-medium text-gray-600 w-32">Time Limit (s)</th>
                        <th class="text-center px-4 py-2.5 font-medium text-gray-600 w-36">Problems / Page</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {#each standards as std}
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-2.5">
                                <div class="font-medium text-gray-800">{std.label ?? std.shortName ?? std.id}</div>
                                {#if std.level}
                                    <div class="text-xs text-gray-400">Level {std.level}</div>
                                {/if}
                            </td>
                            <td class="px-4 py-2.5 text-center">
                                <input
                                    type="number"
                                    min="10" max="600"
                                    bind:value={drafts[std.id].timeLimit}
                                    class="w-20 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400"
                                />
                            </td>
                            <td class="px-4 py-2.5 text-center">
                                <input
                                    type="number"
                                    min="1" max="50"
                                    bind:value={drafts[std.id].problemsPerPage}
                                    class="w-20 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400"
                                />
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <div class="mt-4 flex items-center gap-3">
            <button
                on:click={saveAll}
                disabled={saving}
                class="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
                {saving ? 'Saving…' : 'Save All'}
            </button>
            {#if saved}
                <span class="text-sm text-green-600">Saved.</span>
            {/if}
            {#if error}
                <span class="text-sm text-red-500">{error}</span>
            {/if}
        </div>
    {/if}
</div>

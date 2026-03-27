<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { session } from '$lib/stores/session';
    import { loadAllStandardStates, loadAllStandards, loadStudentState } from '$lib/utils/studentStore.js';
    import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;

    let studentId = '';
    let studentDoc = null;
    let progressState = null;
    let standardStates = {};
    let allStandardsInfo = {};
    let classDoc = null;
    let orderedStandards = [];

    $: studentId = $page.params.studentId;

    onMount(async () => {
        try {
            allStandardsInfo = await loadAllStandards();

            // Load student user doc
            const snap = await getDoc(doc(db, 'users', studentId));
            studentDoc = snap.exists() ? snap.data() : { displayName: studentId };

            // Load progress
            progressState = await loadStudentState(studentId);
            standardStates = await loadAllStandardStates(studentId);

            // Load class for progression order
            const classId = progressState?.classId || studentDoc?.classIds?.[0];
            if (classId) {
                const classSnap = await getDoc(doc(db, 'classes', classId));
                classDoc = classSnap.exists() ? classSnap.data() : null;
            }

            orderedStandards = (classDoc?.standardProgression || Object.keys(allStandardsInfo)).map(
                (id) => ({
                    id,
                    shortName: allStandardsInfo[id]?.shortName || id,
                    state: standardStates[id] || null,
                    active: progressState?.activeStandardIds?.includes(id) || false
                })
            );
        } catch (e) {
            console.error(e);
            error = 'Failed to load student data.';
        } finally {
            loading = false;
        }
    });

    $: masteredCount = orderedStandards.filter((s) => s.state?.mastered).length;
    $: inProgressCount = orderedStandards.filter((s) => s.state && !s.state.mastered && s.state.attempts > 0).length;
    $: totalAttempts = orderedStandards.reduce((sum, s) => sum + (s.state?.attempts || 0), 0);
</script>

<div class="max-w-3xl">
    <div class="mb-4">
        <a href="/teacher" class="text-sm text-indigo-600 hover:text-indigo-800">← Back to class</a>
    </div>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <div class="flex items-baseline gap-4 mb-6">
            <h1 class="text-xl font-semibold text-gray-800">
                {studentDoc?.displayName || studentId}
            </h1>
            <span class="text-sm text-gray-500">{studentDoc?.email || ''}</span>
        </div>

        <!-- Summary stats -->
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-white rounded-lg p-4 border border-gray-200 text-center">
                <p class="text-2xl font-bold text-green-600">{masteredCount}</p>
                <p class="text-xs text-gray-500 mt-1">Standards mastered</p>
            </div>
            <div class="bg-white rounded-lg p-4 border border-gray-200 text-center">
                <p class="text-2xl font-bold text-yellow-500">{inProgressCount}</p>
                <p class="text-xs text-gray-500 mt-1">In progress</p>
            </div>
            <div class="bg-white rounded-lg p-4 border border-gray-200 text-center">
                <p class="text-2xl font-bold text-gray-700">{totalAttempts}</p>
                <p class="text-xs text-gray-500 mt-1">Total attempts</p>
            </div>
        </div>

        <!-- Standard-by-standard table -->
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                        <th class="text-left px-4 py-3">Standard</th>
                        <th class="text-left px-4 py-3">Status</th>
                        <th class="text-center px-4 py-3">Streak</th>
                        <th class="text-center px-4 py-3">Attempts</th>
                        <th class="text-center px-4 py-3">Assisted</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {#each orderedStandards as std}
                        {@const s = std.state}
                        <tr class="hover:bg-gray-50 {std.active ? 'bg-indigo-50' : ''}">
                            <td class="px-4 py-3">
                                <span class="font-medium text-gray-800">{std.shortName}</span>
                                <span class="text-xs text-gray-400 ml-1">{std.id}</span>
                                {#if std.active}
                                    <span class="ml-2 text-xs text-indigo-600 font-medium">Active</span>
                                {/if}
                            </td>
                            <td class="px-4 py-3">
                                {#if s?.mastered}
                                    <span class="inline-flex items-center gap-1 text-green-700 font-medium">
                                        <span class="w-2 h-2 rounded-full bg-green-500"></span> Mastered
                                    </span>
                                {:else if s && s.attempts > 0}
                                    <span class="inline-flex items-center gap-1 text-yellow-700">
                                        <span class="w-2 h-2 rounded-full bg-yellow-400"></span> In progress
                                    </span>
                                {:else}
                                    <span class="text-gray-300">—</span>
                                {/if}
                            </td>
                            <td class="px-4 py-3 text-center text-gray-600">
                                {s ? `${s.streak ?? 0} / 2` : '—'}
                            </td>
                            <td class="px-4 py-3 text-center text-gray-600">
                                {s?.attempts ?? '—'}
                            </td>
                            <td class="px-4 py-3 text-center text-gray-600">
                                {s?.assistedAttempts ?? '—'}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

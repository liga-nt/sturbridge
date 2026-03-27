<script>
    import { onMount } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import {
        loadClass,
        loadAllStandardStates,
        loadAllStandards
    } from '$lib/utils/studentStore.js';
    import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;

    let classDoc = null;
    let students = [];       // [{ uid, displayName }]
    let standards = [];      // ordered array of { id, shortName, description }
    let progressMap = {};    // { uid: { [standardId]: standardState } }

    // Popover state
    let popoverCell = null;  // { uid, standardId, state }
    let popoverStd = null;   // { id, shortName, description }

    onMount(async () => {
        try {
            // Find teacher's class — URL param takes priority
            const urlClassId = $page.url.searchParams.get('classId');
            let classId = urlClassId;

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
            if (!classDoc) { error = 'Class not found.'; loading = false; return; }

            // Load all standards info
            const allStd = await loadAllStandards();

            // Build ordered standards array from class progression
            standards = (classDoc.standardProgression || []).map((id) => ({
                id,
                shortName: allStd[id]?.shortName || id,
                description: allStd[id]?.description || ''
            }));

            // Load student docs
            const studentIds = classDoc.studentIds || [];
            const studentDocs = await Promise.all(
                studentIds.map((sid) => getDoc(doc(db, 'users', sid)).then((s) => s.exists() ? { uid: s.id, ...s.data() } : { uid: sid, displayName: sid }))
            );
            students = studentDocs.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

            // Load all standard states for each student
            const progressEntries = await Promise.all(
                studentIds.map(async (sid) => [sid, await loadAllStandardStates(sid)])
            );
            progressMap = Object.fromEntries(progressEntries);

        } catch (e) {
            console.error(e);
            error = 'Failed to load class data.';
        } finally {
            loading = false;
        }
    });

    function cellState(uid, standardId) {
        const state = progressMap[uid]?.[standardId];
        if (!state) return 'empty';
        if (state.mastered) return 'mastered';
        if (state.streak > 0) return 'progress';
        if (state.attempts > 0) return 'started';
        return 'empty';
    }

    function isActive(uid, standardId) {
        // Check if standardId is in the student's activeStandardIds
        // We don't have the top-level doc loaded here, but we can infer
        return false; // simplified — full version would need studentProgress top docs
    }

    function openPopover(uid, standardId) {
        const state = progressMap[uid]?.[standardId] || null;
        popoverCell = { uid, standardId, state };
        popoverStd = standards.find((s) => s.id === standardId) || { id: standardId, shortName: standardId };
    }

    function closePopover() {
        popoverCell = null;
        popoverStd = null;
    }
</script>

<svelte:window on:click={closePopover} />

<div class="relative">
    {#if loading}
        <p class="text-gray-400">Loading class data...</p>

    {:else if error}
        <p class="text-red-600">{error}</p>

    {:else}
        <div class="mb-4 flex items-baseline gap-4">
            <h1 class="text-xl font-semibold text-gray-800">{classDoc?.name || 'Class'}</h1>
            <span class="text-sm text-gray-500">{students.length} students · {standards.length} standards</span>
        </div>

        <!-- Legend -->
        <div class="flex items-center gap-4 mb-4 text-xs text-gray-600">
            <span class="flex items-center gap-1"><span class="inline-block w-4 h-4 rounded-full bg-green-500"></span> Mastered</span>
            <span class="flex items-center gap-1"><span class="inline-block w-4 h-4 rounded-full bg-yellow-400"></span> In progress</span>
            <span class="flex items-center gap-1"><span class="inline-block w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></span> Not started</span>
        </div>

        <!-- Grid -->
        <div class="overflow-x-auto">
            <table class="text-xs border-collapse w-full">
                <thead>
                    <tr>
                        <th class="text-left font-medium text-gray-600 pr-4 pb-2 sticky left-0 bg-gray-50 z-10 min-w-36">Student</th>
                        {#each standards as std}
                            <th class="pb-2 px-2 font-normal">
                                <button
                                    class="flex items-start justify-center text-gray-400 hover:text-indigo-600 relative group w-full"
                                    title="{std.shortName} ({std.id})"
                                    on:click|stopPropagation
                                >
                                    <span class="text-[11px] font-medium text-gray-500 select-none"
                                        style="writing-mode: vertical-rl; transform: rotate(180deg); max-height: 130px; overflow: hidden; display:block; line-height:1.3;"
                                    >{std.shortName}</span>
                                    <!-- Hover popover -->
                                    <div class="hidden group-hover:block absolute top-full left-1/2 -translate-x-1/2 mt-1 w-56 bg-white shadow-lg rounded p-3 text-left z-50 border border-gray-200">
                                        <p class="font-semibold text-gray-800 mb-1">{std.shortName}</p>
                                        <p class="text-[10px] text-indigo-600 mb-1">{std.id}</p>
                                        <p class="text-gray-600 text-[10px] leading-tight">{std.description}</p>
                                    </div>
                                </button>
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    {#each students as student}
                        <tr class="hover:bg-gray-50">
                            <td class="py-1 pr-4 font-medium text-gray-700 sticky left-0 bg-white z-10 whitespace-nowrap">
                                <a href="/teacher/student/{student.uid}{$page.url.search}" class="hover:text-indigo-600 transition-colors">
                                    {student.displayName || student.uid}
                                </a>
                            </td>
                            {#each standards as std}
                                {@const state = cellState(student.uid, std.id)}
                                <td class="py-1 px-2 text-center">
                                    <button
                                        class="w-5 h-5 rounded-full inline-flex items-center justify-center transition-transform hover:scale-125
                                            {state === 'mastered' ? 'bg-green-500' :
                                             state === 'progress' ? 'bg-yellow-400' :
                                             state === 'started'  ? 'border-2 border-gray-300 bg-white' :
                                             'border border-gray-200 bg-white'}"
                                        on:click|stopPropagation={() => openPopover(student.uid, std.id)}
                                        title="{student.displayName}: {std.shortName}"
                                    ></button>
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <!-- Cell popover -->
        {#if popoverCell}
            <div
                class="fixed inset-0 z-40 flex items-center justify-center"
                on:click={closePopover}
                on:keydown={(e) => e.key === 'Escape' && closePopover()}
                role="dialog"
                aria-modal="true"
                tabindex="-1"
            >
                <div
                    class="bg-white rounded-lg shadow-xl p-5 max-w-xs w-full mx-4 z-50 border border-gray-200"
                    on:click|stopPropagation
                    on:keydown|stopPropagation
                    role="presentation"
                >
                    <p class="font-semibold text-gray-800 mb-1">
                        {students.find((s) => s.uid === popoverCell.uid)?.displayName || popoverCell.uid}
                    </p>
                    <p class="text-sm text-indigo-600 mb-3">{popoverStd?.shortName} ({popoverCell.standardId})</p>
                    {#if popoverCell.state}
                        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <dt class="text-gray-500">Status</dt>
                            <dd class="font-medium {popoverCell.state.mastered ? 'text-green-600' : 'text-yellow-600'}">
                                {popoverCell.state.mastered ? 'Mastered' : 'In progress'}
                            </dd>
                            <dt class="text-gray-500">Streak</dt>
                            <dd>{popoverCell.state.streak ?? 0} / 2</dd>
                            <dt class="text-gray-500">Attempts</dt>
                            <dd>{popoverCell.state.attempts ?? 0}</dd>
                            <dt class="text-gray-500">Assisted</dt>
                            <dd>{popoverCell.state.assistedAttempts ?? 0}</dd>
                        </dl>
                    {:else}
                        <p class="text-sm text-gray-400 italic">Not started yet.</p>
                    {/if}
                    <button
                        on:click={closePopover}
                        class="mt-4 text-xs text-gray-400 hover:text-gray-600"
                    >Close</button>
                </div>
            </div>
        {/if}
    {/if}
</div>

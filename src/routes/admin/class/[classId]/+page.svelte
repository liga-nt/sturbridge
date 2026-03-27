<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { loadClass, loadAllStandardStates, loadAllStandards } from '$lib/utils/studentStore.js';
    import { courseLabel } from '$lib/utils/courses.js';
    import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;

    let classDoc = null;
    let students = [];
    let standards = [];
    let progressMap = {};

    $: classId = $page.params.classId;

    onMount(async () => {
        try {
            classDoc = await loadClass(classId);
            if (!classDoc) { error = 'Class not found.'; loading = false; return; }

            const allStd = await loadAllStandards();
            standards = (classDoc.standardProgression || []).map((id) => ({
                id,
                shortName: allStd[id]?.shortName || id,
                description: allStd[id]?.description || ''
            }));

            const studentIds = classDoc.studentIds || [];
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

    $: masteredPerStudent = students.map((s) => {
        const count = standards.filter((std) => progressMap[s.uid]?.[std.id]?.mastered).length;
        return { uid: s.uid, count };
    });

    $: classMasteryPct = students.length > 0
        ? Math.round(masteredPerStudent.reduce((sum, s) => sum + s.count, 0) / (students.length * standards.length || 1) * 100)
        : 0;
</script>

<div>
    <div class="mb-4 flex items-center justify-between">
        <a href="/admin" class="text-sm text-indigo-600 hover:text-indigo-800">← All classes</a>
        <a href="/teacher?classId={classId}" class="text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1 hover:bg-indigo-50 transition-colors">
            View as Teacher →
        </a>
    </div>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <div class="flex items-baseline gap-4 mb-4">
            <h1 class="text-xl font-semibold text-gray-800">{classDoc?.name || classId}</h1>
            {#if classDoc?.grade && classDoc?.subject}
                <span class="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {courseLabel(classDoc.grade, classDoc.subject)}
                </span>
            {/if}
            <span class="text-sm text-gray-500">
                {students.length} students · Class mastery: {classMasteryPct}%
            </span>
        </div>

        <!-- Quick stats -->
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
                <p class="text-2xl font-bold text-indigo-600">{students.length}</p>
                <p class="text-xs text-gray-500 mt-1">Students</p>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
                <p class="text-2xl font-bold text-green-600">{classMasteryPct}%</p>
                <p class="text-xs text-gray-500 mt-1">Avg mastery</p>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
                <p class="text-2xl font-bold text-red-500">
                    {standards.filter((std) => {
                        const masteredCount = students.filter((s) => progressMap[s.uid]?.[std.id]?.mastered).length;
                        return students.length > 0 && masteredCount / students.length < 0.4;
                    }).length}
                </p>
                <p class="text-xs text-gray-500 mt-1">Struggling standards</p>
            </div>
        </div>

        <!-- Read-only mastery grid -->
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Mastery Grid (read-only)</p>
        <div class="overflow-x-auto">
            <table class="text-xs border-collapse w-full">
                <thead>
                    <tr>
                        <th class="text-left font-medium text-gray-600 pr-4 pb-2 sticky left-0 bg-gray-50 z-10 min-w-36">Student</th>
                        {#each standards as std}
                            <th class="pb-2 px-2" title="{std.shortName} ({std.id})">
                                <span
                                    class="text-[11px] font-medium text-gray-500 select-none block"
                                    style="writing-mode: vertical-rl; transform: rotate(180deg); max-height: 130px; overflow: hidden; line-height:1.3;"
                                >{std.shortName}</span>
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    {#each students as student}
                        <tr class="hover:bg-gray-50">
                            <td class="py-1 pr-4 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap text-xs">
                                {student.displayName || student.uid}
                            </td>
                            {#each standards as std}
                                {@const state = cellState(student.uid, std.id)}
                                <td class="py-1 px-2 text-center">
                                    <div
                                        class="w-5 h-5 rounded-full inline-block
                                            {state === 'mastered' ? 'bg-green-500' :
                                             state === 'progress' ? 'bg-yellow-400' :
                                             state === 'started'  ? 'border-2 border-gray-300 bg-white' :
                                             'border border-gray-200 bg-white'}"
                                        title="{student.displayName}: {std.shortName}"
                                    ></div>
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

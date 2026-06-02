<script>
    import { onMount } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { loadClass, loadWeeklySessions } from '$lib/utils/studentStore.js';
    import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;

    let classId = null;
    let classDoc = null;
    let students = [];      // [{ uid, displayName }]
    let sessions = [];      // raw session docs for current week

    let weekOffset = 0;     // 0 = current week, -1 = last week, etc.

    // Popover state
    let popoverData = null; // { studentId, date, daySessions }

    // ── Week helpers ───────────────────────────────────────────────────────────

    function getWeekBounds(offset) {
        const now = new Date();
        const day = now.getDay(); // 0=Sun
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { monday, sunday };
    }

    function toISODate(d) {
        return d.toISOString().slice(0, 10);
    }

    function weekLabel(offset) {
        const { monday, sunday } = getWeekBounds(offset);
        const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${fmt(monday)} – ${fmt(sunday)}`;
    }

    function weekDays(offset) {
        const { monday } = getWeekBounds(offset);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return { date: toISODate(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }) };
        });
    }

    // ── Data loading ───────────────────────────────────────────────────────────

    onMount(async () => {
        try {
            const urlClassId = $page.url.searchParams.get('classId');
            classId = urlClassId;

            if (!classId) {
                const uid = $session.user?.uid;
                if ($session.role === 'admin' || $session.role === 'dev') {
                    const snap = await getDocs(collection(db, 'classes'));
                    classId = snap.docs[0]?.id;
                } else {
                    const userSnap = await getDoc(doc(db, 'users', uid));
                    classId = userSnap.exists() ? userSnap.data()?.classIds?.[0] : null;
                }
            }

            if (!classId) { error = 'No class assigned.'; loading = false; return; }

            classDoc = await loadClass(classId);
            if (!classDoc) { error = 'Class not found.'; loading = false; return; }

            const studentIds = classDoc.studentIds || [];
            const studentDocs = await Promise.all(
                studentIds.map(sid =>
                    getDoc(doc(db, 'users', sid)).then(s =>
                        s.exists() ? { uid: s.id, ...s.data() } : { uid: sid, displayName: sid }
                    )
                )
            );
            students = studentDocs.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

            await loadSessions();
        } catch (e) {
            console.error(e);
            error = 'Failed to load data.';
        } finally {
            loading = false;
        }
    });

    async function loadSessions() {
        const { monday, sunday } = getWeekBounds(weekOffset);
        sessions = await loadWeeklySessions(classId, toISODate(monday), toISODate(sunday));
    }

    async function changeWeek(delta) {
        weekOffset += delta;
        loading = true;
        try {
            await loadSessions();
        } finally {
            loading = false;
        }
    }

    // ── Aggregation ────────────────────────────────────────────────────────────

    function totalSec(session) {
        return Object.values(session.standardTimes ?? {})
            .reduce((s, t) => s + (t.practiceSec ?? 0) + (t.masterySec ?? 0), 0);
    }

    function masterySec(session) {
        return Object.values(session.standardTimes ?? {})
            .reduce((s, t) => s + (t.masterySec ?? 0), 0);
    }

    // Returns { totalSec, masterySec } for a student on a specific date
    function cellTotals(uid, date) {
        const daySessions = sessions.filter(s => s.studentId === uid && s.date === date);
        return {
            total: daySessions.reduce((s, sess) => s + totalSec(sess), 0),
            mastery: daySessions.reduce((s, sess) => s + masterySec(sess), 0),
            overtime: daySessions.some(s => s.overtime),
            sessions: daySessions,
        };
    }

    function weekTotal(uid) {
        return sessions
            .filter(s => s.studentId === uid)
            .reduce((s, sess) => s + totalSec(sess), 0);
    }

    function weekMastery(uid) {
        return sessions
            .filter(s => s.studentId === uid)
            .reduce((s, sess) => s + masterySec(sess), 0);
    }

    function fmt(sec) {
        if (sec < 60) return `${sec}s`;
        return `${Math.round(sec / 60)}m`;
    }

    // ── Popover ────────────────────────────────────────────────────────────────

    function openPopover(uid, date) {
        const daySessions = sessions.filter(s => s.studentId === uid && s.date === date);
        if (!daySessions.length) return;
        const student = students.find(s => s.uid === uid);
        popoverData = { uid, date, displayName: student?.displayName ?? uid, sessions: daySessions };
    }

    function closePopover() { popoverData = null; }
</script>

<svelte:window on:click={closePopover} />

<div>
    {#if error}
        <p class="text-red-600">{error}</p>

    {:else}

        <!-- Header -->
        <div class="mb-5 flex items-center gap-4">
            <h1 class="text-xl font-semibold text-gray-800">Practice Log</h1>
            <div class="flex items-center gap-2 ml-4">
                <button
                    on:click={() => changeWeek(-1)}
                    class="px-2 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-50"
                >←</button>
                <span class="text-sm text-gray-700 min-w-44 text-center">{weekLabel(weekOffset)}</span>
                <button
                    on:click={() => changeWeek(1)}
                    disabled={weekOffset >= 0}
                    class="px-2 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
                >→</button>
            </div>
            {#if loading}
                <span class="text-xs text-gray-400 ml-2">Loading…</span>
            {/if}
        </div>

        {#if !loading}
            {@const days = weekDays(weekOffset)}

            {#if students.length === 0}
                <p class="text-sm text-gray-400 italic">No students in this class.</p>
            {:else if sessions.length === 0}
                <p class="text-sm text-gray-400 italic">No practice sessions recorded this week.</p>
            {/if}

            <div class="overflow-x-auto">
                <table class="text-xs border-collapse">
                    <thead>
                        <tr>
                            <th class="text-left font-medium text-gray-600 pr-6 pb-2 min-w-36 sticky left-0 bg-gray-50 z-10">Student</th>
                            {#each days as day}
                                <th class="pb-2 px-3 font-normal text-gray-500 text-center w-16">{day.label}</th>
                            {/each}
                            <th class="pb-2 px-3 font-medium text-gray-600 text-center w-16">Week</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each students as student}
                            {@const wTotal = weekTotal(student.uid)}
                            {@const wMastery = weekMastery(student.uid)}

                            <!-- Total row -->
                            <tr class="hover:bg-gray-50 border-t border-gray-100">
                                <td class="py-1.5 pr-6 font-medium text-gray-700 sticky left-0 bg-white z-10 whitespace-nowrap">
                                    <a href="/teacher/student/{student.uid}{$page.url.search}"
                                       class="hover:text-indigo-600 transition-colors">
                                        {student.displayName || student.uid}
                                    </a>
                                </td>
                                {#each days as day}
                                    {@const cell = cellTotals(student.uid, day.date)}
                                    <td class="py-1.5 px-3 text-center">
                                        {#if cell.total > 0}
                                            <button
                                                class="font-medium {cell.overtime ? 'text-amber-600' : 'text-gray-800'} hover:text-indigo-600 transition-colors"
                                                on:click|stopPropagation={() => openPopover(student.uid, day.date)}
                                                title="Click to see session details"
                                            >{fmt(cell.total)}</button>
                                        {:else}
                                            <span class="text-gray-300">—</span>
                                        {/if}
                                    </td>
                                {/each}
                                <td class="py-1.5 px-3 text-center font-semibold {wTotal > 0 ? 'text-gray-800' : 'text-gray-300'}">
                                    {wTotal > 0 ? fmt(wTotal) : '—'}
                                </td>
                            </tr>

                            <!-- Mastery sub-row -->
                            <tr class="hover:bg-gray-50">
                                <td class="pb-1.5 pr-6 sticky left-0 bg-white z-10">
                                    <span class="text-gray-400 pl-2">mastery</span>
                                </td>
                                {#each days as day}
                                    {@const cell = cellTotals(student.uid, day.date)}
                                    <td class="pb-1.5 px-3 text-center text-gray-400">
                                        {cell.mastery > 0 ? fmt(cell.mastery) : ''}
                                    </td>
                                {/each}
                                <td class="pb-1.5 px-3 text-center text-gray-400">
                                    {wMastery > 0 ? fmt(wMastery) : ''}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <p class="mt-4 text-xs text-gray-400">
                Times shown are active math time (pauses during 10+ second idle breaks). Amber = went over session limit.
            </p>
        {/if}
    {/if}
</div>

<!-- Day detail popover -->
{#if popoverData}
    <div
        class="fixed inset-0 z-40 flex items-center justify-center"
        on:click={closePopover}
        on:keydown={(e) => e.key === 'Escape' && closePopover()}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div
            class="bg-white rounded-lg shadow-xl p-5 max-w-sm w-full mx-4 z-50 border border-gray-200"
            on:click|stopPropagation
            on:keydown|stopPropagation
            role="presentation"
        >
            <p class="font-semibold text-gray-800">{popoverData.displayName}</p>
            <p class="text-xs text-gray-400 mb-3">{popoverData.date}</p>

            {#each popoverData.sessions as sess, i}
                {@const total = totalSec(sess)}
                {@const mastery = masterySec(sess)}
                <div class="mb-3 {i > 0 ? 'pt-3 border-t border-gray-100' : ''}">
                    <div class="flex justify-between text-sm mb-1">
                        <span class="text-gray-600">Session {i + 1}</span>
                        <span class="font-medium {sess.overtime ? 'text-amber-600' : 'text-gray-700'}">
                            {fmt(total)} total
                        </span>
                    </div>
                    <div class="text-xs text-gray-500 mb-1">
                        {fmt(total - mastery)} practice · {fmt(mastery)} mastery
                    </div>
                    {#if Object.keys(sess.standardTimes ?? {}).length > 0}
                        <div class="mt-1 space-y-0.5">
                            {#each Object.entries(sess.standardTimes) as [stdId, times]}
                                {@const stdTotal = (times.practiceSec ?? 0) + (times.masterySec ?? 0)}
                                {#if stdTotal >= 5}
                                    <div class="flex items-center gap-2 text-xs">
                                        <span class="text-gray-400 font-mono">{stdId}</span>
                                        <span class="text-gray-600">{fmt(stdTotal)}</span>
                                        {#if times.masterySec >= 5}
                                            <span class="text-amber-600">({fmt(times.masterySec)} mastery)</span>
                                        {/if}
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}

            <button on:click={closePopover} class="mt-2 text-xs text-gray-400 hover:text-gray-600">
                Close
            </button>
        </div>
    </div>
{/if}

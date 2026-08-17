<script>
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import {
        loadClass,
        loadAllStandardStates,
        loadAllStandards,
        loadCourse,
        subscribeWeeklySessions
    } from '$lib/utils/studentStore.js';
    import {
        subscribeQuizAssignmentsForClass,
        subscribeProgressForClass,
        deleteQuizAssignment
    } from '$lib/utils/quizStore.js';
    import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;

    // Gradebook sub-tabs
    let subView = 'mastery'; // 'mastery' | 'results' | 'practice'
    let resultsLoading = false;
    let quizAssignmentsForClass = [];
    let progressDocsForClass = [];
    let resultsMap = {};       // { [uid]: { [assignmentId]: progressDoc } }
    let resultsPopoverCell = null; // { uid, assignment, progress }
    let unsubQuizAssignments = null;
    let unsubProgress = null;

    // Practice Log
    let practiceLoaded = false;
    let practiceLoading = false;
    let practiceSessions = [];       // raw session docs for the current week
    let practiceWeekOffset = 0;      // 0 = current week, -1 = last week, etc.
    let practicePopoverData = null;  // { uid, date, displayName, sessions }
    let unsubPracticeSessions = null;

    let classDoc = null;
    let classId  = null;
    let course   = null;
    // Derived from the class being viewed, not the caller's own claim — same
    // reasoning as teacher/assign: a dev/admin impersonating this class must
    // use the class's actual school, not their own (often null) session claim.
    $: schoolId = classDoc?.schoolId ?? $session.schoolId;
    let allStdDocs = {};     // { [id]: full standard doc }
    let students = [];       // [{ uid, displayName }]
    let standards = [];      // ordered array of { id, shortName, description }
    let progressMap = {};    // { uid: { [standardId]: standardState } }

    // Popover state
    let popoverCell = null;  // { uid, standardId, state }
    let popoverStd = null;   // { id, shortName, description }

    // Timer/pace settings now live on the Standards page (Settings tab).

    onMount(async () => {
        try {
            // Find teacher's class — URL param takes priority
            const urlClassId = $page.url.searchParams.get('classId');
            classId = urlClassId;

            if (!classId) {
                const uid = $session.user?.uid;
                const userSnap = await getDoc(doc(db, 'users', uid));
                const userData = userSnap.exists() ? userSnap.data() : null;

                if ($session.role === 'admin' || $session.role === 'dev') {
                    const classesSna = await getDocs(collection(db, 'classes'));
                    classId = classesSna.docs[0]?.id;
                } else {
                    const classIds = userData?.classIds || [];
                    if (classIds.length > 1) {
                        // Teacher has more than one class and didn't specify
                        // which — send them to the picker instead of silently
                        // guessing the first one.
                        goto('/teacher/classes');
                        return;
                    }
                    classId = classIds[0];
                }
            }

            if (!classId) { error = 'No class assigned.'; loading = false; return; }

            classDoc = await loadClass(classId);
            if (!classDoc) { error = 'Class not found.'; loading = false; return; }

            if (classDoc.courseId) course = await loadCourse(classDoc.courseId);

            // Load all standards info
            allStdDocs = await loadAllStandards();

            // Build ordered standards array from class progression
            standards = (classDoc.standardProgression || []).map((id) => ({
                id,
                shortName: allStdDocs[id]?.shortName || allStdDocs[id]?.label || id,
                description: allStdDocs[id]?.description || '',
                order: allStdDocs[id]?.order ?? null
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

    onDestroy(() => {
        if (unsubQuizAssignments) unsubQuizAssignments();
        if (unsubProgress) unsubProgress();
        if (unsubPracticeSessions) unsubPracticeSessions();
    });

    function stdLabel(id) {
        return id.replace(/^\d+\./, '');
    }

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
        resultsPopoverCell = null;
        practicePopoverData = null;
    }

    // Live: Assignment Results subscribes once (on first visit to the tab)
    // and stays subscribed for the rest of the page's lifetime, so completion/
    // in-progress status updates as students answer instead of only refreshing
    // when the teacher leaves and re-enters the tab.
    let resultsSubsStarted = false;
    let assignmentsReady = false;
    let progressReady = false;

    function startResultsSubscriptions() {
        if (resultsSubsStarted) return;
        resultsSubsStarted = true;
        resultsLoading = true;

        unsubQuizAssignments = subscribeQuizAssignmentsForClass(classId, schoolId, (list) => {
            quizAssignmentsForClass = list;
            assignmentsReady = true;
            if (progressReady) resultsLoading = false;
        });

        unsubProgress = subscribeProgressForClass(classId, schoolId, (list) => {
            progressDocsForClass = list;
            progressReady = true;
            if (assignmentsReady) resultsLoading = false;
        });
    }

    function switchToResults() {
        subView = 'results';
        startResultsSubscriptions();
    }

    $: resultsMap = buildResultsMap(progressDocsForClass);
    function buildResultsMap(progressDocs) {
        const map = {};
        for (const p of progressDocs) {
            if (!map[p.studentId]) map[p.studentId] = {};
            map[p.studentId][p.assignmentId] = p;
        }
        return map;
    }

    function resultCellState(progress) {
        if (!progress) return 'empty';
        if (progress.status === 'completed') {
            return progress.score === progress.total ? 'complete_full' : 'complete_partial';
        }
        if (progress.status === 'frozen') return 'frozen';
        return 'in_progress';
    }

    function openResultsPopover(uid, assignment) {
        resultsPopoverCell = { uid, assignment, progress: resultsMap[uid]?.[assignment.id] || null };
    }

    // ── Practice Log ──────────────────────────────────────────────────────────

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

    function practiceWeekLabel(offset) {
        const { monday, sunday } = getWeekBounds(offset);
        const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${fmtDate(monday)} – ${fmtDate(sunday)}`;
    }

    function practiceWeekDays(offset) {
        const { monday } = getWeekBounds(offset);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return { date: toISODate(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }) };
        });
    }

    // Live: re-subscribes whenever the viewed week changes (the date-range
    // query itself changes), so a student finishing a visit shows up in an
    // already-open Practice Log tab instead of only refreshing on next visit.
    function subscribePracticeWeek() {
        if (unsubPracticeSessions) unsubPracticeSessions();
        const { monday, sunday } = getWeekBounds(practiceWeekOffset);
        practiceLoading = true;
        unsubPracticeSessions = subscribeWeeklySessions(classId, toISODate(monday), toISODate(sunday), (list) => {
            practiceSessions = list;
            practiceLoading = false;
        });
    }

    function switchToPractice() {
        subView = 'practice';
        if (practiceLoaded) return;
        practiceLoaded = true;
        subscribePracticeWeek();
    }

    function changePracticeWeek(delta) {
        practiceWeekOffset += delta;
        subscribePracticeWeek();
    }

    function sessionTotalSec(sess) {
        return Object.values(sess.standardTimes ?? {})
            .reduce((s, t) => s + (t.practiceSec ?? 0) + (t.masterySec ?? 0), 0);
    }

    // Returns { total, overtime } for a student on a specific date
    function practiceCellTotals(uid, date) {
        const daySessions = practiceSessions.filter((s) => s.studentId === uid && s.date === date);
        return {
            total: daySessions.reduce((s, sess) => s + sessionTotalSec(sess), 0),
            overtime: daySessions.some((s) => s.overtime),
        };
    }

    function practiceWeekTotal(uid) {
        return practiceSessions.filter((s) => s.studentId === uid).reduce((s, sess) => s + sessionTotalSec(sess), 0);
    }

    // Per-standard active seconds for a student on a specific date, summed
    // across every visit that day — practice and mastery time combined.
    function dayStandardTimes(uid, date) {
        const daySessions = practiceSessions.filter((s) => s.studentId === uid && s.date === date);
        const totals = {};
        for (const sess of daySessions) {
            for (const [stdId, t] of Object.entries(sess.standardTimes ?? {})) {
                totals[stdId] = (totals[stdId] ?? 0) + (t.practiceSec ?? 0) + (t.masterySec ?? 0);
            }
        }
        return totals;
    }

    // Question counts (MCAS only) for a student on a specific date, summed
    // across every visit that day.
    function dayQuestionTotals(uid, date) {
        const daySessions = practiceSessions.filter((s) => s.studentId === uid && s.date === date);
        return daySessions.reduce((acc, sess) => ({
            attempted: acc.attempted + (sess.questionsAttempted ?? 0),
            correctUnassisted: acc.correctUnassisted + (sess.correctUnassisted ?? 0),
            correctAssisted: acc.correctAssisted + (sess.correctAssisted ?? 0),
        }), { attempted: 0, correctUnassisted: 0, correctAssisted: 0 });
    }

    // Standards mastered on a given day. Reads studentProgress/{uid}/standards
    // states already loaded into progressMap; relies on standardState.masteredAt
    // (mastery.js), so standards mastered before that field existed won't show.
    function masteredStandardsForDay(uid, date) {
        const states = progressMap[uid] ?? {};
        return Object.entries(states)
            .filter(([, s]) => s.masteredAt && toISODate(new Date(s.masteredAt)) === date)
            .map(([id]) => standards.find((s) => s.id === id) || { id, shortName: id });
    }

    function fmtSec(sec) {
        if (sec < 60) return `${sec}s`;
        return `${Math.round(sec / 60)}m`;
    }

    function openPracticePopover(uid, date) {
        const daySessions = practiceSessions.filter((s) => s.studentId === uid && s.date === date);
        if (!daySessions.length) return;
        const student = students.find((s) => s.uid === uid);
        practicePopoverData = { uid, date, displayName: student?.displayName ?? uid };
    }

    let deletingAssignmentId = null;

    async function handleDeleteAssignment(assignment) {
        const stillActive = assignment.active ? ' It is still active — any student mid-quiz will be dropped back to normal practice.' : '';
        if (!confirm(`Permanently delete "${assignment.quizName}"? This removes it and every student's results for it — this cannot be undone.${stillActive}`)) return;
        deletingAssignmentId = assignment.id;
        try {
            // No manual local-state removal needed — the live subscriptions
            // above pick up the deletion and refresh quizAssignmentsForClass /
            // resultsMap on their own.
            await deleteQuizAssignment(assignment.id, schoolId);
            if (resultsPopoverCell?.assignment.id === assignment.id) resultsPopoverCell = null;
        } catch (e) {
            console.error(e);
            alert('Failed to delete: ' + e.message);
        } finally {
            deletingAssignmentId = null;
        }
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

        <!-- Sub-tabs -->
        <div class="flex gap-4 mb-4 border-b border-gray-200">
            <button
                class="pb-2 px-1 text-sm font-medium border-b-2 transition-colors {subView === 'mastery' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
                on:click={() => (subView = 'mastery')}
            >
                Mastery Grid
            </button>
            <button
                class="pb-2 px-1 text-sm font-medium border-b-2 transition-colors {subView === 'results' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
                on:click={switchToResults}
            >
                Assignment Results
            </button>
            <button
                class="pb-2 px-1 text-sm font-medium border-b-2 transition-colors {subView === 'practice' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
                on:click={switchToPractice}
            >
                Practice Log
            </button>
        </div>

        {#if subView === 'mastery'}
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
                                    class="flex items-center justify-center text-gray-500 hover:text-indigo-600 relative group w-full"
                                    title="{std.shortName} ({std.id})"
                                    on:click|stopPropagation
                                >
                                    <span class="text-[11px] font-medium select-none whitespace-nowrap">{stdLabel(std.id)}</span>
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
                                {@const cellData = progressMap[student.uid]?.[std.id]}
                                <td class="py-1 px-2 text-center relative group">
                                    <button
                                        class="w-5 h-5 rounded-full inline-flex items-center justify-center transition-transform hover:scale-125
                                            {state === 'mastered' ? 'bg-green-500' :
                                             state === 'progress' ? 'bg-yellow-400' :
                                             state === 'started'  ? 'border-2 border-gray-300 bg-white' :
                                             'border border-gray-200 bg-white'}"
                                        on:click|stopPropagation={() => openPopover(student.uid, std.id)}
                                        title="{student.displayName}: {std.shortName}"
                                    ></button>
                                    <!-- Hover tooltip -->
                                    <div class="hidden group-hover:block absolute top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white shadow-lg rounded p-2.5 text-left z-50 border border-gray-200 pointer-events-none">
                                        <p class="font-semibold text-gray-800 text-[11px] mb-0.5">{student.displayName}</p>
                                        <p class="text-indigo-600 text-[10px] mb-1">{std.shortName}</p>
                                        {#if cellData}
                                            <p class="text-gray-600 text-[10px]">
                                                {state === 'mastered' ? 'Mastered' : state === 'progress' ? 'In progress' : 'Started'}
                                                · {cellData.attempts ?? 0} attempts
                                            </p>
                                        {:else}
                                            <p class="text-gray-400 text-[10px] italic">Not started yet</p>
                                        {/if}
                                    </div>
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        {:else if subView === 'results'}
        <!-- Assignment Results -->
        {#if resultsLoading}
            <p class="text-gray-400">Loading results...</p>
        {:else if quizAssignmentsForClass.length === 0}
            <p class="text-sm text-gray-400 italic">No quizzes have been assigned to this class yet.</p>
        {:else}
            <div class="flex items-center gap-4 mb-4 text-xs text-gray-600">
                <span class="flex items-center gap-1"><span class="inline-block w-4 h-4 rounded-full bg-green-500"></span> Completed, full score</span>
                <span class="flex items-center gap-1"><span class="inline-block w-4 h-4 rounded-full bg-yellow-400"></span> Completed partial / in progress</span>
                <span class="flex items-center gap-1"><span class="inline-block w-4 h-4 rounded-full border-2 border-gray-300 bg-white"></span> Left undone</span>
                <span class="flex items-center gap-1"><span class="inline-block w-4 h-4 rounded-full border border-gray-200 bg-white"></span> Not assigned</span>
            </div>
            <div class="overflow-x-auto">
                <table class="text-xs border-collapse">
                    <thead>
                        <tr>
                            <th class="text-left font-medium text-gray-600 pr-4 pb-2 sticky left-0 bg-gray-50 z-10 w-36">Student</th>
                            {#each quizAssignmentsForClass as assignment}
                                <th class="pb-2 px-1 w-9 relative group/col" title="{assignment.quizName} ({assignment.gradingMode === 'quiz' ? 'Quiz mode' : 'Help mode'})">
                                    <button
                                        on:click={() => handleDeleteAssignment(assignment)}
                                        disabled={deletingAssignmentId === assignment.id}
                                        class="absolute top-0 right-0.5 w-4 h-4 rounded-full text-[10px] leading-none flex items-center justify-center text-gray-300 hover:text-white hover:bg-red-500 opacity-0 group-hover/col:opacity-100 transition-opacity disabled:opacity-100 disabled:cursor-wait"
                                        title="Permanently delete this assignment and its results"
                                        aria-label="Delete {assignment.quizName}"
                                    >{deletingAssignmentId === assignment.id ? '…' : '✕'}</button>
                                    <span
                                        class="text-[11px] font-medium text-gray-500 select-none block"
                                        style="writing-mode: vertical-rl; transform: rotate(180deg); max-height: 130px; overflow: hidden; line-height:1.3;"
                                    >{assignment.quizName}</span>
                                </th>
                            {/each}
                        </tr>
                    </thead>
                    <tbody>
                        {#each students as student}
                            <tr class="hover:bg-gray-50">
                                <td class="py-1 pr-4 font-medium text-gray-700 sticky left-0 bg-white z-10 whitespace-nowrap">
                                    {student.displayName || student.uid}
                                </td>
                                {#each quizAssignmentsForClass as assignment}
                                    {@const progress = resultsMap[student.uid]?.[assignment.id]}
                                    {@const state = resultCellState(progress)}
                                    <td class="py-1 px-1 w-9 text-center relative group">
                                        <button
                                            class="w-5 h-5 rounded-full inline-flex items-center justify-center transition-transform hover:scale-125
                                                {state === 'complete_full' ? 'bg-green-500' :
                                                 state === 'complete_partial' || state === 'in_progress' ? 'bg-yellow-400' :
                                                 state === 'frozen' ? 'border-2 border-gray-300 bg-white' :
                                                 'border border-gray-200 bg-white'}"
                                            on:click|stopPropagation={() => openResultsPopover(student.uid, assignment)}
                                            title="{student.displayName}: {assignment.quizName}"
                                        ></button>
                                        <!-- Hover tooltip -->
                                        <div class="hidden group-hover:block absolute top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white shadow-lg rounded p-2.5 text-left z-50 border border-gray-200 pointer-events-none">
                                            <p class="font-semibold text-gray-800 text-[11px] mb-0.5">{student.displayName}</p>
                                            <p class="text-indigo-600 text-[10px] mb-1">{assignment.quizName}</p>
                                            {#if progress}
                                                <p class="text-gray-600 text-[10px]">
                                                    {progress.status === 'completed' ? 'Completed' : progress.status === 'frozen' ? 'Left undone' : 'In progress'}
                                                    · {progress.score}/{progress.total} correct
                                                </p>
                                            {:else}
                                                <p class="text-gray-400 text-[10px] italic">Not assigned</p>
                                            {/if}
                                        </div>
                                    </td>
                                {/each}
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
        {:else if subView === 'practice'}
        <!-- Practice Log -->
        <div class="mb-4 flex items-center gap-2">
            <button
                on:click={() => changePracticeWeek(-1)}
                class="px-2 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-50"
            >←</button>
            <span class="text-sm text-gray-700 min-w-44 text-center">{practiceWeekLabel(practiceWeekOffset)}</span>
            <button
                on:click={() => changePracticeWeek(1)}
                disabled={practiceWeekOffset >= 0}
                class="px-2 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
            >→</button>
            {#if practiceLoading}
                <span class="text-xs text-gray-400 ml-2">Loading…</span>
            {/if}
        </div>

        {#if !practiceLoading}
            {@const days = practiceWeekDays(practiceWeekOffset)}

            {#if students.length === 0}
                <p class="text-sm text-gray-400 italic">No students in this class.</p>
            {:else if practiceSessions.length === 0}
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
                            {@const wTotal = practiceWeekTotal(student.uid)}

                            <!-- Total row -->
                            <tr class="hover:bg-gray-50 border-t border-gray-100">
                                <td class="py-1.5 pr-6 font-medium text-gray-700 sticky left-0 bg-white z-10 whitespace-nowrap">
                                    {student.displayName || student.uid}
                                </td>
                                {#each days as day}
                                    {@const cell = practiceCellTotals(student.uid, day.date)}
                                    <td class="py-1.5 px-3 text-center">
                                        {#if cell.total > 0}
                                            <button
                                                class="font-medium {cell.overtime ? 'text-amber-600' : 'text-gray-800'} hover:text-indigo-600 transition-colors"
                                                on:click|stopPropagation={() => openPracticePopover(student.uid, day.date)}
                                                title="Click to see session details"
                                            >{fmtSec(cell.total)}</button>
                                        {:else}
                                            <span class="text-gray-300">—</span>
                                        {/if}
                                    </td>
                                {/each}
                                <td class="py-1.5 px-3 text-center font-semibold {wTotal > 0 ? 'text-gray-800' : 'text-gray-300'}">
                                    {wTotal > 0 ? fmtSec(wTotal) : '—'}
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

        <!-- Results cell popover -->
        {#if resultsPopoverCell}
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
                    <p class="font-semibold text-gray-800 mb-1">
                        {students.find((s) => s.uid === resultsPopoverCell.uid)?.displayName || resultsPopoverCell.uid}
                    </p>
                    <p class="text-sm text-indigo-600 mb-3">{resultsPopoverCell.assignment.quizName}</p>
                    {#if resultsPopoverCell.progress}
                        {@const p = resultsPopoverCell.progress}
                        <p class="text-sm text-gray-600 mb-2">
                            {p.status === 'completed' ? 'Completed' : p.status === 'frozen' ? 'Left undone' : 'In progress'}
                            · {p.score}/{p.total} correct
                        </p>
                        <ol class="space-y-1 text-sm">
                            {#each (p.answers || []) as a, i (i)}
                                <li class="flex items-center justify-between">
                                    <span class="text-gray-600">Q{i + 1} · {allStdDocs[a.standardId]?.shortName || a.standardId}</span>
                                    <span class="{a.correct ? 'text-green-600' : 'text-red-600'} font-medium">{a.correct ? '✓' : '✗'}</span>
                                </li>
                            {/each}
                            {#each Array(Math.max(0, p.total - (p.answers || []).length)) as _, i (i)}
                                <li class="text-gray-400 italic">Not yet answered</li>
                            {/each}
                        </ol>
                    {:else}
                        <p class="text-sm text-gray-400 italic">Not assigned to this student.</p>
                    {/if}
                    <button
                        on:click={closePopover}
                        class="mt-4 text-xs text-gray-400 hover:text-gray-600"
                    >Close</button>
                </div>
            </div>
        {/if}

        <!-- Practice Log day detail popover -->
        {#if practicePopoverData}
            {@const cell = practiceCellTotals(practicePopoverData.uid, practicePopoverData.date)}
            {@const stdTimes = dayStandardTimes(practicePopoverData.uid, practicePopoverData.date)}
            {@const stdEntries = standards.filter((s) => (stdTimes[s.id] ?? 0) >= 5)}
            {@const mastered = masteredStandardsForDay(practicePopoverData.uid, practicePopoverData.date)}
            {@const qTotals = dayQuestionTotals(practicePopoverData.uid, practicePopoverData.date)}
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
                    <p class="font-semibold text-gray-800">{practicePopoverData.displayName}</p>
                    <p class="text-xs text-gray-400 mb-3">{practicePopoverData.date}</p>

                    <div class="flex justify-between text-sm mb-3">
                        <span class="text-gray-600">Total time</span>
                        <span class="font-medium {cell.overtime ? 'text-amber-600' : 'text-gray-700'}">{fmtSec(cell.total)}</span>
                    </div>

                    {#if course?.contentKey?.startsWith('mcas-')}
                        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                            <dt class="text-gray-500">Questions attempted</dt>
                            <dd class="font-medium text-gray-700">{qTotals.attempted}</dd>
                            <dt class="text-gray-500">Correct, no help</dt>
                            <dd class="font-medium text-gray-700">{qTotals.correctUnassisted}</dd>
                            <dt class="text-gray-500">Correct, with help</dt>
                            <dd class="font-medium text-gray-700">{qTotals.correctAssisted}</dd>
                        </dl>
                    {/if}

                    <p class="text-xs font-medium text-gray-500 mb-1">Time by standard</p>
                    {#if stdEntries.length > 0}
                        <div class="space-y-0.5 mb-3">
                            {#each stdEntries as std}
                                <div class="flex items-center justify-between text-xs">
                                    <span class="text-gray-600">{std.shortName}</span>
                                    <span class="text-gray-500">{fmtSec(stdTimes[std.id])}</span>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-xs text-gray-400 italic mb-3">No standard time recorded.</p>
                    {/if}

                    <p class="text-xs font-medium text-gray-500 mb-1">Standards mastered</p>
                    {#if mastered.length > 0}
                        <ul class="text-xs text-green-700 space-y-0.5">
                            {#each mastered as std}
                                <li>{std.shortName}</li>
                            {/each}
                        </ul>
                    {:else}
                        <p class="text-xs text-gray-400 italic">None</p>
                    {/if}

                    <button on:click={closePopover} class="mt-4 text-xs text-gray-400 hover:text-gray-600">
                        Close
                    </button>
                </div>
            </div>
        {/if}


    {/if}
</div>

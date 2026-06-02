<script>
    import { onMount, onDestroy, getContext, tick } from 'svelte';
    import { get } from 'svelte/store';
    import { generatePage, gradePage } from '$lib/utils/fundamentals.js';
    import { saveStandardState, subscribeLeaderboard, updateLeaderboard, writeSessionLog } from '$lib/utils/studentStore.js';
    import { session } from '$lib/stores/session';

    const ctx = getContext('student');
    const standardStates = ctx.standardStates;
    const standards = ctx.standards;
    const uid       = ctx.uid;
    const classDoc  = ctx.classDoc;

    function setting(standardId, key, fallback) {
        return classDoc?.standardSettings?.[standardId]?.[key] ?? fallback;
    }

    // ── State ──────────────────────────────────────────────────────────────────

    let standardIndex = 0;
    $: standard = standards[standardIndex];

    let problems  = [];
    let answers   = [];
    let carries   = [];   // carry scratch DOM values (cleared via ref, not Svelte state)
    let inputRefs = [];
    let carryRefs = [];
    let submitted = false;
    let results   = null;

    let mode = 'practice';
    let justMastered = false;
    let lastTime = null;    // seconds used on the just-mastered attempt
    let isNewBest = false;

    let timerRemaining = 60;
    let timerRunning   = false;
    let timerInterval  = null;

    // ── Session timer ──────────────────────────────────────────────────────────

    let sessionTimeLimit = 600;      // seconds; loaded from classDoc
    let standardTimes = {};          // { [standardId]: { practiceSec, masterySec } }
    let sessionActive = false;
    let stintStartMs = null;
    let stintStandardId = null;
    let stintMode = null;
    let isIdle = false;
    let lastActivityMs = Date.now();
    let sessionDisplayInterval = null;
    let sessionDisplaySec = 0;

    function onActivity() {
        lastActivityMs = Date.now();
        if (isIdle) resumeStint();
    }

    function startStint() {
        stintStartMs = Date.now();
        stintStandardId = standard?.id ?? null;
        stintMode = mode;
        sessionActive = true;
        isIdle = false;
    }

    function pauseStint(markIdle = false) {
        if (stintStartMs && stintStandardId) {
            const elapsed = (Date.now() - stintStartMs) / 1000;
            if (!standardTimes[stintStandardId]) {
                standardTimes[stintStandardId] = { practiceSec: 0, masterySec: 0 };
            }
            if (stintMode === 'master') {
                standardTimes[stintStandardId].masterySec += elapsed;
            } else {
                standardTimes[stintStandardId].practiceSec += elapsed;
            }
        }
        stintStartMs = null;
        isIdle = markIdle;
    }

    function resumeStint() {
        startStint();
    }

    function switchMode(newMode) {
        pauseStint();
        mode = newMode;
        startStint();
    }

    async function saveSession() {
        const totalSec = Object.values(standardTimes)
            .reduce((s, t) => s + (t.practiceSec ?? 0) + (t.masterySec ?? 0), 0);
        if (!sessionActive || totalSec < 5) return;
        const roundedTimes = {};
        for (const [id, t] of Object.entries(standardTimes)) {
            roundedTimes[id] = {
                practiceSec: Math.round(t.practiceSec),
                masterySec: Math.round(t.masterySec)
            };
        }
        const date = new Date().toISOString().slice(0, 10);
        try {
            await writeSessionLog(classDoc.classId, uid, {
                date,
                standardTimes: roundedTimes,
                sessionTimeLimit
            });
        } catch (e) {
            console.error('Error saving session log:', e);
        }
    }

    // ── Leaderboard ────────────────────────────────────────────────────────────

    let leaderboard = [];
    let unsubLeaderboard = null;

    function loadLeaderboard() {
        if (unsubLeaderboard) unsubLeaderboard();
        if (!classDoc?.classId || !standard?.id) return;
        unsubLeaderboard = subscribeLeaderboard(classDoc.classId, standard.id, entries => {
            leaderboard = entries;
        });
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    onMount(() => {
        const states = get(standardStates);
        const idx = standards.findIndex(s => !states[s.id]?.mastered);
        standardIndex = idx !== -1 ? idx : standards.length - 1;
        sessionTimeLimit = classDoc?.sessionTimeLimit ?? 600;
        newPage();
        loadLeaderboard();
        startStint();
        sessionDisplayInterval = setInterval(() => {
            if (Date.now() - lastActivityMs > 10_000 && !isIdle) pauseStint(true);
            const elapsed = stintStartMs ? (Date.now() - stintStartMs) / 1000 : 0;
            const base = Object.values(standardTimes)
                .reduce((s, t) => s + (t.practiceSec ?? 0) + (t.masterySec ?? 0), 0);
            sessionDisplaySec = Math.round(base + (isIdle ? 0 : elapsed));
        }, 1000);
        window.addEventListener('beforeunload', handleBeforeUnload);
    });

    onDestroy(() => {
        if (timerInterval) clearInterval(timerInterval);
        if (sessionDisplayInterval) clearInterval(sessionDisplayInterval);
        if (unsubLeaderboard) unsubLeaderboard();
        window.removeEventListener('beforeunload', handleBeforeUnload);
        pauseStint();
        saveSession();
    });

    function handleBeforeUnload() {
        pauseStint();
        saveSession();
    }

    // Reload leaderboard when standard changes
    $: if (standard?.id) loadLeaderboard();

    // ── Page management ────────────────────────────────────────────────────────

    async function newPage() {
        const std = standards[standardIndex];
        if (!std) return;
        const count = setting(std.id, 'problemsPerPage', std.problemsPerPage ?? 8);
        problems  = generatePage(std.id, count);
        answers   = Array(count).fill('');
        submitted = false;
        results   = null;
        justMastered = false;
        lastTime  = null;
        isNewBest = false;
        await tick();
        carryRefs.forEach(r => { if (r) r.value = ''; });
        inputRefs[0]?.focus();
    }

    function handleKeydown(e, i) {
        if (e.key === 'ArrowUp' && problems[i]?.factors && !submitted) {
            e.preventDefault();
            carryRefs[i]?.focus();
            return;
        }
        const isNav = e.key === 'Enter' || (e.key === ' ' && problems[i]?.type === 'number');
        if (!isNav) return;
        e.preventDefault();
        if (i < problems.length - 1) {
            inputRefs[i + 1]?.focus();
        } else {
            handleSubmit();
        }
    }

    function handleCarryKeydown(e, i) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault();
            const input = inputRefs[i];
            if (input) {
                input.focus();
                input.setSelectionRange(0, 0);
            }
        }
    }

    function clearCarry(i) {
        if (carryRefs[i]) carryRefs[i].value = '';
    }

    function handleSubmit() {
        if (submitted) return;
        submitted = true;
        if (timerRunning) stopTimer();
        results = gradePage(problems, answers);
        if (mode === 'master' && results.allCorrect && timerRemaining > 0) {
            justMastered = true;
            lastTime = timerMax - timerRemaining;
            saveMastery(lastTime);
        }
    }

    // ── Master mode ────────────────────────────────────────────────────────────

    function startMaster() {
        stopTimer();
        switchMode('master');
        timerRemaining = setting(standard.id, 'timeLimit', standard.timeLimit ?? 60);
        newPage();
        timerRunning = true;
        timerInterval = setInterval(() => {
            timerRemaining = Math.max(0, timerRemaining - 1);
            if (timerRemaining === 0) { stopTimer(); handleSubmit(); }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
        timerRunning  = false;
    }

    async function saveMastery(timeUsed) {
        try {
            const current  = get(standardStates)[standard.id] ?? {};
            const prevBest = current.bestTime ?? Infinity;
            const newBest  = timeUsed < prevBest;
            isNewBest = newBest;
            const newState = {
                ...current,
                mastered: true,
                attempts: (current.attempts ?? 0) + 1,
                bestTime: newBest ? timeUsed : (current.bestTime ?? timeUsed)
            };
            await saveStandardState(uid, standard.id, newState);
            standardStates.update(s => ({ ...s, [standard.id]: newState }));
            // Update class leaderboard
            const displayName = $session.user?.displayName || uid;
            await updateLeaderboard(classDoc.classId, standard.id, uid, displayName, newState.bestTime);
        } catch (e) {
            console.error('Error saving mastery:', e);
        }
    }

    // ── Navigation ─────────────────────────────────────────────────────────────

    function jumpToStandard(idx) {
        stopTimer();
        pauseStint();
        mode = 'practice';
        standardIndex = idx;
        newPage();
        startStint();
    }

    function tryAgain() {
        if (mode === 'master') startMaster(); else newPage();
    }

    function keepPracticing() {
        stopTimer();
        switchMode('practice');
        newPage();
    }

    function goNextStandard() {
        stopTimer();
        pauseStint();
        mode = 'practice';
        const states = get(standardStates);
        let next = standards.findIndex((s, i) => i > standardIndex && !states[s.id]?.mastered);
        if (next === -1) next = standards.findIndex(s => !states[s.id]?.mastered);
        standardIndex = next !== -1 ? next : standardIndex;
        newPage();
        startStint();
    }

    function devSkipForward() {
        stopTimer();
        pauseStint();
        mode = 'practice';
        if (standardIndex < standards.length - 1) standardIndex++;
        newPage();
        startStint();
    }

    function devSkipBack() {
        stopTimer();
        pauseStint();
        mode = 'practice';
        if (standardIndex > 0) standardIndex--;
        newPage();
        startStint();
    }

    // ── Derived ────────────────────────────────────────────────────────────────

    $: isVertical    = problems[0]?.factors;
    $: gridCols = (() => {
        if (!problems.length) return 2;
        const p = problems[0];
        if (p.factors) {
            // Vertical: compact — column count by answer digit count
            const d = p.answer.length;
            return d <= 3 ? 4 : d <= 4 ? 3 : 2;
        }
        // Horizontal: column count by display string length
        const len = p.display.length;
        if (len <= 5) return 4;   // "2 × 3"
        if (len <= 8) return 3;   // "87 ÷ 6", "47 × 23"
        return 2;                 // "1234 + 5678", long division
    })();
    $: allComplete   = standards.length > 0 && standards.every(s => $standardStates[s.id]?.mastered);
    $: masteredCount = standards.filter(s => $standardStates[s.id]?.mastered).length;
    $: timerMax      = standard ? setting(standard.id, 'timeLimit', standard.timeLimit ?? 60) : 60;
    $: timerPercent  = (timerRemaining / timerMax) * 100;
    $: timerColor    = timerPercent > 50 ? '#22c55e' : timerPercent > 20 ? '#f59e0b' : '#ef4444';

    function formatTime(s) {
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function inputPlaceholder(type) {
        if (type === 'remainder') return 'e.g. 3 R 2';
        if (type === 'fraction')  return 'e.g. 3/4';
        return '';
    }
</script>

<svelte:window on:keydown={onActivity} />

<div class="min-h-screen bg-gray-100 py-8 px-4">

    {#if allComplete}
        <div class="max-w-lg mx-auto bg-white rounded-xl shadow p-10 text-center mt-16">
            <div class="text-5xl mb-4">★</div>
            <h2 class="text-2xl font-bold text-gray-800 mb-2">Course Complete!</h2>
            <p class="text-gray-500">You've mastered all {standards.length} standards.</p>
        </div>

    {:else if standard}

        <!-- ── Standards nav strip ── -->
        <div class="max-w-4xl mx-auto mb-4 flex flex-wrap gap-1.5">
            {#each standards as s, idx}
                {@const state = $standardStates[s.id]}
                <button
                    on:click={() => jumpToStandard(idx)}
                    title={s.label}
                    class="px-2.5 py-1 text-xs font-medium rounded transition-colors
                        {idx === standardIndex
                            ? 'bg-indigo-600 text-white'
                            : state?.mastered
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}">
                    {s.level ?? idx + 1}
                    {#if state?.mastered && idx !== standardIndex}✓{/if}
                </button>
            {/each}
        </div>

        <!-- ── Main layout: problem + leaderboard ── -->
        <div class="max-w-4xl mx-auto flex gap-5 items-start">

            <!-- ── Left: problem column ── -->
            <div class="flex-1 min-w-0 flex flex-col items-center">

                <!-- Header -->
                <div class="w-full max-w-2xl mb-4 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase tracking-wide">
                            Level {standard.level}
                        </span>
                        <span class="text-sm font-medium text-gray-700">{standard.label}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        {#if sessionActive}
                            {@const remaining = sessionTimeLimit - sessionDisplaySec}
                            <span class="text-xs font-mono
                                {remaining < 0 ? 'text-amber-600 font-semibold' :
                                 isIdle ? 'text-gray-400' : 'text-gray-500'}">
                                {#if isIdle}
                                    Paused
                                {:else if remaining >= 0}
                                    {formatTime(remaining)} left
                                {:else}
                                    +{formatTime(-remaining)} over
                                {/if}
                            </span>
                        {/if}
                        <span class="text-xs text-gray-400">{masteredCount} / {standards.length} mastered</span>
                    </div>
                </div>

                <!-- Timer bar -->
                {#if mode === 'master'}
                    <div class="w-full max-w-2xl mb-3">
                        <div class="flex justify-between text-xs mb-1" style="color: {timerColor}">
                            <span class="font-semibold">
                                {justMastered ? 'Mastered!' : (submitted ? 'Time used' : 'Time remaining')}
                            </span>
                            <span class="font-mono font-bold">{formatTime(timerRemaining)}</span>
                        </div>
                        <div class="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all duration-1000"
                                style="width: {timerPercent}%; background-color: {timerColor}"></div>
                        </div>
                    </div>
                {/if}

                <!-- Problem sheet -->
                <div class="w-full max-w-2xl bg-white rounded-xl shadow overflow-hidden">

                    <!-- Mode badge -->
                    <div class="px-5 pt-4 pb-2 flex items-center gap-2">
                        {#if mode === 'master'}
                            <span class="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">Master Attempt</span>
                        {:else}
                            <span class="text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wide">Practice</span>
                        {/if}
                        {#if submitted && results}
                            <span class="text-sm {results.allCorrect ? 'text-green-600' : 'text-red-500'} font-medium ml-auto">
                                {results.correct} / {results.total} correct
                            </span>
                        {/if}
                    </div>

                    <!-- Problems grid -->
                    <div class="px-5 pb-4 grid items-start gap-x-4 {isVertical ? 'gap-y-6' : 'gap-y-2'}"
                         style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr))">
                        {#each problems as problem, i}
                            {@const graded = submitted && results}
                            {@const correct = graded && results.results[i]}
                            {@const boxClass = graded
                                ? correct ? 'bg-green-50 border-green-400 text-green-800' : 'bg-red-50 border-red-400 text-red-700'
                                : 'border-gray-300 bg-white'}

                            {#if problem.factors}
                                {@const minW = Math.max(String(problem.factors[0]).length, problem.answer.length) + 2}
                                <div class="flex justify-center">
                                    <div class="font-mono text-base text-gray-800"
                                         style="width: {minW}ch">
                                        <input
                                            type="text"
                                            inputmode="numeric"
                                            maxlength="2"
                                            tabindex="-1"
                                            bind:this={carryRefs[i]}
                                            disabled={submitted}
                                            on:keydown={e => handleCarryKeydown(e, i)}
                                            class="select-text block w-full border-0 bg-transparent text-sm leading-none py-1 text-center text-red-500 font-mono font-bold
                                                   focus:outline-none disabled:cursor-default"
                                        />
                                        <div class="text-right">{problem.factors[0]}</div>
                                        <div class="flex items-baseline justify-end gap-1">
                                            <span class="text-gray-500">×</span>
                                            <span>{problem.factors[1]}</span>
                                        </div>
                                        <div class="border-t-2 border-gray-700 my-0.5"></div>
                                        <input
                                            type="text"
                                            inputmode="numeric"
                                            bind:this={inputRefs[i]}
                                            bind:value={answers[i]}
                                            disabled={submitted}
                                            on:keydown={e => handleKeydown(e, i)}
                                            on:input={() => clearCarry(i)}
                                            style="width: 100%"
                                            class="p-0 border-0 bg-transparent text-right text-sm
                                                   focus:outline-none disabled:cursor-default transition-colors
                                                   {graded ? (correct ? 'text-green-700' : 'text-red-600') : 'text-gray-800'}"
                                        />
                                        {#if graded && !correct}
                                            <div class="text-xs text-gray-400 text-right">{problem.answer}</div>
                                        {/if}
                                    </div>
                                </div>

                            {:else}
                                <!-- Horizontal layout -->
                                <div class="flex items-center gap-2 font-mono text-base">
                                    <span class="whitespace-nowrap text-gray-700 select-none">
                                        {problem.display} =
                                    </span>
                                    <input
                                        type="text"
                                        bind:this={inputRefs[i]}
                                        bind:value={answers[i]}
                                        disabled={submitted}
                                        placeholder={inputPlaceholder(problem.type)}
                                        on:keydown={e => handleKeydown(e, i)}
                                        class="flex-1 min-w-0 px-2 py-1 border rounded text-center text-gray-800 text-sm
                                               focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200
                                               disabled:cursor-default transition-colors {boxClass}"
                                    />
                                    {#if graded && !correct}
                                        <span class="text-xs text-gray-400">{problem.answer}</span>
                                    {/if}
                                </div>
                            {/if}
                        {/each}
                    </div>

                    <!-- Bottom bar -->
                    <div class="bg-gray-50 border-t border-gray-200 px-5 py-3 flex items-center justify-between gap-3">
                        {#if !submitted}
                            {#if mode === 'practice'}
                                <button on:click={startMaster}
                                    class="px-4 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded hover:bg-amber-100 transition-colors">
                                    Master It
                                </button>
                            {:else}
                                <div></div>
                            {/if}
                            <div class="flex items-center gap-2">
                                {#if $session.role === 'dev'}
                                    <button on:click={devSkipBack} disabled={standardIndex === 0}
                                        class="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors">
                                        ← Prev
                                    </button>
                                    <button on:click={devSkipForward} disabled={standardIndex === standards.length - 1}
                                        class="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors">
                                        Next →
                                    </button>
                                {/if}
                                <button on:click={handleSubmit}
                                    class="px-6 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
                                    Submit
                                </button>
                            </div>

                        {:else if justMastered}
                            <div class="flex flex-col gap-0.5">
                                <span class="text-green-700 font-semibold text-sm">
                                    ★ Mastered! {formatTime(lastTime)}
                                </span>
                                {#if isNewBest}
                                    <span class="text-xs text-green-600">New best time!</span>
                                {:else}
                                    {@const best = $standardStates[standard.id]?.bestTime}
                                    {#if best != null}
                                        <span class="text-xs text-gray-400">Best: {formatTime(best)}</span>
                                    {/if}
                                {/if}
                            </div>
                            <div class="flex gap-2">
                                <button on:click={startMaster}
                                    class="px-4 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded hover:bg-amber-100 transition-colors">
                                    Try to Beat It
                                </button>
                                <button on:click={goNextStandard}
                                    class="px-6 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors">
                                    Next Standard →
                                </button>
                            </div>

                        {:else if mode === 'master' && !results?.allCorrect}
                            <button on:click={keepPracticing}
                                class="px-4 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                                Keep Practicing
                            </button>
                            <button on:click={tryAgain}
                                class="px-6 py-1.5 text-sm font-medium text-white bg-amber-500 rounded hover:bg-amber-600 transition-colors">
                                Try Again
                            </button>

                        {:else}
                            <button on:click={startMaster}
                                class="px-4 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded hover:bg-amber-100 transition-colors">
                                Master It
                            </button>
                            <button on:click={tryAgain}
                                class="px-6 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
                                New Page
                            </button>
                        {/if}
                    </div>
                </div>

                {#if standard.description}
                    <p class="w-full max-w-2xl mt-3 text-xs text-gray-400 text-center">{standard.description}</p>
                {/if}
            </div>

            <!-- ── Right: leaderboard ── -->
            <div class="w-48 flex-shrink-0">
                <div class="bg-white rounded-xl shadow p-4">
                    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Top Times</h3>
                    {#if leaderboard.length === 0}
                        <p class="text-xs text-gray-400 italic">No times yet</p>
                    {:else}
                        <ol class="space-y-2">
                            {#each leaderboard as entry, rank}
                                <li class="flex items-center gap-2">
                                    <span class="text-xs font-bold w-4 text-gray-400">{rank + 1}</span>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-xs font-medium text-gray-700 truncate">{entry.name}</div>
                                        <div class="text-xs font-mono {rank === 0 ? 'text-amber-600 font-bold' : 'text-gray-400'}">
                                            {formatTime(entry.bestTime)}
                                        </div>
                                    </div>
                                </li>
                            {/each}
                        </ol>
                    {/if}
                </div>
            </div>

        </div>
    {/if}
</div>

<script>
    import { onMount } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { loadClass, loadAllStandards, loadCourse } from '$lib/utils/studentStore.js';
    import { doc, getDoc, setDoc, getDocs, collection, updateDoc } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;
    let saving = false;
    let saved = false;

    let subView = 'progression'; // 'progression' | 'settings'

    let classId = null;
    let classDoc = null;
    let course = null;
    let progression = [];   // [{ id, shortName, description, expanded }]
    let allStandardsInfo = {};

    // Daily timer (MCAS-style courses)
    let dailyTimerEnabled = false;
    let dailyTimerMinutes = 10;
    let timerSaving = false;
    let timerSaved = false;
    let timerError = null;

    // Pace settings (fundamentals-math only)
    let settingsDrafts = {};  // { [standardId]: { timeLimit, problemsPerPage } }
    let sessionTimeLimitDraft = 10;  // minutes
    let leaderboardEnabledDraft = true;
    let leaderboardSizeDraft = 5;
    let settingsSaving = false;
    let settingsSaved  = false;
    let settingsError  = null;

    onMount(async () => {
        try {
            classId = $page.url.searchParams.get('classId');
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
            if (classDoc?.courseId) course = await loadCourse(classDoc.courseId);
            allStandardsInfo = await loadAllStandards();

            progression = (classDoc?.standardProgression || []).map((id) => ({
                id,
                shortName: allStandardsInfo[id]?.shortName || id,
                description: allStandardsInfo[id]?.description || '',
                expanded: false
            }));

            dailyTimerEnabled = classDoc?.dailyTimerEnabled ?? false;
            dailyTimerMinutes = Math.round((classDoc?.dailyTimerSeconds ?? 600) / 60);

            if (course?.contentKey === 'fundamentals-math') {
                sessionTimeLimitDraft = Math.round((classDoc.sessionTimeLimit ?? 600) / 60);
                leaderboardEnabledDraft = classDoc.leaderboardEnabled ?? true;
                leaderboardSizeDraft = classDoc.leaderboardSize ?? 5;
                for (const id of (classDoc.standardProgression || [])) {
                    const override = classDoc.standardSettings?.[id] ?? {};
                    settingsDrafts[id] = {
                        timeLimit:       override.timeLimit      ?? allStandardsInfo[id]?.timeLimit      ?? 60,
                        problemsPerPage: override.problemsPerPage ?? allStandardsInfo[id]?.problemsPerPage ?? 8
                    };
                }
            }
        } catch (e) {
            console.error(e);
            error = 'Failed to load standards.';
        } finally {
            loading = false;
        }
    });

    // ── Drag-and-drop ──────────────────────────────────────────────────────────
    let dragIndex = null;
    let dragOverIndex = null;

    function onDragStart(i) {
        dragIndex = i;
    }

    function onDragOver(e, i) {
        e.preventDefault();
        dragOverIndex = i;
    }

    function onDrop(i) {
        if (dragIndex === null || dragIndex === i) {
            dragIndex = null;
            dragOverIndex = null;
            return;
        }
        const newOrder = [...progression];
        const [moved] = newOrder.splice(dragIndex, 1);
        newOrder.splice(i, 0, moved);
        progression = newOrder;
        dragIndex = null;
        dragOverIndex = null;
    }

    function onDragEnd() {
        dragIndex = null;
        dragOverIndex = null;
    }

    async function saveOrder() {
        saving = true;
        saved = false;
        try {
            await updateDoc(doc(db, 'classes', classId), {
                standardProgression: progression.map((s) => s.id)
            });
            saved = true;
            setTimeout(() => (saved = false), 2000);
        } catch (e) {
            console.error(e);
            error = 'Failed to save.';
        } finally {
            saving = false;
        }
    }

    async function saveDailyTimer() {
        timerSaving = true;
        timerSaved = false;
        timerError = null;
        try {
            await updateDoc(doc(db, 'classes', classId), {
                dailyTimerEnabled,
                dailyTimerSeconds: Math.max(1, Number(dailyTimerMinutes)) * 60
            });
            timerSaved = true;
            setTimeout(() => (timerSaved = false), 2000);
        } catch (e) {
            console.error(e);
            timerError = e.message;
        } finally {
            timerSaving = false;
        }
    }

    async function saveSettings() {
        settingsSaving = true;
        settingsSaved  = false;
        settingsError  = null;
        try {
            const standardSettings = {};
            for (const [id, vals] of Object.entries(settingsDrafts)) {
                standardSettings[id] = {
                    timeLimit:       Number(vals.timeLimit),
                    problemsPerPage: Number(vals.problemsPerPage)
                };
            }
            const sessionTimeLimit = Math.max(1, Number(sessionTimeLimitDraft)) * 60;
            const leaderboardEnabled = leaderboardEnabledDraft;
            const leaderboardSize = Math.max(1, Number(leaderboardSizeDraft));
            await setDoc(
                doc(db, 'classes', classId),
                { standardSettings, sessionTimeLimit, leaderboardEnabled, leaderboardSize },
                { merge: true }
            );
            classDoc = { ...classDoc, standardSettings, sessionTimeLimit, leaderboardEnabled, leaderboardSize };
            settingsSaved = true;
            setTimeout(() => settingsSaved = false, 2500);
        } catch (e) {
            settingsError = e.message;
        } finally {
            settingsSaving = false;
        }
    }
</script>

<div class="max-w-2xl">
    <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold text-gray-800">Standards</h1>
        {#if subView === 'progression'}
            <div class="flex items-center gap-3">
                {#if saved}
                    <span class="text-sm text-green-600 font-medium">Saved!</span>
                {/if}
                <button
                    on:click={saveOrder}
                    disabled={saving}
                    class="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                    {saving ? 'Saving...' : 'Save Order'}
                </button>
            </div>
        {/if}
    </div>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <div class="flex gap-5 border-b border-gray-200 mb-6">
            <button
                on:click={() => (subView = 'progression')}
                class="pb-2 px-1 text-sm font-medium border-b-2 transition-colors {subView === 'progression' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
            >
                Standard Progression
            </button>
            <button
                on:click={() => (subView = 'settings')}
                class="pb-2 px-1 text-sm font-medium border-b-2 transition-colors {subView === 'settings' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
            >
                Timer Settings
            </button>
        </div>

        {#if subView === 'progression'}
            <p class="text-sm text-gray-500 mb-4">Drag rows to reorder the standard progression for your class.</p>

            <ol class="space-y-1">
                {#each progression as std, i}
                    <li
                        draggable="true"
                        on:dragstart={() => onDragStart(i)}
                        on:dragover={(e) => onDragOver(e, i)}
                        on:drop={() => onDrop(i)}
                        on:dragend={onDragEnd}
                        class="flex items-start gap-3 bg-white rounded-lg border px-4 py-3 cursor-grab select-none
                            {dragOverIndex === i ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}
                            {dragIndex === i ? 'opacity-40' : ''}"
                    >
                        <span class="text-gray-300 mt-0.5">⠿</span>
                        <span class="text-xs text-gray-400 font-mono mt-0.5 w-4 shrink-0">{i + 1}</span>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-baseline gap-2">
                                <span class="font-medium text-gray-800 text-sm">{std.shortName}</span>
                                <span class="text-xs text-gray-400">{std.id}</span>
                            </div>
                            {#if std.expanded}
                                <p class="text-xs text-gray-500 mt-1 leading-relaxed">{std.description}</p>
                            {/if}
                        </div>
                        <button
                            on:click={() => (std.expanded = !std.expanded)}
                            class="text-xs text-gray-400 hover:text-gray-600 shrink-0 mt-0.5"
                            aria-label="Toggle description"
                        >
                            {std.expanded ? '▲' : '▼'}
                        </button>
                    </li>
                {/each}
            </ol>

        {:else if subView === 'settings'}
            {#if course?.contentKey === 'fundamentals-math'}
                <p class="text-xs text-gray-400 mb-4">
                    Override the default timer and problem count for each standard in this class.
                </p>

                <div class="mb-4 flex items-center gap-3">
                    <label class="text-sm text-gray-700 font-medium">Session time limit</label>
                    <input
                        type="number" min="1" max="60"
                        bind:value={sessionTimeLimitDraft}
                        class="w-16 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400"
                    />
                    <span class="text-sm text-gray-500">min <span class="text-xs text-gray-400">(total active time per session)</span></span>
                </div>

                <div class="mb-4 flex items-center gap-3">
                    <label class="flex items-center gap-2 text-sm text-gray-700 font-medium">
                        <input type="checkbox" bind:checked={leaderboardEnabledDraft} class="rounded" />
                        Show leaderboard
                    </label>
                    <input
                        type="number" min="1" max="50"
                        bind:value={leaderboardSizeDraft}
                        disabled={!leaderboardEnabledDraft}
                        class="w-16 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-40"
                    />
                    <span class="text-sm text-gray-500">students shown</span>
                </div>

                <div class="bg-white rounded-lg shadow overflow-hidden max-w-2xl">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th class="text-left px-4 py-2 font-medium text-gray-600">Standard</th>
                                <th class="text-center px-4 py-2 font-medium text-gray-600 w-32">Time (s)</th>
                                <th class="text-center px-4 py-2 font-medium text-gray-600 w-36">Problems</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            {#each progression as std}
                                {#if settingsDrafts[std.id]}
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-4 py-2 text-gray-700">{std.shortName}</td>
                                        <td class="px-4 py-2 text-center">
                                            <input
                                                type="number" min="10" max="600"
                                                bind:value={settingsDrafts[std.id].timeLimit}
                                                class="w-20 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400"
                                            />
                                        </td>
                                        <td class="px-4 py-2 text-center">
                                            <input
                                                type="number" min="1" max="50"
                                                bind:value={settingsDrafts[std.id].problemsPerPage}
                                                class="w-20 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400"
                                            />
                                        </td>
                                    </tr>
                                {/if}
                            {/each}
                        </tbody>
                    </table>
                </div>
                <div class="mt-3 flex items-center gap-3">
                    <button
                        on:click={saveSettings}
                        disabled={settingsSaving}
                        class="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {settingsSaving ? 'Saving…' : 'Save'}
                    </button>
                    {#if settingsSaved}
                        <span class="text-sm text-green-600">Saved.</span>
                    {/if}
                    {#if settingsError}
                        <span class="text-sm text-red-500">{settingsError}</span>
                    {/if}
                </div>
            {:else}
                <p class="text-xs text-gray-500 mb-3">
                    Optional. Counts down while students practice; once time's up it keeps counting as overage instead of stopping them. The daily total and question count show up in the Gradebook's Practice Log.
                </p>
                <div class="flex items-center gap-3 mb-3">
                    <label class="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" bind:checked={dailyTimerEnabled} class="rounded" />
                        Enable daily timer
                    </label>
                    <input
                        type="number" min="1" max="120"
                        bind:value={dailyTimerMinutes}
                        disabled={!dailyTimerEnabled}
                        class="w-16 text-center border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-40"
                    />
                    <span class="text-sm text-gray-500">min</span>
                </div>
                <div class="flex items-center gap-3">
                    <button
                        on:click={saveDailyTimer}
                        disabled={timerSaving}
                        class="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {timerSaving ? 'Saving...' : 'Save'}
                    </button>
                    {#if timerSaved}
                        <span class="text-sm text-green-600 font-medium">Saved!</span>
                    {/if}
                    {#if timerError}
                        <span class="text-sm text-red-500">{timerError}</span>
                    {/if}
                </div>
            {/if}
        {/if}
    {/if}
</div>

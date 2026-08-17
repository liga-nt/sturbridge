<script>
    import { onMount, setContext } from 'svelte';
    import { writable } from 'svelte/store';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { session } from '$lib/stores/session';
    import { db } from '$lib/firebase/client';
    import { doc, getDoc } from 'firebase/firestore';
    import {
        loadClass,
        loadAllClassIds,
        loadCourse,
        loadStandardsByCourse,
        loadAllStandardStates
    } from '$lib/utils/studentStore.js';

    // contentKey → student route
    const COURSE_ROUTES = {
        'fundamentals-math':  '/student/fundamentals',
        'mcas-grade4-math':   '/student/mcas',
        'greek-immersive':    '/student/greek',
        'persian-immersive':  '/student/persian',
        'hebrew-immersive':   '/student/hebrew',
    };

    // Routes that render without class/course data (standalone pages)
    const STANDALONE_ROUTES = ['/student/persian', '/student/hebrew'];

    function isStandalone(pathname) {
        return STANDALONE_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
    }
    const FALLBACK_ROUTE = '/student/mcas';

    // Context — child components see these after dataLoaded = true
    let uid;
    let classDoc;
    let course;
    let standards = [];
    let isTester = false;
    const standardStates = writable({});

    setContext('student', {
        get uid()       { return uid; },
        get classDoc()  { return classDoc; },
        get course()    { return course; },
        get standards() { return standards; },
        get isTester()  { return isTester; },
        standardStates
    });

    let dataLoaded  = false;
    let dataError   = null;

    // Course picker
    let showPicker        = false;
    let classOptions      = [];   // [{ classId, className, courseLabel, contentKey }]
    let hasMultipleClasses = false;
    let switchingCourse    = false; // true from click on a picker option until the new route lands

    async function loadData() {
        // Dev can impersonate a specific student via ?studentId=, e.g. to drive
        // the question loop as a demo student and verify it lands in the
        // teacher gradebook. request.auth.uid stays the dev's own — firestore.rules
        // grants dev a write bypass on studentProgress/sessions independent of uid.
        const devTargetUid = $session.role === 'dev' ? $page.url.searchParams.get('studentId') : null;
        uid = devTargetUid || $session.user?.uid;
        if (!uid) throw new Error('Not logged in');

        let classIds;

        if ($session.role === 'dev' && !devTargetUid) {
            // Dev can see all classes without being enrolled
            classIds = await loadAllClassIds();
            isTester = true; // dev always gets tester-only tools
        } else {
            // Always read classIds from the user doc — canonical source
            const userSnap = await getDoc(doc(db, 'users', uid));
            classIds = userSnap.data()?.classIds ?? [];
            isTester = userSnap.data()?.isTester === true;

            // Fallback for legacy students whose classId only exists on studentProgress
            if (classIds.length === 0) {
                const progressSnap = await getDoc(doc(db, 'studentProgress', uid));
                const legacyId = progressSnap.data()?.classId;
                if (legacyId) classIds = [legacyId];
            }
        }

        if (classIds.length === 0) throw new Error('No class assigned. Please contact your teacher.');

        // Resolve which class to load
        let selectedClassId;

        if (classIds.length === 1) {
            selectedClassId = classIds[0];
        } else {
            // Always show the picker for multi-class students — every fresh
            // login lands on the class list, never silently back into
            // whichever class they used last.
            hasMultipleClasses = true;
            classOptions = await loadPickerOptions(classIds);
            showPicker = true;
            return; // wait for user to pick
        }

        await loadForClass(selectedClassId);
    }

    async function loadPickerOptions(classIds) {
        return Promise.all(classIds.map(async classId => {
            const rawClass = await loadClass(classId);
            const c = rawClass?.courseId ? await loadCourse(rawClass.courseId) : null;
            return {
                classId,
                className:   rawClass?.name   ?? classId,
                courseLabel: c?.label         ?? rawClass?.courseId ?? classId,
                contentKey:  c?.contentKey    ?? null
            };
        }));
    }

    async function pickClass(classId) {
        showPicker = false;
        // Guards the window between loadForClass reassigning `course` (while
        // the URL is still /student, or still on the old course's route) and
        // the goto below landing: without this, the reactive redirect fires
        // on that intermediate reassignment and flips showPicker back on,
        // and the old route renders briefly with the new course's data.
        switchingCourse = true;
        try {
            await loadForClass(classId);
            // loadForClass only updates context data — if the student was already
            // sitting on a course route (e.g. /student/mcas), we have to navigate
            // explicitly or they'd stay on that route with the new course's data.
            await goto(COURSE_ROUTES[course?.contentKey] ?? FALLBACK_ROUTE);
        } finally {
            switchingCourse = false;
        }
    }

    function switchClass() {
        showPicker = true;
    }

    async function loadForClass(classId) {
        const rawClass = await loadClass(classId);
        if (!rawClass) throw new Error('Class not found.');
        classDoc  = { classId, ...rawClass };
        course    = await loadCourse(classDoc.courseId);
        standards = await loadStandardsByCourse(classDoc.courseId);

        const states = await loadAllStandardStates(uid);
        standardStates.set(states);

        dataLoaded = true;
    }

    // Once data is loaded, /student itself is just a redirect target — send
    // the student on to their course. Reactive (not a one-off check inside
    // loadForClass) so it also fires when the "Home" nav link brings them
    // back to /student later, without needing the layout to remount.
    // For multi-class students, Home acts like "Switch course" — show the
    // picker instead of silently bouncing back into whatever course they
    // were already on.
    $: if (dataLoaded && course && !switchingCourse && $page.url.pathname === '/student') {
        if (hasMultipleClasses) {
            showPicker = true;
        } else {
            goto(COURSE_ROUTES[course?.contentKey] ?? FALLBACK_ROUTE);
        }
    }

    onMount(async () => {
        if ($session.role !== 'student' && $session.role !== 'dev') return;
        if (isStandalone($page.url.pathname)) return;
        try {
            await loadData();
        } catch (e) {
            console.error(e);
            dataError = e.message;
        }
    });
</script>

{#if $session.loading}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-gray-400">Loading...</p>
    </div>

{:else if $session.role !== 'student' && $session.role !== 'dev'}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-gray-500">Access denied.</p>
    </div>

{:else if dataError}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-red-500">{dataError}</p>
    </div>

{:else if showPicker}
    <!-- Course picker — shown when student is in multiple classes -->
    <div class="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-4">
        <h1 class="text-xl font-semibold text-gray-800 mb-2">Choose a course</h1>
        <p class="text-sm text-gray-400 mb-8">You're enrolled in multiple courses. Which one would you like to work on?</p>
        <div class="flex flex-col gap-3 w-full max-w-sm">
            {#each classOptions as opt}
                <button
                    on:click={() => pickClass(opt.classId)}
                    class="bg-white rounded-xl shadow px-6 py-5 text-left hover:shadow-md hover:ring-2 hover:ring-indigo-300 transition-all"
                >
                    <div class="font-semibold text-gray-800">{opt.courseLabel}</div>
                    <div class="text-sm text-gray-400 mt-0.5">{opt.className}</div>
                </button>
            {/each}
        </div>
    </div>

{:else if (!dataLoaded && !isStandalone($page.url.pathname)) || switchingCourse}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-gray-400">Loading...</p>
    </div>

{:else}
    <slot />
    {#if hasMultipleClasses}
        <button
            on:click={switchClass}
            class="fixed bottom-4 right-4 text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-3 py-1.5 shadow-sm hover:text-gray-600 hover:border-gray-300 transition-all"
        >
            Switch course
        </button>
    {/if}
{/if}

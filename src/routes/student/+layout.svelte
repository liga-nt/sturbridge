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
        'fundamentals-math': '/student/fundamentals',
        'mcas-grade4-math':  '/student/mcas',
    };
    const FALLBACK_ROUTE = '/student/mcas';

    // Context — child components see these after dataLoaded = true
    let uid;
    let classDoc;
    let course;
    let standards = [];
    const standardStates = writable({});

    setContext('student', {
        get uid()       { return uid; },
        get classDoc()  { return classDoc; },
        get course()    { return course; },
        get standards() { return standards; },
        standardStates
    });

    let dataLoaded  = false;
    let dataError   = null;

    // Course picker
    let showPicker   = false;
    let classOptions = [];   // [{ classId, className, courseLabel, contentKey }]

    async function loadData() {
        uid = $session.user?.uid;
        if (!uid) throw new Error('Not logged in');

        let classIds;

        if ($session.role === 'dev') {
            // Dev can see all classes without being enrolled
            classIds = await loadAllClassIds();
        } else {
            // Always read classIds from the user doc — canonical source
            const userSnap = await getDoc(doc(db, 'users', uid));
            classIds = userSnap.data()?.classIds ?? [];

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
            // Multiple classes — check localStorage for remembered choice
            const remembered = localStorage.getItem(`student_class_${uid}`);
            if (remembered && classIds.includes(remembered)) {
                selectedClassId = remembered;
            } else {
                // Need to show the picker — load options first
                classOptions = await loadPickerOptions(classIds);
                showPicker = true;
                return; // wait for user to pick
            }
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
        localStorage.setItem(`student_class_${uid}`, classId);
        showPicker = false;
        await loadForClass(classId);
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

        if ($page.url.pathname === '/student') {
            const route = COURSE_ROUTES[course?.contentKey] ?? FALLBACK_ROUTE;
            goto(route);
        }
    }

    onMount(async () => {
        if ($session.role !== 'student' && $session.role !== 'dev') return;
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

{:else if !dataLoaded}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-gray-400">Loading...</p>
    </div>

{:else}
    <slot />
{/if}

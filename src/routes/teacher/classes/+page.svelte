<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { session } from '$lib/stores/session';
    import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';
    import { loadCourse } from '$lib/utils/studentStore.js';

    let loading = true;
    let error = null;
    let classes = []; // [{ classId, name, courseId, courseLabel, studentIds }]

    onMount(async () => {
        try {
            let rawClasses = [];

            if ($session.role === 'admin' || $session.role === 'dev') {
                // Not the normal path here (admin/dev have their own home
                // routes), but land gracefully if reached directly.
                const snap = await getDocs(collection(db, 'classes'));
                rawClasses = snap.docs.map((d) => ({ classId: d.id, ...d.data() }));
            } else {
                const uid = $session.user?.uid;
                const userSnap = await getDoc(doc(db, 'users', uid));
                const classIds = userSnap.exists() ? (userSnap.data().classIds || []) : [];

                if (classIds.length === 0) {
                    error = 'No class assigned.';
                    loading = false;
                    return;
                }
                if (classIds.length === 1) {
                    goto(`/teacher?classId=${classIds[0]}`, { replaceState: true });
                    return;
                }

                const docs = await Promise.all(classIds.map((id) => getDoc(doc(db, 'classes', id))));
                rawClasses = docs.filter((d) => d.exists()).map((d) => ({ classId: d.id, ...d.data() }));
            }

            const courseCache = {};
            for (const c of rawClasses) {
                if (c.courseId && !(c.courseId in courseCache)) {
                    courseCache[c.courseId] = await loadCourse(c.courseId);
                }
            }

            classes = rawClasses
                .map((c) => ({ ...c, courseLabel: courseCache[c.courseId]?.label ?? c.courseId ?? '—' }))
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } catch (e) {
            console.error(e);
            error = 'Failed to load classes.';
        } finally {
            loading = false;
        }
    });
</script>

<div class="min-h-[70vh] flex flex-col items-center justify-center px-4">
    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else if classes.length === 0}
        <p class="text-sm text-gray-400 italic">No classes found.</p>
    {:else}
        <h1 class="text-xl font-semibold text-gray-800 mb-2">Choose a class</h1>
        <p class="text-sm text-gray-400 mb-8">You teach multiple classes. Which one would you like to open?</p>
        <div class="flex flex-col gap-3 w-full max-w-sm">
            {#each classes as cls}
                <a
                    href="/teacher?classId={cls.classId}"
                    class="bg-white rounded-xl shadow px-6 py-5 text-left hover:shadow-md hover:ring-2 hover:ring-indigo-300 transition-all"
                >
                    <div class="font-semibold text-gray-800">{cls.name || cls.classId}</div>
                    <div class="text-sm text-gray-400 mt-0.5">{cls.courseLabel} · {(cls.studentIds || []).length} students</div>
                </a>
            {/each}
        </div>
    {/if}
</div>

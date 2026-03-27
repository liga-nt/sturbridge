<script>
    import { onMount } from 'svelte';
    import { loadAllStandards } from '$lib/utils/studentStore.js';
    import { courseLabel } from '$lib/utils/courses.js';
    import { getDocs, collection, doc, getDoc } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;
    let classes = [];

    onMount(async () => {
        try {
            const allStd = await loadAllStandards();
            const classesSna = await getDocs(collection(db, 'classes'));

            classes = await Promise.all(
                classesSna.docs.map(async (classSnap) => {
                    const data = classSnap.data();
                    const teacherSnap = data.teacherId
                        ? await getDoc(doc(db, 'users', data.teacherId))
                        : null;
                    const teacherName = teacherSnap?.exists()
                        ? teacherSnap.data().displayName
                        : data.teacherId || '—';
                    return {
                        classId: classSnap.id,
                        name: data.name || classSnap.id,
                        teacherName,
                        grade: data.grade || null,
                        subject: data.subject || null,
                        studentCount: data.studentIds?.length || 0,
                        standardCount: data.standardProgression?.length || 0
                    };
                })
            );
        } catch (e) {
            console.error(e);
            error = 'Failed to load classes.';
        } finally {
            loading = false;
        }
    });
</script>

<div>
    <h1 class="text-xl font-semibold text-gray-800 mb-6">All Classes</h1>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else if classes.length === 0}
        <p class="text-gray-400">No classes yet. <a href="/admin/classes" class="text-indigo-600 hover:underline">Create one</a>.</p>
    {:else}
        <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {#each classes as cls}
                <div class="bg-white rounded-lg border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col gap-3">
                    <a href="/admin/class/{cls.classId}" class="block">
                        <h2 class="font-semibold text-gray-800 mb-1">{cls.name}</h2>
                        {#if cls.grade && cls.subject}
                            <p class="text-xs text-indigo-600 mb-1">{courseLabel(cls.grade, cls.subject)}</p>
                        {/if}
                        <p class="text-sm text-gray-500">Teacher: {cls.teacherName}</p>
                        <div class="flex gap-4 mt-2 text-sm text-gray-600">
                            <span>{cls.studentCount} students</span>
                            <span>{cls.standardCount} standards</span>
                        </div>
                    </a>
                    <a
                        href="/teacher?classId={cls.classId}"
                        class="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-auto"
                    >Teacher View →</a>
                </div>
            {/each}
        </div>
    {/if}
</div>

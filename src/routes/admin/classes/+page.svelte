<script>
    import { onMount } from 'svelte';
    import { loadStandardsByGradeSubject } from '$lib/utils/studentStore.js';
    import { COURSES, courseLabel } from '$lib/utils/courses.js';
    import {
        getDocs, collection, doc, setDoc, getDoc, serverTimestamp, updateDoc
    } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;
    let teachers = [];

    // New class form
    let newName = '';
    let newTeacherId = '';
    let newCourseKey = `${COURSES[0].grade}-${COURSES[0].subject}`;  // default: first course
    let creating = false;
    let createError = null;
    let createSuccess = null;

    // Add students form
    let selectedClassId = '';
    let studentEmailsRaw = '';
    let addingStudents = false;
    let studentAddResult = null;

    let classes = [];

    $: selectedCourse = COURSES.find((c) => `${c.grade}-${c.subject}` === newCourseKey) || COURSES[0];

    onMount(async () => {
        try {
            const [teacherSnap, classSnap] = await Promise.all([
                getDocs(collection(db, 'users')),
                getDocs(collection(db, 'classes'))
            ]);
            teachers = teacherSnap.docs
                .map((d) => ({ uid: d.id, ...d.data() }))
                .filter((u) => u.role === 'teacher');
            classes = classSnap.docs.map((d) => ({ classId: d.id, ...d.data() }));
        } catch (e) {
            error = 'Failed to load.';
        } finally {
            loading = false;
        }
    });

    async function createClass() {
        if (!newName.trim()) return;
        creating = true;
        createError = null;
        createSuccess = null;
        try {
            // Build progression from standards matching this grade+subject
            const standards = await loadStandardsByGradeSubject(selectedCourse.grade, selectedCourse.subject);
            const progression = standards.map((s) => s.id);

            const classId = `class-${Date.now()}`;
            const classData = {
                classId,
                name: newName.trim(),
                grade: selectedCourse.grade,
                subject: selectedCourse.subject,
                teacherId: newTeacherId || null,
                studentIds: [],
                standardProgression: progression,
                createdAt: serverTimestamp()
            };
            await setDoc(doc(db, 'classes', classId), classData);

            if (newTeacherId) {
                const teacherRef = doc(db, 'users', newTeacherId);
                const teacherSnap = await getDoc(teacherRef);
                if (teacherSnap.exists()) {
                    const existing = teacherSnap.data().classIds || [];
                    await updateDoc(teacherRef, { classIds: [...existing, classId] });
                }
            }

            createSuccess = `Class "${newName.trim()}" created (${selectedCourse.label}, ${progression.length} standards).`;
            classes = [...classes, classData];
            newName = '';
            newTeacherId = '';
        } catch (e) {
            createError = e.message;
        } finally {
            creating = false;
        }
    }

    async function addStudents() {
        if (!selectedClassId || !studentEmailsRaw.trim()) return;
        addingStudents = true;
        studentAddResult = null;
        try {
            const emails = studentEmailsRaw
                .split(/[\n,]+/)
                .map((e) => e.trim().toLowerCase())
                .filter(Boolean);

            let added = 0;
            for (const email of emails) {
                await setDoc(doc(db, 'invites', email), {
                    role: 'student',
                    classIds: [selectedClassId],
                    createdAt: serverTimestamp()
                }, { merge: true });
                added++;
            }
            studentAddResult = `${added} invite(s) created. Students will be added to the class on first sign-in.`;
            studentEmailsRaw = '';
        } catch (e) {
            studentAddResult = 'Error: ' + e.message;
        } finally {
            addingStudents = false;
        }
    }
</script>

<div class="max-w-3xl space-y-8">
    <h1 class="text-xl font-semibold text-gray-800">Manage Classes</h1>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <!-- Create class -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
            <h2 class="text-sm font-semibold text-gray-700 mb-4">New Class</h2>
            <form on:submit|preventDefault={createClass} class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs text-gray-500 mb-1" for="cls-name">Class Name</label>
                        <input
                            id="cls-name"
                            bind:value={newName}
                            type="text"
                            placeholder="Room 12, Period 3…"
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1" for="course-sel">Course</label>
                        <select
                            id="course-sel"
                            bind:value={newCourseKey}
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        >
                            {#each COURSES as c}
                                <option value="{c.grade}-{c.subject}">{c.label}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1" for="teacher-sel">Teacher <span class="text-gray-400">(optional)</span></label>
                    <select
                        id="teacher-sel"
                        bind:value={newTeacherId}
                        class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    >
                        <option value="">— No teacher yet —</option>
                        {#each teachers as t}
                            <option value={t.uid}>{t.displayName || t.email}</option>
                        {/each}
                    </select>
                </div>
                <button
                    type="submit"
                    disabled={creating}
                    class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                    {creating ? 'Creating…' : 'Create Class'}
                </button>
            </form>
            {#if createSuccess}<p class="text-sm text-green-600 mt-2">{createSuccess}</p>{/if}
            {#if createError}<p class="text-sm text-red-600 mt-2">{createError}</p>{/if}
        </div>

        <!-- Existing classes list -->
        {#if classes.length > 0}
            <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
                    All Classes ({classes.length})
                </div>
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <tr>
                            <th class="text-left px-4 py-3">Name</th>
                            <th class="text-left px-4 py-3">Course</th>
                            <th class="text-left px-4 py-3">Standards</th>
                            <th class="text-left px-4 py-3">Students</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        {#each classes as cls}
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-3 font-medium text-gray-800">
                                    <a href="/admin/class/{cls.classId}" class="hover:text-indigo-600">{cls.name || cls.classId}</a>
                                </td>
                                <td class="px-4 py-3 text-gray-500">
                                    {cls.grade && cls.subject ? courseLabel(cls.grade, cls.subject) : '—'}
                                </td>
                                <td class="px-4 py-3 text-gray-500">{cls.standardProgression?.length ?? 0}</td>
                                <td class="px-4 py-3 text-gray-500">{cls.studentIds?.length ?? 0}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}

        <!-- Add students to class -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
            <h2 class="text-sm font-semibold text-gray-700 mb-4">Add Students to Class</h2>
            <form on:submit|preventDefault={addStudents} class="space-y-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1" for="cls-sel">Class</label>
                    <select
                        id="cls-sel"
                        bind:value={selectedClassId}
                        class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        required
                    >
                        <option value="">— Select class —</option>
                        {#each classes as cls}
                            <option value={cls.classId}>
                                {cls.name || cls.classId}{cls.grade ? ` — ${courseLabel(cls.grade, cls.subject)}` : ''}
                            </option>
                        {/each}
                    </select>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1" for="emails">
                        Student Gmail addresses (one per line or comma-separated)
                    </label>
                    <textarea
                        id="emails"
                        bind:value={studentEmailsRaw}
                        rows="5"
                        placeholder="student1@gmail.com&#10;student2@gmail.com"
                        class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                        required
                    ></textarea>
                </div>
                <button
                    type="submit"
                    disabled={addingStudents}
                    class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                    {addingStudents ? 'Adding…' : 'Create Invites'}
                </button>
            </form>
            {#if studentAddResult}
                <p class="text-sm text-green-600 mt-2">{studentAddResult}</p>
            {/if}
        </div>
    {/if}
</div>

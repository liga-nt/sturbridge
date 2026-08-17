<script>
    import { onMount } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { loadCourses, loadStandardsByCourse } from '$lib/utils/studentStore.js';
    import {
        getDocs, collection, doc, setDoc, getDoc, serverTimestamp, updateDoc, query, where
    } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';
    import { syncUserClaims } from '$lib/utils/auth.js';

    let loading = true;
    let error = null;
    let teachers = [];
    let courses = {};   // { [courseId]: { id, label, grade, subject, progressionType, ... } }
    let courseList = []; // ordered array for the dropdown

    // New class form
    let newName = '';
    let newTeacherId = '';
    let newCourseId = '';
    let creating = false;
    let createError = null;
    let createSuccess = null;

    // Add students form
    let selectedClassId = '';
    let studentEmailsRaw = '';
    let addingStudents = false;
    let studentAddResult = null;

    let classes = [];
    let archivingId = null;

    $: activeClasses = classes.filter((c) => !c.archived);

    onMount(async () => {
        try {
            const effectiveSchoolId = $page.url.searchParams.get('schoolId') ?? $session.schoolId;
            const unscoped = $session.role === 'dev' && !effectiveSchoolId;

            if (!effectiveSchoolId && !unscoped) {
                error = 'No school assigned to your account. Ask a dev to set your schoolId claim.';
                loading = false;
                return;
            }

            const usersRef   = unscoped ? collection(db, 'users')   : query(collection(db, 'users'),   where('schoolId', '==', effectiveSchoolId));
            const classesRef = unscoped ? collection(db, 'classes') : query(collection(db, 'classes'), where('schoolId', '==', effectiveSchoolId));

            // Load school doc to get allowed courseIds (if set)
            const schoolSnap = effectiveSchoolId
                ? await getDoc(doc(db, 'schools', effectiveSchoolId))
                : null;
            const allowedCourseIds = schoolSnap?.exists()
                ? (schoolSnap.data().courseIds ?? null)
                : null;

            const [teacherSnap, classSnap] = await Promise.all([
                getDocs(usersRef),
                getDocs(classesRef),
            ]);
            teachers = teacherSnap.docs
                .map((d) => ({ uid: d.id, ...d.data() }))
                .filter((u) => u.role === 'teacher');
            classes = classSnap.docs.map((d) => ({ classId: d.id, ...d.data() }));
            courses = await loadCourses();
            // Filter to school's allowed courses; if none configured, show all
            const allCourseList = Object.values(courses).sort((a, b) =>
                String(a.grade ?? '').localeCompare(String(b.grade ?? '')) ||
                (a.label ?? '').localeCompare(b.label ?? '')
            );
            courseList = (allowedCourseIds && allowedCourseIds.length > 0)
                ? allCourseList.filter((c) => allowedCourseIds.includes(c.id))
                : allCourseList;
            if (courseList.length > 0) newCourseId = courseList[0].id;
        } catch (e) {
            console.error('Admin classes load error:', e);
            error = 'Failed to load: ' + e.message;
        } finally {
            loading = false;
        }
    });

    async function createClass() {
        if (!newName.trim() || !newCourseId) return;
        creating = true;
        createError = null;
        createSuccess = null;
        try {
            const selectedCourse = courses[newCourseId];

            // Build progression from standards tagged with this courseId
            const standards = await loadStandardsByCourse(newCourseId);
            const progression = standards.map((s) => s.id);

            const classId = `class-${Date.now()}`;
            const classData = {
                classId,
                name: newName.trim(),
                courseId: newCourseId,
                schoolId: $page.url.searchParams.get('schoolId') ?? $session.schoolId ?? 'default',
                progressionType: selectedCourse.progressionType ?? 'mastery',
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
                    // Firestore rules check classIds off the auth token, not the user
                    // doc — refresh the teacher's custom claims or their writes to
                    // this class (quizzes, etc.) will be permission-denied until
                    // their token happens to refresh on its own.
                    await syncUserClaims(newTeacherId);
                }
            }

            const label = selectedCourse?.label ?? newCourseId;
            createSuccess = `Class "${newName.trim()}" created (${label}, ${progression.length} standards).`;
            classes = [...classes, classData];
            newName = '';
            newTeacherId = '';
        } catch (e) {
            createError = e.message;
        } finally {
            creating = false;
        }
    }

    async function archiveClass(cls) {
        if (!confirm(`Archive "${cls.name || cls.classId}"? It will be hidden from this list but can be restored or deleted from the Archived Classes page.`)) return;
        archivingId = cls.classId;
        try {
            await updateDoc(doc(db, 'classes', cls.classId), { archived: true, archivedAt: serverTimestamp() });
            classes = classes.map((c) => c.classId === cls.classId ? { ...c, archived: true } : c);
        } catch (e) {
            alert('Failed to archive: ' + e.message);
        } finally {
            archivingId = null;
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
                const inviteRef = doc(db, 'invites', email);
                const existingSnap = await getDoc(inviteRef);
                const existingClassIds = existingSnap.exists() ? (existingSnap.data().classIds || []) : [];
                const classIds = existingClassIds.includes(selectedClassId)
                    ? existingClassIds
                    : [...existingClassIds, selectedClassId];

                await setDoc(inviteRef, {
                    role: 'student',
                    classIds,
                    schoolId: $page.url.searchParams.get('schoolId') ?? $session.schoolId ?? 'default',
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
                            bind:value={newCourseId}
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                            required
                        >
                            {#if courseList.length === 0}
                                <option value="">No courses in database</option>
                            {:else}
                                {#each courseList as c}
                                    <option value={c.id}>{c.label}</option>
                                {/each}
                            {/if}
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
                    disabled={creating || !newCourseId}
                    class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                    {creating ? 'Creating…' : 'Create Class'}
                </button>
            </form>
            {#if createSuccess}<p class="text-sm text-green-600 mt-2">{createSuccess}</p>{/if}
            {#if createError}<p class="text-sm text-red-600 mt-2">{createError}</p>{/if}
        </div>

        <!-- Existing classes list -->
        {#if activeClasses.length > 0}
            <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700 flex items-center justify-between">
                    <span>All Classes ({activeClasses.length})</span>
                    <a href="/admin/classes/archive{$page.url.search}" class="text-xs font-normal text-indigo-600 hover:text-indigo-800">
                        View Archived Classes →
                    </a>
                </div>
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <tr>
                            <th class="text-left px-4 py-3">Name</th>
                            <th class="text-left px-4 py-3">Course</th>
                            <th class="text-left px-4 py-3">Standards</th>
                            <th class="text-left px-4 py-3">Students</th>
                            <th class="text-right px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        {#each activeClasses as cls}
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-3 font-medium text-gray-800">
                                    <a href="/admin/class/{cls.classId}" class="hover:text-indigo-600">{cls.name || cls.classId}</a>
                                </td>
                                <td class="px-4 py-3 text-gray-500">
                                    {courses[cls.courseId]?.label ?? cls.courseId ?? '—'}
                                </td>
                                <td class="px-4 py-3 text-gray-500">{cls.standardProgression?.length ?? 0}</td>
                                <td class="px-4 py-3 text-gray-500">{cls.studentIds?.length ?? 0}</td>
                                <td class="px-4 py-3 text-right space-x-3">
                                    <a
                                        href="/teacher?classId={cls.classId}"
                                        class="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                                    >Teacher View →</a>
                                    <button
                                        on:click={() => archiveClass(cls)}
                                        disabled={archivingId === cls.classId}
                                        class="text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
                                    >{archivingId === cls.classId ? 'Archiving…' : 'Archive'}</button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else if classes.length > 0}
            <div class="bg-white rounded-lg border border-gray-200 p-5 text-sm text-gray-500 flex items-center justify-between">
                <span>No active classes.</span>
                <a href="/admin/classes/archive{$page.url.search}" class="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                    View Archived Classes →
                </a>
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
                                {cls.name || cls.classId}{cls.courseId ? ` — ${courses[cls.courseId]?.label ?? cls.courseId}` : ''}
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

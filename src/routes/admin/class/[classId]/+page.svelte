<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { loadClass, loadAllStandardStates, loadAllStandards, loadCourse } from '$lib/utils/studentStore.js';
    import {
        doc, getDoc, getDocs, collection, query, where,
        updateDoc, arrayRemove, arrayUnion, setDoc, serverTimestamp
    } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';
    import { syncUserClaims } from '$lib/utils/auth.js';

    let loading = true;
    let error = null;

    let classDoc = null;
    let course = null;
    let students = [];
    let standards = [];
    let progressMap = {};
    let teachers = [];

    // Edit state
    let editName = '';
    let editTeacherId = '';
    let savingName = false;
    let savingTeacher = false;
    let saveError = null;
    let saveSuccess = null;
    let removingStudentId = null;

    // Add students
    let studentEmailsRaw = '';
    let addingStudents = false;
    let addStudentsMsg = null;

    $: classId = $page.params.classId;

    onMount(async () => {
        try {
            classDoc = await loadClass(classId);
            if (!classDoc) { error = 'Class not found.'; loading = false; return; }

            editName = classDoc.name || '';
            editTeacherId = classDoc.teacherId || '';

            if (classDoc.courseId) {
                course = await loadCourse(classDoc.courseId);
            }

            const teachersRef = classDoc.schoolId
                ? query(collection(db, 'users'), where('schoolId', '==', classDoc.schoolId))
                : collection(db, 'users');
            const teacherSnap = await getDocs(teachersRef);
            teachers = teacherSnap.docs
                .map((d) => ({ uid: d.id, ...d.data() }))
                .filter((u) => u.role === 'teacher');

            const allStd = await loadAllStandards();
            standards = (classDoc.standardProgression || []).map((id) => ({
                id,
                shortName: allStd[id]?.shortName || id,
                description: allStd[id]?.description || '',
                order: allStd[id]?.order ?? null
            }));

            const studentIds = classDoc.studentIds || [];
            const studentDocs = await Promise.all(
                studentIds.map((sid) =>
                    getDoc(doc(db, 'users', sid)).then((s) =>
                        s.exists() ? { uid: s.id, ...s.data() } : { uid: sid, displayName: sid }
                    )
                )
            );
            students = studentDocs.sort((a, b) =>
                (a.displayName || '').localeCompare(b.displayName || '')
            );

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

    async function saveName() {
        if (!editName.trim() || editName.trim() === classDoc.name) return;
        savingName = true;
        saveError = null;
        saveSuccess = null;
        try {
            await updateDoc(doc(db, 'classes', classId), { name: editName.trim() });
            classDoc = { ...classDoc, name: editName.trim() };
            saveSuccess = 'Class name updated.';
        } catch (e) {
            saveError = e.message;
        } finally {
            savingName = false;
        }
    }

    async function saveTeacher() {
        const newTeacherId = editTeacherId || null;
        if (newTeacherId === (classDoc.teacherId || null)) return;
        savingTeacher = true;
        saveError = null;
        saveSuccess = null;
        try {
            const oldTeacherId = classDoc.teacherId || null;

            if (oldTeacherId) {
                await updateDoc(doc(db, 'users', oldTeacherId), { classIds: arrayRemove(classId) });
                await syncUserClaims(oldTeacherId);
            }
            if (newTeacherId) {
                await updateDoc(doc(db, 'users', newTeacherId), { classIds: arrayUnion(classId) });
                await syncUserClaims(newTeacherId);
            }
            await updateDoc(doc(db, 'classes', classId), { teacherId: newTeacherId });

            classDoc = { ...classDoc, teacherId: newTeacherId };
            saveSuccess = 'Teacher updated.';
        } catch (e) {
            saveError = e.message;
        } finally {
            savingTeacher = false;
        }
    }

    async function removeStudent(student) {
        if (!confirm(`Remove ${student.displayName || student.uid} from this class?`)) return;
        removingStudentId = student.uid;
        saveError = null;
        try {
            await updateDoc(doc(db, 'classes', classId), { studentIds: arrayRemove(student.uid) });
            await updateDoc(doc(db, 'users', student.uid), { classIds: arrayRemove(classId) });
            await syncUserClaims(student.uid);

            students = students.filter((s) => s.uid !== student.uid);
            classDoc = { ...classDoc, studentIds: (classDoc.studentIds || []).filter((id) => id !== student.uid) };
            delete progressMap[student.uid];
        } catch (e) {
            saveError = e.message;
        } finally {
            removingStudentId = null;
        }
    }

    async function addStudents() {
        if (!studentEmailsRaw.trim()) return;
        addingStudents = true;
        addStudentsMsg = null;
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
                const classIds = existingClassIds.includes(classId)
                    ? existingClassIds
                    : [...existingClassIds, classId];

                await setDoc(inviteRef, {
                    role: 'student',
                    classIds,
                    schoolId: classDoc.schoolId ?? 'default',
                    createdAt: serverTimestamp()
                }, { merge: true });
                added++;
            }
            addStudentsMsg = { ok: true, text: `${added} invite(s) created. Students will be added to this class on first sign-in.` };
            studentEmailsRaw = '';
        } catch (e) {
            addStudentsMsg = { ok: false, text: e.message };
        } finally {
            addingStudents = false;
        }
    }

    function cellState(uid, standardId) {
        const state = progressMap[uid]?.[standardId];
        if (!state) return 'empty';
        if (state.mastered) return 'mastered';
        if (state.streak > 0) return 'progress';
        if (state.attempts > 0) return 'started';
        return 'empty';
    }

    $: masteredPerStudent = students.map((s) => {
        const count = standards.filter((std) => progressMap[s.uid]?.[std.id]?.mastered).length;
        return { uid: s.uid, count };
    });

    $: classMasteryPct = students.length > 0
        ? Math.round(masteredPerStudent.reduce((sum, s) => sum + s.count, 0) / (students.length * standards.length || 1) * 100)
        : 0;
</script>

<div>
    <div class="mb-4 flex items-center justify-between">
        <a href="/admin/classes" class="text-sm text-indigo-600 hover:text-indigo-800">← All classes</a>
        <a href="/teacher?classId={classId}" class="text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1 hover:bg-indigo-50 transition-colors">
            View as Teacher →
        </a>
    </div>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <div class="flex items-baseline gap-4 mb-4">
            <h1 class="text-xl font-semibold text-gray-800">{classDoc?.name || classId}</h1>
            {#if course}
                <span class="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {course.label}
                </span>
            {/if}
            <span class="text-sm text-gray-500">
                {students.length} students · Class mastery: {classMasteryPct}%
            </span>
        </div>

        <!-- Quick stats -->
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
                <p class="text-2xl font-bold text-indigo-600">{students.length}</p>
                <p class="text-xs text-gray-500 mt-1">Students</p>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
                <p class="text-2xl font-bold text-green-600">{classMasteryPct}%</p>
                <p class="text-xs text-gray-500 mt-1">Avg mastery</p>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
                <p class="text-2xl font-bold text-red-500">
                    {standards.filter((std) => {
                        const masteredCount = students.filter((s) => progressMap[s.uid]?.[std.id]?.mastered).length;
                        return students.length > 0 && masteredCount / students.length < 0.4;
                    }).length}
                </p>
                <p class="text-xs text-gray-500 mt-1">Struggling standards</p>
            </div>
        </div>

        <!-- Class settings -->
        <div class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
            <h2 class="text-sm font-semibold text-gray-700 mb-4">Class Settings</h2>
            <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                    <label class="block text-xs text-gray-500 mb-1" for="edit-name">Class Name</label>
                    <div class="flex gap-2">
                        <input
                            id="edit-name"
                            bind:value={editName}
                            type="text"
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                        <button
                            on:click={saveName}
                            disabled={savingName || !editName.trim() || editName.trim() === classDoc.name}
                            class="px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                        >{savingName ? 'Saving…' : 'Save'}</button>
                    </div>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1" for="edit-teacher">Teacher</label>
                    <div class="flex gap-2">
                        <select
                            id="edit-teacher"
                            bind:value={editTeacherId}
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        >
                            <option value="">— No teacher —</option>
                            {#each teachers as t}
                                <option value={t.uid}>{t.displayName || t.email}</option>
                            {/each}
                        </select>
                        <button
                            on:click={saveTeacher}
                            disabled={savingTeacher || (editTeacherId || '') === (classDoc.teacherId || '')}
                            class="px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                        >{savingTeacher ? 'Saving…' : 'Save'}</button>
                    </div>
                </div>
            </div>
            {#if saveSuccess}<p class="text-sm text-green-600 mt-3">{saveSuccess}</p>{/if}
            {#if saveError}<p class="text-sm text-red-600 mt-3">{saveError}</p>{/if}
        </div>

        <!-- Add students -->
        <div class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
            <h2 class="text-sm font-semibold text-gray-700 mb-3">Add Students</h2>
            <form on:submit|preventDefault={addStudents} class="space-y-3">
                <div>
                    <label class="block text-xs text-gray-500 mb-1" for="emails">
                        Student Gmail addresses (one per line or comma-separated)
                    </label>
                    <textarea
                        id="emails"
                        bind:value={studentEmailsRaw}
                        rows="3"
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
            {#if addStudentsMsg}
                <p class="text-sm mt-2 {addStudentsMsg.ok ? 'text-green-600' : 'text-red-600'}">{addStudentsMsg.text}</p>
            {/if}
        </div>

        <!-- Mastery grid -->
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Mastery Grid</p>
        {#if students.length === 0}
            <p class="text-sm text-gray-400 italic">No students in this class yet.</p>
        {/if}
        <div class="overflow-x-auto">
            <table class="text-xs border-collapse w-full">
                <thead>
                    <tr>
                        <th class="text-left font-medium text-gray-600 pr-4 pb-2 sticky left-0 bg-gray-50 z-10 min-w-48">Student</th>
                        {#each standards as std}
                            <th class="pb-2 px-2 text-center" title="{std.shortName} ({std.id})">
                                <span class="text-[11px] font-medium text-gray-500 select-none whitespace-nowrap">{std.id.replace(/^\d+\./, '')}</span>
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    {#each students as student (student.uid)}
                        <tr class="hover:bg-gray-50 group">
                            <td class="py-1 pr-4 font-medium text-gray-700 sticky left-0 bg-white group-hover:bg-gray-50 whitespace-nowrap text-xs">
                                <div class="flex items-center justify-between gap-2">
                                    <span>{student.displayName || student.uid}</span>
                                    <button
                                        on:click={() => removeStudent(student)}
                                        disabled={removingStudentId === student.uid}
                                        title="Remove from class"
                                        class="text-[11px] font-medium text-gray-300 hover:text-red-600 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >{removingStudentId === student.uid ? '…' : 'Remove'}</button>
                                </div>
                            </td>
                            {#each standards as std}
                                {@const state = cellState(student.uid, std.id)}
                                <td class="py-1 px-2 text-center">
                                    <div
                                        class="w-5 h-5 rounded-full inline-block
                                            {state === 'mastered' ? 'bg-green-500' :
                                             state === 'progress' ? 'bg-yellow-400' :
                                             state === 'started'  ? 'border-2 border-gray-300 bg-white' :
                                             'border border-gray-200 bg-white'}"
                                        title="{student.displayName}: {std.shortName}"
                                    ></div>
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

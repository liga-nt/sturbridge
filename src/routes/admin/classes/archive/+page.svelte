<script>
    import { onMount } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { loadCourses } from '$lib/utils/studentStore.js';
    import {
        getDocs, collection, doc, updateDoc, deleteDoc, query, where, arrayRemove, serverTimestamp
    } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';
    import { syncUserClaims } from '$lib/utils/auth.js';

    let loading = true;
    let error = null;
    let courses = {};
    let archivedClasses = [];

    let restoringId = null;
    let deletingId = null;

    onMount(async () => {
        try {
            const effectiveSchoolId = $page.url.searchParams.get('schoolId') ?? $session.schoolId;
            const unscoped = $session.role === 'dev' && !effectiveSchoolId;

            if (!effectiveSchoolId && !unscoped) {
                error = 'No school assigned to your account. Ask a dev to set your schoolId claim.';
                loading = false;
                return;
            }

            const classesRef = unscoped ? collection(db, 'classes') : query(collection(db, 'classes'), where('schoolId', '==', effectiveSchoolId));
            const classSnap = await getDocs(classesRef);
            archivedClasses = classSnap.docs
                .map((d) => ({ classId: d.id, ...d.data() }))
                .filter((c) => c.archived);

            courses = await loadCourses();
        } catch (e) {
            console.error('Admin archived classes load error:', e);
            error = 'Failed to load: ' + e.message;
        } finally {
            loading = false;
        }
    });

    async function restoreClass(cls) {
        if (!confirm(`Restore "${cls.name || cls.classId}"? It will show up in Manage Classes again.`)) return;
        restoringId = cls.classId;
        try {
            await updateDoc(doc(db, 'classes', cls.classId), { archived: false, archivedAt: null });
            archivedClasses = archivedClasses.filter((c) => c.classId !== cls.classId);
        } catch (e) {
            alert('Failed to restore: ' + e.message);
        } finally {
            restoringId = null;
        }
    }

    async function deleteClass(cls) {
        const label = cls.name || cls.classId;
        if (!confirm(`Permanently delete "${label}"? This removes the class and unenrolls its teacher and ${cls.studentIds?.length ?? 0} student(s). This cannot be undone.`)) return;
        deletingId = cls.classId;
        try {
            const cleanupUids = [
                ...(cls.teacherId ? [cls.teacherId] : []),
                ...(cls.studentIds || [])
            ];
            await Promise.all(cleanupUids.map(async (uid) => {
                await updateDoc(doc(db, 'users', uid), { classIds: arrayRemove(cls.classId) });
                await syncUserClaims(uid);
            }));
            await deleteDoc(doc(db, 'classes', cls.classId));
            archivedClasses = archivedClasses.filter((c) => c.classId !== cls.classId);
        } catch (e) {
            alert('Failed to delete: ' + e.message);
        } finally {
            deletingId = null;
        }
    }
</script>

<div class="max-w-3xl space-y-6">
    <div class="flex items-center justify-between">
        <a href="/admin/classes{$page.url.search}" class="text-sm text-indigo-600 hover:text-indigo-800">← Manage Classes</a>
    </div>

    <h1 class="text-xl font-semibold text-gray-800">Archived Classes</h1>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else if archivedClasses.length === 0}
        <p class="text-sm text-gray-400 italic">No archived classes.</p>
    {:else}
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                        <th class="text-left px-4 py-3">Name</th>
                        <th class="text-left px-4 py-3">Course</th>
                        <th class="text-left px-4 py-3">Students</th>
                        <th class="text-right px-4 py-3">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {#each archivedClasses as cls}
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 font-medium text-gray-800">{cls.name || cls.classId}</td>
                            <td class="px-4 py-3 text-gray-500">
                                {courses[cls.courseId]?.label ?? cls.courseId ?? '—'}
                            </td>
                            <td class="px-4 py-3 text-gray-500">{cls.studentIds?.length ?? 0}</td>
                            <td class="px-4 py-3 text-right space-x-3">
                                <button
                                    on:click={() => restoreClass(cls)}
                                    disabled={restoringId === cls.classId || deletingId === cls.classId}
                                    class="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                                >{restoringId === cls.classId ? 'Restoring…' : 'Restore'}</button>
                                <button
                                    on:click={() => deleteClass(cls)}
                                    disabled={restoringId === cls.classId || deletingId === cls.classId}
                                    class="text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
                                >{deletingId === cls.classId ? 'Deleting…' : 'Delete Permanently'}</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

<script>
    import { onMount } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { getDocs, collection, doc, updateDoc, query, where } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;
    let archivedTeachers = [];
    let restoringUid = null;

    onMount(async () => {
        try {
            const effectiveSchoolId = $page.url.searchParams.get('schoolId') ?? $session.schoolId;
            const usersRef = ($session.role === 'dev' && !effectiveSchoolId)
                ? collection(db, 'users')
                : query(collection(db, 'users'), where('schoolId', '==', effectiveSchoolId));
            const snap = await getDocs(usersRef);
            archivedTeachers = snap.docs
                .map((d) => ({ uid: d.id, ...d.data() }))
                .filter((u) => u.role === 'teacher' && u.archived)
                .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        } catch (e) {
            console.error(e);
            error = 'Failed to load archived teachers.';
        } finally {
            loading = false;
        }
    });

    async function restoreTeacher(teacher) {
        if (!confirm(`Restore ${teacher.displayName || teacher.email}? They'll show up in the Teachers list again.`)) return;
        restoringUid = teacher.uid;
        try {
            await updateDoc(doc(db, 'users', teacher.uid), { archived: false, archivedAt: null });
            archivedTeachers = archivedTeachers.filter((t) => t.uid !== teacher.uid);
        } catch (e) {
            alert('Failed to restore: ' + e.message);
        } finally {
            restoringUid = null;
        }
    }
</script>

<div class="max-w-3xl space-y-6">
    <div class="flex items-center justify-between">
        <a href="/admin/teachers{$page.url.search}" class="text-sm text-indigo-600 hover:text-indigo-800">← Teachers</a>
    </div>

    <h1 class="text-xl font-semibold text-gray-800">Archived Teachers</h1>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else if archivedTeachers.length === 0}
        <p class="text-sm text-gray-400 italic">No archived teachers.</p>
    {:else}
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                        <th class="text-left px-4 py-3">Name</th>
                        <th class="text-left px-4 py-3">Email</th>
                        <th class="text-left px-4 py-3">Classes</th>
                        <th class="text-right px-4 py-3">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {#each archivedTeachers as teacher}
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 font-medium text-gray-800">
                                <a href="/admin/teacher/{teacher.uid}{$page.url.search}" class="hover:text-indigo-600">
                                    {teacher.displayName || '—'}
                                </a>
                            </td>
                            <td class="px-4 py-3 text-gray-600">{teacher.email}</td>
                            <td class="px-4 py-3 text-gray-500">{teacher.classIds?.length || 0} class(es)</td>
                            <td class="px-4 py-3 text-right">
                                <button
                                    on:click={() => restoreTeacher(teacher)}
                                    disabled={restoringUid === teacher.uid}
                                    class="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                                >{restoringUid === teacher.uid ? 'Restoring…' : 'Restore'}</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

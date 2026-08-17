<script>
    import { onMount } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { getDocs, collection, doc, setDoc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;
    let teachers = [];
    let newEmail = '';
    let adding = false;
    let addError = null;
    let addSuccess = null;
    let archivingUid = null;

    $: activeTeachers = teachers.filter((t) => !t.archived);

    onMount(async () => {
        await loadTeachers();
    });

    async function loadTeachers() {
        loading = true;
        try {
            const effectiveSchoolId = $page.url.searchParams.get('schoolId') ?? $session.schoolId;
            const usersRef = ($session.role === 'dev' && !effectiveSchoolId)
                ? collection(db, 'users')
                : query(collection(db, 'users'), where('schoolId', '==', effectiveSchoolId));
            const snap = await getDocs(usersRef);
            teachers = snap.docs
                .map((d) => ({ uid: d.id, ...d.data() }))
                .filter((u) => u.role === 'teacher')
                .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        } catch (e) {
            error = 'Failed to load teachers.';
        } finally {
            loading = false;
        }
    }

    async function archiveTeacher(teacher) {
        if (!confirm(`Archive ${teacher.displayName || teacher.email}? They'll be hidden from this list but can be restored later. Their classes and access are not affected.`)) return;
        archivingUid = teacher.uid;
        try {
            await updateDoc(doc(db, 'users', teacher.uid), { archived: true, archivedAt: serverTimestamp() });
            teachers = teachers.map((t) => t.uid === teacher.uid ? { ...t, archived: true } : t);
        } catch (e) {
            alert('Failed to archive: ' + e.message);
        } finally {
            archivingUid = null;
        }
    }

    async function addTeacher() {
        if (!newEmail.trim()) return;
        adding = true;
        addError = null;
        addSuccess = null;
        try {
            // Write invite — teacher will get claim on first sign-in
            await setDoc(doc(db, 'invites', newEmail.trim().toLowerCase()), {
                role: 'teacher',
                classIds: [],
                schoolId: $page.url.searchParams.get('schoolId') ?? $session.schoolId ?? 'default',
                createdAt: serverTimestamp()
            }, { merge: true });
            addSuccess = `Invite created for ${newEmail}. They will get teacher access on first sign-in.`;
            newEmail = '';
        } catch (e) {
            addError = e.message;
        } finally {
            adding = false;
        }
    }
</script>

<div class="max-w-3xl">
    <h1 class="text-xl font-semibold text-gray-800 mb-6">Teachers</h1>

    <!-- Add teacher -->
    <div class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">Add Teacher</h2>
        <form on:submit|preventDefault={addTeacher} class="flex gap-3">
            <input
                bind:value={newEmail}
                type="email"
                placeholder="teacher@gmail.com"
                class="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                required
            />
            <button
                type="submit"
                disabled={adding}
                class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
                {adding ? 'Adding...' : 'Add'}
            </button>
        </form>
        {#if addSuccess}
            <p class="text-sm text-green-600 mt-2">{addSuccess}</p>
        {/if}
        {#if addError}
            <p class="text-sm text-red-600 mt-2">{addError}</p>
        {/if}
    </div>

    <!-- Teacher list -->
    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else if activeTeachers.length === 0}
        <div class="text-sm text-gray-400 italic mb-3 flex items-center justify-between">
            <span>{teachers.length === 0 ? 'No teachers have signed in yet.' : 'No active teachers.'}</span>
            {#if teachers.length > 0}
                <a href="/admin/teachers/archive{$page.url.search}" class="text-xs font-medium text-indigo-600 hover:text-indigo-800 not-italic">
                    View Archived Teachers →
                </a>
            {/if}
        </div>
    {:else}
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden mb-3">
            <div class="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700 flex items-center justify-between">
                <span>All Teachers ({activeTeachers.length})</span>
                <a href="/admin/teachers/archive{$page.url.search}" class="text-xs font-normal text-indigo-600 hover:text-indigo-800">
                    View Archived Teachers →
                </a>
            </div>
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
                    {#each activeTeachers as teacher}
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
                                    on:click={() => archiveTeacher(teacher)}
                                    disabled={archivingUid === teacher.uid}
                                    class="text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
                                >{archivingUid === teacher.uid ? 'Archiving…' : 'Archive'}</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

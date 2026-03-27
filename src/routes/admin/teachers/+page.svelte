<script>
    import { onMount } from 'svelte';
    import { getDocs, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;
    let teachers = [];
    let newEmail = '';
    let adding = false;
    let addError = null;
    let addSuccess = null;

    onMount(async () => {
        await loadTeachers();
    });

    async function loadTeachers() {
        loading = true;
        try {
            const snap = await getDocs(collection(db, 'users'));
            teachers = snap.docs
                .map((d) => d.data())
                .filter((u) => u.role === 'teacher')
                .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        } catch (e) {
            error = 'Failed to load teachers.';
        } finally {
            loading = false;
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
    {:else if teachers.length === 0}
        <p class="text-gray-400 italic text-sm">No teachers have signed in yet.</p>
    {:else}
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                        <th class="text-left px-4 py-3">Name</th>
                        <th class="text-left px-4 py-3">Email</th>
                        <th class="text-left px-4 py-3">Classes</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {#each teachers as teacher}
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 font-medium text-gray-800">{teacher.displayName || '—'}</td>
                            <td class="px-4 py-3 text-gray-600">{teacher.email}</td>
                            <td class="px-4 py-3 text-gray-500">{teacher.classIds?.length || 0} class(es)</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

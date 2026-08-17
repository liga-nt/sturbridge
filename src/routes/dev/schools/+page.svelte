<script>
    import { onMount } from 'svelte';
    import {
        getDocs, collection, doc, setDoc, getDoc, serverTimestamp
    } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;
    let schools = [];
    let stats = {};  // { [schoolId]: { classCount, userCount } }

    // Create school form
    let newName = '';
    let newDomain = '';
    let newAdminEmail = '';
    let creating = false;
    let createError = null;
    let createSuccess = null;

    // Invite admin to existing school
    let inviteSchoolId = null;   // which school's invite form is open
    let inviteEmail = '';
    let inviting = false;
    let inviteResult = null;

    onMount(async () => {
        await loadSchools();
    });

    async function loadSchools() {
        loading = true;
        error = null;
        try {
            const [schoolSnap, classSnap, userSnap] = await Promise.all([
                getDocs(collection(db, 'schools')),
                getDocs(collection(db, 'classes')),
                getDocs(collection(db, 'users'))
            ]);

            schools = schoolSnap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

            const classCounts = {};
            const userCounts = {};
            classSnap.docs.forEach((d) => {
                const sid = d.data().schoolId ?? 'unknown';
                classCounts[sid] = (classCounts[sid] ?? 0) + 1;
            });
            userSnap.docs.forEach((d) => {
                const sid = d.data().schoolId ?? 'unknown';
                userCounts[sid] = (userCounts[sid] ?? 0) + 1;
            });
            stats = {};
            schools.forEach((s) => {
                stats[s.id] = {
                    classCount: classCounts[s.id] ?? 0,
                    userCount: userCounts[s.id] ?? 0
                };
            });
        } catch (e) {
            console.error(e);
            error = 'Failed to load schools.';
        } finally {
            loading = false;
        }
    }

    function slugify(name) {
        return name.trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    async function writeAdminInvite(email, schoolId) {
        await setDoc(doc(db, 'invites', email.trim().toLowerCase()), {
            role: 'admin',
            classIds: [],
            schoolId,
            createdAt: serverTimestamp()
        }, { merge: true });
    }

    async function createSchool() {
        if (!newName.trim()) return;
        creating = true;
        createError = null;
        createSuccess = null;
        try {
            const baseId = slugify(newName);
            let schoolId = baseId;
            let attempt = 1;
            while ((await getDoc(doc(db, 'schools', schoolId))).exists()) {
                schoolId = `${baseId}-${++attempt}`;
            }

            await setDoc(doc(db, 'schools', schoolId), {
                name: newName.trim(),
                domain: newDomain.trim() || null,
                createdAt: serverTimestamp()
            });

            if (newAdminEmail.trim()) {
                await writeAdminInvite(newAdminEmail.trim(), schoolId);
                createSuccess = `School "${newName.trim()}" created (id: ${schoolId}). Admin invite sent to ${newAdminEmail.trim()}.`;
            } else {
                createSuccess = `School "${newName.trim()}" created (id: ${schoolId}).`;
            }

            newName = '';
            newDomain = '';
            newAdminEmail = '';
            await loadSchools();
        } catch (e) {
            createError = e.message;
        } finally {
            creating = false;
        }
    }

    async function inviteAdmin(schoolId) {
        if (!inviteEmail.trim()) return;
        inviting = true;
        inviteResult = null;
        try {
            await writeAdminInvite(inviteEmail.trim(), schoolId);
            inviteResult = { ok: true, msg: `Invite created for ${inviteEmail.trim()}.` };
            inviteEmail = '';
            inviteSchoolId = null;
        } catch (e) {
            inviteResult = { ok: false, msg: e.message };
        } finally {
            inviting = false;
        }
    }

    function toggleInvite(schoolId) {
        if (inviteSchoolId === schoolId) {
            inviteSchoolId = null;
            inviteEmail = '';
            inviteResult = null;
        } else {
            inviteSchoolId = schoolId;
            inviteEmail = '';
            inviteResult = null;
        }
    }
</script>

<div class="max-w-4xl space-y-8">
    <h1 class="text-xl font-semibold text-gray-800">Manage Schools</h1>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <!-- Create school -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
            <h2 class="text-sm font-semibold text-gray-700 mb-4">New School</h2>
            <form on:submit|preventDefault={createSchool} class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs text-gray-500 mb-1" for="school-name">School Name</label>
                        <input
                            id="school-name"
                            bind:value={newName}
                            type="text"
                            placeholder="Lincoln Elementary"
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1" for="school-domain">
                            Email Domain <span class="text-gray-400">(optional)</span>
                        </label>
                        <input
                            id="school-domain"
                            bind:value={newDomain}
                            type="text"
                            placeholder="lincolnelem.org"
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                    </div>
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1" for="admin-email">
                        Admin Email <span class="text-gray-400">(optional — creates invite immediately)</span>
                    </label>
                    <input
                        id="admin-email"
                        bind:value={newAdminEmail}
                        type="email"
                        placeholder="principal@lincolnelem.org"
                        class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    />
                </div>
                <button
                    type="submit"
                    disabled={creating}
                    class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                    {creating ? 'Creating…' : 'Create School'}
                </button>
            </form>
            {#if createSuccess}<p class="text-sm text-green-600 mt-2">{createSuccess}</p>{/if}
            {#if createError}<p class="text-sm text-red-600 mt-2">{createError}</p>{/if}
        </div>

        <!-- Schools list -->
        {#if schools.length === 0}
            <p class="text-gray-400 italic text-sm">No schools yet.</p>
        {:else}
            <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
                    All Schools ({schools.length})
                </div>
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <tr>
                            <th class="text-left px-4 py-3">Name</th>
                            <th class="text-left px-4 py-3">ID</th>
                            <th class="text-left px-4 py-3">Domain</th>
                            <th class="text-left px-4 py-3">Classes</th>
                            <th class="text-left px-4 py-3">Users</th>
                            <th class="text-left px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        {#each schools as school}
                            <tr class="hover:bg-gray-50 align-top">
                                <td class="px-4 py-3 font-medium text-gray-800">{school.name}</td>
                                <td class="px-4 py-3 font-mono text-xs text-gray-500">{school.id}</td>
                                <td class="px-4 py-3 text-gray-500">{school.domain ?? '—'}</td>
                                <td class="px-4 py-3 text-gray-500">{stats[school.id]?.classCount ?? 0}</td>
                                <td class="px-4 py-3 text-gray-500">{stats[school.id]?.userCount ?? 0}</td>
                                <td class="px-4 py-3">
                                    <div class="flex flex-col gap-2">
                                        <a
                                            href="/dev/schools/{school.id}"
                                            class="text-xs font-medium text-gray-600 hover:text-gray-900 whitespace-nowrap"
                                        >Edit</a>
                                        <a
                                            href="/admin/classes?schoolId={school.id}"
                                            class="text-xs font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
                                        >View as Admin →</a>
                                        <button
                                            on:click={() => toggleInvite(school.id)}
                                            class="text-xs text-gray-500 hover:text-gray-700 text-left whitespace-nowrap"
                                        >{inviteSchoolId === school.id ? 'Cancel' : '+ Invite Admin'}</button>

                                        {#if inviteSchoolId === school.id}
                                            <form
                                                on:submit|preventDefault={() => inviteAdmin(school.id)}
                                                class="flex gap-2 items-center mt-1"
                                            >
                                                <input
                                                    bind:value={inviteEmail}
                                                    type="email"
                                                    placeholder="admin@school.org"
                                                    class="border border-gray-300 rounded px-2 py-1 text-xs w-40"
                                                    required
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={inviting}
                                                    class="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                                                >{inviting ? '…' : 'Send'}</button>
                                            </form>
                                            {#if inviteResult}
                                                <p class="text-xs {inviteResult.ok ? 'text-green-600' : 'text-red-600'}">{inviteResult.msg}</p>
                                            {/if}
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    {/if}
</div>

<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import {
        getDoc, doc, updateDoc, getDocs, collection, query, where,
        setDoc, serverTimestamp
    } from 'firebase/firestore';
    import { httpsCallable } from 'firebase/functions';
    import { db, functions } from '$lib/firebase/client';

    $: schoolId = $page.params.schoolId;

    let loading = true;
    let error = null;

    // School fields
    let school = null;
    let editName = '';
    let editDomain = '';

    // Courses
    let allCourses = [];       // [{ id, label, grade, subject }] sorted
    let selectedCourseIds = new Set();
    let savingCourses = false;
    let coursesMsg = null;
    let saving = false;
    let saveMsg = null;

    // Admins
    let admins = [];
    let removingUid = null;
    let removeError = null;

    // Invite new admin
    let inviteEmail = '';
    let inviting = false;
    let inviteMsg = null;

    onMount(async () => {
        await load();
    });

    async function load() {
        loading = true;
        error = null;
        try {
            const [schoolSnap, usersSnap, coursesSnap] = await Promise.all([
                getDoc(doc(db, 'schools', schoolId)),
                getDocs(query(
                    collection(db, 'users'),
                    where('role', '==', 'admin'),
                    where('schoolId', '==', schoolId)
                )),
                getDocs(collection(db, 'courses'))
            ]);

            if (!schoolSnap.exists()) { error = 'School not found.'; loading = false; return; }

            school   = { id: schoolSnap.id, ...schoolSnap.data() };
            editName = school.name ?? '';
            editDomain = school.domain ?? '';

            admins = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

            allCourses = coursesSnap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
            selectedCourseIds = new Set(school.courseIds ?? []);
        } catch (e) {
            console.error(e);
            error = 'Failed to load school.';
        } finally {
            loading = false;
        }
    }

    async function saveSchool() {
        saving = true;
        saveMsg = null;
        try {
            await updateDoc(doc(db, 'schools', schoolId), {
                name:   editName.trim(),
                domain: editDomain.trim() || null
            });
            school = { ...school, name: editName.trim(), domain: editDomain.trim() || null };
            saveMsg = { ok: true, text: 'Saved.' };
        } catch (e) {
            saveMsg = { ok: false, text: e.message };
        } finally {
            saving = false;
        }
    }

    async function removeAdmin(uid) {
        removingUid = uid;
        removeError = null;
        try {
            const fn = httpsCallable(functions, 'revokeAccess');
            await fn({ uid });
            admins = admins.filter((a) => a.uid !== uid);
        } catch (e) {
            removeError = e.message;
        } finally {
            removingUid = null;
        }
    }

    function toggleCourse(courseId) {
        if (selectedCourseIds.has(courseId)) {
            selectedCourseIds.delete(courseId);
        } else {
            selectedCourseIds.add(courseId);
        }
        selectedCourseIds = new Set(selectedCourseIds); // trigger reactivity
    }

    async function saveCourses() {
        savingCourses = true;
        coursesMsg = null;
        try {
            await updateDoc(doc(db, 'schools', schoolId), {
                courseIds: [...selectedCourseIds]
            });
            school = { ...school, courseIds: [...selectedCourseIds] };
            coursesMsg = { ok: true, text: 'Saved.' };
        } catch (e) {
            coursesMsg = { ok: false, text: e.message };
        } finally {
            savingCourses = false;
        }
    }

    async function inviteAdmin() {
        if (!inviteEmail.trim()) return;
        inviting = true;
        inviteMsg = null;
        try {
            await setDoc(doc(db, 'invites', inviteEmail.trim().toLowerCase()), {
                role: 'admin',
                classIds: [],
                schoolId,
                createdAt: serverTimestamp()
            }, { merge: true });
            inviteMsg = { ok: true, text: `Invite created for ${inviteEmail.trim()}.` };
            inviteEmail = '';
        } catch (e) {
            inviteMsg = { ok: false, text: e.message };
        } finally {
            inviting = false;
        }
    }
</script>

<div class="max-w-2xl space-y-8">
    <div class="flex items-center gap-4">
        <a href="/dev/schools" class="text-sm text-indigo-600 hover:text-indigo-800">← All Schools</a>
    </div>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <!-- Edit school -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
            <h1 class="text-lg font-semibold text-gray-800 mb-4">{school.name}</h1>
            <p class="text-xs text-gray-400 mb-4 font-mono">id: {school.id}</p>
            <form on:submit|preventDefault={saveSchool} class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs text-gray-500 mb-1" for="edit-name">School Name</label>
                        <input
                            id="edit-name"
                            bind:value={editName}
                            type="text"
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1" for="edit-domain">Email Domain</label>
                        <input
                            id="edit-domain"
                            bind:value={editDomain}
                            type="text"
                            placeholder="optional"
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={saving}
                    class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                >{saving ? 'Saving…' : 'Save Changes'}</button>
            </form>
            {#if saveMsg}
                <p class="text-sm mt-2 {saveMsg.ok ? 'text-green-600' : 'text-red-600'}">{saveMsg.text}</p>
            {/if}
        </div>

        <!-- Available Courses -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
            <h2 class="text-sm font-semibold text-gray-700 mb-1">Available Courses</h2>
            <p class="text-xs text-gray-400 mb-4">Controls which courses appear when this school's admin creates a class.</p>
            {#if allCourses.length === 0}
                <p class="text-sm text-gray-400 italic">No courses in database yet.</p>
            {:else}
                <div class="space-y-2 mb-4">
                    {#each allCourses as course}
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selectedCourseIds.has(course.id)}
                                on:change={() => toggleCourse(course.id)}
                                class="rounded border-gray-300 text-indigo-600"
                            />
                            <span class="text-sm text-gray-700">{course.label}</span>
                            <span class="text-xs text-gray-400 font-mono">{course.id}</span>
                        </label>
                    {/each}
                </div>
                <button
                    on:click={saveCourses}
                    disabled={savingCourses}
                    class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                >{savingCourses ? 'Saving…' : 'Save Courses'}</button>
                {#if coursesMsg}
                    <p class="text-sm mt-2 {coursesMsg.ok ? 'text-green-600' : 'text-red-600'}">{coursesMsg.text}</p>
                {/if}
            {/if}
        </div>

        <!-- Admins -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
            <h2 class="text-sm font-semibold text-gray-700 mb-4">Administrators</h2>

            {#if admins.length === 0}
                <p class="text-sm text-gray-400 italic mb-4">No admins yet — invite one below.</p>
            {:else}
                <div class="divide-y divide-gray-100 mb-5">
                    {#each admins as admin}
                        <div class="flex items-center justify-between py-3">
                            <div>
                                <p class="text-sm font-medium text-gray-800">{admin.displayName || '—'}</p>
                                <p class="text-xs text-gray-500">{admin.email}</p>
                            </div>
                            <button
                                on:click={() => removeAdmin(admin.uid)}
                                disabled={removingUid === admin.uid}
                                class="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                            >{removingUid === admin.uid ? 'Removing…' : 'Remove Admin'}</button>
                        </div>
                    {/each}
                </div>
                {#if removeError}
                    <p class="text-xs text-red-600 mb-3">{removeError}</p>
                {/if}
            {/if}

            <!-- Invite new admin -->
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Invite Admin</h3>
            <form on:submit|preventDefault={inviteAdmin} class="flex gap-2">
                <input
                    bind:value={inviteEmail}
                    type="email"
                    placeholder="admin@school.org"
                    class="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                    required
                />
                <button
                    type="submit"
                    disabled={inviting}
                    class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                >{inviting ? 'Sending…' : 'Send Invite'}</button>
            </form>
            {#if inviteMsg}
                <p class="text-sm mt-2 {inviteMsg.ok ? 'text-green-600' : 'text-red-600'}">{inviteMsg.text}</p>
            {/if}
        </div>
    {/if}
</div>

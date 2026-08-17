<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { loadCourse } from '$lib/utils/studentStore.js';
    import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;

    let teacher = null;
    let classes = []; // [{ classId, name, courseId, courseLabel, studentIds }]

    // Profile edit
    let editDisplayName = '';
    let savingProfile = false;
    let profileMsg = null;

    // Archive
    let archiving = false;

    $: teacherId = $page.params.teacherId;

    onMount(async () => {
        try {
            const snap = await getDoc(doc(db, 'users', teacherId));
            if (!snap.exists() || snap.data().role !== 'teacher') {
                error = 'Teacher not found.';
                loading = false;
                return;
            }
            teacher = { uid: snap.id, ...snap.data() };
            editDisplayName = teacher.displayName || '';

            const classIds = teacher.classIds || [];
            const classDocs = await Promise.all(classIds.map((id) => getDoc(doc(db, 'classes', id))));
            const rawClasses = classDocs.filter((d) => d.exists()).map((d) => ({ classId: d.id, ...d.data() }));

            const courseCache = {};
            for (const c of rawClasses) {
                if (c.courseId && !(c.courseId in courseCache)) {
                    courseCache[c.courseId] = await loadCourse(c.courseId);
                }
            }
            classes = rawClasses
                .map((c) => ({ ...c, courseLabel: courseCache[c.courseId]?.label ?? c.courseId ?? '—' }))
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } catch (e) {
            console.error(e);
            error = 'Failed to load teacher.';
        } finally {
            loading = false;
        }
    });

    async function saveProfile() {
        if (!editDisplayName.trim() || editDisplayName.trim() === teacher.displayName) return;
        savingProfile = true;
        profileMsg = null;
        try {
            await updateDoc(doc(db, 'users', teacher.uid), { displayName: editDisplayName.trim() });
            teacher = { ...teacher, displayName: editDisplayName.trim() };
            profileMsg = { ok: true, text: 'Saved.' };
        } catch (e) {
            profileMsg = { ok: false, text: e.message };
        } finally {
            savingProfile = false;
        }
    }

    async function toggleArchive() {
        const archive = !teacher.archived;
        const msg = archive
            ? `Archive ${teacher.displayName || teacher.email}? They'll be hidden from the Teachers list but can be restored later. Their classes and access are not affected.`
            : `Restore ${teacher.displayName || teacher.email}? They'll show up in the Teachers list again.`;
        if (!confirm(msg)) return;
        archiving = true;
        try {
            await updateDoc(doc(db, 'users', teacher.uid), {
                archived: archive,
                archivedAt: archive ? serverTimestamp() : null
            });
            teacher = { ...teacher, archived: archive };
        } catch (e) {
            alert(`Failed to ${archive ? 'archive' : 'restore'}: ` + e.message);
        } finally {
            archiving = false;
        }
    }
</script>

<div class="max-w-3xl space-y-6">
    <a href="/admin/teachers{$page.url.search}" class="text-sm text-indigo-600 hover:text-indigo-800">← Teachers</a>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <div class="flex items-center gap-3">
            <h1 class="text-xl font-semibold text-gray-800">{teacher.displayName || teacher.email}</h1>
            {#if teacher.archived}
                <span class="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Archived</span>
            {/if}
        </div>

        <!-- Profile -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
            <h2 class="text-sm font-semibold text-gray-700 mb-4">Profile</h2>
            <div class="grid grid-cols-2 gap-3 items-end">
                <div>
                    <label class="block text-xs text-gray-500 mb-1" for="edit-name">Display Name</label>
                    <div class="flex gap-2">
                        <input
                            id="edit-name"
                            bind:value={editDisplayName}
                            type="text"
                            class="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                        <button
                            on:click={saveProfile}
                            disabled={savingProfile || !editDisplayName.trim() || editDisplayName.trim() === teacher.displayName}
                            class="px-3 py-2 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                        >{savingProfile ? 'Saving…' : 'Save'}</button>
                    </div>
                </div>
                <div>
                    <p class="block text-xs text-gray-500 mb-1">Email</p>
                    <p class="text-sm text-gray-700 px-3 py-2">{teacher.email}</p>
                </div>
            </div>
            {#if profileMsg}
                <p class="text-sm mt-3 {profileMsg.ok ? 'text-green-600' : 'text-red-600'}">{profileMsg.text}</p>
            {/if}

            <div class="mt-4 pt-4 border-t border-gray-100">
                <button
                    on:click={toggleArchive}
                    disabled={archiving}
                    class="text-xs font-medium disabled:opacity-50 {teacher.archived ? 'text-indigo-600 hover:text-indigo-800' : 'text-gray-400 hover:text-red-600'}"
                >{archiving ? 'Saving…' : (teacher.archived ? 'Restore Teacher' : 'Archive Teacher')}</button>
            </div>
        </div>

        <!-- Classes -->
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div class="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
                Classes ({classes.length})
            </div>
            {#if classes.length === 0}
                <p class="text-sm text-gray-400 italic px-5 py-4">No classes assigned.</p>
            {:else}
                <div class="divide-y divide-gray-100">
                    {#each classes as cls}
                        <a
                            href="/admin/class/{cls.classId}{$page.url.search}"
                            class="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                        >
                            <div>
                                <p class="font-medium text-gray-800">{cls.name || cls.classId}</p>
                                <p class="text-xs text-gray-500 mt-0.5">{cls.courseLabel} · {(cls.studentIds || []).length} students</p>
                            </div>
                            <span class="text-indigo-600 text-sm">Manage →</span>
                        </a>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>

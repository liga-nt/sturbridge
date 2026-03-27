<script>
    import { onMount } from 'svelte';
    import { session } from '$lib/stores/session';
    import { page } from '$app/stores';
    import { loadClass, loadAllStandards } from '$lib/utils/studentStore.js';
    import { doc, getDoc, setDoc, getDocs, collection, updateDoc } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;
    let saving = false;
    let saved = false;

    let classId = null;
    let progression = [];   // [{ id, shortName, description, expanded }]
    let allStandardsInfo = {};

    onMount(async () => {
        try {
            classId = $page.url.searchParams.get('classId');
            if (!classId) {
                const uid = $session.user?.uid;
                const userSnap = await getDoc(doc(db, 'users', uid));
                const userData = userSnap.exists() ? userSnap.data() : null;

                if ($session.role === 'admin' || $session.role === 'dev') {
                    const classesSna = await getDocs(collection(db, 'classes'));
                    classId = classesSna.docs[0]?.id;
                } else {
                    classId = userData?.classIds?.[0];
                }
            }
            if (!classId) { error = 'No class assigned.'; loading = false; return; }

            const classDoc = await loadClass(classId);
            allStandardsInfo = await loadAllStandards();

            progression = (classDoc?.standardProgression || []).map((id) => ({
                id,
                shortName: allStandardsInfo[id]?.shortName || id,
                description: allStandardsInfo[id]?.description || '',
                expanded: false
            }));
        } catch (e) {
            console.error(e);
            error = 'Failed to load standards.';
        } finally {
            loading = false;
        }
    });

    // ── Drag-and-drop ──────────────────────────────────────────────────────────
    let dragIndex = null;
    let dragOverIndex = null;

    function onDragStart(i) {
        dragIndex = i;
    }

    function onDragOver(e, i) {
        e.preventDefault();
        dragOverIndex = i;
    }

    function onDrop(i) {
        if (dragIndex === null || dragIndex === i) {
            dragIndex = null;
            dragOverIndex = null;
            return;
        }
        const newOrder = [...progression];
        const [moved] = newOrder.splice(dragIndex, 1);
        newOrder.splice(i, 0, moved);
        progression = newOrder;
        dragIndex = null;
        dragOverIndex = null;
    }

    function onDragEnd() {
        dragIndex = null;
        dragOverIndex = null;
    }

    async function saveOrder() {
        saving = true;
        saved = false;
        try {
            await updateDoc(doc(db, 'classes', classId), {
                standardProgression: progression.map((s) => s.id)
            });
            saved = true;
            setTimeout(() => (saved = false), 2000);
        } catch (e) {
            console.error(e);
            error = 'Failed to save.';
        } finally {
            saving = false;
        }
    }
</script>

<div class="max-w-2xl">
    <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold text-gray-800">Standard Progression</h1>
        <div class="flex items-center gap-3">
            {#if saved}
                <span class="text-sm text-green-600 font-medium">Saved!</span>
            {/if}
            <button
                on:click={saveOrder}
                disabled={saving}
                class="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
                {saving ? 'Saving...' : 'Save Order'}
            </button>
        </div>
    </div>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else}
        <p class="text-sm text-gray-500 mb-4">Drag rows to reorder the standard progression for your class.</p>

        <ol class="space-y-1">
            {#each progression as std, i}
                <li
                    draggable="true"
                    on:dragstart={() => onDragStart(i)}
                    on:dragover={(e) => onDragOver(e, i)}
                    on:drop={() => onDrop(i)}
                    on:dragend={onDragEnd}
                    class="flex items-start gap-3 bg-white rounded-lg border px-4 py-3 cursor-grab select-none
                        {dragOverIndex === i ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}
                        {dragIndex === i ? 'opacity-40' : ''}"
                >
                    <span class="text-gray-300 mt-0.5">⠿</span>
                    <span class="text-xs text-gray-400 font-mono mt-0.5 w-4 shrink-0">{i + 1}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2">
                            <span class="font-medium text-gray-800 text-sm">{std.shortName}</span>
                            <span class="text-xs text-gray-400">{std.id}</span>
                        </div>
                        {#if std.expanded}
                            <p class="text-xs text-gray-500 mt-1 leading-relaxed">{std.description}</p>
                        {/if}
                    </div>
                    <button
                        on:click={() => (std.expanded = !std.expanded)}
                        class="text-xs text-gray-400 hover:text-gray-600 shrink-0 mt-0.5"
                        aria-label="Toggle description"
                    >
                        {std.expanded ? '▲' : '▼'}
                    </button>
                </li>
            {/each}
        </ol>
    {/if}
</div>

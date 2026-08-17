<script>
    import { onMount } from 'svelte';
    import {
        getDocs, collection, query, orderBy, doc, updateDoc, deleteDoc
    } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    let loading = true;
    let error = null;
    let reports = [];
    let expandedId = null;
    let showResolved = false;

    onMount(loadReports);

    async function loadReports() {
        loading = true;
        error = null;
        try {
            const snap = await getDocs(query(collection(db, 'bugReports'), orderBy('createdAt', 'desc')));
            reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error(e);
            error = 'Failed to load bug reports.';
        } finally {
            loading = false;
        }
    }

    function toggle(id) {
        expandedId = expandedId === id ? null : id;
    }

    function formatTime(ts) {
        if (!ts?.seconds) return '—';
        return new Date(ts.seconds * 1000).toLocaleString();
    }

    async function toggleResolved(report) {
        const resolved = !report.resolved;
        await updateDoc(doc(db, 'bugReports', report.id), { resolved });
        reports = reports.map((r) => r.id === report.id ? { ...r, resolved } : r);
    }

    async function remove(report) {
        if (!confirm('Delete this bug report? This cannot be undone.')) return;
        await deleteDoc(doc(db, 'bugReports', report.id));
        reports = reports.filter((r) => r.id !== report.id);
        if (expandedId === report.id) expandedId = null;
    }

    $: visibleReports = showResolved ? reports : reports.filter((r) => !r.resolved);
</script>

<div class="max-w-5xl space-y-6">
    <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-800">Bug Reports</h1>
        <label class="flex items-center gap-2 text-sm text-gray-500">
            <input type="checkbox" bind:checked={showResolved} />
            Show resolved
        </label>
    </div>

    {#if loading}
        <p class="text-gray-400">Loading...</p>
    {:else if error}
        <p class="text-red-600">{error}</p>
    {:else if visibleReports.length === 0}
        <p class="text-gray-400 italic text-sm">No open bug reports.</p>
    {:else}
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {#each visibleReports as report}
                <div class="px-5 py-4 {report.resolved ? 'opacity-50' : ''}">
                    <button on:click={() => toggle(report.id)} class="w-full text-left">
                        <div class="flex items-start justify-between gap-4">
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-gray-800 font-medium">{report.notes}</p>
                                <p class="text-xs text-gray-400 mt-1 font-mono">
                                    variant: {report.variantId ?? '—'}
                                </p>
                            </div>
                            <span class="text-xs text-gray-400 shrink-0">{formatTime(report.createdAt)}</span>
                        </div>
                    </button>

                    {#if expandedId === report.id}
                        <div class="mt-3 space-y-3">
                            <div class="flex gap-3">
                                <button
                                    on:click={() => toggleResolved(report)}
                                    class="text-xs font-medium px-3 py-1.5 rounded border {report.resolved ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'}"
                                >
                                    {report.resolved ? 'Mark unresolved' : 'Mark resolved'}
                                </button>
                                <button
                                    on:click={() => remove(report)}
                                    class="text-xs font-medium px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<script>
    import { onMount } from 'svelte';

    let draft = 1;
    let files = [];
    let existingFiles = new Set();
    let titles = {};
    let selected = '';
    let content = '';
    let standards = [];
    let saved = false;
    let saving = false;
    let dirty = false;

    const STORY_ORDER_V1 = [
        'ch_P_euthyphro.md',
        'ch_00_storm.md',
        'ch_01_delphi.md',
        'ch_03_corinth.md',
        'ch_02_olympia.md',
        'ch_04_aegean.md',
        'ch_R1_apology.md',
        'ch_05_marathon.md',
        'ch_06_thermopylae.md',
        'ch_07_sparta.md',
        'ch_08_salamis.md',
        'ch_R2_crito.md',
        'ch_09_acropolis.md',
        'ch_10_theater.md',
        'ch_11_mycenae.md',
        'ch_12_thebes.md',
        'ch_R3_phaedo_morning.md',
        'ch_13_hellespont_troy.md',
        'ch_14_crete.md',
        'ch_15_eastern_med.md',
        'ch_16_alexandria.md',
        'ch_17_chaeronea.md',
        'ch_18_gaugamela.md',
        'ch_F_plato.md',
    ];

    onMount(() => loadDraft(draft));

    async function loadDraft(d) {
        if (dirty && !confirm('Unsaved changes — discard?')) return;
        draft = d;
        dirty = false;
        saved = false;
        selected = '';
        content = '';
        standards = [];
        titles = {};

        const res = await fetch(`/dev/chapters/api?draft=${draft}`);
        const data = await res.json();
        const fetched = new Set(data.files);
        existingFiles = fetched;

        if (draft === 1) {
            files = STORY_ORDER_V1.filter(f => fetched.has(f));
        } else {
            const v2Order = data.v2Order || [];
            titles = data.titles || {};
            const v2Set = new Set(v2Order);
            const extras = [...fetched].filter(f => !v2Set.has(f)).sort();
            files = [...v2Order, ...extras];
        }

        if (files.length) selectFile(files[0]);
    }

    async function selectFile(file) {
        if (dirty && !confirm('Unsaved changes — discard?')) return;
        selected = file;
        dirty = false;
        saved = false;
        const res = await fetch(`/dev/chapters/api?file=${encodeURIComponent(file)}&draft=${draft}`);
        const data = await res.json();
        content = data.content;
        standards = data.standards || [];
    }

    async function save() {
        saving = true;
        await fetch(`/dev/chapters/api?draft=${draft}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: selected, content })
        });
        saving = false;
        saved = true;
        dirty = false;
        setTimeout(() => (saved = false), 2000);
    }

    function handleKey(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            save();
        }
    }

    function handleTextareaKey(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
            e.preventDefault();
            const el = e.target;
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const sel = content.slice(start, end);
            content = content.slice(0, start) + '**' + sel + '**' + content.slice(end);
            dirty = true;
            requestAnimationFrame(() => {
                el.selectionStart = start + 2;
                el.selectionEnd = end + 2;
            });
        }
    }

    function formatName(f) {
        const id = f.replace(/\.md$/, '');
        if (draft === 2) {
            return titles[id] || id.replace(/^ch_\d+_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return id
            .replace(/^ch_[^_]+_/, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function formatDomain(d) {
        return d ? d.replace(/_/g, ' ') : '';
    }
</script>

<svelte:window on:keydown={handleKey} />

<div class="flex flex-col -mx-6 -mt-8" style="height: calc(100vh - 64px);">
    <!-- Draft tab bar -->
    <div class="flex-shrink-0 flex gap-1 px-3 pt-2 pb-0 bg-white border-b border-gray-200">
        <button
            on:click={() => loadDraft(1)}
            class="px-4 py-1.5 text-sm font-medium rounded-t border-b-2 transition-colors
                {draft === 1
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}"
        >
            Draft 1
        </button>
        <button
            on:click={() => loadDraft(2)}
            class="px-4 py-1.5 text-sm font-medium rounded-t border-b-2 transition-colors
                {draft === 2
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}"
        >
            Draft 2
        </button>
    </div>

    <!-- Three-panel editor -->
    <div class="flex flex-1 min-h-0">
        <!-- Sidebar -->
        <div class="w-56 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
            <ul class="py-1">
                {#each files as f}
                    <li>
                        <button
                            class="w-full text-left px-3 py-2 text-sm truncate
                                {selected === f
                                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                                    : existingFiles.has(f)
                                    ? 'text-gray-700 hover:bg-gray-50'
                                    : 'text-gray-400 italic hover:bg-gray-50'}"
                            on:click={() => selectFile(f)}
                        >
                            {formatName(f)}
                        </button>
                    </li>
                {/each}
            </ul>
        </div>

        <!-- Editor -->
        <div class="flex-1 flex flex-col min-w-0">
            <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
                <span class="text-sm font-medium text-gray-700">{selected || '—'}</span>
                <div class="flex items-center gap-3">
                    {#if saved}
                        <span class="text-xs text-green-600">Saved</span>
                    {:else if dirty}
                        <span class="text-xs text-amber-500">Unsaved</span>
                    {/if}
                    <button
                        on:click={save}
                        disabled={!selected || saving}
                        class="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
            <textarea
                class="flex-1 w-full px-5 py-4 font-mono text-sm text-gray-800 bg-gray-50 resize-none outline-none border-none"
                bind:value={content}
                on:input={() => { dirty = true; saved = false; }}
                on:keydown={handleTextareaKey}
                spellcheck="false"
            ></textarea>
        </div>

        <!-- Standards panel -->
        {#if true}
        <div class="w-72 flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
            <div class="px-3 py-3 border-b border-gray-100">
                <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Standards Covered</h2>
            </div>
            {#if standards.length === 0}
                <p class="px-3 py-4 text-xs text-gray-400">None recorded for this chapter.</p>
            {:else}
                <ul class="divide-y divide-gray-100">
                    {#each standards as s}
                        <li class="px-3 py-3">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs font-mono text-indigo-600">{s.id}</span>
                                {#if s.domain}
                                    <span class="text-xs text-gray-400">{formatDomain(s.domain)}</span>
                                {/if}
                            </div>
                            <p class="text-xs text-gray-700 leading-relaxed">{s.description}</p>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
        {/if}
    </div>
</div>

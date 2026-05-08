<script>
    import { onMount } from 'svelte';

    let files = [];
    let selected = '';
    let content = '';
    let saved = false;
    let saving = false;
    let dirty = false;

    onMount(async () => {
        const res = await fetch('/dev/chapters/api');
        const data = await res.json();
        files = data.files;
        if (files.length) selectFile(files[0]);
    });

    async function selectFile(file) {
        if (dirty && !confirm('Unsaved changes — discard?')) return;
        selected = file;
        dirty = false;
        saved = false;
        const res = await fetch(`/dev/chapters/api?file=${encodeURIComponent(file)}`);
        const data = await res.json();
        content = data.content;
    }

    async function save() {
        saving = true;
        await fetch('/dev/chapters/api', {
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

    function formatName(f) {
        return f.replace(/\.md$/, '').replace(/_/g, ' ');
    }
</script>

<svelte:window on:keydown={handleKey} />

<div class="flex gap-0 -mx-6 -mt-8" style="height: calc(100vh - 64px);">
    <!-- Sidebar -->
    <div class="w-56 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
        <div class="px-3 py-3 border-b border-gray-100">
            <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Chapters</h2>
        </div>
        <ul class="py-1">
            {#each files as f}
                <li>
                    <button
                        class="w-full text-left px-3 py-2 text-sm truncate
                            {selected === f
                                ? 'bg-indigo-50 text-indigo-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-50'}"
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
            spellcheck="false"
        ></textarea>
    </div>
</div>

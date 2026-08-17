<script>
    import { db } from '$lib/firebase/client';
    import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
    import { session } from '$lib/stores/session';

    // The pooled variant's doc id (questionVariants/{variantId}) — enough on
    // its own to look up the item, its data, and its template. Null if the
    // question wasn't pooled (shouldn't happen for testers/dev audit today).
    export let variantId = null;

    let open = false;
    let notes = '';
    let saving = false;
    let saved = false;
    let error = null;

    function openModal() {
        open = true;
        saved = false;
        error = null;
        notes = '';
    }

    async function submit() {
        if (!notes.trim()) return;
        saving = true;
        error = null;
        try {
            await addDoc(collection(db, 'bugReports'), {
                uid: $session.user?.uid ?? null,
                notes: notes.trim(),
                variantId,
                createdAt: serverTimestamp()
            });
            saved = true;
            setTimeout(() => { open = false; }, 1200);
        } catch (e) {
            error = e.message;
        } finally {
            saving = false;
        }
    }
</script>

<button
    on:click={openModal}
    class="fixed bottom-4 left-4 text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-3 py-1.5 shadow-sm hover:text-gray-600 hover:border-gray-300 transition-all"
>
    🐛 Report bug
</button>

{#if open}
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-1">Report a bug</h3>
            <p class="text-sm text-gray-500 mb-4">
                This saves your note along with a reference to the current question variant.
            </p>

            {#if saved}
                <p class="text-green-600 text-sm font-medium py-4 text-center">Saved — thank you!</p>
            {:else}
                <textarea
                    bind:value={notes}
                    rows="4"
                    placeholder="What went wrong?"
                    class="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                ></textarea>

                {#if error}
                    <p class="text-red-600 text-sm mt-2">{error}</p>
                {/if}

                <div class="flex justify-end gap-2 mt-4">
                    <button
                        on:click={() => open = false}
                        class="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                    >
                        Cancel
                    </button>
                    <button
                        on:click={submit}
                        disabled={saving || !notes.trim()}
                        class="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {saving ? 'Saving...' : 'Save report'}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}

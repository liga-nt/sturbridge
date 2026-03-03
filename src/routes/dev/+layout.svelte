<script>
    import { session } from '$lib/stores/session';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';

    onMount(() => {
        if (!$session.loading && $session.role !== 'dev') {
            goto('/');
        }
    });
</script>

{#if $session.loading}
    <div class="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
    </div>
{:else if $session.role !== 'dev'}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-gray-500">Access denied.</p>
    </div>
{:else}
    <div class="min-h-screen bg-gray-100">
        <nav class="bg-indigo-900 text-white px-6 py-3">
            <div class="flex items-center gap-6">
                <span class="font-bold text-lg tracking-wide">Dev Dashboard</span>
                <a href="/dev" class="text-indigo-200 hover:text-white text-sm">Bank Status</a>
                <a href="/dev/preview" class="text-indigo-200 hover:text-white text-sm">Preview</a>
                <a href="/dev/algo-check" class="text-indigo-200 hover:text-white text-sm">Algo Check</a>
                <a href="/dev/generate" class="text-indigo-200 hover:text-white text-sm">Generate</a>
                <a href="/dev/review" class="text-indigo-200 hover:text-white text-sm">Review</a>
                <a href="/dev/prompts" class="text-indigo-200 hover:text-white text-sm">Prompts</a>
                <a href="/dev/standards" class="text-indigo-200 hover:text-white text-sm">Standards</a>
            </div>
        </nav>
        <main class="container mx-auto px-6 py-8">
            <slot />
        </main>
    </div>
{/if}

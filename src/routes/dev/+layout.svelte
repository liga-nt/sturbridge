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
                <a href="/dev" class="font-bold text-lg tracking-wide hover:text-indigo-200">Dev</a>
                <a href="/dev/preview" class="text-indigo-200 hover:text-white text-sm">Preview</a>
                <a href="/dev/algo-check" class="text-indigo-200 hover:text-white text-sm">Algo Check</a>
                <span class="mx-2 text-indigo-700">|</span>
                <a href="/admin" class="text-indigo-300 hover:text-white text-sm">Admin</a>
                <a href="/student" class="text-indigo-300 hover:text-white text-sm">Student</a>
            </div>
        </nav>
        <main class="container mx-auto px-6 py-8">
            <slot />
        </main>
    </div>
{/if}

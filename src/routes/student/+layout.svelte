<script>
    import { session } from '$lib/stores/session';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';

    onMount(() => {
        if (!$session.loading && $session.role !== 'student' && $session.role !== 'dev') {
            goto('/');
        }
    });
</script>

{#if $session.loading}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-gray-500">Loading...</p>
    </div>
{:else if $session.role !== 'student' && $session.role !== 'dev'}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-gray-500">Access denied.</p>
    </div>
{:else}
    <slot />
{/if}

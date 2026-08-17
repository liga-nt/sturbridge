<script>
    import { session } from '$lib/stores/session';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';

    const allowed = ['teacher', 'admin', 'dev'];

    onMount(() => {
        if (!$session.loading && !allowed.includes($session.role)) {
            goto('/');
        }
    });
</script>

{#if $session.loading}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-gray-500">Loading...</p>
    </div>
{:else if !allowed.includes($session.role)}
    <div class="flex min-h-screen items-center justify-center">
        <p class="text-gray-500">Access denied.</p>
    </div>
{:else}
    <main class="p-6">
        <slot />
    </main>
{/if}

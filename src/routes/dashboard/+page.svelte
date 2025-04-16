<script>
    import { session } from '$lib/stores/session';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    
    onMount(() => {
        if (!$session.loading && !$session.loggedIn) {
            localStorage.setItem('redirectUrl', '/dashboard');
            goto('/login');
        }
    });
</script>

<div class="container mx-auto px-4 py-16">
    {#if $session.loading}
        <div class="text-center">
            <p>Loading...</p>
        </div>
    {:else if !$session.loggedIn}
        <div class="text-center">
            <p>Please log in to view this page.</p>
        </div>
    {:else}
        <div class="max-w-3xl mx-auto">
            <h1 class="text-3xl font-bold mb-6">Dashboard</h1>
            <div class="bg-white shadow rounded-lg p-6">
                <h2 class="text-xl font-semibold mb-4">Welcome, {$session.user.email}</h2>
                <p class="mb-4">This is a protected page visible only to authenticated users.</p>
                <p class="text-gray-600">Authentication is working properly if you can see this content.</p>
            </div>
        </div>
    {/if}
</div>
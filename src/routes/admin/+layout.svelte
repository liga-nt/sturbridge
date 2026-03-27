<script>
    import { session } from '$lib/stores/session';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';

    const allowed = ['admin', 'dev'];

    onMount(() => {
        if (!$session.loading && !allowed.includes($session.role)) {
            goto('/');
        }
    });

    const navLinks = [
        { href: '/admin', label: 'Classes' },
        { href: '/admin/teachers', label: 'Teachers' },
        { href: '/admin/classes', label: 'Manage Classes' },
    ];
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
    <div class="min-h-screen bg-gray-50 flex flex-col">
        <nav class="bg-gray-900 text-white px-6 py-3 flex items-center gap-6">
            <span class="font-semibold text-lg tracking-wide">Admin</span>
            {#each navLinks as link}
                <a
                    href={link.href}
                    class="text-sm {$page.url.pathname === link.href
                        ? 'text-white font-medium'
                        : 'text-gray-300 hover:text-white'}"
                >
                    {link.label}
                </a>
            {/each}
            <div class="ml-auto text-xs text-gray-400">{$session.user?.email}</div>
        </nav>
        <main class="flex-1 p-6">
            <slot />
        </main>
    </div>
{/if}

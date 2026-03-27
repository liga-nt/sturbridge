<script>
    import { session } from '$lib/stores/session';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';

    const allowed = ['teacher', 'admin', 'dev'];

    onMount(() => {
        if (!$session.loading && !allowed.includes($session.role)) {
            goto('/');
        }
    });

    $: classId = $page.url.searchParams.get('classId');
    $: navClassSuffix = classId ? `?classId=${classId}` : '';

    $: navLinks = [
        { href: `/teacher${navClassSuffix}`, label: 'Mastery Grid', path: '/teacher' },
        { href: `/teacher/standards${navClassSuffix}`, label: 'Standards', path: '/teacher/standards' },
        { href: `/teacher/assign${navClassSuffix}`, label: 'Assign', path: '/teacher/assign' },
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
        <nav class="bg-indigo-800 text-white px-6 py-3 flex items-center gap-6">
            {#if classId && ($session.role === 'admin' || $session.role === 'dev')}
                <a href="/admin/class/{classId}" class="text-indigo-300 hover:text-white text-sm mr-1">← Admin</a>
                <span class="text-indigo-600 text-sm">|</span>
            {/if}
            <span class="font-semibold text-lg tracking-wide">Teacher</span>
            {#each navLinks as link}
                <a
                    href={link.href}
                    class="text-sm {$page.url.pathname === link.path
                        ? 'text-white font-medium'
                        : 'text-indigo-200 hover:text-white'}"
                >
                    {link.label}
                </a>
            {/each}
            <div class="ml-auto text-xs text-indigo-300">{$session.user?.email}</div>
        </nav>
        <main class="flex-1 p-6">
            <slot />
        </main>
    </div>
{/if}

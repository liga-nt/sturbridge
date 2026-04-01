<script>
    import { session } from '$lib/stores/session';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { getDoc, doc } from 'firebase/firestore';
    import { db } from '$lib/firebase/client';

    const allowed = ['admin', 'dev'];

    // When dev is impersonating a school via ?schoolId=, load that school's name
    let viewSchoolName = null;

    $: viewSchoolId = $session.role === 'dev' ? $page.url.searchParams.get('schoolId') : null;
    $: suffix = viewSchoolId ? `?schoolId=${viewSchoolId}` : '';

    $: navLinks = [
        { href: `/admin${suffix}`,          path: '/admin',           label: 'Classes' },
        { href: `/admin/teachers${suffix}`,  path: '/admin/teachers',  label: 'Teachers' },
        { href: `/admin/classes${suffix}`,   path: '/admin/classes',   label: 'Manage Classes' },
    ];

    onMount(async () => {
        if (!$session.loading && !allowed.includes($session.role)) {
            goto('/');
        }
        if (viewSchoolId) {
            const snap = await getDoc(doc(db, 'schools', viewSchoolId));
            viewSchoolName = snap.exists() ? snap.data().name : viewSchoolId;
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
    <div class="min-h-screen bg-gray-50 flex flex-col">
        <nav class="bg-gray-900 text-white px-6 py-3 flex items-center gap-6">
            {#if viewSchoolId}
                <a href="/dev/schools" class="text-gray-400 hover:text-white text-sm mr-1">← Dev</a>
                <span class="text-gray-700 text-sm">|</span>
            {/if}
            <span class="font-semibold text-lg tracking-wide">Admin</span>
            {#if viewSchoolName}
                <span class="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{viewSchoolName}</span>
            {/if}
            {#each navLinks as link}
                <a
                    href={link.href}
                    class="text-sm {$page.url.pathname === link.path
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

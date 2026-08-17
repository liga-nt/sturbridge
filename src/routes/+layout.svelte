<script>
    import { session } from '$lib/stores/session';
    import { auth, db } from '$lib/firebase/client';
    import { signOut } from 'firebase/auth';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { roleHomePath } from '$lib/utils/auth.js';
    import { doc, getDoc } from 'firebase/firestore';
    import '../app.css';

    let menuOpen = false;

    $: pathname = $page.url.pathname;
    $: section = pathname.startsWith('/teacher') ? 'teacher'
        : pathname.startsWith('/admin') ? 'admin'
        : pathname.startsWith('/dev') ? 'dev'
        : null;

    // Teacher section: classId passthrough (set by admin/dev impersonation)
    $: classId = $page.url.searchParams.get('classId');
    $: teacherSuffix = classId ? `?classId=${classId}` : '';

    // Admin section: schoolId passthrough (set by dev impersonation)
    $: viewSchoolId = $session.role === 'dev' ? $page.url.searchParams.get('schoolId') : null;
    $: adminSuffix = viewSchoolId ? `?schoolId=${viewSchoolId}` : '';

    let viewSchoolName = null;
    $: if (viewSchoolId) {
        getDoc(doc(db, 'schools', viewSchoolId)).then(snap => {
            viewSchoolName = snap.exists() ? snap.data().name : viewSchoolId;
        });
    } else {
        viewSchoolName = null;
    }

    $: teacherLinks = [
        { href: `/teacher${teacherSuffix}`, label: 'Gradebook', path: '/teacher' },
        { href: `/teacher/standards${teacherSuffix}`, label: 'Standards', path: '/teacher/standards' },
        { href: `/teacher/assign${teacherSuffix}`, label: 'Assign', path: '/teacher/assign' },
    ];

    $: adminLinks = [
        { href: `/admin/classes${adminSuffix}`, label: 'Manage Classes', path: '/admin/classes' },
        { href: `/admin/teachers${adminSuffix}`, label: 'Teachers', path: '/admin/teachers' },
    ];

    const devLinks = [
        { href: '/dev/preview', label: 'Preview', path: '/dev/preview' },
        { href: '/dev/algo-check', label: 'Algo Check', path: '/dev/algo-check' },
        { href: '/dev/schools', label: 'Schools', path: '/dev/schools' },
        { href: '/dev/standards', label: 'Standards', path: '/dev/standards' },
        { href: '/dev/greek', label: 'Greek', path: '/dev/greek' },
        { href: '/dev/chapters', label: 'Chapters', path: '/dev/chapters' },
        { href: '/dev/bugs', label: 'Bug Reports', path: '/dev/bugs' },
    ];

    $: sectionLinks = section === 'teacher' ? teacherLinks
        : section === 'admin' ? adminLinks
        : section === 'dev' ? devLinks
        : [];

    async function logout() {
        menuOpen = false;
        try {
            await signOut(auth);
            session.set({ user: null, loggedIn: false, loading: false, role: null, schoolId: null });
            goto('/');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    }
</script>

<div class="min-h-screen bg-gray-50">
    <nav class="bg-gray-800 text-white px-6 py-3">
        <div class="flex justify-between items-center gap-6 w-full">
            <div class="flex items-center gap-5 min-w-0">
                <a href="/" class="flex items-center shrink-0">
                    <img src="/lexlogo_trans.png" alt="LexAudio" class="h-12" />
                </a>

                {#if $session.loggedIn && section}
                    {#if section === 'teacher' && classId && ($session.role === 'admin' || $session.role === 'dev')}
                        <a href="/admin/class/{classId}" class="text-gray-400 hover:text-white text-sm shrink-0">← Admin</a>
                        <span class="text-gray-600 shrink-0">|</span>
                    {/if}
                    {#if section === 'admin' && viewSchoolId}
                        <a href="/dev/schools" class="text-gray-400 hover:text-white text-sm shrink-0">← Dev</a>
                        <span class="text-gray-600 shrink-0">|</span>
                    {/if}

                    <span class="hidden md:inline font-semibold text-sm tracking-wide uppercase text-gray-400 shrink-0">{section}</span>

                    {#if section === 'admin' && viewSchoolName}
                        <span class="hidden md:inline text-xs text-gray-400 bg-gray-900 px-2 py-0.5 rounded shrink-0">{viewSchoolName}</span>
                    {/if}

                    <div class="hidden md:flex gap-4 items-center text-sm min-w-0 overflow-x-auto">
                        {#each sectionLinks as link}
                            <a
                                href={link.href}
                                class="whitespace-nowrap {pathname === link.path ? 'text-white font-medium' : 'text-gray-300 hover:text-white'}"
                            >{link.label}</a>
                        {/each}
                        {#if section === 'dev'}
                            <span class="text-gray-600">|</span>
                            <a href="/student" class="text-gray-400 hover:text-white whitespace-nowrap">Student</a>
                        {/if}
                    </div>
                {/if}
            </div>

            {#if $session.loading}
                <!-- nothing -->
            {:else if $session.loggedIn}
                <!-- Desktop: inline links -->
                <div class="hidden md:flex gap-4 items-center text-sm shrink-0">
                    <a href={roleHomePath($session.role)} class="hover:text-gray-300">Home</a>
                    <span class="text-gray-400 text-xs truncate max-w-[160px]">{$session.user.email}</span>
                    <button on:click={logout} class="hover:text-gray-300">Logout</button>
                </div>

                <!-- Mobile: hamburger -->
                <button class="md:hidden text-gray-300 hover:text-white shrink-0" on:click={() => menuOpen = !menuOpen} aria-label="Menu">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {#if menuOpen}
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        {:else}
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                        {/if}
                    </svg>
                </button>
            {:else}
                <a href="/" class="text-sm hover:text-gray-300">Login</a>
            {/if}
        </div>

        <!-- Mobile dropdown -->
        {#if menuOpen && $session.loggedIn}
            <div class="md:hidden border-t border-gray-700 mt-2 pt-2 pb-1 px-2 flex flex-col gap-2 text-sm">
                {#if sectionLinks.length}
                    {#each sectionLinks as link}
                        <a
                            href={link.href}
                            class="py-1 {pathname === link.path ? 'text-white font-medium' : 'text-gray-300 hover:text-white'}"
                            on:click={() => menuOpen = false}
                        >{link.label}</a>
                    {/each}
                    {#if section === 'dev'}
                        <a href="/student" class="text-gray-300 hover:text-white py-1" on:click={() => menuOpen = false}>Student</a>
                    {/if}
                    <span class="border-t border-gray-700 my-1"></span>
                {/if}
                <a href={roleHomePath($session.role)} class="hover:text-gray-300 py-1" on:click={() => menuOpen = false}>Home</a>
                <span class="text-gray-400 text-xs truncate">{$session.user.email}</span>
                <button on:click={logout} class="text-left hover:text-gray-300 py-1">Logout</button>
            </div>
        {/if}
    </nav>

    <slot />
</div>

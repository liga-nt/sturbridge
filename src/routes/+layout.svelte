<script>
    import { session } from '$lib/stores/session';
    import { auth } from '$lib/firebase/client';
    import { signOut } from 'firebase/auth';
    import { goto } from '$app/navigation';
    import { roleHomePath } from '$lib/utils/auth.js';
    import '../app.css';

    let menuOpen = false;
</script>

<div class="min-h-screen bg-gray-50">
    <nav class="bg-gray-800 text-white px-4 py-2">
        <div class="mx-auto flex justify-between items-center w-full" style="max-width: 1200px; padding: 0 16px; box-sizing: border-box;">
            <a href="/" class="flex items-center">
                <img src="/lexlogo_trans.png" alt="LexAudio" class="h-12" />
            </a>

            {#if $session.loading}
                <!-- nothing -->
            {:else if $session.loggedIn}
                <!-- Desktop: inline links -->
                <div class="hidden sm:flex gap-4 items-center text-sm">
                    <a href={roleHomePath($session.role)} class="hover:text-gray-300">Home</a>
                    <span class="text-gray-400 text-xs truncate max-w-[160px]">{$session.user.email}</span>
                    <button
                        on:click={async () => {
                            try {
                                await signOut(auth);
                                session.set({ user: null, loggedIn: false, loading: false, role: null, schoolId: null });
                                goto('/');
                            } catch (error) {
                                console.error('Error signing out:', error);
                            }
                        }}
                        class="hover:text-gray-300"
                    >Logout</button>
                </div>

                <!-- Mobile: hamburger -->
                <button class="sm:hidden text-gray-300 hover:text-white" on:click={() => menuOpen = !menuOpen} aria-label="Menu">
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
            <div class="sm:hidden border-t border-gray-700 mt-2 pt-2 pb-1 px-2 flex flex-col gap-2 text-sm">
                <a href={roleHomePath($session.role)} class="hover:text-gray-300 py-1" on:click={() => menuOpen = false}>Home</a>
                <span class="text-gray-400 text-xs truncate">{$session.user.email}</span>
                <button
                    on:click={async () => {
                        menuOpen = false;
                        try {
                            await signOut(auth);
                            session.set({ user: null, loggedIn: false, loading: false, role: null, schoolId: null });
                            goto('/');
                        } catch (error) {
                            console.error('Error signing out:', error);
                        }
                    }}
                    class="text-left hover:text-gray-300 py-1"
                >Logout</button>
            </div>
        {/if}
    </nav>

    <main>
        <slot />
    </main>
</div>

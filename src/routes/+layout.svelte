<script>
    import { session } from '$lib/stores/session';
    import { auth } from '$lib/firebase/client';
    import { signOut } from 'firebase/auth';
    import { goto } from '$app/navigation';
    import '../app.css';
</script>

<div class="min-h-screen bg-gray-50">
    <nav class="bg-gray-800 text-white p-4">
        <div class="container mx-auto flex justify-between items-center">
            <a href="/" class="text-xl font-bold">Math Mastery</a>
            
            <div class="flex gap-4 items-center">
                {#if $session.loading}
                    <span>Loading...</span>
                {:else if $session.loggedIn}
                    <a href="/dashboard" class="hover:text-gray-300">Dashboard</a>
                    <span>{$session.user.email}</span>
                    <button
                        on:click={async () => {
                            try {
                                await signOut(auth);
                                session.set({ user: null, loggedIn: false, loading: false, role: null });
                                goto('/');
                            } catch (error) {
                                console.error('Error signing out:', error);
                            }
                        }}
                        class="hover:text-gray-300"
                    >
                        Logout
                    </button>
                {:else}
                    <a
                        href="/"
                        class="hover:text-gray-300"
                    >
                        Login
                    </a>
                {/if}
            </div>
        </div>
    </nav>

    <main>
        <slot />
    </main>
</div>
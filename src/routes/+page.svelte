<script>
    import { auth } from '$lib/firebase/client';
    import { session } from '$lib/stores/session';
    import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
    import { goto } from '$app/navigation';

    let isLoading = false;
    let error = null;

    async function handleGoogleLogin() {
        isLoading = true;
        error = null;
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            await session.set({
                user: result.user,
                loggedIn: true,
                loading: false
            });

            const redirectUrl = localStorage.getItem('redirectUrl');
            if (redirectUrl) {
                localStorage.removeItem('redirectUrl');
                goto(redirectUrl);
            }
            // Otherwise stay on this page — the reactive session update shows the logged-in view
        } catch (e) {
            error = e.message;
        }
        isLoading = false;
    }
</script>

{#if $session.loading}
    <div class="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
    </div>
{:else if $session.loggedIn}
    <div class="container mx-auto px-4 py-16">
        <div class="text-center max-w-2xl mx-auto">
            <h1 class="text-4xl font-bold mb-6">Welcome to Clean Read</h1>
            <p class="text-xl mb-8">A distraction-free reading experience.</p>
            <div class="py-4">
                <p class="mb-4">You are logged in as {$session.user.email}</p>
                <button
                    class="bg-blue-600 text-white py-2 px-6 rounded-lg"
                    on:click={() => goto('/dashboard')}
                >
                    Go to Dashboard
                </button>
            </div>
        </div>
    </div>
{:else}
    <div class="flex min-h-screen items-center justify-center">
        <div class="w-full max-w-md space-y-8 p-4">
            <div class="text-center">
                <h2 class="text-3xl font-bold mb-2">Sign in to Clean Read</h2>
                <p class="text-gray-600">A distraction-free reading experience.</p>
            </div>

            {#if error}
                <div class="bg-red-100 text-red-700 p-3 rounded">
                    {error}
                </div>
            {/if}

            <button
                on:click={handleGoogleLogin}
                disabled={isLoading}
                class="w-full flex items-center justify-center gap-3 rounded border border-gray-300 bg-white py-3 px-4 text-gray-700 hover:bg-gray-50 disabled:opacity-50 shadow-sm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="w-5 h-5">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
                {isLoading ? 'Signing in...' : 'Sign in with Google'}
            </button>
        </div>
    </div>
{/if}

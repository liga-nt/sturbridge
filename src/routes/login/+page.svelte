<script>
    import { auth } from '$lib/firebase/client';
    import { session } from '$lib/stores/session';
    import { 
        signInWithEmailAndPassword,
        // Commented out but preserved for future use
        createUserWithEmailAndPassword 
    } from 'firebase/auth';
    import { goto } from '$app/navigation';

    let email = '';
    let password = '';
    let isLoading = false;
    let error = null;

    async function handleLogin() {
        isLoading = true;
        error = null;
        try {
            const result = await signInWithEmailAndPassword(auth, email, password);
            await session.set({
                user: result.user,
                loggedIn: true,
                loading: false
            });
            
            const redirectUrl = localStorage.getItem('redirectUrl');
            if (redirectUrl) {
                localStorage.removeItem('redirectUrl');
                goto(redirectUrl);
            } else {
                goto('/');
            }
        } catch (e) {
            error = e.message;
        }
        isLoading = false;
    }

    // Commented out but preserved for future use
    /*
    async function handleSignup() {
        isLoading = true;
        error = null;
        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            session.set({
                user: result.user,
                loggedIn: true,
                loading: false
            });
            goto('/');
        } catch (e) {
            error = e.message;
        }
        isLoading = false;
    }
    */
</script>

<div class="flex min-h-screen items-center justify-center">
    <div class="w-full max-w-md space-y-8 p-4">
        <div class="text-center">
            <h2 class="text-3xl font-bold">Sign in to Clean Read</h2>
        </div>
        
        <form class="space-y-4" on:submit|preventDefault={handleLogin}>
            {#if error}
                <div class="bg-red-100 text-red-700 p-3 rounded">
                    {error}
                </div>
            {/if}
            
            <div>
                <label for="email" class="block text-sm font-medium">
                    Email address
                </label>
                <input
                    id="email"
                    type="email"
                    bind:value={email}
                    required
                    class="mt-1 block w-full rounded border p-2"
                />
            </div>

            <div>
                <label for="password" class="block text-sm font-medium">
                    Password
                </label>
                <input
                    id="password"
                    type="password"
                    bind:value={password}
                    required
                    class="mt-1 block w-full rounded border p-2"
                />
            </div>

            <div class="flex gap-4">
                <button
                    type="submit"
                    disabled={isLoading}
                    class="flex-1 rounded bg-blue-600 py-2 px-4 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {isLoading ? 'Loading...' : 'Sign in'}
                </button>

                <!-- Commented out but preserved for future use
                <button
                    type="button"
                    disabled={isLoading}
                    on:click={handleSignup}
                    class="flex-1 rounded bg-gray-600 py-2 px-4 text-white hover:bg-gray-700 disabled:opacity-50"
                >
                    Sign up
                </button>
                -->
            </div>
        </form>
    </div>
</div>
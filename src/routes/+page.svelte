<script>
    import { session } from '$lib/stores/session';
    import { goto } from '$app/navigation';
</script>

<div class="container mx-auto px-4 py-16">
    <div class="text-center max-w-2xl mx-auto">
        <h1 class="text-4xl font-bold mb-6">Welcome to Clean Read</h1>
        <p class="text-xl mb-8">A distraction-free reading experience.</p>

        {#if $session.loading}
            <div class="py-4">
                <p>Loading authentication...</p>
            </div>
        {:else if $session.loggedIn}
            <div class="py-4">
                <p class="mb-4">You are logged in as {$session.user.email}</p>
                <button 
                    class="bg-blue-600 text-white py-2 px-6 rounded-lg"
                    on:click={() => goto('/dashboard')}
                >
                    Go to Dashboard
                </button>
            </div>
        {:else}
            <div class="py-4">
                <p class="mb-4">Please login to access your personalized reading experience</p>
                <button 
                    class="bg-blue-600 text-white py-2 px-6 rounded-lg"
                    on:click={() => goto('/login')}
                >
                    Login
                </button>
            </div>
        {/if}
    </div>
</div>
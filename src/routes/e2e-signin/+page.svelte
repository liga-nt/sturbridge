<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { auth } from '$lib/firebase/client';
    import { signInWithCustomToken } from 'firebase/auth';
    import { session } from '$lib/stores/session';
    import { roleHomePath } from '$lib/utils/auth.js';

    let error = null;

    // Lets Playwright (and other automation) sign in as a real Firebase Auth
    // user without driving the Google popup flow, which browser automation
    // can't do reliably. The token itself is the credential: minting one
    // requires the service account key, so this route grants nothing by
    // existing. Mirrors the sign-in → claims → redirect sequence in the
    // Google-login flow (src/routes/+page.svelte) rather than relying on the
    // ambient onAuthStateChanged listener, whose claims update raced the
    // redirect when driven reactively here.
    onMount(async () => {
        const token = $page.url.searchParams.get('token');
        const next = $page.url.searchParams.get('next');
        if (!token) { error = 'Missing token'; return; }
        try {
            const result = await signInWithCustomToken(auth, token);
            const tokenResult = await result.user.getIdTokenResult(true);
            const role = tokenResult.claims.role ?? null;
            const schoolId = tokenResult.claims.schoolId ?? null;
            session.set({ user: result.user, loggedIn: true, loading: false, role, schoolId });
            await goto(next || roleHomePath(role));
        } catch (e) {
            error = e.message;
        }
    });
</script>

{#if error}
    <p class="p-8 text-red-600">{error}</p>
{:else}
    <p class="p-8 text-gray-400">Signing in…</p>
{/if}

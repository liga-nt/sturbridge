<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

    onMount(() => {
        goto(`/admin/classes${$page.url.search}`, { replaceState: true });
    });
</script>

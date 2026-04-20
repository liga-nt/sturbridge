<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { session } from '$lib/stores/session';
  import PoemVocabExercise from '$lib/components/persian/PoemVocabExercise.svelte';

  let poem          = null;
  let uid           = null;
  let loading       = true;
  let error         = null;
  let showQwertyHint = true;

  $: poemId = $page.params.poemId;

  onMount(async () => {
    uid            = $session.user?.uid;
    showQwertyHint = localStorage.getItem('persian_hint') !== 'false';
    if (!uid) {
      error = 'Not logged in.';
      loading = false;
      return;
    }
    try {
      const res = await fetch(`/data/Persian/poems/${poemId}.json`);
      if (!res.ok) throw new Error(`Poem not found: ${poemId}`);
      poem    = await res.json();
      loading = false;
    } catch (e) {
      error   = e.message;
      loading = false;
    }
  });

  function toggleHint() {
    showQwertyHint = !showQwertyHint;
    localStorage.setItem('persian_hint', String(showQwertyHint));
  }
</script>

<svelte:head>
  <title>{poem?.title ?? 'Poem'} · Persian</title>
</svelte:head>

<div class="poem-page">
  <header class="poem-header">
    <a href="/student/persian" class="back-link">← Persian</a>
    {#if poem}
      <div class="header-center">
        <span class="poem-title" dir="rtl">{poem.title}</span>
        <span class="poem-poet">{poem.poet}</span>
      </div>
    {/if}
    <div class="header-right">
      <button class="hint-toggle" on:click={toggleHint}>
        {showQwertyHint ? 'Hide keys' : 'Show keys'}
      </button>
    </div>
  </header>

  <main class="poem-main">
    {#if loading}
      <div class="state-msg">Loading…</div>
    {:else if error}
      <div class="state-msg error">{error}</div>
    {:else if poem && uid}
      <PoemVocabExercise {poem} {uid} {showQwertyHint} />
    {/if}
  </main>
</div>

<style>
  .poem-page {
    min-height: 100vh;
    background: #f1f5f9;
    display: flex;
    flex-direction: column;
  }

  .poem-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1.5rem;
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .back-link {
    font-size: 0.85rem;
    color: #6b7280;
    text-decoration: none;
    white-space: nowrap;
  }

  .back-link:hover {
    color: #374151;
  }

  .header-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
  }

  .poem-title {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 1.25rem;
    color: #1e293b;
  }

  .poem-poet {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .header-right {
    display: flex;
    justify-content: flex-end;
    min-width: 80px;
  }

  .hint-toggle {
    font-size: 0.8rem;
    color: #6b7280;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    padding: 0.25em 0.8em;
    cursor: pointer;
    white-space: nowrap;
  }

  .hint-toggle:hover {
    background: #f3f4f6;
  }

  .poem-main {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .poem-main > :global(*) {
    width: 100%;
  }

  .state-msg {
    margin-top: 4rem;
    font-size: 1rem;
    color: #9ca3af;
    text-align: center;
  }

  .state-msg.error {
    color: #dc2626;
  }
</style>

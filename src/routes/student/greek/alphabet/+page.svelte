<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import GreekAlphabetSequence from '$lib/components/greek/GreekAlphabetSequence.svelte';
  import GreekLetterRecognition from '$lib/components/greek/GreekLetterRecognition.svelte';
  import GreekDiacriticsPractice from '$lib/components/greek/GreekDiacriticsPractice.svelte';
  import GreekIntroDeck from '$lib/components/greek/GreekIntroDeck.svelte';

  let activeTab = 'sequence';
  let showQwertyHint = true;
  let alphabet = [];
  let introVocab = [];
  let loading = true;

  const TABS = [
    { id: 'sequence',    label: 'Sequence' },
    { id: 'recognition', label: 'Recognition' },
    { id: 'diacritics',  label: 'Diacritics' },
    { id: 'vocab',       label: 'Vocab' },
  ];

  onMount(async () => {
    activeTab      = localStorage.getItem('greek_alpha_tab')  ?? 'sequence';
    showQwertyHint = localStorage.getItem('greek_alpha_hint') !== 'false';
    try {
      const [alphaData, vocabData] = await Promise.all([
        fetch('/data/Greek/alphabet.json').then(r => r.json()),
        fetch('/data/Greek/nge_vocabulary.json').then(r => r.json()),
      ]);
      alphabet   = alphaData;
      introVocab = (vocabData.entries ?? []).filter(e => e.introduced === 'intro');
    } catch (e) {
      console.error('Failed to load Greek data:', e);
    }
    loading = false;
  });

  function setTab(tab) {
    activeTab = tab;
    localStorage.setItem('greek_alpha_tab', tab);
  }

  function toggleHint() {
    showQwertyHint = !showQwertyHint;
    localStorage.setItem('greek_alpha_hint', String(showQwertyHint));
  }
</script>

<svelte:head>
  <title>Greek Alphabet</title>
</svelte:head>

<div class="alpha-page">
  <header class="page-header">
    <div class="page-header-inner">
      <button class="back-btn" on:click={() => goto('/student/greek')} aria-label="Back">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h1 class="page-title">Greek Alphabet</h1>
      <div class="header-controls">
        <button class="hint-toggle" on:click={toggleHint}>
          {showQwertyHint ? 'Hide keys' : 'Show keys'}
        </button>
      </div>
    </div>
  </header>

  <nav class="tab-bar">
    <div class="tab-bar-inner">
      {#each TABS as tab}
        <button
          class="tab-btn"
          class:active={activeTab === tab.id}
          on:click={() => setTab(tab.id)}
        >{tab.label}</button>
      {/each}
    </div>
  </nav>

  <main class="tab-content">
    {#if loading}
      <div class="loading">Loading…</div>
    {:else if activeTab === 'sequence'}
      <GreekAlphabetSequence {alphabet} {showQwertyHint} />
    {:else if activeTab === 'recognition'}
      <GreekLetterRecognition {alphabet} {showQwertyHint} />
    {:else if activeTab === 'diacritics'}
      <GreekDiacriticsPractice {alphabet} vocab={introVocab} {showQwertyHint} />
    {:else if activeTab === 'vocab'}
      <GreekIntroDeck vocab={introVocab} />
    {/if}
  </main>
</div>

<style>
  .alpha-page {
    min-height: 100vh;
    background: #f1f5f9;
    display: flex;
    flex-direction: column;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .page-header {
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .page-header-inner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .back-btn {
    display: flex;
    align-items: center;
    padding: 4px;
    border: none;
    background: none;
    cursor: pointer;
    color: #6b7280;
    flex-shrink: 0;
  }

  .back-btn:hover { color: #111; }

  .page-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0;
    flex: 1;
  }

  .header-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .hint-toggle {
    font-size: 0.8rem;
    color: #6b7280;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    padding: 0.25em 0.8em;
    cursor: pointer;
  }

  .hint-toggle:hover { background: #f3f4f6; }

  .tab-bar {
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .tab-bar-inner {
    display: flex;
    gap: 0.25rem;
    padding: 0 0.5rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .tab-btn {
    padding: 0.75rem 1.25rem;
    font-size: 0.9rem;
    color: #6b7280;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab-btn:hover { color: #374151; }

  .tab-btn.active {
    color: #4f46e5;
    border-bottom-color: #6366f1;
    font-weight: 600;
  }

  .tab-content {
    flex: 1;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: #9ca3af;
    font-size: 1rem;
  }
</style>

<script>
  import { onMount } from 'svelte';
  import AlphabetSequence from '$lib/components/persian/AlphabetSequence.svelte';
  import LetterRecognition from '$lib/components/persian/LetterRecognition.svelte';
  import LetterForms from '$lib/components/persian/LetterForms.svelte';

  let activeTab = 'sequence';
  let showQwertyHint = true;
  let showRomanization = true;
  let alphabet = [];
  let combos = [];
  let letterForms = [];
  let loading = true;

  onMount(async () => {
    activeTab       = localStorage.getItem('persian_tab')   ?? 'sequence';
    showQwertyHint  = localStorage.getItem('persian_hint')  !== 'false';
    showRomanization = localStorage.getItem('persian_roman') !== 'false';

    const [a, c] = await Promise.all([
      fetch('/data/Persian/alphabet.json').then(r => r.json()),
      fetch('/data/Persian/combos.json').then(r => r.json()),
    ]);
    alphabet = a;
    combos = c;
    // letter-forms loaded separately — not blocking
    fetch('/data/Persian/letter-forms.json').then(r => r.json()).then(d => { letterForms = d; }).catch(() => {});
    loading = false;
  });

  function setTab(tab) {
    activeTab = tab;
    localStorage.setItem('persian_tab', tab);
  }

  function toggleHint() {
    showQwertyHint = !showQwertyHint;
    localStorage.setItem('persian_hint', String(showQwertyHint));
  }

  function toggleRoman() {
    showRomanization = !showRomanization;
    localStorage.setItem('persian_roman', String(showRomanization));
  }

  const TABS = [
    { id: 'sequence',    label: 'Alphabet' },
    { id: 'combos',      label: 'Combos' },
    { id: 'recognition', label: 'Practice' },
    { id: 'poems',       label: 'Poems' },
  ];
</script>

<svelte:head>
  <title>Persian · Alphabet</title>
  <link
    href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="persian-page">
  <!-- Header -->
  <header class="page-header">
    <h1 class="page-title" dir="rtl">فارسی</h1>
    <div class="header-controls">
      <button class="hint-toggle" on:click={toggleRoman}>
        {showRomanization ? 'Hide roman' : 'Show roman'}
      </button>
      <button class="hint-toggle" on:click={toggleHint}>
        {showQwertyHint ? 'Hide keys' : 'Show keys'}
      </button>
    </div>
  </header>

  <!-- Tab bar: buttons on desktop, select on mobile -->
  <nav class="tab-bar">
    {#each TABS as tab}
      <button
        class="tab-btn"
        class:active={activeTab === tab.id}
        on:click={() => setTab(tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </nav>
  <div class="tab-select-wrap">
    <select class="tab-select" value={activeTab} on:change={e => setTab(e.target.value)}>
      {#each TABS as tab}
        <option value={tab.id}>{tab.label}</option>
      {/each}
    </select>
  </div>

  <!-- Content -->
  <main class="tab-content">
    {#if loading}
      <div class="loading">Loading…</div>
    {:else if activeTab === 'sequence'}
      <AlphabetSequence {alphabet} {letterForms} {showQwertyHint} {showRomanization} />
    {:else if activeTab === 'recognition'}
      <LetterRecognition {alphabet} {letterForms} {showQwertyHint} />
    {:else if activeTab === 'combos'}
      <LetterForms {letterForms} {showQwertyHint} {showRomanization} />
    {:else if activeTab === 'poems'}
      <div class="poems-list">
        <a class="poem-card" href="/student/persian/poems/rudaki-001">
          <span class="poem-card-title" dir="rtl">بوی جوی مولیان</span>
          <span class="poem-card-poet">Rudaki</span>
          <span class="poem-card-arrow">→</span>
        </a>
      </div>
    {/if}
  </main>
</div>

<style>
  .persian-page {
    min-height: 100vh;
    background: #f1f5f9;
    display: flex;
    flex-direction: column;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .page-title {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 1.75rem;
    color: #1e293b;
    margin: 0;
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

  .hint-toggle:hover {
    background: #f3f4f6;
  }

  .tab-bar {
    display: flex;
    background: white;
    border-bottom: 1px solid #e2e8f0;
    padding: 0 1rem;
    gap: 0.25rem;
  }

  .tab-select-wrap {
    display: none;
    background: white;
    border-bottom: 1px solid #e2e8f0;
    padding: 0.5rem 1rem;
  }

  .tab-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.95rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    color: #374151;
    appearance: auto;
  }

  @media (max-width: 480px) {
    .tab-bar { display: none; }
    .tab-select-wrap { display: block; }
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

  .tab-btn:hover {
    color: #374151;
  }

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

  .poems-list {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
  }

  .poem-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    max-width: 400px;
    background: white;
    border-radius: 1rem;
    padding: 1.25rem 1.5rem;
    box-shadow: 0 1px 8px rgba(0,0,0,0.07);
    text-decoration: none;
    transition: box-shadow 0.15s, transform 0.1s;
  }

  .poem-card:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    transform: translateY(-1px);
  }

  .poem-card-title {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 1.2rem;
    color: #1e293b;
    flex: 1;
  }

  .poem-card-poet {
    font-size: 0.8rem;
    color: #9ca3af;
    font-style: italic;
  }

  .poem-card-arrow {
    color: #6366f1;
    font-size: 1rem;
  }
</style>

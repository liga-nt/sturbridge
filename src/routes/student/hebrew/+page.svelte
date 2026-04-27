<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
  import { db } from '$lib/firebase/client';
  import HebrewAlphabetSequence from '$lib/components/hebrew/HebrewAlphabetSequence.svelte';
  import HebrewLetterRecognition from '$lib/components/hebrew/HebrewLetterRecognition.svelte';

  let activeTab = 'sequence';
  let showQwertyHint = true;
  let alphabet = [];
  let loading = true;
  let lessons = [];

  const TABS = [
    { id: 'sequence', label: 'Alphabet' },
  ];

  onMount(async () => {
    activeTab      = localStorage.getItem('hebrew_tab')  ?? 'sequence';
    showQwertyHint = localStorage.getItem('hebrew_hint') !== 'false';
    try {
      [alphabet, lessons] = await Promise.all([
        fetch('/data/Hebrew/alphabet.json').then(r => r.json()),
        getDocs(query(
          collection(db, 'lessons'),
          where('courseId', '==', 'hebrew-alphabet'),
          where('lang', '==', 'hebrew')
        )).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => [])
      ]);
    } catch (e) {
      console.error('Failed to load Hebrew data:', e);
    }
    loading = false;
  });

  function setTab(tab) {
    activeTab = tab;
    localStorage.setItem('hebrew_tab', tab);
  }

  function toggleHint() {
    showQwertyHint = !showQwertyHint;
    localStorage.setItem('hebrew_hint', String(showQwertyHint));
  }

</script>

<svelte:head>
  <title>Hebrew Alphabet</title>
</svelte:head>

<div class="alpha-page">
  <header class="page-header">
    <div class="page-header-inner">
      <button class="back-btn" on:click={() => goto('/student')} aria-label="Back">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h1 class="page-title">Hebrew Alphabet</h1>
      <div class="header-controls">
        <button class="toggle-btn" on:click={toggleHint}>
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
      <HebrewAlphabetSequence {alphabet} {showQwertyHint} />
    {:else if activeTab === 'recognition'}
      <HebrewLetterRecognition {alphabet} {showQwertyHint} />
    {/if}
  </main>

  {#if !loading && lessons.length > 0}
    <section class="lessons-section">
      <div class="lessons-inner">
        <h2 class="lessons-heading">Text Lessons</h2>
        <div class="lesson-list">
          {#each lessons as lesson}
            <button class="lesson-card" on:click={() => goto(`/student/hebrew/${lesson.id}`)}>
              <span class="lesson-title">{lesson.title}</span>
              <span class="lesson-meta">{lesson.sentences?.length ?? 0} sentences</span>
            </button>
          {/each}
        </div>
      </div>
    </section>
  {/if}
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

  .toggle-btn {
    font-size: 0.8rem;
    color: #6b7280;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    padding: 0.25em 0.8em;
    cursor: pointer;
  }

  .toggle-btn:hover { background: #f3f4f6; }

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

  .lessons-section {
    background: white;
    border-top: 1px solid #e2e8f0;
    padding: 24px 0 32px;
  }

  .lessons-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
  }

  .lessons-heading {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b7280;
    margin: 0 0 12px;
  }

  .lesson-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .lesson-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 12px 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, border-color 0.15s;
    min-width: 160px;
  }

  .lesson-card:hover {
    background: #eef2ff;
    border-color: #a5b4fc;
  }

  .lesson-title {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
  }

  .lesson-meta {
    font-size: 11px;
    color: #9ca3af;
  }
</style>

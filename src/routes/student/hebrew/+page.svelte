<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
  import { db } from '$lib/firebase/client';
  import HebrewAlphabetSequence from '$lib/components/hebrew/HebrewAlphabetSequence.svelte';
  import HebrewLessonReader from '$lib/components/hebrew/HebrewLessonReader.svelte';

  let activeTab      = 'alphabet';
  let showQwertyHint = true;
  let alphabet       = [];
  let loading        = true;

  // ── Reader state ──────────────────────────────────────────────────────────────
  let lessonMetas    = [];   // [{ id, title, sentenceRange }]
  let selectedId     = null;
  let selectedLesson = null;
  let lessonLoading  = false;
  let wordFormsCache = null;

  const TABS = [
    { id: 'alphabet', label: 'Alphabet' },
    { id: 'reader',   label: 'Reader'   },
  ];

  onMount(async () => {
    activeTab      = localStorage.getItem('hebrew_tab')  ?? 'alphabet';
    showQwertyHint = localStorage.getItem('hebrew_hint') !== 'false';

    const [alphabetData, snap] = await Promise.all([
      fetch('/data/Hebrew/alphabet.json').then(r => r.json()).catch(() => []),
      getDocs(query(
        collection(db, 'lessons'),
        where('courseId', '==', 'hebrew-alphabet'),
        where('lang',     '==', 'hebrew')
      )).catch(() => ({ docs: [] }))
    ]);

    alphabet    = alphabetData;
    lessonMetas = snap.docs.map(d => ({
      id:            d.id,
      title:         d.data().title,
      sentenceRange: d.data().sentenceRange,
    }));

    loading = false;

    // If reader tab is active (or we have exactly one lesson), pre-select it
    if (lessonMetas.length > 0) {
      const storedId = localStorage.getItem('hebrew_lesson');
      selectedId = lessonMetas.find(l => l.id === storedId)?.id ?? lessonMetas[0].id;
      if (activeTab === 'reader') await loadLesson(selectedId);
    }
  });

  async function loadWordForms() {
    if (wordFormsCache) return wordFormsCache;
    try {
      const raw  = await fetch('/data/Hebrew/word_forms.json').then(r => r.json());
      const snap = await getDoc(doc(db, 'word_glosses', 'hebrew-alphabet')).catch(() => null);
      if (snap?.exists()) Object.assign(raw, snap.data().forms ?? {});
      // Derive paradigmKey from morph when not explicitly set
      for (const v of Object.values(raw)) {
        if (v.paradigmKey) continue;
        const m = v.morph;
        if (!m || typeof m !== 'object') continue;
        if (m.pos === 'verb' && m.stem && m.tense) {
          v.paradigmKey = `${m.stem}_${m.tense}`;
        } else if (m.pos === 'noun' || m.pos === 'adj') {
          const suffix = m.gender === 'f' ? 'fem' : m.gender === 'm' ? 'masc' : null;
          if (suffix) v.paradigmKey = `${m.pos}_${suffix}`;
        }
      }
      const stripped = {};
      for (const [k, v] of Object.entries(raw)) {
        const bare = k.replace(/[֑-ׇ]/g, '');
        if (bare !== k) stripped[bare] = v;
      }
      wordFormsCache = { ...raw, ...stripped };
    } catch (e) {
      console.warn('loadWordForms failed:', e.message);
      wordFormsCache = {};
    }
    return wordFormsCache;
  }

  async function loadLesson(id) {
    if (!id) return;
    lessonLoading  = true;
    selectedLesson = null;
    try {
      const [snap] = await Promise.all([
        getDoc(doc(db, 'lessons', id)),
        loadWordForms()
      ]);
      if (snap.exists()) selectedLesson = { id: snap.id, ...snap.data() };
    } catch (e) {
      console.error('loadLesson failed:', e);
    }
    lessonLoading = false;
  }

  async function setTab(tab) {
    activeTab = tab;
    localStorage.setItem('hebrew_tab', tab);
    if (tab === 'reader' && selectedId && !selectedLesson) {
      await loadLesson(selectedId);
    }
  }

  async function selectLesson(id) {
    selectedId = id;
    localStorage.setItem('hebrew_lesson', id);
    selectedLesson = null;
    await loadLesson(id);
  }

  function toggleHint() {
    showQwertyHint = !showQwertyHint;
    localStorage.setItem('hebrew_hint', String(showQwertyHint));
  }
</script>

<svelte:head>
  <title>Hebrew</title>
</svelte:head>

<div class="page">

  <!-- ── Header ─────────────────────────────────────────────────────────────── -->
  <header class="page-header">
    <div class="page-header-inner">
      <button class="back-btn" on:click={() => goto('/student')} aria-label="Back">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h1 class="page-title">Hebrew</h1>
      <div class="header-controls">
        {#if activeTab === 'alphabet'}
          <button class="toggle-btn" on:click={toggleHint}>
            {showQwertyHint ? 'Hide keys' : 'Show keys'}
          </button>
        {/if}
      </div>
    </div>
  </header>

  <!-- ── Top-level tab bar ───────────────────────────────────────────────────── -->
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

  <!-- ── Content ────────────────────────────────────────────────────────────── -->
  {#if loading}
    <div class="loading">Loading…</div>

  {:else if activeTab === 'alphabet'}
    <main class="tab-content">
      <HebrewAlphabetSequence {alphabet} {showQwertyHint} />
    </main>

  {:else if activeTab === 'reader'}
    <div class="reader-area">

      {#if lessonMetas.length === 0}
        <div class="empty-state">No passages imported yet.</div>

      {:else}

        <!-- Lesson selector (shown when >1 lesson) -->
        {#if lessonMetas.length > 1}
          <div class="lesson-selector">
            {#each lessonMetas as meta}
              <button
                class="lesson-pill"
                class:active={selectedId === meta.id}
                on:click={() => selectLesson(meta.id)}
              >{meta.title}</button>
            {/each}
          </div>
        {/if}

        {#if lessonLoading}
          <div class="loading">Loading passage…</div>
        {:else if selectedLesson}
          <HebrewLessonReader lesson={selectedLesson} {wordFormsCache} />
        {:else}
          <div class="empty-state">Select a passage above.</div>
        {/if}

      {/if}
    </div>
  {/if}

</div>

<style>
  .page {
    min-height: 100vh;
    background: #f1f5f9;
    display: flex;
    flex-direction: column;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .page-header {
    background: white;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
  }
  .page-header-inner {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.75rem 1rem;
    max-width: 1200px; margin: 0 auto; width: 100%; box-sizing: border-box;
  }
  .back-btn {
    display: flex; align-items: center; padding: 4px;
    border: none; background: none; cursor: pointer; color: #6b7280; flex-shrink: 0;
  }
  .back-btn:hover { color: #111; }

  .page-title { font-size: 1.15rem; font-weight: 700; color: #1e293b; margin: 0; flex: 1; }

  .header-controls { display: flex; gap: 0.5rem; align-items: center; }
  .toggle-btn {
    font-size: 0.8rem; color: #6b7280; background: #f9fafb;
    border: 1px solid #e5e7eb; border-radius: 999px; padding: 0.25em 0.8em; cursor: pointer;
  }
  .toggle-btn:hover { background: #f3f4f6; }

  .tab-bar { background: white; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
  .tab-bar-inner {
    display: flex; gap: 0.25rem; padding: 0 0.5rem;
    max-width: 1200px; margin: 0 auto; width: 100%; box-sizing: border-box;
  }
  .tab-btn {
    padding: 0.75rem 1.25rem; font-size: 0.9rem; color: #6b7280;
    background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.15s;
  }
  .tab-btn:hover { color: #374151; }
  .tab-btn.active { color: #4f46e5; border-bottom-color: #6366f1; font-weight: 600; }

  .tab-content { flex: 1; }

  /* Reader area: takes remaining height, no scroll (reader component handles it) */
  .reader-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #fff;
  }

  .lesson-selector {
    display: flex; gap: 6px; flex-wrap: wrap;
    padding: 8px 16px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
  }
  .lesson-pill {
    font-size: 12px; font-weight: 500;
    padding: 4px 12px; border-radius: 999px;
    border: 1px solid #e5e7eb; background: white; color: #374151; cursor: pointer; transition: all 0.15s;
  }
  .lesson-pill:hover { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }
  .lesson-pill.active { background: #eef2ff; border-color: #6366f1; color: #4338ca; font-weight: 600; }

  .loading {
    display: flex; align-items: center; justify-content: center;
    min-height: 200px; color: #9ca3af; font-size: 1rem;
  }

  .empty-state {
    display: flex; align-items: center; justify-content: center;
    min-height: 200px; color: #9ca3af; font-size: 0.9rem; font-style: italic;
  }
</style>

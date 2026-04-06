<script>
  import { page } from '$app/stores';
  import { onMount, getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { doc, getDoc } from 'firebase/firestore';
  import { db } from '$lib/firebase/client';
  import GreekPassage from '$lib/components/greek/GreekPassage.svelte';
  import VocabPanel from '$lib/components/greek/VocabPanel.svelte';
  import GrammarPanel from '$lib/components/greek/GrammarPanel.svelte';
  import WordTooltip from '$lib/components/greek/WordTooltip.svelte';

  const ctx = getContext('student');

  let lesson = null;
  let loading = true;
  let error = null;

  let hoveredWord = null;
  let tooltipPos = { x: 0, y: 0 };

  onMount(async () => {
    try {
      const snap = await getDoc(doc(db, 'lessons', $page.params.lessonId));
      if (snap.exists()) {
        lesson = { id: snap.id, ...snap.data() };
      } else {
        error = 'Lesson not found.';
      }
    } catch (e) {
      console.error(e);
      error = e.message;
    } finally {
      loading = false;
    }
  });

  function handleWordHover(e) {
    const detail = e.detail;
    if (!detail) {
      hoveredWord = null;
      return;
    }
    hoveredWord = detail.word;
    if (detail.event) {
      const rect = detail.event.target?.getBoundingClientRect();
      if (rect) {
        tooltipPos = {
          x: rect.left + rect.width / 2,
          y: rect.top
        };
      }
    }
  }

  $: sentences = lesson?.sentences ?? [];
  $: vocabList = lesson?.vocab ?? [];
  $: standards = ctx?.standards
    ? Object.fromEntries((ctx.standards ?? []).map(s => [s.id, s]))
    : {};

  // For prev/next navigation, we'd need the full lesson list;
  // for now, just show the back button.
</script>

<svelte:head>
  <title>{lesson?.title ?? 'Lesson'} — Greek</title>
</svelte:head>

<div class="lesson-page">
  <!-- Header bar -->
  <header class="lesson-header">
    <div class="header-left">
      <button class="back-btn" on:click={() => goto('/student/greek')}>
        ← Lessons
      </button>
      {#if lesson}
        <h1 class="lesson-title">{lesson.title}</h1>
        {#if lesson.chapter}
          <span class="chapter-badge">Ch. {lesson.chapter}</span>
        {/if}
      {/if}
    </div>
  </header>

  {#if loading}
    <div class="loading-state">
      <p>Loading lesson...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>{error}</p>
      <button on:click={() => goto('/student/greek')}>Back to lessons</button>
    </div>
  {:else if lesson}
    <!-- Three-panel layout -->
    <div class="three-panel">
      <!-- Left: Vocab -->
      <aside class="panel panel-vocab">
        <VocabPanel {vocabList} />
      </aside>

      <!-- Center: Passage -->
      <main class="panel panel-passage">
        {#if sentences.length > 0}
          <GreekPassage {sentences} on:wordHover={handleWordHover} />
        {:else}
          <div class="no-content">
            <p class="lesson-intro">{lesson.intro ?? ''}</p>
            <p class="no-sentences">No sentences have been added to this lesson yet.</p>
          </div>
        {/if}
      </main>

      <!-- Right: Grammar -->
      <aside class="panel panel-grammar">
        <GrammarPanel
          {hoveredWord}
          allSentences={sentences}
          {standards}
        />
      </aside>
    </div>

    <!-- Word tooltip follows cursor -->
    <WordTooltip word={hoveredWord} position={tooltipPos} />
  {/if}
</div>

<style>
  .lesson-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #e9e9e9;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  /* Header */
  .lesson-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff;
    border-bottom: 1px solid #d1d5db;
    padding: 10px 16px;
    flex-shrink: 0;
    gap: 12px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .back-btn {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: #2563eb;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .back-btn:hover {
    text-decoration: underline;
  }

  .lesson-title {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chapter-badge {
    font-size: 12px;
    background: #f3f4f6;
    color: #6b7280;
    padding: 2px 8px;
    border-radius: 12px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Three-panel layout */
  .three-panel {
    display: grid;
    grid-template-columns: 220px 1fr 260px;
    flex: 1;
    overflow: hidden;
    gap: 0;
  }

  .panel {
    background: #fff;
    overflow-y: auto;
    padding: 16px;
  }

  .panel-vocab {
    border-right: 1px solid #e5e7eb;
  }

  .panel-passage {
    background: #fff;
  }

  .panel-grammar {
    border-left: 1px solid #e5e7eb;
    background: #fafafa;
  }

  /* States */
  .loading-state,
  .error-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #6b7280;
    font-size: 15px;
  }

  .error-state p {
    color: #ef4444;
  }

  .error-state button {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 13px;
    padding: 6px 16px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    cursor: pointer;
    color: #374151;
  }

  .no-content {
    padding: 8px 0;
  }

  .lesson-intro {
    font-size: 15px;
    line-height: 1.6;
    color: #374151;
    margin-bottom: 16px;
  }

  .no-sentences {
    font-size: 13px;
    color: #9ca3af;
    font-style: italic;
  }
</style>

<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { doc, getDoc } from 'firebase/firestore';
  import { db } from '$lib/firebase/client';
  import HebrewLessonReader from '$lib/components/hebrew/HebrewLessonReader.svelte';

  let lesson         = null;
  let wordFormsCache = null;
  let loading        = true;
  let error          = null;

  onMount(async () => {
    try {
      const raw  = await fetch('/data/Hebrew/word_forms.json').then(r => r.json()).catch(() => ({}));
      const snap = await getDoc(doc(db, 'lessons', $page.params.lessonId));
      if (!snap.exists()) { error = 'Lesson not found.'; return; }
      lesson = { id: snap.id, ...snap.data() };

      const stripped = {};
      for (const [k, v] of Object.entries(raw)) {
        const bare = k.replace(/[֑-ׇ]/g, '');
        if (bare !== k) stripped[bare] = v;
      }
      wordFormsCache = { ...raw, ...stripped };
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>{lesson?.title ?? 'Lesson'} — Hebrew</title>
</svelte:head>

<div class="shell">
  <div class="topbar">
    <button class="back-btn" on:click={() => goto('/student/hebrew')} aria-label="Back">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <span class="course-name">Hebrew</span>
  </div>

  {#if loading}
    <div class="state-msg">Loading…</div>
  {:else if error}
    <div class="state-msg error">{error}</div>
  {:else}
    <HebrewLessonReader {lesson} {wordFormsCache} />
  {/if}
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    background: #fff;
  }

  .topbar {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.6rem 1rem;
    background: white; border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
  }

  .back-btn {
    display: flex; align-items: center; padding: 4px;
    border: none; background: none; cursor: pointer; color: #6b7280;
  }
  .back-btn:hover { color: #111; }

  .course-name { font-size: 1rem; font-weight: 700; color: #1e293b; }

  .state-msg {
    flex: 1; display: flex; align-items: center; justify-content: center;
    font-size: 15px; color: #6b7280;
  }
  .state-msg.error { color: #ef4444; }
</style>

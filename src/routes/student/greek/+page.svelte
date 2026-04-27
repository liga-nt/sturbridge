<script>
  import { getContext, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { loadLessons } from '$lib/utils/studentStore.js';

  const ctx = getContext('student');

  let lessons = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const courseId = ctx?.course?.id;
      if (!courseId) throw new Error('No course loaded.');
      lessons = await loadLessons(courseId);
    } catch (e) {
      console.error(e);
      error = e.message;
    } finally {
      loading = false;
    }
  });

  /**
   * Linear progression: a lesson is unlocked if it's the first one,
   * or if the previous lesson has been completed.
   * For now, we unlock all — real locking can be added when progress tracking is wired up.
   */
  function isUnlocked(index) {
    // Chapter 1 is always unlocked; subsequent chapters require the previous to be completed.
    // Without progress data here, unlock lesson 0 only for now, but allow all for dev.
    // To keep it usable while building, unlock all published lessons.
    return true;
  }
</script>

<svelte:head>
  <title>Greek Lessons</title>
</svelte:head>

<div class="lessons-page">
  <header class="page-header">
    <h1 class="page-title">Greek Lessons</h1>
    {#if ctx?.course?.label}
      <p class="course-label">{ctx.course.label}</p>
    {/if}
  </header>

  <!-- Alphabet card — always visible once page is not in error -->
  {#if !error}
    <div class="lessons-list" style="margin-bottom: 0;">
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="lesson-card alphabet-card"
        on:click={() => goto('/student/greek/alphabet')}
        role="button"
        tabindex="0"
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && goto('/student/greek/alphabet')}
      >
        <div class="card-left alphabet-left">
          <span class="alphabet-icon">Αα</span>
        </div>
        <div class="card-body">
          <div class="card-title">Alphabet</div>
          <div class="card-subtitle">Learn the 24 Greek letters and their sounds</div>
        </div>
        <div class="card-right">
          <span class="arrow-icon">›</span>
        </div>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="state-message">
      <p>Loading lessons...</p>
    </div>
  {:else if error}
    <div class="state-message error">
      <p>{error}</p>
    </div>
  {:else if lessons.length === 0}
    <div class="state-message">
      <p>No lessons published yet. Check back soon!</p>
    </div>
  {:else}
    <div class="lessons-list">
      {#each lessons as lesson, i}
        {@const unlocked = isUnlocked(i)}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="lesson-card"
          class:locked={!unlocked}
          on:click={() => unlocked && goto(`/student/greek/${lesson.id}`)}
          role={unlocked ? 'button' : 'presentation'}
          tabindex={unlocked ? 0 : -1}
          on:keydown={(e) => unlocked && (e.key === 'Enter' || e.key === ' ') && goto(`/student/greek/${lesson.id}`)}
        >
          <div class="card-left">
            {#if lesson.chapter}
              <div class="chapter-num">Ch. {lesson.chapter}</div>
            {:else}
              <div class="chapter-num">{i + 1}</div>
            {/if}
          </div>

          <div class="card-body">
            <div class="card-title">{lesson.title ?? 'Untitled Lesson'}</div>
            {#if lesson.subtitle}
              <div class="card-subtitle">{lesson.subtitle}</div>
            {/if}
            {#if lesson.vocab_count || lesson.sentence_count}
              <div class="card-meta">
                {#if lesson.sentence_count}
                  <span>{lesson.sentence_count} sentence{lesson.sentence_count !== 1 ? 's' : ''}</span>
                {/if}
                {#if lesson.vocab_count}
                  <span>{lesson.vocab_count} vocab word{lesson.vocab_count !== 1 ? 's' : ''}</span>
                {/if}
              </div>
            {/if}
          </div>

          <div class="card-right">
            {#if !unlocked}
              <span class="lock-icon" title="Complete the previous lesson to unlock">🔒</span>
            {:else}
              <span class="arrow-icon">›</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .lessons-page {
    min-height: 100vh;
    background: #e9e9e9;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    padding: 32px 16px;
  }

  .page-header {
    max-width: 1200px;
    margin: 0 auto 24px;
  }

  .page-title {
    font-size: 24px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 4px;
  }

  .course-label {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  .state-message {
    max-width: 1200px;
    margin: 0 auto;
    font-size: 15px;
    color: #6b7280;
    text-align: center;
    padding: 48px 0;
  }

  .state-message.error {
    color: #ef4444;
  }

  .lessons-list {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .lesson-card {
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    display: flex;
    align-items: center;
    gap: 0;
    cursor: pointer;
    transition: box-shadow 0.15s, transform 0.1s;
    overflow: hidden;
    border: 1px solid transparent;
  }

  .lesson-card:hover:not(.locked) {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
    border-color: #bfdbfe;
  }

  .lesson-card:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
  }

  .lesson-card.locked {
    cursor: default;
    opacity: 0.55;
  }

  .card-left {
    flex-shrink: 0;
    width: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
    align-self: stretch;
    border-right: 1px solid #e5e7eb;
  }

  .chapter-num {
    font-size: 15px;
    font-weight: 700;
    color: #374151;
    text-align: center;
    line-height: 1;
  }

  .card-body {
    flex: 1;
    padding: 14px 16px;
    min-width: 0;
  }

  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    line-height: 1.3;
    margin-bottom: 2px;
  }

  .card-subtitle {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.4;
    margin-bottom: 4px;
  }

  .card-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #9ca3af;
    margin-top: 4px;
  }

  .card-right {
    flex-shrink: 0;
    padding: 0 16px;
    display: flex;
    align-items: center;
  }

  .lock-icon {
    font-size: 16px;
  }

  .arrow-icon {
    font-size: 22px;
    color: #9ca3af;
    font-weight: 300;
    line-height: 1;
  }

  .alphabet-card {
    border: 1px solid #e0e7ff;
  }

  .alphabet-card:hover {
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
    border-color: #a5b4fc;
  }

  .alphabet-left {
    background: #eef2ff;
    border-right-color: #e0e7ff;
  }

  .alphabet-icon {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 17px;
    font-weight: 700;
    color: #4338ca;
    letter-spacing: -0.02em;
  }
</style>

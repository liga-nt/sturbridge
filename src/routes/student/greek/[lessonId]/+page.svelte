<script>
  import { page } from '$app/stores';
  import { onMount, onDestroy, getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { doc, getDoc } from 'firebase/firestore';
  import { db } from '$lib/firebase/client';
  import GreekPassage from '$lib/components/greek/GreekPassage.svelte';
  import VocabPanel from '$lib/components/greek/VocabPanel.svelte';
  import ConjugationTable from '$lib/components/greek/ConjugationTable.svelte';

  const ctx = getContext('student');

  // ── Lesson data ──────────────────────────────────────────────────────────────
  let lesson = null;
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const snap = await getDoc(doc(db, 'lessons', $page.params.lessonId));
      if (snap.exists()) lesson = { id: snap.id, ...snap.data() };
      else error = 'Lesson not found.';
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });

  $: sentences = lesson?.sentences ?? [];
  $: vocabList = lesson?.vocab ?? [];

  // ── Hover word ────────────────────────────────────────────────────────────────
  let hoveredWord = null;

  function handleWordHover(e) {
    hoveredWord = e.detail?.word ?? null;
  }

  $: paradigmKey = hoveredWord?.paradigm_key ?? null;
  $: highlightMorph = hoveredWord?.morph ?? '';

  // ── Audio state ───────────────────────────────────────────────────────────────
  let audioMode = 'greek'; // 'greek' | 'english' | 'alternating'
  let isPlaying = false;
  let currentAudio = null;
  let currentSentenceIdx = -1;

  // currentWords drives GreekPassage highlighting
  let currentWords = [];
  let highlightVersion = 0;

  onDestroy(stopAudio);

  function clearHighlights() {
    highlightVersion++;
    currentWords = [];
  }

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
    clearHighlights();
    isPlaying = false;
    currentSentenceIdx = -1;
  }

  const MIN_HIGHLIGHT_DURATION = 0.15;

  function setupHighlighting(timepoints, sentenceNum, audioRef, offset = 0) {
    clearHighlights();
    const version = highlightVersion;
    if (!timepoints) return;

    const entries = Object.entries(timepoints).filter(([, tp]) => tp?.start !== undefined);
    if (entries.length === 0) return;

    const allWords = entries
      .map(([sentPos, tp]) => ({ sentPos, start: tp.start, end: tp.end }))
      .sort((a, b) => a.start - b.start);

    // Group words sharing the same start time
    const groups = [];
    for (const w of allWords) {
      const last = groups.at(-1);
      if (last && Math.abs(last[0].start - w.start) < 0.001) last.push(w);
      else groups.push([w]);
    }

    function schedule(delayMs, words, phase) {
      let t0;
      const cb = (ts) => {
        if (highlightVersion !== version || currentAudio !== audioRef) return;
        if (t0 === undefined) t0 = ts;
        if (ts - t0 >= delayMs) {
          if (phase === 'clear') {
            currentWords = [];
          } else {
            currentWords = words.map(w => ({
              sentenceNum: String(sentenceNum),
              sentPos: String(w.sentPos),
              phase
            }));
          }
        } else {
          requestAnimationFrame(cb);
        }
      };
      requestAnimationFrame(cb);
    }

    for (const group of groups) {
      const start = group[0].start;
      if (start < offset - 0.1) continue;
      schedule(Math.max(0, (start - offset) * 1000), group, 'full');

      group.forEach(word => {
        const idx = allWords.findIndex(w => w.sentPos === word.sentPos && w.start === word.start);
        if (idx < allWords.length - 1) {
          const fadeTime = Math.max(word.end, word.start + MIN_HIGHLIGHT_DURATION);
          const fadeDelay = Math.max(0, (fadeTime - offset) * 1000);
          const next = allWords[idx + 1];
          schedule(fadeDelay, [word], 'fadeOut');
          schedule(fadeDelay, [next], 'fadeIn');
        }
      });
    }

    const lastGroup = groups.at(-1);
    if (lastGroup) {
      const maxEnd = Math.max(...lastGroup.map(w => w.end));
      schedule(Math.max(0, (maxEnd - offset) * 1000), [], 'clear');
    }
  }

  function getUrl(sentence, mode) {
    if (mode === 'english') return sentence.english_audio_url ?? null;
    return sentence.greek_audio_url ?? sentence.audio_url ?? null;
  }

  function getTimepoints(sentence, mode) {
    if (mode === 'english') return sentence.timepoints?.english ?? {};
    return sentence.timepoints?.greek ?? {};
  }

  function handleWordClick(e) {
    const { word, sentence } = e.detail;
    const mode = audioMode === 'alternating' ? 'greek' : audioMode;
    const url = getUrl(sentence, mode);
    if (!url) return;

    const timepoints = getTimepoints(sentence, mode);
    const tp = timepoints[String(word.sentPos)];
    const offset = tp?.start ?? 0;

    stopAudio();
    const audio = new Audio(url);
    currentAudio = audio;
    isPlaying = true;
    currentSentenceIdx = sentences.indexOf(sentence);

    // Immediate feedback
    currentWords = [{ sentenceNum: String(sentence.num), sentPos: String(word.sentPos), phase: 'full' }];

    audio.addEventListener('ended', () => {
      clearHighlights();
      isPlaying = false;
      currentSentenceIdx = -1;
      currentAudio = null;
    }, { once: true });

    audio.play().then(() => {
      if (offset > 0) audio.currentTime = offset;
      setupHighlighting(timepoints, sentence.num, audio, offset);
    }).catch(() => { isPlaying = false; });
  }

  async function playAll() {
    stopAudio();
    isPlaying = true;

    for (let i = 0; i < sentences.length; i++) {
      if (!isPlaying) break;
      currentSentenceIdx = i;
      const sentence = sentences[i];
      const mode = audioMode === 'alternating' ? (i % 2 === 0 ? 'greek' : 'english') : audioMode;
      const url = getUrl(sentence, mode);

      await new Promise((resolve) => {
        if (!url || !isPlaying) { resolve(); return; }
        const audio = new Audio(url);
        currentAudio = audio;

        function checkInterrupt() {
          if (currentAudio !== audio || !isPlaying) { resolve(); return; }
          requestAnimationFrame(checkInterrupt);
        }

        audio.addEventListener('ended', () => { clearHighlights(); resolve(); }, { once: true });
        audio.addEventListener('error', resolve, { once: true });
        audio.play().then(() => {
          setupHighlighting(getTimepoints(sentence, mode), sentence.num, audio, 0);
          requestAnimationFrame(checkInterrupt);
        }).catch(resolve);
      });
    }

    isPlaying = false;
    currentAudio = null;
    currentSentenceIdx = -1;
  }

  function togglePlayPause() {
    if (isPlaying) stopAudio();
    else playAll();
  }
</script>

<svelte:head>
  <title>{lesson?.title ?? 'Lesson'} — Greek</title>
</svelte:head>

<div class="lesson-page">

  <!-- ── Fixed top bar ─────────────────────────────────────────────────────── -->
  <div class="top-bar">
    <div class="controls-row">
      <!-- Back -->
      <button class="back-btn" on:click={() => goto('/student/greek')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      <!-- Play / Pause (Reader-style large button) -->
      <button class="play-pause-btn" on:click={togglePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'} disabled={!lesson}>
        {#if isPlaying}
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="6" x2="12" y2="42"/>
            <line x1="30" y1="6" x2="30" y2="42"/>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="6 4 42 24 6 44 6 4"/>
          </svg>
        {/if}
      </button>

      <!-- Audio mode -->
      <div class="mode-group" role="group">
        <button class="mode-btn" class:active={audioMode === 'greek'}
          on:click={() => { stopAudio(); audioMode = 'greek'; }}>Greek</button>
        <button class="mode-btn" class:active={audioMode === 'english'}
          on:click={() => { stopAudio(); audioMode = 'english'; }}>English</button>
        <button class="mode-btn" class:active={audioMode === 'alternating'}
          on:click={() => { stopAudio(); audioMode = 'alternating'; }}>Alt</button>
      </div>

      <!-- Title -->
      {#if lesson}
        <span class="lesson-title">{lesson.title}</span>
        {#if lesson.chapter}
          <span class="chapter-badge">Ch. {lesson.chapter}</span>
        {/if}
      {/if}
    </div>

    <!-- Analysis bar — Reader.svelte style -->
    {#if hoveredWord}
      <div class="analysis-bar">
        <strong class="word-form">{hoveredWord.dict_entry ?? hoveredWord.text}</strong>
        {#if hoveredWord.short_def}
          <span class="sep">|</span>
          <span class="definition">"{hoveredWord.short_def}"</span>
        {/if}
        {#if hoveredWord.morph}
          <span class="sep">|</span>
          <span class="morph-tag">{hoveredWord.morph}</span>
        {/if}
      </div>
    {:else}
      <div class="analysis-bar analysis-placeholder">
        Hover a word to see analysis
      </div>
    {/if}
  </div>

  <!-- ── Single scrollable area ─────────────────────────────────────────────── -->
  {#if loading}
    <div class="state-msg">Loading lesson…</div>
  {:else if error}
    <div class="state-msg error">{error}</div>
  {:else if lesson}
    <div class="scroll-area">
      <div class="three-col">

        <!-- Left: Vocab -->
        <aside class="col col-vocab">
          <div class="col-label">Vocabulary</div>
          <VocabPanel {vocabList} headless />
        </aside>

        <!-- Center: Greek text -->
        <main class="col col-passage">
          {#if sentences.length > 0}
            <GreekPassage
              {sentences}
              {currentWords}
              on:wordHover={handleWordHover}
              on:wordClick={handleWordClick}
            />
          {:else}
            <p class="empty-note">{lesson.intro ?? 'No content yet.'}</p>
          {/if}
        </main>

        <!-- Right: Paradigm -->
        <aside class="col col-paradigm">
          {#if paradigmKey}
            <div class="col-label">Paradigm</div>
            <ConjugationTable {paradigmKey} {highlightMorph} />
          {:else if hoveredWord}
            <p class="empty-note">No paradigm for this word.</p>
          {:else}
            <p class="empty-note muted">Hover a word…</p>
          {/if}
        </aside>

      </div>
    </div>
  {/if}

</div>

<style>
  /* Full-viewport layout */
  .lesson-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #fff;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    overflow: hidden;
  }

  /* ── Top bar ── */
  .top-bar {
    flex-shrink: 0;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.12);
    z-index: 10;
  }

  .controls-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 16px;
    border-bottom: 1px solid #e5e7eb;
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

  /* Large play/pause (Reader style) */
  .play-pause-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    background: none;
    cursor: pointer;
    color: #111827;
    flex-shrink: 0;
    padding: 0;
  }

  .play-pause-btn:hover { color: #1d4ed8; }
  .play-pause-btn:disabled { opacity: 0.35; cursor: default; }

  /* Mode group */
  .mode-group {
    display: flex;
    gap: 0;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .mode-btn {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border: none;
    border-right: 1px solid #d1d5db;
    background: #fff;
    color: #374151;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .mode-btn:last-child { border-right: none; }
  .mode-btn:hover { background: #f3f4f6; }
  .mode-btn.active { background: #111827; color: #fff; }

  .lesson-title {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .chapter-badge {
    font-size: 11px;
    background: #f3f4f6;
    color: #6b7280;
    padding: 2px 7px;
    border-radius: 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Analysis bar — Reader.svelte pattern */
  .analysis-bar {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 20px;
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 15px;
    line-height: 1.5;
    min-height: 32px;
    background: #fff;
    color: #111;
  }

  .analysis-placeholder {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
  }

  .word-form {
    font-size: 17px;
    font-weight: 700;
  }

  .sep {
    color: #9ca3af;
  }

  .definition {
    color: #374151;
    font-style: italic;
  }

  .morph-tag {
    color: #6b7280;
  }

  /* ── Scroll area ── */
  .scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Three-column layout — all columns same height, single scroll */
  .three-col {
    display: grid;
    grid-template-columns: 200px 1fr 240px;
    min-height: 100%;
    align-items: start;
  }

  .col {
    padding: 20px 16px;
  }

  .col-vocab {
    border-right: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    height: calc(100vh - 88px); /* approx top-bar height */
    overflow-y: auto;
  }

  .col-passage {
    /* Center column scrolls with the page */
  }

  .col-paradigm {
    border-left: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    height: calc(100vh - 88px);
    overflow-y: auto;
  }

  .col-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #f3f4f6;
  }

  /* States */
  .state-msg {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: #6b7280;
    padding: 48px;
  }

  .state-msg.error { color: #ef4444; }

  .empty-note {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: #6b7280;
    font-style: italic;
    margin: 0;
  }

  .empty-note.muted { color: #d1d5db; }
</style>

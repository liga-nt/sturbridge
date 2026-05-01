<script>
  import { onDestroy, getContext } from 'svelte';
  import HebrewPassage from '$lib/components/hebrew/HebrewPassage.svelte';
  import HebrewParadigmTable from '$lib/components/hebrew/HebrewParadigmTable.svelte';
  import HebrewFlashcard from '$lib/components/hebrew/HebrewFlashcard.svelte';
  import VocabPanel from '$lib/components/greek/VocabPanel.svelte';

  /**
   * HebrewLessonReader — embeddable reader for a Hebrew lesson.
   * Props:
   *   lesson         — full lesson document (sentences, vocabList, title, etc.)
   *   wordFormsCache — pre-built { surface: { dictEntry, morph, paradigmKey, ... } }
   */
  export let lesson         = null;
  export let wordFormsCache = null;

  const ctx = getContext('student');

  let activeTab = 'reader'; // 'reader' | 'vocab'

  $: sentences = lesson?.sentences ?? [];
  $: vocabList = lesson?.vocabList ?? [];

  // ── Word forms helpers ────────────────────────────────────────────────────────

  function stripNikud(s) {
    return s.replace(/[֑-ׇ]/g, '');
  }

  function morphToDisplay(m) {
    if (!m || typeof m !== 'object') return typeof m === 'string' ? m : '';
    const { pos, stem, tense, gender, number, state, person } = m;
    if (!pos) return '';
    if (pos === 'verb') {
      return [stem, tense, person ? `${person}${gender ?? ''}${number ?? ''}` : null].filter(Boolean).join(' ');
    }
    if (pos === 'noun' || pos === 'adj') {
      return [gender === 'f' ? 'fem' : gender === 'm' ? 'masc' : gender, number, state].filter(Boolean).join(' ');
    }
    return pos;
  }

  function hasNikud(s) {
    return /[ְ-ּֽֿׁׂ]/.test(s);
  }

  function betterForm(existing, candidate) {
    if (!existing) return true;
    const eHas = hasNikud(existing), cHas = hasNikud(candidate);
    if (cHas && !eHas) return true;                      // nikud beats none
    if (cHas && eHas && candidate.length < existing.length) return true; // shorter = bare form preferred
    return false;
  }

  function buildWordForms(de) {
    if (!de || !wordFormsCache) return null;
    const result = {};
    for (const [form, entry] of Object.entries(wordFormsCache)) {
      if (entry.dictEntry !== de) continue;
      const m = entry.morph;
      if (!m || typeof m !== 'object') continue;
      const { pos, stem, tense, gender, number, state, person } = m;
      if (pos === 'verb' && stem && tense) {
        const key = `${stem}.${tense}`;
        result[key] ??= {};
        if (number && person && gender) {
          result[key][number] ??= {};
          const cell = `${person}${gender}`;
          if (betterForm(result[key][number][cell], form))
            result[key][number][cell] = form;
        }
      } else if ((pos === 'noun' || pos === 'adj') && number && state) {
        result[number] ??= {};
        if (betterForm(result[number][state], form))
          result[number][state] = form;
      }
    }
    return Object.keys(result).length ? result : null;
  }

  // ── Hover word ────────────────────────────────────────────────────────────────

  let hoveredWord = null;

  function handleWordHover(e) { hoveredWord = e.detail?.word ?? null; }

  $: hoveredMorph       = hoveredWord?.morph ?? null;
  $: hoveredDictEntry   = hoveredWord?.dictEntry ?? null;
  $: hoveredParadigmKey = hoveredWord?.paradigmKey
    ?? (hoveredWord?.text ? wordFormsCache?.[hoveredWord.text]?.paradigmKey : null)
    ?? null;
  $: _allWordForms      = hoveredWord && wordFormsCache ? buildWordForms(hoveredWord.dictEntry) : null;

  // ── Audio ─────────────────────────────────────────────────────────────────────

  let audioMode           = 'hebrew';
  let hebrewRate          = 1.0;
  let englishRate         = 1.0;
  let highlightingEnabled = true;
  let isPlaying           = false;
  let currentAudio        = null;
  let currentSentenceIdx  = -1;
  let currentWords        = [];
  let highlightVersion    = 0;
  let showSettingsModal   = false;

  onDestroy(stopAudio);

  function clearHighlights() { highlightVersion++; currentWords = []; }

  function stopAudio() {
    if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; }
    clearHighlights();
    isPlaying = false;
    currentSentenceIdx = -1;
  }

  function getUrl(sentence, mode) {
    return mode === 'english' ? (sentence.english_audio_url ?? null) : (sentence.hebrew_audio_url ?? null);
  }

  function getTimepoints(sentence, mode) {
    return mode === 'english' ? (sentence.timepoints?.english ?? {}) : (sentence.timepoints?.hebrew ?? {});
  }

  const MIN_HIGHLIGHT_DURATION = 0.15;

  function setupHighlighting(timepoints, sentenceNum, audioRef, offset = 0, rate = 1.0) {
    clearHighlights();
    const version = highlightVersion;
    if (!timepoints) return;
    const entries = Object.entries(timepoints).filter(([, tp]) => tp?.start !== undefined);
    if (entries.length === 0) return;
    const allWords = entries.map(([sentPos, tp]) => ({ sentPos, start: tp.start, end: tp.end })).sort((a, b) => a.start - b.start);
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
          currentWords = phase === 'clear' ? [] : words.map(w => ({ sentenceNum: String(sentenceNum), sentPos: String(w.sentPos), phase }));
        } else requestAnimationFrame(cb);
      };
      requestAnimationFrame(cb);
    }
    for (const group of groups) {
      const start = group[0].start;
      if (start < offset - 0.1) continue;
      schedule(Math.max(0, (start - offset) / rate * 1000), group, 'full');
      group.forEach(word => {
        const idx = allWords.findIndex(w => w.sentPos === word.sentPos && w.start === word.start);
        if (idx < allWords.length - 1) {
          const fadeTime  = Math.max(word.end, word.start + MIN_HIGHLIGHT_DURATION);
          schedule(Math.max(0, (fadeTime - offset) / rate * 1000), [word], 'fadeOut');
          schedule(Math.max(0, (fadeTime - offset) / rate * 1000), [allWords[idx + 1]], 'fadeIn');
        }
      });
    }
    const lastGroup = groups.at(-1);
    if (lastGroup) {
      const maxEnd = Math.max(...lastGroup.map(w => w.end));
      schedule(Math.max(0, (maxEnd - offset) / rate * 1000), [], 'clear');
    }
  }

  function playSentence(sentence, mode, sentenceIdx) {
    const url  = getUrl(sentence, mode);
    const rate = mode === 'hebrew' ? hebrewRate : englishRate;
    currentSentenceIdx = sentenceIdx;
    if (!url || !isPlaying) return Promise.resolve();
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.playbackRate = rate;
      currentAudio = audio;
      audio.addEventListener('ended', () => { clearHighlights(); resolve(); }, { once: true });
      audio.addEventListener('error', resolve, { once: true });
      audio.play().then(() => {
        if (highlightingEnabled) setupHighlighting(getTimepoints(sentence, mode), sentence.num, audio, 0, rate);
      }).catch(resolve);
    });
  }

  function handleWordClick(e) {
    const { word, sentence } = e.detail;
    const mode = audioMode === 'alternating' ? 'hebrew' : audioMode;
    const url  = getUrl(sentence, mode);
    if (!url) return;
    const rate       = mode === 'hebrew' ? hebrewRate : englishRate;
    const timepoints = getTimepoints(sentence, mode);
    const tp         = timepoints[String(word.sentPos)];
    const offset     = tp?.start ?? 0;
    stopAudio();
    const audio = new Audio(url);
    audio.playbackRate = rate;
    currentAudio = audio;
    isPlaying = true;
    currentSentenceIdx = sentences.indexOf(sentence);
    currentWords = [{ sentenceNum: String(sentence.num), sentPos: String(word.sentPos), phase: 'full' }];
    audio.addEventListener('ended', () => { clearHighlights(); isPlaying = false; currentSentenceIdx = -1; currentAudio = null; }, { once: true });
    audio.play().then(() => {
      if (offset > 0) audio.currentTime = offset;
      if (highlightingEnabled) setupHighlighting(timepoints, sentence.num, audio, offset, rate);
    }).catch(() => { isPlaying = false; });
  }

  async function playAll() {
    stopAudio();
    isPlaying = true;
    for (let i = 0; i < sentences.length; i++) {
      if (!isPlaying) break;
      const sentence = sentences[i];
      const modes = audioMode === 'alternating' ? ['hebrew', 'english'] : [audioMode];
      for (const mode of modes) {
        if (!isPlaying) break;
        await playSentence(sentence, mode, i);
      }
    }
    isPlaying = false; currentAudio = null; currentSentenceIdx = -1;
  }

  function togglePlayPause() { if (isPlaying) stopAudio(); else playAll(); }

  $: if (activeTab) stopAudio();
</script>

<!-- ── Tab bar ─────────────────────────────────────────────────────────────────── -->
<div class="reader-shell">
  <div class="reader-topbar">
    <div class="topbar-inner">
      {#if activeTab === 'reader'}
        <button class="play-pause-btn" on:click={togglePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'} disabled={!lesson}>
          {#if isPlaying}
            <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="10" y1="4" x2="10" y2="43"/><line x1="30" y1="4" x2="30" y2="43"/>
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 3 40 23 3 43 3 3"/>
            </svg>
          {/if}
        </button>
        <button class="icon-btn" on:click={() => showSettingsModal = true} title="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 1 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      {/if}

      {#if lesson?.title}
        <span class="lesson-title">{lesson.title}</span>
      {/if}

      <div class="part-tabs">
        <button class="part-tab" class:active={activeTab === 'reader'} on:click={() => activeTab = 'reader'}>Reader</button>
        <button class="part-tab" class:active={activeTab === 'vocab'} on:click={() => activeTab = 'vocab'}>Vocab</button>
      </div>
    </div>
  </div>

  {#if activeTab === 'reader'}
    <!-- Analysis bar -->
    <div class="analysis-bar" class:placeholder={!hoveredWord}>
      <div class="analysis-inner">
        {#if hoveredWord}
          <strong class="word-form" dir="rtl">{hoveredWord.dictEntry ?? hoveredWord.text}</strong>
          {#if hoveredWord.shortDef}<span class="sep">|</span><span class="definition">"{hoveredWord.shortDef}"</span>{/if}
          {#if hoveredWord.morph}<span class="sep">|</span><span class="morph-tag">{morphToDisplay(hoveredWord.morph)}</span>{/if}
        {:else}
          Hover a word to see analysis
        {/if}
      </div>
    </div>
  {/if}

  <!-- ── Content ──────────────────────────────────────────────────────────────── -->
  <div class="reader-body">
    {#if activeTab === 'reader'}
      <div class="three-col">
        <aside class="col col-vocab">
          <div class="col-label">Vocabulary</div>
          <VocabPanel {vocabList} headless />
        </aside>
        <main class="col col-passage">
          {#if sentences.length > 0}
            <HebrewPassage {sentences} {currentWords}
              on:wordHover={handleWordHover}
              on:wordClick={handleWordClick}
            />
          {:else}
            <p class="empty-note">No content.</p>
          {/if}
        </main>
        <aside class="col col-paradigm">
          {#if hoveredWord}
            <div class="col-label">Paradigm</div>
            <HebrewParadigmTable
              morph={hoveredMorph}
              wordForms={_allWordForms}
              dictEntry={hoveredDictEntry}
              paradigmKey={hoveredParadigmKey}
              surfaceForm={hoveredWord?.text}
              definition={hoveredWord?.definition ?? null}
            />
          {:else}
            <p class="empty-note muted">Hover a word…</p>
          {/if}
        </aside>
      </div>

    {:else if activeTab === 'vocab'}
      <div class="flashcard-wrap">
        <HebrewFlashcard {vocabList} uid={ctx?.uid ?? ''} courseId="hebrew-alphabet" />
      </div>
    {/if}
  </div>
</div>

<!-- ── Settings modal ─────────────────────────────────────────────────────────── -->
{#if showSettingsModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={() => showSettingsModal = false}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Reader Settings</h2>
        <button class="modal-close" on:click={() => showSettingsModal = false}>×</button>
      </div>
      <div class="modal-body">
        <section class="settings-section">
          <h3>Audio Language</h3>
          <div class="settings-options">
            {#each [['hebrew','Hebrew'],['english','English'],['alternating','Alternating']] as [val, lbl]}
              <label class="setting-option">
                <input type="radio" name="audioMode" value={val} checked={audioMode === val}
                  on:change={() => { stopAudio(); audioMode = val; }} />
                <span>{lbl}</span>
              </label>
            {/each}
          </div>
        </section>
        <section class="settings-section">
          <h3>Playback Speed</h3>
          <div class="settings-options">
            {#each [['hebrew','Hebrew Speed', hebrewRate],['english','English Speed', englishRate]] as [variant, lbl, rate]}
              <div class="rate-control">
                <label>{lbl}</label>
                <div class="rate-slider">
                  <input type="range" min="0.5" max="2" step="0.05" value={rate}
                    on:input={(e) => { if (variant === 'hebrew') hebrewRate = +e.target.value; else englishRate = +e.target.value; }} />
                  <span class="rate-value">{rate.toFixed(2)}x</span>
                </div>
              </div>
            {/each}
          </div>
        </section>
        <section class="settings-section">
          <h3>Highlighting</h3>
          <label class="setting-option">
            <input type="checkbox" checked={highlightingEnabled}
              on:change={(e) => { highlightingEnabled = e.target.checked; }} />
            <span>Enable word highlighting during playback</span>
          </label>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .reader-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .reader-topbar {
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .topbar-inner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 4px 16px;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .play-pause-btn {
    display: flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; border: none; background: none;
    cursor: pointer; color: #111827; flex-shrink: 0; padding: 0;
  }
  .play-pause-btn:hover { color: #1d4ed8; }
  .play-pause-btn:disabled { opacity: 0.35; cursor: default; }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border: none; background: none;
    cursor: pointer; color: #6b7280; border-radius: 6px; flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }
  .icon-btn:hover { background: #f3f4f6; color: #111827; }

  .lesson-title {
    font-size: 13px; font-weight: 600; color: #374151;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
  }

  .part-tabs { display: flex; gap: 4px; margin-left: auto; }
  .part-tab {
    padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
    background: transparent; border: 1px solid transparent; color: #9ca3af; cursor: pointer; transition: all 0.15s;
  }
  .part-tab:hover { color: #374151; background: #f3f4f6; }
  .part-tab.active { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }

  .analysis-bar {
    border-bottom: 1px solid #f3f4f6;
    font-family: "Frank Ruhl Libre", "Times New Roman", serif;
    font-size: 19px; height: 48px; background: #fafafa; flex-shrink: 0; overflow: hidden;
  }
  .analysis-bar.placeholder {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11px; color: #d1d5db; font-style: italic;
  }
  .analysis-inner {
    display: flex; align-items: center; flex-wrap: nowrap; gap: 6px;
    padding: 0 16px; height: 100%;
    max-width: 1200px; margin: 0 auto; width: 100%; box-sizing: border-box;
  }
  .word-form { font-size: 21px; font-weight: 700; }
  .sep { color: #9ca3af; }
  .definition { color: #374151; font-style: italic; font-size: 18px; }
  .morph-tag  { color: #6b7280; font-size: 16px; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }

  .reader-body { flex: 1; overflow-y: auto; overflow-x: hidden; }

  .three-col {
    display: grid;
    grid-template-columns: 200px 1fr 260px;
    align-items: start;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }
  .col { padding: 20px 16px; }
  .col-vocab    { border-right: 1px solid #e5e7eb; }
  .col-passage  { min-width: 0; }
  .col-paradigm { border-left: 1px solid #e5e7eb; }

  .col-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: #9ca3af; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6;
  }

  .flashcard-wrap { max-width: 640px; margin: 0 auto; width: 100%; }

  .empty-note { font-size: 13px; color: #6b7280; font-style: italic; margin: 0; }
  .empty-note.muted { color: #d1d5db; }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
  }
  .modal-content {
    background: white; border-radius: 8px; max-width: 500px; width: 100%;
    max-height: 80vh; display: flex; flex-direction: column;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 20px 24px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
  }
  .modal-header h2 { margin: 0; font-size: 1.125rem; font-weight: 600; color: #111827; }
  .modal-close {
    background: none; border: none; font-size: 1.75rem; line-height: 1; color: #6b7280;
    cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  }
  .modal-body { padding: 20px 24px; overflow-y: auto; }
  .settings-section { margin-bottom: 24px; }
  .settings-section h3 { font-size: 0.9rem; font-weight: 600; color: #111827; margin: 0 0 10px; }
  .settings-options { display: flex; flex-direction: column; gap: 10px; }
  .setting-option {
    display: flex; align-items: center; gap: 8px; cursor: pointer;
    padding: 6px 8px; border-radius: 4px; transition: background 0.15s;
  }
  .setting-option:hover { background: #f3f4f6; }
  .setting-option span { color: #374151; font-size: 0.875rem; }
  .rate-control { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 6px; background: #f9fafb; }
  .rate-control label { font-size: 0.875rem; font-weight: 500; color: #374151; }
  .rate-slider { display: flex; align-items: center; gap: 10px; }
  .rate-slider input[type="range"] { flex: 1; height: 6px; border-radius: 3px; accent-color: #111827; }
  .rate-value { font-size: 0.8rem; font-weight: 600; color: #374151; min-width: 38px; text-align: right; }
</style>

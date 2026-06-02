<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import GreekAlphabetSequence from '$lib/components/greek/GreekAlphabetSequence.svelte';
  import GreekAlphabetFlashcard from '$lib/components/greek/GreekAlphabetFlashcard.svelte';
  import GreekLetterRecognition from '$lib/components/greek/GreekLetterRecognition.svelte';
  import GreekDiacriticsPractice from '$lib/components/greek/GreekDiacriticsPractice.svelte';
  import GreekVocabExercise from '$lib/components/greek/GreekVocabExercise.svelte';
  import { QWERTY_TO_GREEK } from '$lib/utils/greekKeyboard.js';

  import { onDestroy } from 'svelte';

  let activeTab  = 'sequence';
  let inputMode  = 'greek-hints'; // 'greek-hints' | 'greek' | 'translit'
  let alphabet   = [];
  let introVocab = [];
  let loading    = true;

  let lastKey = null;
  let lastKeyTimer = null;
  let hintKeys = [];

  $: activeTab, (hintKeys = []);
  $: showKeyboard = inputMode === 'greek-hints' && activeTab !== 'flashcards' && activeTab !== 'recognition';

  // ── Hint audio ────────────────────────────────────────────────────────────────
  let hints = {};           // { [tabId]: { text, audioUrl, alignment } }
  let hintAudio = null;
  let hintPlayingTab = null;
  let hintWordIdx = -1;
  let hintRaf = null;

  function stopHintAudio() {
    if (hintRaf) { cancelAnimationFrame(hintRaf); hintRaf = null; }
    if (hintAudio) { hintAudio.pause(); hintAudio.src = ''; hintAudio = null; }
    hintPlayingTab = null;
    hintWordIdx = -1;
  }

  // Stop hint audio when the tab changes
  $: activeTab, stopHintAudio();

  function toggleHintAudio(tabId) {
    if (hintPlayingTab === tabId) { stopHintAudio(); return; }
    stopHintAudio();
    const hint = hints[tabId];
    if (!hint?.audioUrl) return;
    const audio = new Audio(hint.audioUrl);
    hintAudio = audio;
    hintPlayingTab = tabId;
    hintWordIdx = -1;
    const al = hint.alignment ?? [];
    function tick() {
      if (!hintAudio || hintAudio !== audio) return;
      const t = audio.currentTime;
      let idx = -1;
      for (let i = 0; i < al.length; i++) {
        if (t >= al[i].start && t <= al[i].end) { idx = i; break; }
      }
      hintWordIdx = idx;
      hintRaf = requestAnimationFrame(tick);
    }
    audio.addEventListener('play', () => { hintRaf = requestAnimationFrame(tick); }, { once: true });
    audio.addEventListener('ended', () => {
      cancelAnimationFrame(hintRaf); hintRaf = null;
      hintPlayingTab = null; hintWordIdx = -1;
    }, { once: true });
    audio.play().catch(() => {});
  }

  onDestroy(stopHintAudio);

  function cycleInputMode() {
    if (activeTab === 'diacritics') {
      inputMode = inputMode === 'greek-hints' ? 'greek' : 'greek-hints';
    } else {
      inputMode = inputMode === 'greek-hints' ? 'greek'
                : inputMode === 'greek'       ? 'translit'
                :                               'greek-hints';
    }
    localStorage.setItem('greek_alpha_inputMode', inputMode);
  }

  const TABS = [
    { id: 'sequence',    label: 'Alphabet' },
    { id: 'flashcards',  label: 'Flashcards' },
    { id: 'recognition', label: 'Upper / Lower Case' },
    { id: 'diacritics',  label: 'Accents & Breathings' },
    { id: 'vocab',       label: 'Words' },
  ];

  const LETTER_ROW1 = ['q','w','e','r','t','y','u','i','o','p'];
  const LETTER_ROW2 = ['a','s','d','f','g','h','j','k','l'];
  const LETTER_ROW3 = ['z','x','c','v','b','n','m'];

  const VALID_TABS   = new Set(['sequence','flashcards','recognition','diacritics','vocab']);
  const VALID_MODES  = new Set(['greek-hints','greek','translit']);

  onMount(async () => {
    const saved     = localStorage.getItem('greek_alpha_tab');
    const savedMode = localStorage.getItem('greek_alpha_inputMode');
    activeTab  = VALID_TABS.has(saved)   ? saved   : 'sequence';
    inputMode  = VALID_MODES.has(savedMode) ? savedMode : 'greek-hints';
    try {
      const [alphaData, vocabData, hintsData] = await Promise.all([
        fetch('/data/Greek/alphabet.json').then(r => r.json()),
        fetch('/data/Greek/nge_vocabulary.json').then(r => r.json()),
        fetch('/data/Greek/alphabet_hints.json').then(r => r.json()),
      ]);
      alphabet   = alphaData;
      introVocab = (vocabData.entries ?? []).filter(e => e.introduced === 'intro');
      hints      = hintsData;
    } catch (e) {
      console.error('Failed to load Greek data:', e);
    }
    loading = false;
  });

  function setTab(tab) {
    activeTab = tab;
    localStorage.setItem('greek_alpha_tab', tab);
  }


  function handleKeyMap(e) {
    if (!showKeyboard) return;
    if (lastKeyTimer) clearTimeout(lastKeyTimer);
    lastKey = e.key;
    lastKeyTimer = setTimeout(() => { lastKey = null; }, 800);
  }
</script>

<svelte:window on:keydown={handleKeyMap} />

<svelte:head>
  <title>Greek Alphabet</title>
</svelte:head>

<div class="alpha-page" class:has-keyboard={showKeyboard}>
  <header class="page-header">
    <div class="page-header-inner">
      <button class="back-btn" on:click={() => goto('/student/greek')} aria-label="Back">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h1 class="page-title">
        Greek Alphabet
        {#if activeTab !== 'flashcards' && activeTab !== 'recognition'}
          <button class="input-mode-btn mode-{inputMode}" on:click={cycleInputMode}>
            {inputMode === 'greek-hints' ? 'Greek + keyboard' : inputMode === 'greek' ? 'Greek' : 'Transliterate'}
          </button>
        {/if}
      </h1>
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
      <div class="tab-hint">
        <button class="hint-play-btn" class:hint-playing={hintPlayingTab === 'sequence'} on:click={() => toggleHintAudio('sequence')} aria-label="Play instructions">
          {#if hintPlayingTab === 'sequence'}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>{:else}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>{/if}
        </button>
        <span class="hint-text">{#each (hints.sequence?.alignment ?? []) as w, i}<span class="hw" class:hw-active={hintPlayingTab === 'sequence' && hintWordIdx === i}>{w.word}</span>{' '}{/each}{#if !hints.sequence}Click a tile or type a letter to hear it. Choose your input style:{/if}</span>
        <button class="input-mode-btn mode-{inputMode}" on:click={cycleInputMode}>
          {inputMode === 'greek-hints' ? 'Greek + keyboard' : inputMode === 'greek' ? 'Greek' : 'Transliterate'}
        </button>
      </div>
      <GreekAlphabetSequence {alphabet} {inputMode} bind:hintKeys />
    {:else if activeTab === 'flashcards'}
      <div class="tab-hint">
        <button class="hint-play-btn" class:hint-playing={hintPlayingTab === 'flashcards'} on:click={() => toggleHintAudio('flashcards')} aria-label="Play instructions">
          {#if hintPlayingTab === 'flashcards'}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>{:else}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>{/if}
        </button>
        <span class="hint-text">{#each (hints.flashcards?.alignment ?? []) as w, i}<span class="hw" class:hw-active={hintPlayingTab === 'flashcards' && hintWordIdx === i}>{w.word}</span>{' '}{/each}{#if !hints.flashcards}Say the letter's name aloud before flipping each card.{/if}</span>
      </div>
      <GreekAlphabetFlashcard {alphabet} {inputMode} bind:hintKeys />
    {:else if activeTab === 'recognition'}
      <div class="tab-hint">
        <button class="hint-play-btn" class:hint-playing={hintPlayingTab === 'recognition'} on:click={() => toggleHintAudio('recognition')} aria-label="Play instructions">
          {#if hintPlayingTab === 'recognition'}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>{:else}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>{/if}
        </button>
        <span class="hint-text">{#each (hints.recognition?.alignment ?? []) as w, i}<span class="hw" class:hw-active={hintPlayingTab === 'recognition' && hintWordIdx === i}>{w.word}</span>{' '}{/each}{#if !hints.recognition}Click the upper or lower case letter that matches the letter shown.{/if}</span>
      </div>
      <GreekLetterRecognition {alphabet} bind:hintKeys />
    {:else if activeTab === 'diacritics'}
      <div class="tab-hint">
        <button class="hint-play-btn" class:hint-playing={hintPlayingTab === 'diacritics'} on:click={() => toggleHintAudio('diacritics')} aria-label="Play instructions">
          {#if hintPlayingTab === 'diacritics'}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>{:else}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>{/if}
        </button>
        <span class="hint-text">{#each (hints.diacritics?.alignment ?? []) as w, i}<span class="hw" class:hw-active={hintPlayingTab === 'diacritics' && hintWordIdx === i}>{w.word}</span>{' '}{/each}{#if !hints.diacritics}Type each word with its correct accent and breathing marks. Choose your input style:{/if}</span>
        <button class="input-mode-btn mode-{inputMode}" on:click={cycleInputMode}>
          {inputMode === 'greek-hints' ? 'Greek + keyboard' : 'Greek'}
        </button>
      </div>
      <GreekDiacriticsPractice {alphabet} vocab={introVocab} bind:hintKeys />
    {:else if activeTab === 'vocab'}
      <div class="vocab-wrap">
        <div class="tab-hint">
          <button class="hint-play-btn" class:hint-playing={hintPlayingTab === 'vocab'} on:click={() => toggleHintAudio('vocab')} aria-label="Play instructions">
            {#if hintPlayingTab === 'vocab'}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>{:else}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>{/if}
          </button>
          <span class="hint-text">{#each (hints.vocab?.alignment ?? []) as w, i}<span class="hw" class:hw-active={hintPlayingTab === 'vocab' && hintWordIdx === i}>{w.word}</span>{' '}{/each}{#if !hints.vocab}This is all the vocabulary you will need to memorize for the National Greek Exam.{/if}</span>
          Choose your input style:
          <button class="input-mode-btn mode-{inputMode}" on:click={cycleInputMode}>
            {inputMode === 'greek-hints' ? 'Greek + keyboard' : inputMode === 'greek' ? 'Greek' : 'Transliterate'}
          </button>
        </div>
        <GreekVocabExercise vocabList={introVocab.map(e => ({ dictEntry: e.greek, shortDef: e.definition, vocabTier: 'intro', audioGreekUrl: e.audio_greek_url, audioEnUrl: e.audio_en_url }))} {inputMode} bind:hintKeys />
      </div>
    {/if}
  </main>

  <!-- ── Keyboard map panel ── -->
  {#if showKeyboard}
    <div class="keyboard-panel">
      <div class="keyboard-inner">

        <!-- Row 1: q–p -->
        <div class="key-row">
          {#each LETTER_ROW1 as k}
            <div class="key-cap"
              class:key-active={lastKey === k || lastKey === k.toUpperCase()}
              class:hint-0={hintKeys[0] === k || hintKeys[0] === k.toUpperCase()}
              class:hint-1={hintKeys[1] === k || hintKeys[1] === k.toUpperCase()}
              class:hint-2={hintKeys[2] === k || hintKeys[2] === k.toUpperCase()}>
              <span class="key-qwerty">{k}</span>
              <span class="key-greek">{QWERTY_TO_GREEK[k] ?? ''}</span>
            </div>
          {/each}
        </div>

        <!-- Row 2: a–l -->
        <div class="key-row">
          {#each LETTER_ROW2 as k}
            <div class="key-cap"
              class:key-active={lastKey === k || lastKey === k.toUpperCase()}
              class:hint-0={hintKeys[0] === k || hintKeys[0] === k.toUpperCase()}
              class:hint-1={hintKeys[1] === k || hintKeys[1] === k.toUpperCase()}
              class:hint-2={hintKeys[2] === k || hintKeys[2] === k.toUpperCase()}>
              <span class="key-qwerty">{k}</span>
              <span class="key-greek">{QWERTY_TO_GREEK[k] ?? ''}</span>
            </div>
          {/each}
        </div>

        <!-- Row 3: z–m -->
        <div class="key-row">
          {#each LETTER_ROW3 as k}
            <div class="key-cap"
              class:key-active={lastKey === k || lastKey === k.toUpperCase()}
              class:hint-0={hintKeys[0] === k || hintKeys[0] === k.toUpperCase()}
              class:hint-1={hintKeys[1] === k || hintKeys[1] === k.toUpperCase()}
              class:hint-2={hintKeys[2] === k || hintKeys[2] === k.toUpperCase()}>
              <span class="key-qwerty">{k}</span>
              <span class="key-greek">{QWERTY_TO_GREEK[k] ?? ''}</span>
            </div>
          {/each}
        </div>

      </div>
    </div>
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

  .alpha-page.has-keyboard {
    padding-bottom: 140px;
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
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .input-mode-btn {
    font-size: 0.8rem;
    border-radius: 999px;
    padding: 0.25em 0.9em;
    cursor: pointer;
    border: 1px solid #e5e7eb;
    transition: background 0.15s, color 0.15s;
  }
  .input-mode-btn.mode-greek-hints { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }
  .input-mode-btn.mode-greek       { background: #f9fafb; border-color: #e5e7eb; color: #6b7280; }
  .input-mode-btn.mode-translit    { background: #fdf4ff; border-color: #e9d5ff; color: #7e22ce; }
  .input-mode-btn:hover            { filter: brightness(0.97); }

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
  .tab-btn.active { color: #4f46e5; border-bottom-color: #6366f1; font-weight: 600; }

  .tab-content { flex: 1; }

  .vocab-wrap {
    max-width: 740px;
    margin: 0 auto;
    width: 100%;
    padding: 0 16px;
    box-sizing: border-box;
  }

  .tab-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    text-align: center;
    font-size: 0.95rem;
    font-weight: 600;
    color: #374151;
    margin: 12px 0 0;
    padding: 0 1rem;
    line-height: 2;
  }

  .hint-play-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1.5px solid #a5b4fc;
    background: #eef2ff;
    color: #4338ca;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .hint-play-btn:hover      { background: #e0e7ff; border-color: #818cf8; }
  .hint-play-btn.hint-playing { background: #4338ca; border-color: #4338ca; color: white; }

  .hint-text { display: inline; }

  .hw { display: inline; transition: background 0.08s; border-radius: 3px; }
  .hw-active { background: #fef08a; }


  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: #9ca3af;
    font-size: 1rem;
  }


  /* ── Keyboard panel ── */
  .keyboard-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #1e293b;
    border-top: 1px solid #334155;
    padding: 8px 10px 12px;
    z-index: 50;
  }

  .keyboard-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    max-width: 780px;
    margin: 0 auto;
  }

  .key-row {
    display: flex;
    gap: 3px;
    justify-content: center;
    align-items: flex-end;
  }

  .key-cap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 48px;
    background: #334155;
    border-radius: 6px;
    border: 1px solid #475569;
    transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
    cursor: default;
    gap: 2px;
  }

  .key-cap.key-active {
    background: #4f46e5;
    border-color: #818cf8;
    box-shadow: 0 0 0 2px rgba(129,140,248,0.4);
  }

  /* Hint color tiers */
  .key-cap.hint-0 {
    background: #3730a3;
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.35);
  }
  .key-cap.hint-1 {
    background: #92400e;
    border-color: #f59e0b;
    box-shadow: 0 0 0 2px rgba(245,158,11,0.35);
  }
  .key-cap.hint-2 {
    background: #065f46;
    border-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16,185,129,0.35);
  }

  .key-qwerty {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1;
    font-family: monospace;
    font-weight: 600;
  }
  .key-active .key-qwerty  { color: #c7d2fe; }
  .hint-0 .key-qwerty      { color: #a5b4fc; }
  .hint-1 .key-qwerty      { color: #fcd34d; }
  .hint-2 .key-qwerty      { color: #6ee7b7; }

  .key-greek {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 18px;
    color: #f1f5f9;
    line-height: 1;
  }
  .key-active .key-greek { color: #fff; }
  .hint-0 .key-greek     { color: #e0e7ff; }
  .hint-1 .key-greek     { color: #fef3c7; }
  .hint-2 .key-greek     { color: #d1fae5; }

</style>

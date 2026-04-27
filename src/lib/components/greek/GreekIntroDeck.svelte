<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    keyToGreek, applyDiacritic, processFinalSigma,
    stripGreekDiacritics, DIACRITIC_MAP
  } from '$lib/utils/greekKeyboard.js';

  export let vocab = [];   // filtered intro vocab entries: { greek, pos, definition, ... }

  let fullDeck = [];
  let deck = [];
  let pos = 0;
  let showEnglish = true;
  let typed = '';
  let flash = null;
  let flashTimer = null;
  let hiddenInput;
  let initialized = false;

  $: if (vocab.length && !initialized) {
    initialized = true;
    fullDeck = [...vocab];
    deck = [...vocab];
  }

  $: current   = deck.length ? deck[pos] : null;
  $: remaining = deck.length;

  function focusInput() { setTimeout(() => hiddenInput?.focus(), 50); }

  function goBack() {
    if (!deck.length) return;
    pos = (pos - 1 + deck.length) % deck.length;
    typed = '';
    focusInput();
  }

  function goForward() {
    if (!deck.length) return;
    pos = (pos + 1) % deck.length;
    typed = '';
    focusInput();
  }

  function removeCard() {
    if (!deck.length) return;
    deck = deck.filter((_, i) => i !== pos);
    if (deck.length === 0) { pos = 0; return; }
    if (pos >= deck.length) pos = deck.length - 1;
    typed = '';
    focusInput();
  }

  function resetDeck() {
    deck = [...fullDeck];
    pos = 0;
    typed = '';
    flash = null;
    focusInput();
  }

  function updateTyped(newTyped) {
    typed = newTyped;
    if (!current) return;
    const target = stripGreekDiacritics(processFinalSigma(current.greek.trim()));
    const input  = stripGreekDiacritics(processFinalSigma(typed.trim()));
    if (input.length > 0 && input === target) {
      triggerFlash('correct');
      playAndAdvance();
    }
  }

  function playAndAdvance() {
    const advance = () => { typed = ''; flash = null; goForward(); };
    if (current?.audio_greek_url) {
      const a = new Audio(current.audio_greek_url);
      a.addEventListener('ended', advance);
      a.play().catch(() => setTimeout(advance, 400));
    } else {
      setTimeout(advance, 500);
    }
  }

  function playAll() {
    if (!current?.audio_greek_url) return;
    const gr = new Audio(current.audio_greek_url);
    gr.addEventListener('ended', () => {
      if (current?.audio_en_url) new Audio(current.audio_en_url).play().catch(() => {});
    });
    gr.play().catch(() => {});
  }

  function triggerFlash(type) {
    if (flashTimer) clearTimeout(flashTimer);
    flash = type;
    flashTimer = setTimeout(() => { flash = null; }, 400);
  }

  function handleKeydown(e) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); goForward(); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); removeCard(); return; }

    const SKIP = ['Tab','Escape','ArrowUp','Enter','Delete',
      'Control','Shift','Alt','Meta',
      'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];
    if (SKIP.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();

    if (e.key === 'Backspace') {
      updateTyped([...typed].slice(0, -1).join(''));
      return;
    }
    if (e.key in DIACRITIC_MAP) {
      updateTyped(applyDiacritic(typed, e.key));
      return;
    }
    const greek = keyToGreek(e.key);
    if (!greek) return;
    const t = ' .,:'.includes(greek) ? processFinalSigma(typed) : typed;
    updateTyped(t + greek);
  }

  function handleInput(e) {
    const char = e.data;
    hiddenInput.value = '';
    if (!char) return;
    if (/[Ͱ-Ͽἀ-῿]/u.test(char)) { updateTyped(typed + char); return; }
    const greek = keyToGreek(char);
    if (greek) updateTyped(typed + greek);
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    hiddenInput?.focus();
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    if (flashTimer) clearTimeout(flashTimer);
  });
</script>

<input
  bind:this={hiddenInput}
  class="hidden-input"
  type="text"
  inputmode="text"
  autocomplete="off"
  autocorrect="off"
  autocapitalize="none"
  spellcheck="false"
  on:input={handleInput}
/>

<div class="deck-wrapper" on:click={focusInput} role="presentation">

  {#if deck.length === 0}
    <div class="done-screen">
      <div class="done-check">✓</div>
      <div class="done-msg">All {fullDeck.length} words removed!</div>
      <button class="reset-btn" on:click={resetDeck}>Start over</button>
    </div>

  {:else}
    <!-- Toolbar -->
    <div class="toolbar">
      <span class="remaining-count">{remaining} / {fullDeck.length}</span>
      <div class="toolbar-right">
        <button class="tool-btn" on:click={() => { showEnglish = !showEnglish; focusInput(); }}>
          {showEnglish ? 'Hide English' : 'Show English'}
        </button>
        <button class="tool-btn reset" on:click={resetDeck}>Reset</button>
      </div>
    </div>

    <!-- Flash card -->
    <div class="flash-card" class:flash-correct={flash === 'correct'}>
      <!-- Greek word + play button -->
      <div class="greek-word-row">
        <div class="greek-word">{current.greek}</div>
        {#if current.audio_greek_url}
          <button class="play-btn" on:click|stopPropagation={playAll} title="Play Greek then English">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
        {/if}
      </div>

      <!-- POS tag -->
      <div class="pos-tag">{current.pos}{current.governs ? ' ' + current.governs : ''}</div>

      <!-- English definition -->
      {#if showEnglish}
        <div class="english-def">{current.definition}</div>
      {:else}
        <div class="english-hidden">— hidden —</div>
      {/if}

      <!-- Typing area -->
      <div class="type-area">
        <div class="typed-display">{typed}<span class="cursor">|</span></div>
      </div>
    </div>

    <!-- Navigation -->
    <div class="nav-row">
      <button class="nav-btn" on:click={goBack} title="Previous (←)">←</button>
      <button class="nav-btn remove-btn" on:click={removeCard} title="Remove from deck (↓)">↓</button>
      <button class="nav-btn" on:click={goForward} title="Next (→)">→</button>
    </div>

    <div class="key-hint">← → navigate · ↓ remove · type to match</div>
  {/if}

</div>

<style>
  .hidden-input {
    position: fixed;
    top: 0; left: 0;
    width: 1px; height: 1px;
    opacity: 0; border: none; padding: 0; margin: 0;
    outline: none; caret-color: transparent;
    background: transparent; color: transparent;
  }

  .deck-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem 1rem;
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 440px;
  }

  .remaining-count {
    font-size: 0.85rem;
    color: #9ca3af;
    font-weight: 500;
  }

  .toolbar-right {
    display: flex;
    gap: 0.5rem;
  }

  .tool-btn {
    font-size: 0.78rem;
    color: #6b7280;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    padding: 0.25em 0.75em;
    cursor: pointer;
    transition: all 0.1s;
  }

  .tool-btn:hover { background: #f9fafb; border-color: #d1d5db; }
  .tool-btn.reset { color: #ef4444; border-color: #fecaca; }
  .tool-btn.reset:hover { background: #fef2f2; }

  /* Flash card */
  .flash-card {
    width: 100%;
    max-width: 440px;
    background: white;
    border-radius: 1.25rem;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    padding: 2.5rem 2rem 1.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    text-align: center;
    transition: background 0.15s;
    min-height: 280px;
  }

  .flash-card.flash-correct { background: #d1fae5; }

  .greek-word-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .greek-word {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 4.5rem;
    line-height: 1.15;
    color: #1e293b;
    user-select: text;
  }

  .play-btn {
    flex-shrink: 0;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    border: 1.5px solid #e2e8f0;
    background: white;
    color: #6366f1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.1s;
    padding: 0;
    margin-top: 0.5rem;
  }

  .play-btn:hover { background: #eef2ff; border-color: #a5b4fc; }

  .pos-tag {
    font-size: 0.75rem;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }

  .english-def {
    font-size: 1.25rem;
    font-weight: 600;
    color: #374151;
    line-height: 1.4;
    margin-top: 0.25rem;
  }

  .english-hidden {
    font-size: 0.9rem;
    color: #d1d5db;
    font-style: italic;
    margin-top: 0.25rem;
  }

  .type-area {
    width: 100%;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #f1f5f9;
  }

  .typed-display {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 2.25rem;
    color: #1e293b;
    min-height: 3rem;
    text-align: center;
  }

  .cursor {
    opacity: 0.35;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 0.35; }
    50%       { opacity: 0; }
  }

  /* Navigation */
  .nav-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .nav-btn {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    border: 1.5px solid #e2e8f0;
    background: white;
    font-size: 1.2rem;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s;
  }

  .nav-btn:hover    { background: #f1f5f9; border-color: #cbd5e1; }
  .remove-btn       { border-color: #fecaca; color: #ef4444; font-size: 1rem; }
  .remove-btn:hover { background: #fef2f2; }

  .key-hint {
    font-size: 0.72rem;
    color: #d1d5db;
    text-align: center;
    margin-top: -0.5rem;
  }

  /* Done state */
  .done-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 3rem 1rem;
  }

  .done-check {
    font-size: 3rem;
    color: #16a34a;
  }

  .done-msg {
    font-size: 1.1rem;
    font-weight: 600;
    color: #374151;
  }

  .reset-btn {
    padding: 0.5em 1.5em;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 999px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .reset-btn:hover { background: #4f46e5; }
</style>

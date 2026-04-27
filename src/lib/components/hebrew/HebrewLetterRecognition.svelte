<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToHebrew } from '$lib/utils/hebrewKeyboard.js';

  export let alphabet = [];
  export let showQwertyHint = true;

  // sub-modes: 'letter-name' | 'sofit'
  let subMode = 'letter-name';

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── Letter-name mode ──────────────────────────────────────────────
  // Show the Hebrew char, pick its English name from 4 tiles.
  let lnDeck = [];
  let lnRemaining = [];
  let lnTarget = null;   // alphabet entry
  let lnTiles = [];      // 4 alphabet entries (tiles show name_en)
  let lnFlash = {};
  let lnFlashTimers = {};
  let lnDone = false;
  let lnTotal = 0;
  let lnStarted = false;

  $: if (alphabet.length && !lnStarted && subMode === 'letter-name') {
    lnStarted = true;
    buildLnDeck();
  }

  function buildLnDeck() {
    lnDeck = shuffle([...alphabet]);
    lnTotal = lnDeck.length;
    lnRemaining = [...lnDeck];
    lnDone = false;
    lnFlash = {};
    lnPickRound();
  }

  function lnPickRound() {
    if (lnRemaining.length === 0) { lnDone = true; lnTarget = null; lnTiles = []; return; }
    lnTarget = lnRemaining[0];
    const pool = shuffle(alphabet.filter(l => l.id !== lnTarget.id));
    lnTiles = shuffle([lnTarget, ...pool.slice(0, 3)]);
    lnFlash = {};
  }

  function lnHandleTile(tile, idx) {
    if (!lnTarget || lnFlash[idx] === 'correct') return;
    if (tile.id === lnTarget.id) {
      lnSetFlash(idx, 'correct');
      lnRemaining = lnRemaining.slice(1);
      setTimeout(lnPickRound, 600);
    } else {
      lnSetFlash(idx, 'wrong');
    }
    setTimeout(() => hiddenInput?.focus(), 0);
  }

  function lnSetFlash(idx, type) {
    lnFlash = { ...lnFlash, [idx]: type };
    if (lnFlashTimers[idx]) clearTimeout(lnFlashTimers[idx]);
    lnFlashTimers[idx] = setTimeout(() => { lnFlash = { ...lnFlash, [idx]: null }; }, 400);
  }

  // ── Sofit mode ────────────────────────────────────────────────────
  // Show a sofit (final) form; pick which base letter it belongs to.
  $: sofitLetters = alphabet.filter(l => l.sofit_char != null);

  let sfDeck = [];
  let sfRemaining = [];
  let sfTarget = null;   // alphabet entry (has sofit_char)
  let sfTiles = [];      // 4 alphabet entries (tiles show name_en of base letter)
  let sfFlash = {};
  let sfFlashTimers = {};
  let sfDone = false;
  let sfTotal = 0;
  let sfStarted = false;

  $: if (sofitLetters.length && !sfStarted && subMode === 'sofit') {
    sfStarted = true;
    buildSfDeck();
  }

  function buildSfDeck() {
    sfDeck = shuffle([...sofitLetters]);
    sfTotal = sfDeck.length;
    sfRemaining = [...sfDeck];
    sfDone = false;
    sfFlash = {};
    sfPickRound();
  }

  function sfPickRound() {
    if (sfRemaining.length === 0) { sfDone = true; sfTarget = null; sfTiles = []; return; }
    sfTarget = sfRemaining[0];
    const pool = shuffle(alphabet.filter(l => l.id !== sfTarget.id));
    sfTiles = shuffle([sfTarget, ...pool.slice(0, 3)]);
    sfFlash = {};
  }

  function sfHandleTile(tile, idx) {
    if (!sfTarget || sfFlash[idx] === 'correct') return;
    if (tile.id === sfTarget.id) {
      sfSetFlash(idx, 'correct');
      sfRemaining = sfRemaining.slice(1);
      setTimeout(sfPickRound, 600);
    } else {
      sfSetFlash(idx, 'wrong');
    }
    setTimeout(() => hiddenInput?.focus(), 0);
  }

  function sfSetFlash(idx, type) {
    sfFlash = { ...sfFlash, [idx]: type };
    if (sfFlashTimers[idx]) clearTimeout(sfFlashTimers[idx]);
    sfFlashTimers[idx] = setTimeout(() => { sfFlash = { ...sfFlash, [idx]: null }; }, 400);
  }

  // Strip combining marks for loose char comparison
  function baseOnly(str) {
    return (str ?? '').normalize('NFD').replace(/[֑-ׇ]/g, '');
  }

  // ── Keyboard: number keys 1–4 or mapped QWERTY key selects tile ───
  function handleKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // Number key: select tile by position
    const n = parseInt(e.key);
    if (n >= 1 && n <= 4) {
      e.preventDefault();
      if (subMode === 'letter-name' && lnTiles[n - 1]) lnHandleTile(lnTiles[n - 1], n - 1);
      if (subMode === 'sofit'       && sfTiles[n - 1]) sfHandleTile(sfTiles[n - 1], n - 1);
      return;
    }

    // QWERTY key: find the tile whose letter matches the typed Hebrew char
    const hebrew = keyToHebrew(e.key);
    if (!hebrew) return;
    e.preventDefault();

    if (subMode === 'letter-name' && lnTarget) {
      const idx = lnTiles.findIndex(t => baseOnly(t.char) === baseOnly(hebrew));
      if (idx !== -1) lnHandleTile(lnTiles[idx], idx);
    }
    if (subMode === 'sofit' && sfTarget) {
      const idx = sfTiles.findIndex(t => baseOnly(t.char) === baseOnly(hebrew));
      if (idx !== -1) sfHandleTile(sfTiles[idx], idx);
    }
  }

  function switchSubMode(m) {
    subMode = m;
    if (m === 'letter-name') { lnStarted = false; lnStarted = true; buildLnDeck(); }
    if (m === 'sofit')       { sfStarted = false; sfStarted = true; buildSfDeck(); }
    hiddenInput?.focus();
  }

  let hiddenInput;

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    hiddenInput?.focus();
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    Object.values(lnFlashTimers).forEach(clearTimeout);
    Object.values(sfFlashTimers).forEach(clearTimeout);
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
/>

<div class="recognition-wrapper" on:click={() => hiddenInput?.focus()} role="presentation">

  <!-- Sub-mode toggle -->
  <div class="submode-row">
    <button class="submode-btn" class:active={subMode === 'letter-name'} on:click={() => switchSubMode('letter-name')}>
      Letter → Name
    </button>
    <button class="submode-btn" class:active={subMode === 'sofit'} on:click={() => switchSubMode('sofit')}>
      Final Forms
    </button>
  </div>

  {#if subMode === 'letter-name'}
    {#if !lnStarted}
      <div class="loading">Loading…</div>

    {:else if lnDone}
      <div class="done-screen">
        <div class="done-check">✓</div>
        <div class="done-message">All {lnTotal} letters!</div>
        <button class="restart-btn" on:click={() => buildLnDeck()}>Try again</button>
      </div>

    {:else if lnTarget}
      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" style="width:{((lnTotal - lnRemaining.length) / lnTotal) * 100}%"></div>
        </div>
        <span class="progress-text">{lnTotal - lnRemaining.length} / {lnTotal}</span>
      </div>

      <div class="prompt-label">What is this letter called?</div>

      <div class="target-area">
        <div class="target-char" dir="rtl">{lnTarget.char}</div>
      </div>

      <div class="tile-grid">
        {#each lnTiles as tile, i}
          <button
            class="tile"
            class:flash-correct={lnFlash[i] === 'correct'}
            class:flash-wrong={lnFlash[i] === 'wrong'}
            on:click={() => lnHandleTile(tile, i)}
            aria-label={tile.name_en}
          >
            <div class="tile-name">{tile.name_en}</div>
            {#if showQwertyHint}
              <div class="tile-key-row">
                <kbd>{i + 1}</kbd>
              </div>
            {/if}
          </button>
        {/each}
      </div>

      <div class="key-hint">Press 1–4, the letter's key, or click</div>
    {/if}

  {:else if subMode === 'sofit'}
    {#if !sfStarted || sofitLetters.length === 0}
      <div class="loading">Loading…</div>

    {:else if sfDone}
      <div class="done-screen">
        <div class="done-check">✓</div>
        <div class="done-message">All {sfTotal} final forms!</div>
        <button class="restart-btn" on:click={() => buildSfDeck()}>Try again</button>
      </div>

    {:else if sfTarget}
      <div class="progress-row">
        <div class="progress-track">
          <div class="progress-fill" style="width:{((sfTotal - sfRemaining.length) / sfTotal) * 100}%"></div>
        </div>
        <span class="progress-text">{sfTotal - sfRemaining.length} / {sfTotal}</span>
      </div>

      <div class="prompt-label">Which letter is this final form?</div>

      <div class="target-area">
        <div class="target-char" dir="rtl">{sfTarget.sofit_char}</div>
        <div class="target-sublabel">סוֹפִית — final form</div>
      </div>

      <div class="tile-grid">
        {#each sfTiles as tile, i}
          <button
            class="tile"
            class:flash-correct={sfFlash[i] === 'correct'}
            class:flash-wrong={sfFlash[i] === 'wrong'}
            on:click={() => sfHandleTile(tile, i)}
            aria-label={tile.name_en}
          >
            <div class="tile-char-sm" dir="rtl">{tile.char}</div>
            <div class="tile-name tile-name-sm">{tile.name_en}</div>
            {#if showQwertyHint}
              <div class="tile-key-row">
                <kbd>{i + 1}</kbd>
              </div>
            {/if}
          </button>
        {/each}
      </div>

      <div class="key-hint">Press 1–4, the letter's key, or click</div>
    {/if}
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

  .recognition-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem 1rem;
  }

  .loading {
    color: #9ca3af;
    font-size: 1rem;
    padding: 3rem;
  }

  .submode-row {
    display: flex;
    gap: 0.35rem;
    background: #f1f5f9;
    padding: 0.25rem;
    border-radius: 999px;
  }

  .submode-btn {
    padding: 0.3em 1.1em;
    border-radius: 999px;
    border: none;
    background: transparent;
    font-size: 0.85rem;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }

  .submode-btn.active {
    background: white;
    color: #4338ca;
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 360px;
  }

  .progress-track {
    flex: 1;
    height: 6px;
    background: #e5e7eb;
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #6366f1;
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.75rem;
    color: #9ca3af;
    white-space: nowrap;
  }

  .prompt-label {
    font-size: 0.8rem;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    margin-bottom: -0.5rem;
  }

  .target-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .target-char {
    font-family: "Noto Sans Hebrew", "SBL Hebrew", "Times New Roman", serif;
    font-size: 7rem;
    line-height: 1.2;
    color: #1e293b;
    user-select: none;
    min-height: 9rem;
    display: flex;
    align-items: center;
  }

  .target-sublabel {
    font-size: 0.75rem;
    color: #9ca3af;
    margin-top: -0.5rem;
  }

  .tile-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .tile {
    width: 150px;
    min-height: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 0.5rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 1rem;
    cursor: pointer;
    transition: all 0.1s;
    gap: 0.3rem;
  }

  .tile:hover { border-color: #a5b4fc; background: #f5f3ff; }
  .tile.flash-correct { background: #d1fae5; border-color: #34d399; }
  .tile.flash-wrong   { background: #fee2e2; border-color: #f87171; }

  .tile-name {
    font-size: 1rem;
    font-weight: 600;
    color: #1e293b;
    text-align: center;
    user-select: none;
  }

  .tile-name-sm {
    font-size: 0.85rem;
  }

  .tile-char-sm {
    font-family: "Noto Sans Hebrew", "SBL Hebrew", "Times New Roman", serif;
    font-size: 2.2rem;
    color: #1e293b;
    user-select: none;
    line-height: 1.3;
  }

  .tile-key-row {
    margin-top: 0.2rem;
  }

  kbd {
    display: inline-block;
    padding: 0.15em 0.5em;
    font-size: 0.8rem;
    font-family: monospace;
    color: #374151;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  .key-hint {
    font-size: 0.72rem;
    color: #d1d5db;
    margin-top: -0.5rem;
  }

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

  .done-message {
    font-size: 1.1rem;
    font-weight: 600;
    color: #374151;
  }

  .restart-btn {
    padding: 0.5em 1.5em;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 999px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .restart-btn:hover { background: #4f46e5; }
</style>

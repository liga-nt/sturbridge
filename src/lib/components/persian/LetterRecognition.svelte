<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToPersian } from '$lib/utils/persianKeyboard.js';

  export let alphabet = [];
  export let letterForms = [];
  export let showQwertyHint = true;

  function buildDeck(forms) {
    const entries = [];
    for (const letter of forms) {
      for (const form of letter.forms) {
        entries.push({
          letterId:   letter.id,
          char:       letter.char,
          qwerty_key: letter.qwerty_key,
          label:      form.label,
          text:       form.text,
          audio_url:  form.audio_url,
        });
      }
    }
    return entries;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let fullDeck = [];
  let remaining = [];
  let target = null;
  let tiles = [];
  let flash = {};
  let flashTimers = {};
  let done = false;
  let total = 0;
  let started = false;

  $: if (letterForms.length && alphabet.length && !started) {
    started = true;
    fullDeck = buildDeck(letterForms);
    total = fullDeck.length;
    remaining = shuffle([...fullDeck]);
    pickRound();
  }

  function pickRound() {
    if (remaining.length === 0) { done = true; target = null; tiles = []; return; }
    target = remaining[0];
    const pool = shuffle(alphabet.filter(l => l.id !== target.letterId));
    const targetAlph = alphabet.find(l => l.id === target.letterId);
    tiles = shuffle([targetAlph, ...pool.slice(0, 3)]);
    flash = {};
    if (target.audio_url) new Audio(target.audio_url).play().catch(() => {});
  }

  function playTarget() {
    if (target?.audio_url) new Audio(target.audio_url).play().catch(() => {});
  }

  function restart() {
    done = false;
    remaining = shuffle([...fullDeck]);
    pickRound();
  }

  function handleTile(tile, idx) {
    if (!target || flash[idx] === 'correct') return;
    if (tile.id === target.letterId) {
      setFlash(idx, 'correct');
      remaining = remaining.slice(1);
      setTimeout(pickRound, 600);
    } else {
      setFlash(idx, 'wrong');
    }
    setTimeout(() => hiddenInput?.focus(), 0);
  }

  function handleKey(e) {
    if (!target || done) return;
    if (['Tab','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
         'Enter','Backspace','Delete','Control','Shift','Alt','Meta'].includes(e.key)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    const persian = keyToPersian(e.key);
    if (!persian) return;
    const idx = tiles.findIndex(t => t.char === persian);
    if (idx !== -1) handleTile(tiles[idx], idx);
  }

  function setFlash(index, type) {
    flash = { ...flash, [index]: type };
    if (flashTimers[index]) clearTimeout(flashTimers[index]);
    flashTimers[index] = setTimeout(() => { flash = { ...flash, [index]: null }; }, 400);
  }

  let hiddenInput;
  function focusInput() { hiddenInput?.focus(); }

  function handleInput(e) {
    const char = e.data;
    if (!char || !target) return;
    hiddenInput.value = '';
    const persian = /[\u0600-\u06FF]/.test(char) ? char : keyToPersian(char);
    if (!persian) return;
    const idx = tiles.findIndex(t => t.char === persian);
    if (idx !== -1) handleTile(tiles[idx], idx);
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    hiddenInput?.focus();
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    Object.values(flashTimers).forEach(clearTimeout);
  });

  const FORM_LABELS = {
    isolated:          'Isolated',
    initial:           'Initial',
    medial:            'Medial',
    final:             'Final',
    'after-connector': 'After ◌',
  };

  const LABEL_COLORS = {
    isolated:          '#6366f1',
    initial:           '#0ea5e9',
    medial:            '#f59e0b',
    final:             '#10b981',
    'after-connector': '#8b5cf6',
  };
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

<div class="recognition-wrapper" on:click={focusInput} role="presentation">
  {#if !started}
    <div class="loading">Loading…</div>

  {:else if done}
    <div class="done-screen">
      <div class="done-check">✓</div>
      <div class="done-message">All {total} forms recognized!</div>
      <button class="restart-btn" on:click={restart}>Try again</button>
    </div>

  {:else if target}
    <!-- Progress -->
    <div class="progress-row">
      <div class="progress-track">
        <div class="progress-fill" style="width:{((total - remaining.length) / total) * 100}%"></div>
      </div>
      <span class="progress-text">{total - remaining.length} / {total}</span>
    </div>

    <!-- Target form display -->
    <div class="target-area">
      <div
        class="form-badge"
        style="background:{LABEL_COLORS[target.label]}18; color:{LABEL_COLORS[target.label]}; border-color:{LABEL_COLORS[target.label]}"
      >
        {FORM_LABELS[target.label] ?? target.label}
      </div>
      <div class="target-display" dir="rtl">{target.text}</div>
      <button class="replay-btn" on:click={playTarget} title="Replay audio">↻</button>
    </div>

    <!-- 4 tiles -->
    <div class="tile-grid">
      {#each tiles as tile, i}
        <button
          class="tile"
          class:flash-correct={flash[i] === 'correct'}
          class:flash-wrong={flash[i] === 'wrong'}
          on:click={() => handleTile(tile, i)}
          aria-label={tile.name_en}
        >
          <span class="tile-char" dir="rtl">{tile.char}</span>
          {#if showQwertyHint}
            <kbd class="tile-key">{tile.qwerty_key}</kbd>
          {/if}
        </button>
      {/each}
    </div>
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
    gap: 1.75rem;
    padding: 2rem 1rem;
  }

  .loading {
    color: #9ca3af;
    font-size: 1rem;
    padding: 3rem;
  }

  /* Progress */
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

  /* Target */
  .target-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .form-badge {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 0.2em 0.85em;
    border-radius: 999px;
    border: 1.5px solid;
  }

  .target-display {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 6rem;
    line-height: 1.1;
    color: #1e293b;
    user-select: none;
  }

  .replay-btn {
    font-size: 0.85rem;
    color: #6366f1;
    background: #eef2ff;
    border: none;
    border-radius: 999px;
    padding: 0.2em 0.85em;
    cursor: pointer;
  }

  .replay-btn:hover { background: #e0e7ff; }

  /* Tiles */
  .tile-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .tile {
    width: 140px;
    min-height: 140px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem 0;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 1rem;
    cursor: pointer;
    transition: all 0.1s;
  }

  .tile:hover { border-color: #a5b4fc; background: #f5f3ff; }
  .tile.flash-correct { background: #d1fae5; border-color: #34d399; }
  .tile.flash-wrong   { background: #fee2e2; border-color: #f87171; }

  .tile-char {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 5rem;
    line-height: 1;
    color: #1e293b;
    user-select: none;
  }

  .tile-key {
    display: block;
    margin-top: 0.4rem;
    padding: 0.2em 0.5em;
    font-size: 0.85rem;
    font-family: monospace;
    color: #374151;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  /* Done screen */
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

<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToGreek } from '$lib/utils/greekKeyboard.js';

  export let alphabet = [];
  export let showQwertyHint = true;

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Deck: alternate uppercase→lowercase and lowercase→uppercase rounds
  let deck = [];
  let remaining = [];
  let target = null;    // { letter, showUpper }
  let tiles = [];       // array of alphabet letter objects
  let flash = {};
  let flashTimers = {};
  let done = false;
  let total = 0;
  let started = false;

  $: if (alphabet.length && !started) {
    started = true;
    buildDeck();
  }

  function buildDeck() {
    const rounds = [];
    for (const letter of alphabet) {
      rounds.push({ letter, showUpper: true });   // show uppercase, pick lowercase
      rounds.push({ letter, showUpper: false });  // show lowercase, pick uppercase
    }
    deck = shuffle(rounds);
    total = deck.length;
    remaining = [...deck];
    done = false;
    flash = {};
    pickRound();
  }

  function pickRound() {
    if (remaining.length === 0) { done = true; target = null; tiles = []; return; }
    target = remaining[0];
    const pool = shuffle(alphabet.filter(l => l.id !== target.letter.id));
    tiles = shuffle([target.letter, ...pool.slice(0, 3)]);
    flash = {};
  }

  function restart() {
    started = false;
    started = true;
    buildDeck();
  }

  function handleTile(tile, idx) {
    if (!target || flash[idx] === 'correct') return;
    if (tile.id === target.letter.id) {
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
    const greek = keyToGreek(e.key);
    if (!greek) return;
    const idx = tiles.findIndex(t => t.char_lower === greek);
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
    const greek = /[Ͱ-Ͽἀ-῿]/.test(char) ? char : keyToGreek(char);
    if (!greek) return;
    const idx = tiles.findIndex(t => t.char_lower === greek);
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
      <div class="done-message">All {total} rounds!</div>
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

    <!-- Prompt label -->
    <div class="prompt-label">
      {target.showUpper ? 'Find the lowercase form' : 'Find the uppercase form'}
    </div>

    <!-- Target display: show the form student must match -->
    <div class="target-area">
      <div class="target-display">
        {target.showUpper ? target.letter.char_upper : target.letter.char_lower}
      </div>
    </div>

    <!-- 4 tiles: each shows both forms of a letter -->
    <div class="tile-grid">
      {#each tiles as tile, i}
        <button
          class="tile"
          class:flash-correct={flash[i] === 'correct'}
          class:flash-wrong={flash[i] === 'wrong'}
          on:click={() => handleTile(tile, i)}
          aria-label="{tile.name_en}"
        >
          <div class="tile-char">
            {target.showUpper ? tile.char_lower : tile.char_upper}
          </div>
          {#if showQwertyHint}
            <kbd class="tile-key">{tile.qwerty_key}</kbd>
          {/if}
        </button>
      {/each}
    </div>

    <div class="key-hint">Press the QWERTY key or click the tile</div>
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
  }

  .target-display {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 6rem;
    line-height: 1.1;
    color: #1e293b;
    user-select: none;
  }

  .tile-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .tile {
    width: 150px;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem 0.5rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 1rem;
    cursor: pointer;
    transition: all 0.1s;
    gap: 0.4rem;
  }

  .tile:hover { border-color: #a5b4fc; background: #f5f3ff; }
  .tile.flash-correct { background: #d1fae5; border-color: #34d399; }
  .tile.flash-wrong   { background: #fee2e2; border-color: #f87171; }

  .tile-char {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 2.8rem;
    color: #1e293b;
    user-select: none;
    line-height: 1.1;
  }

  .tile-key {
    display: block;
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

<script>
  import { onDestroy } from 'svelte';

  export let alphabet = [];
  export let hintKeys = []; // kept for interface compat; never set internally

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let deck = [];
  let remaining = [];
  let target = null;
  let tiles = [];
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
      rounds.push({ letter, showUpper: true });
      rounds.push({ letter, showUpper: false });
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
      if (target.letter.audio_url) new Audio(target.letter.audio_url).play().catch(() => {});
      setFlash(idx, 'correct');
      remaining = remaining.slice(1);
      setTimeout(pickRound, 600);
    } else {
      setFlash(idx, 'wrong');
    }
  }

  function setFlash(index, type) {
    flash = { ...flash, [index]: type };
    if (flashTimers[index]) clearTimeout(flashTimers[index]);
    flashTimers[index] = setTimeout(() => { flash = { ...flash, [index]: null }; }, 400);
  }

  onDestroy(() => Object.values(flashTimers).forEach(clearTimeout));
</script>

<div class="recognition-wrapper">
  {#if !started}
    <div class="loading">Loading…</div>

  {:else if done}
    <div class="done-screen">
      <div class="done-check">✓</div>
      <div class="done-message">All {total} rounds!</div>
      <button class="restart-btn" on:click={restart}>Try again</button>
    </div>

  {:else if target}
    <div class="progress-row">
      <div class="progress-track">
        <div class="progress-fill" style="width:{((total - remaining.length) / total) * 100}%"></div>
      </div>
      <span class="progress-text">{total - remaining.length} / {total}</span>
    </div>

    <div class="prompt-label">
      {target.showUpper ? 'Find the lowercase form' : 'Find the uppercase form'}
    </div>

    <div class="target-area">
      <div class="target-display">
        {target.showUpper ? target.letter.char_upper : target.letter.char_lower}
      </div>
    </div>

    <div class="tile-grid">
      {#each tiles as tile, i}
        <button
          class="tile"
          class:flash-correct={flash[i] === 'correct'}
          class:flash-wrong={flash[i] === 'wrong'}
          on:click={() => handleTile(tile, i)}
          aria-label={tile.name_en}
        >
          <div class="tile-char">
            {target.showUpper ? tile.char_lower : tile.char_upper}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
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
    align-items: center;
    justify-content: center;
    padding: 1rem 0.5rem;
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
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 2.8rem;
    color: #1e293b;
    user-select: none;
    line-height: 1.1;
  }

  .done-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 3rem 1rem;
  }

  .done-check { font-size: 3rem; color: #16a34a; }

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

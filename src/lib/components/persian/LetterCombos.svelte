<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToPersian, persianToQwerty } from '$lib/utils/persianKeyboard.js';
  import { playUrl } from '$lib/utils/persianAudio.js';

  export let combos = [];
  export let showQwertyHint = true;

  let comboLength = 2;
  let showSeparated = false;
  let currentCombo = null;
  let typed = [];
  let flash = null;
  let flashTimer = null;
  let deck = [];   // shuffled queue; refills when empty
  let seen = 0;   // combos completed in current deck pass

  $: available = combos.filter(c => c.length === comboLength);

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickCombo() {
    if (available.length === 0) return;
    if (deck.length === 0) {
      deck = shuffle(available);
      seen = 0;
    }
    currentCombo = deck.pop();
    seen++;
    typed = [];
    flash = null;
  }

  function handleKey(e) {
    if (!currentCombo) return;
    if (['Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
         'Enter', 'Backspace', 'Delete', 'Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();

    const persian = keyToPersian(e.key);
    if (!persian) return;

    const expected = currentCombo.text[typed.length];
    if (persian === expected) {
      typed = [...typed, persian];
      if (typed.length === currentCombo.text.length) {
        if (currentCombo.audio_url) playUrl(currentCombo.audio_url);
        setTimeout(pickCombo, 600);
      }
    } else {
      triggerFlash('wrong');
      typed = [];
    }
  }

  function triggerFlash(type) {
    if (flashTimer) clearTimeout(flashTimer);
    flash = type;
    flashTimer = setTimeout(() => { flash = null; }, 400);
  }

  function setLength(len) {
    comboLength = len;
    deck = [];
    pickCombo();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    pickCombo();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    if (flashTimer) clearTimeout(flashTimer);
  });
</script>

<div class="combos-wrapper">
  <!-- Length toggle -->
  <div class="length-toggle">
    {#each [2, 3] as len}
      <button
        class="len-btn"
        class:active={comboLength === len}
        on:click={() => setLength(len)}
      >
        {len} letters
        <span class="count">({combos.filter(c => c.length === len).length})</span>
      </button>
    {/each}
    <button
      class="len-btn"
      class:active={showSeparated}
      on:click={() => showSeparated = !showSeparated}
    >
      separated
    </button>
  </div>

  <!-- Progress through current deck pass -->
  {#if available.length > 0}
    <div class="deck-progress">{seen} / {available.length}</div>
  {/if}

  <!-- Combo display — full text in one element so shaping engine connects letters -->
  {#if currentCombo}
    <div
      class="combo-display"
      class:flash-wrong={flash === 'wrong'}
      class:flash-correct={typed.length === currentCombo.text.length}
      dir="rtl"
    >
      {#if showSeparated}
        <span class="combo-text separated">
          {#each Array.from(currentCombo.text) as char}
            <span>{char}</span>
          {/each}
        </span>
      {:else}
        <span class="combo-text">{currentCombo.text}</span>
      {/if}
    </div>

    <!-- Progress dots (one per character) -->
    <div class="typed-progress">
      {#each Array.from(currentCombo.text) as _, i}
        <span class="progress-dot" class:filled={i < typed.length}></span>
      {/each}
    </div>

    <!-- QWERTY key sequence -->
    {#if showQwertyHint}
      <div class="key-sequence">
        {#each Array.from(currentCombo.text) as char}
          <kbd>{persianToQwerty(char) ?? '?'}</kbd>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .combos-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    padding: 2rem 1rem;
  }

  .length-toggle {
    display: flex;
    gap: 0.5rem;
  }

  .len-btn {
    padding: 0.4em 1em;
    border-radius: 999px;
    border: 1.5px solid #e5e7eb;
    background: white;
    font-size: 0.85rem;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.1s;
  }

  .len-btn.active {
    background: #eef2ff;
    border-color: #818cf8;
    color: #4338ca;
    font-weight: 600;
  }

  .count {
    font-size: 0.75rem;
    color: #9ca3af;
    font-weight: 400;
    margin-left: 0.2em;
  }

  .deck-progress {
    font-size: 0.8rem;
    color: #9ca3af;
    margin-top: -1rem;
  }

  .combo-display {
    padding: 2rem 2.5rem;
    background: white;
    border-radius: 1.25rem;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    transition: background 0.15s;
    min-width: 160px;
    text-align: center;
  }

  .combo-display.flash-wrong {
    background: #fee2e2;
  }

  .combo-display.flash-correct {
    background: #d1fae5;
  }

  .combo-text {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 5rem;
    line-height: 1;
    color: #1e293b;
    user-select: none;
  }

  .combo-text.separated {
    display: flex;
    flex-direction: row;
    justify-content: center;
    gap: 0.5rem;
  }

  .combo-text.separated span {
    display: inline-block;
  }

  .typed-progress {
    display: flex;
    gap: 0.5rem;
  }

  .progress-dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: #e5e7eb;
    transition: background 0.1s;
  }

  .progress-dot.filled {
    background: #16a34a;
  }

  .key-sequence {
    display: flex;
    gap: 0.35rem;
  }

  kbd {
    display: inline-block;
    padding: 0.2em 0.5em;
    font-size: 0.85rem;
    font-family: monospace;
    color: #374151;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }
</style>

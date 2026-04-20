<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToPersian, persianToQwerty } from '$lib/utils/persianKeyboard.js';

  export let letterForms = [];
  export let showQwertyHint = true;
  export let showRomanization = true;

  // Build a flat deck of { letterId, name_en, transliteration, label, text, audio_url }
  $: deck = buildDeck(letterForms);

  function buildDeck(forms) {
    const entries = [];
    for (const letter of forms) {
      for (const form of letter.forms) {
        entries.push({
          letterId:      letter.id,
          name_en:       letter.name_en,
          transliteration: letter.transliteration,
          qwerty_key:    letter.qwerty_key,
          is_connector:  letter.is_connector,
          label:         form.label,
          text:          form.text,
          audio_url:     form.audio_url,
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

  let showSeparated = false;
  let queue = [];
  let current = null;
  let flash = null;
  let flashTimer = null;
  let seen = 0;

  function targetIndex(label, text) {
    const n = Array.from(text).length;
    if (n <= 1 || label === 'isolated' || label === 'initial') return 0;
    if (label === 'medial') return Math.floor(n / 2);
    return n - 1;
  }

  $: targetChar = current
    ? Array.from(current.text)[targetIndex(current.label, current.text)]
    : null;

  function refill() {
    queue = shuffle([...deck]);
    seen = 0;
  }

  function next() {
    if (deck.length === 0) return;
    if (queue.length === 0) refill();
    current = queue.pop();
    seen++;
    flash = null;
  }

  function attempt(char) {
    if (!char || !targetChar) return;
    if (char === targetChar) {
      triggerFlash('correct');
      if (current.audio_url) {
        const a = new Audio(current.audio_url);
        a.play().catch(() => {});
      }
      setTimeout(next, 700);
    } else {
      triggerFlash('wrong');
    }
  }

  function handleKey(e) {
    if (!current) return;
    if (['Tab','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
         'Enter','Backspace','Delete','Control','Shift','Alt','Meta'].includes(e.key)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    const persian = keyToPersian(e.key);
    if (persian) attempt(persian);
  }

  function triggerFlash(type) {
    if (flashTimer) clearTimeout(flashTimer);
    flash = type;
    flashTimer = setTimeout(() => { flash = null; }, 400);
  }

  // ── Mobile keyboard support ──────────────────────────────────────
  let hiddenInput;

  function focusInput() {
    hiddenInput?.focus();
  }

  function handleInput(e) {
    const char = e.data;
    if (!char || !current) return;
    hiddenInput.value = '';
    const persian = /[\u0600-\u06FF]/.test(char) ? char : keyToPersian(char);
    if (persian) attempt(persian);
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    hiddenInput?.focus();
    refill();
    next();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    if (flashTimer) clearTimeout(flashTimer);
  });

  const LABEL_NAMES = {
    isolated:        'Isolated',
    initial:         'Initial',
    medial:          'Medial',
    final:           'Final',
    'after-connector': 'After connector',
  };

  const LABEL_COLORS = {
    isolated:        '#6366f1',
    initial:         '#0ea5e9',
    medial:          '#f59e0b',
    final:           '#10b981',
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

<div class="forms-wrapper" on:click={focusInput} role="presentation">
  <!-- Progress + separated toggle -->
  <div class="top-row">
    <div class="deck-progress">{seen} / {deck.length}</div>
    <button class="sep-toggle" class:active={showSeparated} on:click={() => showSeparated = !showSeparated}>
      separated
    </button>
  </div>

  {#if current}
    <!-- Form label badge -->
    <div class="form-label-badge" style="background:{LABEL_COLORS[current.label]}18; color:{LABEL_COLORS[current.label]}; border-color:{LABEL_COLORS[current.label]}">
      {LABEL_NAMES[current.label] ?? current.label}
    </div>

    <!-- Main combo display -->
    <div
      class="combo-card"
      class:flash-correct={flash === 'correct'}
      class:flash-wrong={flash === 'wrong'}
      dir="rtl"
    >
      {#if showSeparated}
        <span class="combo-text sep">
          {#each Array.from(current.text) as char}
            <span>{char}</span>
          {/each}
        </span>
      {:else}
        <span class="combo-text">{current.text}</span>
      {/if}
    </div>

    <!-- Letter info -->
    {#if showRomanization}
      <div class="letter-info">
        <span class="letter-name">{current.name_en}</span>
        <span class="letter-translit">{current.transliteration}</span>
      </div>
    {/if}

    <!-- QWERTY key hint -->
    {#if showQwertyHint && targetChar}
      <div class="key-sequence">
        <kbd>{persianToQwerty(targetChar) ?? '?'}</kbd>
      </div>
    {/if}
  {/if}
</div>

<style>
  .hidden-input {
    position: fixed;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    border: none;
    padding: 0;
    margin: 0;
    outline: none;
    caret-color: transparent;
    background: transparent;
    color: transparent;
  }

  .forms-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem 1rem;
  }

  .top-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .deck-progress {
    font-size: 0.8rem;
    color: #9ca3af;
  }

  .sep-toggle {
    font-size: 0.75rem;
    padding: 0.2em 0.7em;
    border-radius: 999px;
    border: 1.5px solid #e5e7eb;
    background: white;
    color: #6b7280;
    cursor: pointer;
  }

  .sep-toggle.active {
    background: #eef2ff;
    border-color: #818cf8;
    color: #4338ca;
    font-weight: 600;
  }

  .combo-text.sep {
    display: flex;
    flex-direction: row;
    justify-content: center;
    gap: 0.5rem;
  }

  .combo-text.sep span {
    display: inline-block;
  }

  .form-label-badge {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 0.25em 0.9em;
    border-radius: 999px;
    border: 1.5px solid;
  }

  .combo-card {
    padding: 2.5rem 3.5rem;
    background: white;
    border-radius: 1.25rem;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    transition: background 0.15s;
    min-width: 180px;
    text-align: center;
  }

  .combo-card.flash-correct { background: #d1fae5; }
  .combo-card.flash-wrong   { background: #fee2e2; }

  .combo-text {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 5rem;
    line-height: 1;
    color: #1e293b;
    user-select: none;
  }

  .letter-info {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
  }

  .letter-name {
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
  }

  .letter-translit {
    font-size: 0.85rem;
    color: #6b7280;
    font-style: italic;
  }

  .typed-progress {
    display: flex;
    gap: 0.5rem;
  }

  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: #e5e7eb;
    transition: background 0.1s;
  }

  .dot.filled { background: #16a34a; }

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

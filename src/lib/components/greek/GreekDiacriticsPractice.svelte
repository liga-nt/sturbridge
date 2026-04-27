<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToGreek, applyDiacritic, greekToQwerty, DIACRITIC_MAP } from '$lib/utils/greekKeyboard.js';

  export let vocab = [];      // intro vocab entries — deck derived from these
  export let alphabet = [];   // for audio_url lookup by base letter
  export let showQwertyHint = true;

  // Reverse map: combining mark codepoint → keyboard key
  const MARK_TO_KEY = {
    '́': ';',   // acute
    '̀': '`',   // grave
    '̓': '[',   // smooth breathing
    '̔': '⇧[',  // rough breathing (Shift+[)
    '͂': '=',   // circumflex
    'ͅ': '⇧\\', // iota subscript (Shift+\)
    '̈': '⇧\'', // dialytika (Shift+')
  };

function buildDeck(vocab) {
    const seen = new Set();
    const chars = [];
    for (const word of vocab) {
      for (const ch of [...word.greek]) {
        const nfc = ch.normalize('NFC');
        const nfd = [...nfc.normalize('NFD')];
        if (nfd.length > 1 && !seen.has(nfc)) {
          seen.add(nfc);
          chars.push(nfc);
        }
      }
    }
    return shuffle(chars);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Order-independent diacritic match: same base + same set of combining marks
  function diacriticMatch(a, b) {
    if (!a || !b) return false;
    if (a.normalize('NFC') === b.normalize('NFC')) return true;
    const sortedNFD = (s) => {
      const pts = [...s.normalize('NFD')];
      const base  = pts.filter(c => c.codePointAt(0) < 0x0300);
      const marks = pts.filter(c => c.codePointAt(0) >= 0x0300).sort();
      return base.join('') + marks.join('');
    };
    return sortedNFD(a) === sortedNFD(b);
  }

  let deck = [];
  let pos  = 0;
  let typed = '';
  let flash = null;
  let flashTimer = null;
  let done = false;
  let initialized = false;
  let hiddenInput;

  $: if (vocab.length && !initialized) {
    initialized = true;
    deck = buildDeck(vocab);
  }

  $: target = !done && deck.length ? (deck[pos] ?? null) : null;
  $: total  = deck.length;
  $: targetNfd = target ? [...target.normalize('NFD')] : [];
  $: baseChar  = targetNfd[0] ?? null;
  $: marks     = targetNfd.slice(1);
  $: baseKey   = baseChar ? greekToQwerty(baseChar) : null;
  $: audioEntry = baseChar && alphabet.length
    ? alphabet.find(l => l.char_lower === baseChar || l.char_upper === baseChar)
    : null;

  function updateTyped(newTyped) {
    typed = newTyped;
    if (target && diacriticMatch(typed, target)) {
      triggerFlash('correct');
      playAndAdvance();
    }
  }

  function playAndAdvance() {
    const advance = () => {
      typed = '';
      flash = null;
      if (pos < deck.length - 1) {
        pos++;
      } else {
        done = true;
      }
      focusInput();
    };
    if (audioEntry?.audio_url) {
      const a = new Audio(audioEntry.audio_url);
      a.addEventListener('ended', advance);
      a.play().catch(() => setTimeout(advance, 500));
    } else {
      setTimeout(advance, 500);
    }
  }

  function triggerFlash(type) {
    if (flashTimer) clearTimeout(flashTimer);
    flash = type;
    flashTimer = setTimeout(() => { flash = null; }, 400);
  }

  function restart() {
    deck = buildDeck(vocab);
    pos = 0;
    typed = '';
    done = false;
    flash = null;
    focusInput();
  }

  function focusInput() { hiddenInput?.focus(); }

  function handleKeydown(e) {
    if (done || !target) return;
    const SKIP = ['Tab','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
      'Enter','Delete','Control','Shift','Alt','Meta'];
    if (SKIP.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();

    if (e.key === 'Backspace') {
      const nfd = [...typed.normalize('NFD')];
      if (nfd.length > 1) {
        // Remove last combining mark
        nfd.pop();
        updateTyped(nfd.join('').normalize('NFC'));
      } else {
        updateTyped('');
      }
      return;
    }

    if (e.key in DIACRITIC_MAP) {
      if (typed) updateTyped(applyDiacritic(typed, e.key));
      return;
    }

    const greek = keyToGreek(e.key);
    if (greek) updateTyped(greek); // replace — single-char practice
  }

  function handleInput(e) {
    const char = e.data;
    hiddenInput.value = '';
    if (!char || !target) return;
    if (/[Ͱ-Ͽἀ-῿]/u.test(char)) { updateTyped(char); return; }
    const greek = keyToGreek(char);
    if (greek) updateTyped(greek);
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

<div class="diac-wrapper" on:click={focusInput} role="presentation">

  {#if done}
    <div class="done-screen">
      <div class="done-check">✓</div>
      <div class="done-msg">All {total} forms!</div>
      <button class="restart-btn" on:click={restart}>Try again</button>
    </div>

  {:else if target}
    <!-- Progress -->
    <div class="progress-row">
      <div class="progress-track">
        <div class="progress-fill" style="width:{(pos / total) * 100}%"></div>
      </div>
      <span class="progress-text">{pos} / {total}</span>
    </div>

    <!-- Target card -->
    <div class="target-card" class:flash-correct={flash === 'correct'}>
      <div class="target-char">{target}</div>

      {#if showQwertyHint}
        <div class="hint-row">
          {#if baseKey}
            <kbd class="hint-key base-key">{baseKey}</kbd>
          {/if}
          {#each marks as mark}
            {#if MARK_TO_KEY[mark]}
              <span class="hint-plus">+</span>
              <kbd class="hint-key">{MARK_TO_KEY[mark]}</kbd>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Typed display -->
    <div class="typed-row">
      <div class="typed-char">{typed || ' '}</div>
      <span class="cursor-blink">|</span>
    </div>

    <div class="key-hint">Type the base letter, then add diacritics · Backspace removes last mark</div>
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

  .diac-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.75rem;
    padding: 2rem 1rem;
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

  .target-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 2.5rem 3rem;
    background: white;
    border-radius: 1.25rem;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    min-width: 240px;
    transition: background 0.15s;
  }

  .target-card.flash-correct { background: #d1fae5; }

  .target-char {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 7rem;
    line-height: 1.1;
    color: #1e293b;
    user-select: none;
  }

  .hint-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .hint-plus {
    font-size: 1rem;
    color: #d1d5db;
    line-height: 1;
  }

  .hint-key {
    display: inline-block;
    padding: 0.2em 0.55em;
    font-size: 0.85rem;
    font-family: monospace;
    color: #374151;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  .base-key {
    font-size: 1rem;
    padding: 0.25em 0.65em;
  }

.typed-row {
    display: flex;
    align-items: baseline;
    gap: 0.1rem;
    min-height: 5rem;
  }

  .typed-char {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 4rem;
    color: #1e293b;
    min-width: 3rem;
    text-align: center;
    user-select: none;
  }

  .cursor-blink {
    font-size: 2.5rem;
    color: #9ca3af;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 0; }
  }

  .key-hint {
    font-size: 0.72rem;
    color: #d1d5db;
    text-align: center;
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

  .done-msg {
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

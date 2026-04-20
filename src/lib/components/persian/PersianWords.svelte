<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToPersian, persianToQwerty } from '$lib/utils/persianKeyboard.js';
  import { playSequence, playUrl } from '$lib/utils/persianAudio.js';

  export let words = [];
  export let showQwertyHint = true;

  let currentWord = null;
  let typed = [];
  let revealed = false;
  let flash = null;
  let flashTimer = null;

  function pickWord() {
    if (words.length === 0) return;
    currentWord = words[Math.floor(Math.random() * words.length)];
    typed = [];
    revealed = false;
    flash = null;
  }

  function handleKey(e) {
    if (!currentWord || revealed) return;
    if (['Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
         'Enter', 'Backspace', 'Delete', 'Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();

    const persian = keyToPersian(e.key);
    if (!persian) return;

    const expected = currentWord.farsi[typed.length];
    if (persian === expected) {
      typed = [...typed, persian];
      if (typed.length === currentWord.farsi.length) {
        revealed = true;
        playSequence([currentWord.audio_fa_url, currentWord.audio_en_url]);
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

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    pickWord();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    if (flashTimer) clearTimeout(flashTimer);
  });
</script>

<div class="words-wrapper">
  {#if currentWord}
    <div class="word-card" class:flash-wrong={flash === 'wrong'} class:revealed>
      <!-- Full word in one element so Arabic shaping connects letters correctly -->
      <div
        class="farsi-word"
        class:revealed-word={revealed}
        dir="rtl"
      >{currentWord.farsi}</div>

      <!-- Progress dots while typing -->
      {#if !revealed}
        <div class="typed-progress">
          {#each Array.from(currentWord.farsi) as _, i}
            <span class="progress-dot" class:filled={i < typed.length}></span>
          {/each}
        </div>
        {#if showQwertyHint}
          <div class="key-sequence">
            {#each Array.from(currentWord.farsi) as char}
              <kbd>{persianToQwerty(char) ?? '?'}</kbd>
            {/each}
          </div>
        {/if}
      {/if}

      <!-- Reveal: transliteration + English -->
      {#if revealed}
        <div class="reveal-section">
          <div class="translit">{currentWord.transliteration}</div>
          <div class="english">{currentWord.english}</div>
          {#if currentWord.sufi_meaning}
            <div class="sufi-meaning">{currentWord.sufi_meaning}</div>
          {/if}
          <button class="next-btn" on:click={pickWord}>Next word →</button>
        </div>
      {:else}
        <!-- Typing progress dots -->
        <div class="typed-progress" dir="rtl">
          {#each Array.from(currentWord.farsi) as _, i}
            <span class="progress-dot" class:filled={i < typed.length}></span>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <p class="empty">No words loaded.</p>
  {/if}
</div>

<style>
  .words-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1rem;
  }

  .word-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2.5rem 3rem;
    background: white;
    border-radius: 1.25rem;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    min-width: 280px;
    transition: background 0.15s;
  }

  .word-card.flash-wrong {
    background: #fee2e2;
  }

  .farsi-word {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 4.5rem;
    line-height: 1;
    color: #1e293b;
    user-select: none;
  }

  .farsi-word.revealed-word {
    color: #1e293b;
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
    flex-wrap: wrap;
    justify-content: center;
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

  .reveal-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    text-align: center;
  }

  .translit {
    font-size: 1.1rem;
    color: #6b7280;
    font-style: italic;
  }

  .english {
    font-size: 1.4rem;
    font-weight: 600;
    color: #1e293b;
  }

  .sufi-meaning {
    font-size: 0.9rem;
    color: #7c3aed;
    font-style: italic;
    max-width: 360px;
    line-height: 1.5;
    margin-top: 0.25rem;
  }

  .next-btn {
    margin-top: 1rem;
    padding: 0.5em 1.5em;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 999px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.1s;
  }

  .next-btn:hover {
    background: #4f46e5;
  }

  .empty {
    color: #9ca3af;
  }
</style>

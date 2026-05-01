<script>
  /**
   * HebrewFlashcard — flip-card deck for Hebrew passage vocabulary.
   * Props:
   *   vocabList: { dictEntry, shortDef, audioUrl, vocabTier }[]
   *
   * Modes: 'he-en' (Hebrew front → English back) | 'en-he' (English front → Hebrew back)
   * Audio plays when Hebrew side is visible (front in he-en, back in en-he).
   * Remove: removes current card from active deck (session only).
   * Reset: restores full deck from original vocabList.
   */
  import { onDestroy } from 'svelte';

  export let vocabList = [];

  // Active deck — copy that can have cards removed; reset restores it
  let activeDeck = [...vocabList];
  let index   = 0;
  let flipped = false;
  let mode    = 'he-en'; // 'he-en' | 'en-he'
  let audio   = null;

  // Re-seed if vocabList prop changes (e.g. lesson switch)
  $: if (vocabList !== undefined) {
    activeDeck = [...vocabList];
    index = 0;
    flipped = false;
  }

  $: card  = activeDeck[index] ?? null;
  $: total = activeDeck.length;

  // Hebrew is visible on the unflipped side in he-en, and on the flipped side in en-he
  $: hebrewVisible = mode === 'he-en' ? !flipped : flipped;

  function morphLabel(morph) {
    if (!morph || typeof morph !== 'object') return '';
    const { pos, stem, tense, gender, number, state } = morph;
    if (pos === 'verb') return [stem, tense].filter(Boolean).join(' ');
    if (pos === 'noun' || pos === 'adj') return [gender === 'f' ? 'fem' : gender === 'm' ? 'masc' : gender, number, state].filter(Boolean).join(' ');
    return pos ?? '';
  }

  function playAudio(url) {
    if (!url) return;
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
    audio = new Audio(url);
    audio.play().catch(() => {});
  }

  function stopAudio() {
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
  }

  function showCard(i) {
    stopAudio();
    index   = Math.max(0, Math.min(i, activeDeck.length - 1));
    flipped = false;
  }

  function prev() {
    if (index > 0) showCard(index - 1);
  }

  function next() {
    if (index < total - 1) showCard(index + 1);
  }

  function flip() {
    flipped = !flipped;
  }

  function removeCard() {
    if (total === 0) return;
    activeDeck = activeDeck.filter((_, i) => i !== index);
    index = Math.min(index, activeDeck.length - 1);
    flipped = false;
    stopAudio();
  }

  function resetDeck() {
    activeDeck = [...vocabList];
    index   = 0;
    flipped = false;
    stopAudio();
  }

  function setMode(m) {
    mode    = m;
    flipped = false;
    stopAudio();
  }

  // Auto-play audio when Hebrew side becomes visible
  $: if (card && hebrewVisible && card.audioUrl) {
    playAudio(card.audioUrl);
  }

  function handleKey(e) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === ' ')          { e.preventDefault(); flip(); }
  }

  onDestroy(stopAudio);
</script>

<svelte:window on:keydown={handleKey} />

<div class="flashcard-wrap">

  <!-- Mode toggle -->
  <div class="mode-row">
    <button class="mode-btn" class:mode-active={mode === 'he-en'} on:click={() => setMode('he-en')}>Hebrew → English</button>
    <button class="mode-btn" class:mode-active={mode === 'en-he'} on:click={() => setMode('en-he')}>English → Hebrew</button>
  </div>

  {#if total === 0}
    <div class="empty-state">
      <p class="empty">All cards removed.</p>
      <button class="reset-btn" on:click={resetDeck}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
        </svg>
        Reset deck ({vocabList.length} cards)
      </button>
    </div>
  {:else}
    <div class="progress-row">
      <span class="progress">{index + 1} / {total}</span>
      {#if activeDeck.length < vocabList.length}
        <button class="reset-btn" on:click={resetDeck} title="Restore all removed cards">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
          </svg>
          Reset ({vocabList.length})
        </button>
      {/if}
    </div>

    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="card" class:flipped on:click={flip}>
      <div class="card-inner">

        {#if mode === 'he-en'}
          <!-- Front: Hebrew -->
          <div class="card-front">
            <div class="he-text" dir="rtl">{card?.dictEntry ?? ''}</div>
            {#if card?.audioUrl}
              <button class="audio-btn" on:click|stopPropagation={() => playAudio(card.audioUrl)} title="Play audio">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              </button>
            {/if}
            <div class="flip-hint">tap to reveal</div>
          </div>
          <!-- Back: English -->
          <div class="card-back">
            <div class="en-text">{card?.shortDef ?? ''}</div>
            {#if card?.morph}
              <div class="morph-tag">{morphLabel(card.morph)}</div>
            {/if}
            <div class="he-small" dir="rtl">{card?.dictEntry ?? ''}</div>
          </div>

        {:else}
          <!-- Front: English -->
          <div class="card-front">
            <div class="en-text">{card?.shortDef ?? ''}</div>
            {#if card?.morph}
              <div class="morph-tag">{morphLabel(card.morph)}</div>
            {/if}
            <div class="flip-hint">tap to reveal</div>
          </div>
          <!-- Back: Hebrew -->
          <div class="card-back">
            <div class="he-text" dir="rtl">{card?.dictEntry ?? ''}</div>
            {#if card?.audioUrl}
              <button class="audio-btn" on:click|stopPropagation={() => playAudio(card.audioUrl)} title="Play audio">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              </button>
            {/if}
          </div>
        {/if}

      </div>
    </div>

    <div class="nav-row">
      <button class="nav-btn" on:click={prev} disabled={index === 0} aria-label="Previous">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      <div class="dot-row">
        {#each activeDeck as _, i}
          <button
            class="dot"
            class:dot-active={i === index}
            on:click={() => showCard(i)}
            aria-label="Go to card {i + 1}"
          />
        {/each}
      </div>

      <button class="nav-btn" on:click={next} disabled={index === total - 1} aria-label="Next">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>

    <div class="bottom-row">
      <p class="key-hint">← → to navigate · Space to flip</p>
      <button class="remove-btn" on:click={removeCard} title="Remove this card from the deck">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
        Remove card
      </button>
    </div>
  {/if}
</div>

<style>
  .flashcard-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 32px 16px 48px;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .mode-row {
    display: flex;
    gap: 6px;
    background: #f3f4f6;
    border-radius: 8px;
    padding: 4px;
  }

  .mode-btn {
    font-size: 13px;
    padding: 5px 14px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
  }

  .mode-btn.mode-active {
    background: #fff;
    color: #111827;
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .progress {
    font-size: 13px;
    color: #9ca3af;
  }

  .reset-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #6b7280;
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 3px 10px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .reset-btn:hover { background: #f3f4f6; color: #374151; }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 0;
  }

  .empty {
    font-size: 14px;
    color: #9ca3af;
    font-style: italic;
    margin: 0;
  }

  .bottom-row {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #9ca3af;
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 3px 10px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .remove-btn:hover { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }

  .card {
    width: 100%;
    max-width: 480px;
    height: 240px;
    perspective: 1000px;
    cursor: pointer;
  }

  .card-inner {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.4s ease;
    border-radius: 12px;
  }

  .card.flipped .card-inner {
    transform: rotateY(180deg);
  }

  .card-front,
  .card-back {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    gap: 12px;
  }

  .card-back {
    transform: rotateY(180deg);
    background: #f9fafb;
  }

  .he-text {
    font-family: "Frank Ruhl Libre", "Times New Roman", serif;
    font-size: 40px;
    font-weight: 700;
    color: #111827;
    direction: rtl;
    line-height: 1.3;
  }

  .en-text {
    font-size: 28px;
    font-weight: 600;
    color: #111827;
    text-align: center;
  }

  .he-small {
    font-family: "Frank Ruhl Libre", "Times New Roman", serif;
    font-size: 18px;
    color: #9ca3af;
    direction: rtl;
  }

  .morph-tag {
    font-size: 12px;
    color: #6b7280;
    font-style: italic;
  }

  .flip-hint {
    font-size: 11px;
    color: #d1d5db;
  }

  .audio-btn {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }

  .audio-btn:hover { color: #111827; }

  .nav-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .nav-btn {
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    color: #374151;
    display: flex;
    align-items: center;
    transition: background 0.15s;
  }

  .nav-btn:hover:not(:disabled) { background: #f3f4f6; }
  .nav-btn:disabled { opacity: 0.35; cursor: default; }

  .dot-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 200px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #e5e7eb;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background 0.15s;
  }

  .dot.dot-active { background: #374151; }
  .dot:hover:not(.dot-active) { background: #9ca3af; }

  .key-hint {
    font-size: 11px;
    color: #d1d5db;
    margin: 0;
  }

  .empty {
    font-size: 14px;
    color: #9ca3af;
    font-style: italic;
  }
</style>

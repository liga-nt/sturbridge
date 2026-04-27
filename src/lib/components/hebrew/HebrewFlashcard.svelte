<script>
  /**
   * HebrewFlashcard — flip-card deck for Hebrew passage vocabulary.
   * Props:
   *   vocabList: { dictEntry, shortDef, audioUrl, vocabTier }[]
   *
   * Front: Hebrew dictEntry (RTL) + auto-plays audio.
   * Back:  English shortDef.
   * Navigation: ← → arrows or keyboard.
   */
  import { onDestroy } from 'svelte';

  export let vocabList = [];

  let index   = 0;
  let flipped = false;
  let audio   = null;

  $: card = vocabList[index] ?? null;
  $: total = vocabList.length;

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
    index   = i;
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

  // Auto-play audio when card shows (not on flip to English)
  $: if (card && !flipped && card.audioUrl) {
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

  {#if total === 0}
    <p class="empty">No vocabulary for this lesson.</p>
  {:else}
    <div class="progress">{index + 1} / {total}</div>

    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="card" class:flipped on:click={flip}>
      <div class="card-inner">

        <div class="card-front" dir="rtl">
          <div class="he-text">{card?.dictEntry ?? ''}</div>
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

        <div class="card-back">
          <div class="en-text">{card?.shortDef ?? ''}</div>
          {#if card?.morph}
            <div class="morph-tag">{morphLabel(card.morph)}</div>
          {/if}
          <div class="he-small" dir="rtl">{card?.dictEntry ?? ''}</div>
        </div>

      </div>
    </div>

    <div class="nav-row">
      <button class="nav-btn" on:click={prev} disabled={index === 0} aria-label="Previous">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      <div class="dot-row">
        {#each vocabList as _, i}
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

    <p class="key-hint">← → to navigate · Space to flip</p>
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

  .progress {
    font-size: 13px;
    color: #9ca3af;
  }

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

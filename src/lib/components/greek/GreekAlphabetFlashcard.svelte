<script>
  export let alphabet  = [];
  export let hintKeys  = [];
  export let inputMode = 'greek-hints'; // 'greek-hints' | 'greek' | 'translit'

  $: translitMode = inputMode === 'translit';

  function bareTranslit(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  let showName     = true;
  let showTranslit = true;
  let translitBuffer = '';

  $: currentCard, (translitBuffer = '');
  $: if (!translitMode) translitBuffer = '';

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let deck        = [];
  let currentIdx  = 0;
  let flipped     = false;
  let cardResults = {};

  $: if (alphabet.length) {
    deck = shuffle([...alphabet]);
    currentIdx = 0;
    flipped = false;
    cardResults = {};
  }

  $: correctCount = Object.values(cardResults).filter(r => r === 'correct').length;
  $: allDone      = deck.length > 0 && correctCount === deck.length;
  $: currentCard  = deck[currentIdx] ?? null;

  // Drive the parent's keyboard-hint panel
  $: hintKeys = (inputMode === 'greek-hints' && currentCard && !translitMode)
      ? [currentCard.qwerty_key.toLowerCase()] : [];

  function playAudio(card) {
    if (!card?.audio_url) return;
    new Audio(card.audio_url).play().catch(() => {});
  }

  function flip() {
    if (!flipped && currentCard) playAudio(currentCard);
    flipped = !flipped;
  }

  function handleKeydown(e) {
    if (!currentCard || allDone || flipped) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (translitMode) {
      if (e.key === 'Backspace') { translitBuffer = translitBuffer.slice(0, -1); return; }
      if (e.key.length !== 1) return;
      e.preventDefault();
      const target = bareTranslit(currentCard.transliteration);
      const buf    = translitBuffer + e.key.toLowerCase();
      if (buf === target) {
        translitBuffer = '';
        playAudio(currentCard);
        flipped = true;
      } else if (target.startsWith(buf)) {
        translitBuffer = buf;
      } else {
        translitBuffer = '';
      }
    } else {
      if (e.key.toLowerCase() === currentCard.qwerty_key.toLowerCase()) {
        playAudio(currentCard);
        flipped = true;
      }
    }
  }

  function markCard(result) {
    if (!currentCard) return;
    cardResults = { ...cardResults, [currentCard.id]: result };
    flipped = false;
    for (let i = 1; i <= deck.length; i++) {
      const idx = (currentIdx + i) % deck.length;
      if (cardResults[deck[idx]?.id] !== 'correct') { currentIdx = idx; return; }
    }
  }

  function reshuffle() {
    deck = shuffle([...alphabet]);
    currentIdx = 0;
    flipped = false;
    cardResults = {};
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fc-wrap">

  <!-- Controls row: back-side visibility toggles -->
  <div class="fc-controls">
    <span class="controls-label">Show on back:</span>
    <button class="toggle-pill" class:pill-on={showName} on:click={() => showName = !showName}>
      Name
    </button>
    <button class="toggle-pill" class:pill-on={showTranslit} on:click={() => showTranslit = !showTranslit}>
      Transliteration
    </button>
  </div>

  <!-- Progress dots -->
  <div class="flash-progress">
    {#each deck as card (card.id)}
      {@const r = cardResults[card.id]}
      <span class="dot"
        class:dot-correct={r === 'correct'}
        class:dot-wrong={r === 'wrong'}
        class:dot-current={!allDone && deck[currentIdx]?.id === card.id}
      ></span>
    {/each}
    <span class="progress-label">{correctCount} / {deck.length}</span>
  </div>

  {#if allDone}
    <div class="flash-done">
      <div class="done-text">All done!</div>
      <button class="reshuffle-btn" on:click={reshuffle}>Shuffle again</button>
    </div>
  {:else if currentCard}

    <div class="card-scene"
      on:click={flip}
      on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && flip()}
      role="button"
      tabindex="0">
      <div class="card-inner" class:flipped>

        <!-- Front: just the two Greek letters -->
        <div class="card-face card-front">
          <div class="letter-pair">
            <span class="letter-upper">{currentCard.char_upper}</span>
            <span class="letter-lower">{currentCard.char_lower}</span>
          </div>
          {#if translitMode}
            <div class="translit-buffer">
              {#if translitBuffer}<span class="buf-typed">{translitBuffer}</span><span class="buf-cursor">|</span>
              {:else}<span class="buf-idle">type transliteration</span>{/if}
            </div>
          {:else}
            <span class="card-hint">tap or press {currentCard.qwerty_key.toUpperCase()} to reveal</span>
          {/if}
        </div>

        <!-- Back: letters + name + transliteration -->
        <div class="card-face card-back">
          <div class="letter-pair back-letters">
            <span class="letter-upper back-upper">{currentCard.char_upper}</span>
            <span class="letter-lower back-lower">{currentCard.char_lower}</span>
          </div>
          {#if showName}
            <div class="back-name">{currentCard.name_en}</div>
          {/if}
          {#if showTranslit}
            <div class="back-translit">{currentCard.transliteration}</div>
          {/if}
          {#if !showName && !showTranslit}
            <div class="back-empty">—</div>
          {/if}
        </div>

      </div>
    </div>

    <div class="flash-buttons">
      <button class="mark-btn mark-wrong" on:click={() => markCard('wrong')} title="Still learning">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <button class="mark-btn mark-correct" on:click={() => markCard('correct')} title="Got it">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
    </div>

    <button class="reshuffle-btn" on:click={reshuffle}>Reshuffle</button>
  {/if}
</div>

<style>
  .fc-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 24px 0 64px;
  }

  /* Controls */
  .fc-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .controls-label {
    font-size: 12px;
    color: #9ca3af;
    font-weight: 500;
  }

  .toggle-pill {
    padding: 4px 14px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #9ca3af;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    text-decoration: line-through;
  }
  .toggle-pill:hover { background: #f3f4f6; color: #6b7280; }
  .toggle-pill.pill-on {
    background: #eef2ff;
    border-color: #a5b4fc;
    color: #4338ca;
    text-decoration: none;
  }

  /* Progress dots */
  .flash-progress {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #e5e7eb; transition: background 0.2s; }
  .dot-correct { background: #22c55e; }
  .dot-wrong   { background: #ef4444; }
  .dot-current { background: #6366f1; }
  .progress-label { font-size: 12px; color: #9ca3af; margin-left: 6px; }

  /* Card */
  .card-scene {
    width: min(480px, 92vw);
    height: 320px;
    perspective: 1200px;
    cursor: pointer;
  }

  .card-inner {
    width: 100%;
    height: 100%;
    position: relative;
    transform-style: preserve-3d;
    transition: transform 0.4s ease;
  }
  .card-inner.flipped { transform: rotateY(180deg); }

  .card-face {
    position: absolute;
    inset: 0;
    border-radius: 16px;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  }

  .card-front { background: white; border: 1px solid #e5e7eb; }
  .card-back  { background: #f8faff; border: 1px solid #c7d2fe; transform: rotateY(180deg); }

  /* Letter pair — shared by front and back */
  .letter-pair {
    display: flex;
    align-items: baseline;
    gap: 20px;
  }

  .letter-upper,
  .letter-lower {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    line-height: 1;
    color: #111827;
  }

  .letter-upper { font-size: 96px; }
  .letter-lower { font-size: 80px; color: #374151; }

  /* Back face: slightly smaller letters to leave room for name + translit */
  .back-letters { gap: 16px; }
  .back-upper { font-size: 80px; }
  .back-lower { font-size: 68px; }

  .back-name {
    font-size: 28px;
    font-weight: 600;
    color: #374151;
    letter-spacing: 0.02em;
  }

  .back-translit {
    font-size: 48px;
    font-weight: 700;
    font-style: italic;
    color: #4f46e5;
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    line-height: 1;
  }

  .back-empty {
    color: #d1d5db;
    font-size: 18px;
  }

  .card-hint {
    font-size: 11px;
    color: #d1d5db;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .translit-buffer {
    font-size: 1.4rem;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-weight: 600;
    color: #4f46e5;
    display: flex;
    align-items: center;
    gap: 1px;
    min-height: 2rem;
  }
  .buf-typed  { color: #4f46e5; }
  .buf-cursor { color: #a5b4fc; animation: blink 1s step-end infinite; }
  .buf-idle   { color: #d1d5db; font-size: 11px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.08em; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

  /* Buttons */
  .flash-buttons { display: flex; gap: 32px; }

  .mark-btn {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: white;
    transition: all 0.15s;
  }
  .mark-wrong   { border-color: #fca5a5; color: #ef4444; }
  .mark-correct { border-color: #86efac; color: #22c55e; }
  .mark-wrong:hover   { background: #fef2f2; border-color: #ef4444; transform: scale(1.06); }
  .mark-correct:hover { background: #f0fdf4; border-color: #22c55e; transform: scale(1.06); }

  .reshuffle-btn {
    padding: 6px 18px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #6b7280;
    font-size: 12px;
    cursor: pointer;
  }
  .reshuffle-btn:hover { background: #f3f4f6; color: #374151; }

  .flash-done {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 40px 0;
  }
  .done-text { font-size: 24px; font-weight: 700; color: #16a34a; }
</style>

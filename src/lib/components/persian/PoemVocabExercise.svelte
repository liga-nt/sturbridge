<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToPersian, persianToQwerty } from '$lib/utils/persianKeyboard.js';
  import { playUrl, playSequence } from '$lib/utils/persianAudio.js';
  import {
    loadCardStates, saveCardState, deleteCardState, logReview,
    getDueCards, getNewCards,
    scheduleCard, newCard,
    Rating, State
  } from '$lib/utils/persianFsrs.js';

  export let poem;
  export let uid;
  export let showQwertyHint = true;

  // ── Tab ───────────────────────────────────────────────────────────────────────
  let activeTab = 'acquisition';

  // ── Shared ────────────────────────────────────────────────────────────────────
  let cardStates = new Map();
  let loading    = true;
  let error      = null;

  // ── Acquisition ───────────────────────────────────────────────────────────────
  let acqBatch   = [];  // current batch of up to 10 new cards
  let acqActive  = [];  // cards still in the rotation
  let acqDone    = [];  // removed from rotation, not yet sent to review
  let acqPos     = 0;   // index into acqActive
  let wordHidden    = false;
  let showSeparated = false;
  let acqFlash      = null;
  let acqFlashTimer = null;

  // ── Swipe ─────────────────────────────────────────────────────────────────────
  let touchStartX = null;

  function onTouchStart(e) {
    touchStartX = e.touches[0].clientX;
  }

  function onTouchEnd(e) {
    if (touchStartX === null || activeTab !== 'acquisition' || !acqCurrent) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 40) return;
    if (dx > 0) keepPracticing();
    else goBack();
  }

  let typed          = '';
  let hiddenInput;
  let promptShownAt    = null;
  let firstKeystrokeAt = null;

  $: acqCurrent  = acqActive.length > 0 ? acqActive[acqPos % acqActive.length] : null;
  $: acqDoneCount = acqBatch.length - acqActive.length;
  $: currentLine  = (acqBatch.length > 0 && poem)
      ? poem.lines.find(l => l.num === acqBatch[0].line_num)
      : null;

  // ── Review ────────────────────────────────────────────────────────────────────
  let revQueue    = [];
  let revCurrent  = null;
  let revTyped    = '';
  let revFlash    = null;
  let revFlashTimer = null;
  let revPromptAt   = null;
  let revFirstKeyAt = null;

  // ── Derived counts for tab labels ─────────────────────────────────────────────
  $: dueCount     = poem ? getDueCards(cardStates, poem.cards).length : 0;
  $: newRemaining = poem ? getNewCards(cardStates, poem.cards).length : 0;

  // ── Key hints (hidden when word is hidden in acquisition) ─────────────────────
  $: hintSource = activeTab === 'acquisition' ? acqCurrent : revCurrent;
  $: currentHints = (hintSource && !(activeTab === 'acquisition' && wordHidden))
    ? Array.from(hintSource.surface).map(ch => persianToQwerty(ch) ?? '?')
    : [];

  // ── Line tokenizer ────────────────────────────────────────────────────────────
  function normalizeAr(s) {
    return s
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه')
      .replace(/\u200c/g, '').trim();
  }

  function tokenizeLine(lineText, target) {
    const normTarget = normalizeAr(target);
    return lineText.split(' ').map(word => ({
      text:      word,
      highlight: normalizeAr(word) === normTarget,
    }));
  }

  $: acqLineTokens = (acqCurrent && poem)
    ? (() => {
        const line = poem.lines.find(l => l.num === acqCurrent.line_num);
        return line ? tokenizeLine(line.fa, acqCurrent.surface) : [];
      })()
    : [];

  // ── Load ──────────────────────────────────────────────────────────────────────
  onMount(async () => {
    try {
      cardStates = await loadCardStates(uid, poem.id);
      initAcquisition();
      initReview();
      loading = false;
      focusInput();
    } catch (e) {
      error   = e.message;
      loading = false;
    }
  });

  function getNextLineBatch(states, allCards) {
    const seen = new Set(states.keys());
    let targetLine = null;
    for (const card of allCards) {
      if (!seen.has(card.id)) { targetLine = card.line_num; break; }
    }
    if (targetLine === null) return [];
    return allCards.filter(c => c.line_num === targetLine && !seen.has(c.id));
  }

  function initAcquisition() {
    acqBatch  = getNextLineBatch(cardStates, poem.cards);
    acqActive = [...acqBatch];
    acqDone   = [];
    acqPos    = 0;
    typed     = '';
    promptShownAt    = Date.now();
    firstKeystrokeAt = null;
  }

  function initReview() {
    revQueue    = [...getDueCards(cardStates, poem.cards)];
    revCurrent  = revQueue.length > 0 ? revQueue.shift() : null;
    revTyped    = '';
    revPromptAt   = Date.now();
    revFirstKeyAt = null;
  }

  function focusInput() {
    setTimeout(() => hiddenInput?.focus(), 50);
  }

  // ── Tab switch ────────────────────────────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    typed    = '';
    revTyped = '';
    firstKeystrokeAt = null;
    revFirstKeyAt    = null;
    promptShownAt    = Date.now();
    revPromptAt      = Date.now();
    if (tab === 'review') initReview();
    focusInput();
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  function handleKeydown(e) {
    // Acquisition navigation / action keys (before the skip list)
    if (activeTab === 'acquisition' && acqCurrent) {
      if (e.key === 'ArrowLeft' && !e.shiftKey)  { e.preventDefault(); goBack(); return; }
      if (e.key === 'ArrowRight' && !e.shiftKey) { e.preventDefault(); keepPracticing(); return; }
      if (e.key === 'ArrowRight' && e.shiftKey)  { e.preventDefault(); markDone(); return; }
      if (e.key === 'ArrowUp')                   { e.preventDefault(); sendCurrentToReview(); return; }
      if (e.key === 'Enter' && !e.shiftKey)      { e.preventDefault(); submitAcquisition(); return; }
      if (e.key === 'Enter' && e.shiftKey)       { e.preventDefault(); markDone(); return; }
    }

    if (['Tab','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
         'Delete','Control','Shift','Alt','Meta','Enter'].includes(e.key)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (activeTab === 'acquisition') typed = typed.slice(0, -1);
      else revTyped = revTyped.slice(0, -1);
      return;
    }

    e.preventDefault();
    const persian = keyToPersian(e.key);
    if (!persian) return;

    if (activeTab === 'acquisition') {
      if (firstKeystrokeAt === null) firstKeystrokeAt = Date.now();
      typed = typed + persian;
    } else {
      if (revFirstKeyAt === null) revFirstKeyAt = Date.now();
      revTyped = revTyped + persian;
    }
  }

  function handleInput(e) {
    const char = e.data;
    hiddenInput.value = '';
    if (!char) return;
    const persian = /[\u0600-\u06FF]/.test(char) ? char : keyToPersian(char);
    if (!persian) return;

    if (activeTab === 'acquisition') {
      if (firstKeystrokeAt === null) firstKeystrokeAt = Date.now();
      typed = typed + persian;
    } else {
      if (revFirstKeyAt === null) revFirstKeyAt = Date.now();
      revTyped = revTyped + persian;
    }
  }

  // ── Acquisition: go back ──────────────────────────────────────────────────────
  function goBack() {
    if (acqActive.length === 0) return;
    acqPos = (acqPos - 1 + acqActive.length) % acqActive.length;
    const card = acqActive[acqPos];
    if (card?.audio_url) playUrl(card.audio_url);
    typed = '';
    firstKeystrokeAt = null;
    promptShownAt    = Date.now();
    focusInput();
  }

  // ── Acquisition: keep practicing (go forward, arrow nav) ─────────────────────
  function keepPracticing() {
    if (acqActive.length === 0) return;
    const card = acqCurrent;
    if (card?.audio_url) playUrl(card.audio_url);
    acqPos = (acqPos + 1) % acqActive.length;
    typed = '';
    firstKeystrokeAt = null;
    promptShownAt    = Date.now();
    focusInput();
  }

  // ── Acquisition: Enter — check typed, flash, advance only if correct ──────────
  function submitAcquisition() {
    const card = acqCurrent;
    if (!card || !typed.trim()) return;

    const correct = typed.trim() === card.surface;
    triggerAcqFlash(correct ? 'correct' : 'wrong');

    if (!correct) {
      typed = '';
      firstKeystrokeAt = null;
      focusInput();
      return;
    }

    const advance = () => {
      acqPos = (acqPos + 1) % acqActive.length;
      typed = '';
      firstKeystrokeAt = null;
      promptShownAt    = Date.now();
      focusInput();
    };

    if (card.audio_url) {
      playSequence([card.audio_url]).then(advance);
    } else {
      setTimeout(advance, 500);
    }
  }

  function triggerAcqFlash(type) {
    if (acqFlashTimer) clearTimeout(acqFlashTimer);
    acqFlash = type;
    acqFlashTimer = setTimeout(() => { acqFlash = null; }, 600);
  }

  // ── Acquisition: done (remove from rotation, not yet in review) ───────────────
  function markDone() {
    const card = acqCurrent;
    if (!card) return;
    if (card.audio_url) playUrl(card.audio_url);
    acqActive = acqActive.filter(c => c.id !== card.id);
    acqDone   = [...acqDone, card];
    if (acqPos >= acqActive.length) acqPos = 0;
    typed = '';
    firstKeystrokeAt = null;
    promptShownAt    = Date.now();
    focusInput();
  }

  // ── Acquisition: send current card to review immediately ──────────────────────
  async function sendCurrentToReview() {
    const card = acqCurrent;
    if (!card) return;
    if (card.audio_url) playUrl(card.audio_url);
    await graduateCard(card);
    acqActive = acqActive.filter(c => c.id !== card.id);
    acqDone   = acqDone.filter(c => c.id !== card.id);
    if (acqPos >= acqActive.length) acqPos = 0;
    typed = '';
    firstKeystrokeAt = null;
    promptShownAt    = Date.now();
    initReview();
    maybeLoadNextBatch();
    focusInput();
  }

  // ── Acquisition: send whole batch to review ───────────────────────────────────
  async function sendBatchToReview() {
    const toGraduate = [...acqActive, ...acqDone];
    await Promise.all(toGraduate.map(graduateCard));
    initReview();
    initAcquisition();
    focusInput();
  }

  async function graduateCard(card) {
    if (cardStates.has(card.id)) return; // already in review
    const graduated = scheduleCard(newCard(), Rating.Good);
    graduated.due = new Date(); // make immediately reviewable
    cardStates.set(card.id, graduated);
    cardStates = cardStates; // trigger Svelte reactivity on Map mutation
    await saveCardState(uid, poem.id, card.id, graduated);
  }

  function maybeLoadNextBatch() {
    if (acqActive.length === 0 && acqDone.length === 0) {
      initAcquisition();
    }
  }

  // ── Review: submit ────────────────────────────────────────────────────────────
  async function submitReview(button) {
    const card = revCurrent;
    if (!card) return;

    const correct = revTyped.trim() === card.surface;
    triggerRevFlash(correct ? 'correct' : 'wrong');

    const rating  = correct
      ? (button === 'easy' ? Rating.Easy : Rating.Good)
      : Rating.Again;

    const now     = Date.now();
    const latMs   = revFirstKeyAt ? revFirstKeyAt - revPromptAt : 0;
    const totalMs = now - revPromptAt;

    const existing = cardStates.get(card.id) ?? newCard();
    const updated  = scheduleCard(existing, rating);
    cardStates.set(card.id, updated);
    await saveCardState(uid, poem.id, card.id, updated);
    await logReview(uid, poem.id, card.id, {
      rating, button, typedInput: revTyped, latencyMs: latMs, totalMs,
    });

    if (!correct) {
      const insertAt = Math.min(3, revQueue.length);
      revQueue.splice(insertAt, 0, card);
    }

    const audioUrl = card.audio_url;
    const advance  = () => {
      revCurrent    = revQueue.length > 0 ? revQueue.shift() : null;
      revTyped      = '';
      revFirstKeyAt = null;
      revPromptAt   = Date.now();
      focusInput();
    };

    if (audioUrl) {
      playSequence([audioUrl]).then(advance);
    } else {
      setTimeout(advance, 400);
    }
  }

  // ── Review: send back to learning ────────────────────────────────────────────
  async function sendBackToLearning() {
    const card = revCurrent;
    if (!card) return;
    cardStates.delete(card.id);
    await deleteCardState(uid, poem.id, card.id);
    revCurrent    = revQueue.length > 0 ? revQueue.shift() : null;
    revTyped      = '';
    revFirstKeyAt = null;
    revPromptAt   = Date.now();
    focusInput();
  }

  function triggerRevFlash(type) {
    if (revFlashTimer) clearTimeout(revFlashTimer);
    revFlash = type;
    revFlashTimer = setTimeout(() => { revFlash = null; }, 400);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  onDestroy(() => {
    if (revFlashTimer)  clearTimeout(revFlashTimer);
    if (acqFlashTimer) clearTimeout(acqFlashTimer);
  });
</script>

<svelte:head>
  <link
    href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<input
  bind:this={hiddenInput}
  class="hidden-input"
  type="text"
  inputmode="text"
  autocomplete="off"
  autocorrect="off"
  autocapitalize="none"
  spellcheck="false"
  on:keydown={handleKeydown}
  on:input={handleInput}
/>

<div class="exercise-wrap" on:click={focusInput} on:touchstart={onTouchStart} on:touchend={onTouchEnd} role="presentation">

  {#if loading}
    <div class="state-msg">Loading…</div>

  {:else if error}
    <div class="state-msg error">{error}</div>

  {:else}

    <!-- Tab bar -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        class:active={activeTab === 'acquisition'}
        on:click|stopPropagation={() => switchTab('acquisition')}
      >
        Learning
        {#if newRemaining > 0}
          <span class="tab-count">{newRemaining}</span>
        {/if}
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'review'}
        on:click|stopPropagation={() => switchTab('review')}
      >
        Review
        {#if dueCount > 0}
          <span class="tab-count due">{dueCount}</span>
        {/if}
      </button>
    </div>

    <!-- ── Acquisition tab ── -->
    {#if activeTab === 'acquisition'}

      {#if acqCurrent}

        <!-- Status row -->
        {#if currentLine}
          <div class="line-label">
            <span class="line-num-badge">Line {currentLine.num}</span>
            <span class="line-en-text">{currentLine.en}</span>
          </div>
        {/if}
        <div class="batch-status">
          <span>{acqDoneCount} / {acqBatch.length} done</span>
        </div>

        <div class="prompt-card"
          class:flash-correct={acqFlash === 'correct'}
          class:flash-wrong={acqFlash === 'wrong'}
        >

          <!-- English gloss -->
          <div class="prompt-gloss">{acqCurrent.prompt_en}</div>
          {#if acqCurrent.morphology && acqCurrent.morphology !== 'TODO'}
            <div class="prompt-morph">{acqCurrent.morphology}</div>
          {/if}

          <!-- Hide / Show toggle -->
          <button
            class="vis-toggle"
            class:hidden-active={wordHidden}
            on:click|stopPropagation={() => wordHidden = !wordHidden}
          >
            {wordHidden ? 'Show word' : 'Hide word'}
          </button>

          {#if !wordHidden}
            <!-- Persian word -->
            <div class="acquisition-word-row">
              {#if showSeparated}
                <div class="acquisition-word sep" dir="rtl">
                  {#each Array.from(acqCurrent.surface) as char}
                    <span>{char}</span>
                  {/each}
                </div>
              {:else}
                <div class="acquisition-word" dir="rtl">{acqCurrent.surface}</div>
              {/if}
              {#if acqCurrent.audio_url}
                <button
                  class="play-btn"
                  on:click|stopPropagation={() => playUrl(acqCurrent.audio_url)}
                  aria-label="Play pronunciation"
                >▶</button>
              {/if}
            </div>
            <button
              class="sep-toggle"
              class:active={showSeparated}
              on:click|stopPropagation={() => showSeparated = !showSeparated}
            >separated</button>

            <!-- Line context -->
            {#if acqLineTokens.length > 0}
              <div class="prompt-line" dir="rtl">
                {#each acqLineTokens as token, i}
                  {#if i > 0}<span class="line-space"> </span>{/if}
                  <span class="line-word" class:line-target={token.highlight}>{token.text}</span>
                {/each}
              </div>
            {/if}
          {/if}

          <!-- Typed display -->
          <div class="persian-display"
            class:correct={acqFlash === 'correct'}
            class:wrong={acqFlash === 'wrong'}
            dir="rtl"
          >{typed}</div>

          <!-- Key hints (hidden when word is hidden) -->
          {#if showQwertyHint && currentHints.length > 0}
            <div class="key-hints">
              {#each currentHints as hint}
                <kbd>{hint}</kbd>
              {/each}
            </div>
          {/if}

        </div>

        <!-- Action row -->
        <div class="btn-row">
          <button class="rate-btn done-btn" on:click={markDone} title="Remove from rotation (Shift+Enter)">
            Remove
          </button>
          <button class="rate-btn review-btn" on:click={sendCurrentToReview} title="Send to review (↑)">
            To Review ↑
          </button>
        </div>

        <!-- Send batch -->
        <button
          class="send-batch-btn"
          on:click|stopPropagation={sendBatchToReview}
        >
          Send Batch to Review ({acqActive.length + acqDone.length})
        </button>

      {:else if acqDone.length > 0}
        <!-- Active exhausted, done cards waiting -->
        <div class="done-panel">
          <div class="done-sub">{acqDone.length} word{acqDone.length === 1 ? '' : 's'} ready</div>
          <p class="done-note">Send them to review, or keep practicing.</p>
          <div class="btn-row">
            <button class="rate-btn done-btn" on:click={() => { acqActive = [...acqDone]; acqDone = []; acqPos = 0; focusInput(); }}>
              Practice Again
            </button>
            <button class="rate-btn review-btn" on:click={sendBatchToReview}>
              Send to Review
            </button>
          </div>
        </div>

      {:else}
        <!-- All new cards exhausted -->
        <div class="done-panel">
          <div class="done-sub">All words sent to review!</div>
          <p class="done-note">Switch to the Review tab to practice what you've learned.</p>
          <button class="rate-btn review-btn" on:click|stopPropagation={() => switchTab('review')}>
            Go to Review →
          </button>
        </div>
      {/if}

    <!-- ── Review tab ── -->
    {:else}

      {#if revCurrent}

        <div
          class="prompt-card"
          class:flash-correct={revFlash === 'correct'}
          class:flash-wrong={revFlash === 'wrong'}
        >
          <div class="prompt-gloss">{revCurrent.prompt_en}</div>
          {#if revCurrent.morphology && revCurrent.morphology !== 'TODO'}
            <div class="prompt-morph">{revCurrent.morphology}</div>
          {/if}

          <div
            class="persian-display"
            class:correct={revFlash === 'correct'}
            class:wrong={revFlash === 'wrong'}
            dir="rtl"
          >{revTyped}</div>

          {#if showQwertyHint && currentHints.length > 0}
            <div class="key-hints">
              {#each currentHints as hint}
                <kbd>{hint}</kbd>
              {/each}
            </div>
          {/if}
        </div>

        <div class="phase-label">review</div>

        <div class="btn-row">
          <button class="rate-btn done-btn" on:click={() => submitReview('hard')}>Hard</button>
          <button class="rate-btn review-btn" on:click={() => submitReview('easy')}>Easy</button>
        </div>

        <div class="queue-info">{revQueue.length} remaining</div>

        <button class="back-to-learning-btn" on:click={sendBackToLearning}>
          ↩ Back to Learning
        </button>

      {:else}
        <div class="done-panel">
          <div class="done-sub">No reviews due</div>
          <p class="done-note">Words you've learned will appear here for spaced repetition review. Check back tomorrow.</p>
        </div>
      {/if}

    {/if}

  {/if}

</div>

<style>
  .exercise-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 1.5rem 1rem 2rem;
    min-height: 60vh;
  }

  /* ── Tabs ── */
  .tab-bar {
    display: flex;
    gap: 0.5rem;
    background: white;
    border-radius: 999px;
    padding: 0.25rem;
    box-shadow: 0 1px 6px rgba(0,0,0,0.07);
    width: 100%;
    max-width: 440px;
  }

  .tab-btn {
    flex: 1;
    padding: 0.5em 1em;
    border-radius: 999px;
    border: none;
    background: transparent;
    font-size: 0.88rem;
    font-weight: 500;
    color: #9ca3af;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    transition: all 0.15s;
  }

  .tab-btn.active {
    background: #6366f1;
    color: white;
    font-weight: 600;
  }

  .tab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.4em;
    height: 1.4em;
    border-radius: 999px;
    font-size: 0.75em;
    font-weight: 700;
    background: rgba(255,255,255,0.25);
    color: inherit;
    padding: 0 0.3em;
  }

  .tab-count.due {
    background: #fbbf24;
    color: #78350f;
  }

  /* ── Line label ── */
  .line-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    max-width: 440px;
    text-align: center;
  }

  .line-num-badge {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #a5b4fc;
  }

  .line-en-text {
    font-size: 0.82rem;
    color: #94a3b8;
    font-style: italic;
  }

  /* ── Batch status ── */
  .batch-status {
    font-size: 0.8rem;
    color: #9ca3af;
    display: flex;
    gap: 0.4rem;
  }

  /* ── Prompt card ── */
  .prompt-card {
    width: 100%;
    max-width: 440px;
    background: white;
    border-radius: 1.25rem;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    padding: 2rem 2rem 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
    transition: background 0.15s;
  }

  .prompt-card.flash-correct { background: #d1fae5; }
  .prompt-card.flash-wrong   { background: #fee2e2; }

  .prompt-gloss {
    font-size: 1.3rem;
    font-weight: 600;
    color: #1e293b;
    line-height: 1.4;
  }

  .prompt-morph {
    font-size: 0.85rem;
    color: #6b7280;
    font-style: italic;
    margin-top: -0.25rem;
  }

  /* ── Visibility toggle ── */
  .vis-toggle {
    font-size: 0.72rem;
    padding: 0.2em 0.8em;
    border-radius: 999px;
    border: 1.5px solid #e5e7eb;
    background: white;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }

  .vis-toggle.hidden-active {
    background: #fef3c7;
    border-color: #fbbf24;
    color: #92400e;
    font-weight: 600;
  }

  /* ── Acquisition word ── */
  .acquisition-word-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.25rem 0;
  }

  .acquisition-word {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 4rem;
    line-height: 1.2;
    color: #1e293b;
  }

  .acquisition-word.sep {
    display: flex;
    flex-direction: row;
    gap: 0.4rem;
  }

  .acquisition-word.sep span { display: inline-block; }

  .sep-toggle {
    font-size: 0.72rem;
    padding: 0.2em 0.7em;
    border-radius: 999px;
    border: 1.5px solid #e5e7eb;
    background: white;
    color: #6b7280;
    cursor: pointer;
    margin-top: -0.25rem;
  }

  .sep-toggle.active {
    background: #eef2ff;
    border-color: #818cf8;
    color: #4338ca;
    font-weight: 600;
  }

  .play-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 1.5px solid #e5e7eb;
    background: white;
    color: #6366f1;
    font-size: 0.75rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.1s;
  }

  .play-btn:hover { background: #eef2ff; border-color: #6366f1; }

  /* ── Line context ── */
  .prompt-line {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 1.4rem;
    line-height: 1.8;
    margin: 0;
  }

  .line-word { color: #94a3b8; }
  .line-word.line-target { color: #6366f1; font-weight: 700; }
  .line-space { white-space: pre; }

  /* ── Typed display ── */
  .persian-display {
    width: 100%;
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 2.25rem;
    text-align: center;
    border-bottom: 2px solid #e5e7eb;
    color: #1e293b;
    padding: 0.25rem 0;
    min-height: 3.5rem;
    transition: border-color 0.15s;
  }

  .persian-display.correct { border-bottom-color: #16a34a; }
  .persian-display.wrong   { border-bottom-color: #dc2626; }

  /* ── Key hints ── */
  .key-hints {
    display: flex;
    gap: 0.3rem;
    flex-direction: row-reverse;
    margin-top: 0.25rem;
  }

  kbd {
    display: inline-block;
    padding: 0.15em 0.45em;
    font-size: 0.8rem;
    font-family: monospace;
    color: #374151;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    box-shadow: 0 1px 1px rgba(0,0,0,0.08);
  }

  /* ── Navigation row ── */
  .nav-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .nav-btn {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    border: 1.5px solid #e2e8f0;
    background: white;
    font-size: 1.1rem;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s;
  }

  .nav-btn:hover:not(:disabled) { background: #f1f5f9; border-color: #cbd5e1; }
  .nav-btn:disabled { opacity: 0.3; cursor: default; }

  .nav-btn.primary {
    width: 2.75rem;
    height: 2.75rem;
    font-size: 1.1rem;
  }

  /* ── Action buttons ── */
  .btn-row {
    display: flex;
    gap: 0.75rem;
  }

  .rate-btn {
    padding: 0.6em 1.75em;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.1s;
  }

  .rate-btn.done-btn    { background: #e2e8f0; color: #475569; }
  .rate-btn.done-btn:hover  { background: #cbd5e1; }
  .rate-btn.review-btn  { background: #6366f1; color: white; }
  .rate-btn.review-btn:hover { background: #4f46e5; }

  /* ── Send batch ── */
  .send-batch-btn {
    font-size: 0.78rem;
    color: #9ca3af;
    background: transparent;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    padding: 0.3em 1em;
    cursor: pointer;
    transition: all 0.15s;
  }

  .send-batch-btn:hover { color: #6366f1; border-color: #a5b4fc; }

  /* ── Phase label ── */
  .phase-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #cbd5e1;
  }

  /* ── Queue info ── */
  .queue-info { font-size: 0.75rem; color: #cbd5e1; }

  /* ── Back to learning ── */
  .back-to-learning-btn {
    font-size: 0.78rem;
    color: #9ca3af;
    background: transparent;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    padding: 0.3em 1em;
    cursor: pointer;
    transition: all 0.15s;
  }

  .back-to-learning-btn:hover { color: #6366f1; border-color: #a5b4fc; }

  /* ── Hidden input ── */
  .hidden-input {
    position: fixed;
    top: 0; left: 0;
    width: 1px; height: 1px;
    opacity: 0;
    border: none; padding: 0; margin: 0; outline: none;
    caret-color: transparent;
    background: transparent;
    color: transparent;
  }

  /* ── State / done messages ── */
  .state-msg {
    margin-top: 4rem;
    font-size: 1rem;
    color: #9ca3af;
    text-align: center;
  }

  .state-msg.error { color: #dc2626; }

  .done-panel {
    margin-top: 3rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .done-sub {
    font-size: 1.1rem;
    font-weight: 600;
    color: #16a34a;
  }

  .done-note {
    font-size: 0.85rem;
    color: #9ca3af;
    max-width: 280px;
    margin: 0;
  }
</style>

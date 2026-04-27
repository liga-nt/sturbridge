<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    keyToGreek, applyDiacritic, processFinalSigma,
    stripGreekDiacritics, greekToQwerty, DIACRITIC_MAP
  } from '$lib/utils/greekKeyboard.js';
  import {
    loadCardStates, saveCardState, deleteCardState,
    getDueCards, getNewCards,
    scheduleCard, newCard,
    Rating, State
  } from '$lib/utils/greekFsrs.js';

  export let vocabList = [];   // [{ id, surface, dictEntry, shortDef, morph }]
  export let uid = '';
  export let courseId = '';
  export let enforceAccents = false;

  // ── State ─────────────────────────────────────────────────────────────────────
  let cardStates = new Map();
  let loading = true;
  let error = null;
  let activeTab = 'acquisition';

  // ── Acquisition ───────────────────────────────────────────────────────────────
  let acqActive = [];
  let acqDone   = [];
  let acqPos    = 0;
  let acqFlash      = null;
  let acqFlashTimer = null;

  $: acqCurrent = acqActive.length > 0 ? acqActive[acqPos % acqActive.length] : null;

  // ── Review ────────────────────────────────────────────────────────────────────
  let revQueue   = [];
  let revCurrent = null;
  let revFlash      = null;
  let revFlashTimer = null;

  // ── Typing buffer ─────────────────────────────────────────────────────────────
  let typed    = '';
  let revTyped = '';
  let hiddenInput;

  // ── Counts for tab labels ─────────────────────────────────────────────────────
  $: dueCount    = getDueCards(cardStates, vocabList).length;
  $: newRemaining = getNewCards(cardStates, vocabList).length;

  // ── Key hints ─────────────────────────────────────────────────────────────────
  $: hintSource   = activeTab === 'acquisition' ? acqCurrent : revCurrent;
  $: currentHints = hintSource
    ? [...(hintSource.surface ?? '')].map(ch => greekToQwerty(ch) ?? '?').filter(h => h !== '?')
    : [];

  // ── Load ──────────────────────────────────────────────────────────────────────
  onMount(async () => {
    try {
      cardStates = await loadCardStates(uid, courseId);
      initAcquisition();
      initReview();
      loading = false;
      focusInput();
    } catch (e) {
      error = e.message;
      loading = false;
    }
  });

  function initAcquisition() {
    acqActive = [...vocabList];
    acqDone   = [];
    acqPos    = 0;
    typed     = '';
  }

  function initReview() {
    revQueue   = [...getDueCards(cardStates, vocabList)];
    revCurrent = revQueue.length > 0 ? revQueue.shift() : null;
    revTyped   = '';
  }

  function focusInput() {
    setTimeout(() => hiddenInput?.focus(), 50);
  }

  function switchTab(tab) {
    activeTab = tab;
    typed    = '';
    revTyped = '';
    if (tab === 'review') initReview();
    focusInput();
  }

  // ── Acquisition navigation ────────────────────────────────────────────────────
  function goBack() {
    if (acqActive.length === 0) return;
    acqPos = (acqPos - 1 + acqActive.length) % acqActive.length;
    typed  = '';
    focusInput();
  }

  function goForward() {
    if (acqActive.length === 0) return;
    acqPos = (acqPos + 1) % acqActive.length;
    typed  = '';
    focusInput();
  }

  // ── Acquisition submit: check typed, flash, advance only if correct ────────────
  function submitAcquisition() {
    const card = acqCurrent;
    if (!card || !typed.trim()) return;

    const correct = compare(processFinalSigma(typed.trim()), card.surface);
    triggerAcqFlash(correct ? 'correct' : 'wrong');

    if (!correct) {
      typed = '';
      focusInput();
      return;
    }

    setTimeout(() => {
      acqPos = (acqPos + 1) % acqActive.length;
      typed  = '';
      focusInput();
    }, 400);
  }

  function triggerAcqFlash(type) {
    if (acqFlashTimer) clearTimeout(acqFlashTimer);
    acqFlash = type;
    acqFlashTimer = setTimeout(() => { acqFlash = null; }, 500);
  }

  function markDone() {
    const card = acqCurrent;
    if (!card) return;
    acqActive = acqActive.filter(c => c.id !== card.id);
    acqDone   = [...acqDone, card];
    if (acqPos >= acqActive.length) acqPos = 0;
    typed = '';
    focusInput();
  }

  async function sendAllToReview() {
    const toGraduate = [...acqActive, ...acqDone];
    await Promise.all(toGraduate.map(graduateCard));
    initReview();
    initAcquisition();
    switchTab('review');
  }

  async function graduateCard(card) {
    if (cardStates.has(card.id)) return;
    const graduated = scheduleCard(newCard(), Rating.Good);
    graduated.due = new Date();
    cardStates.set(card.id, graduated);
    cardStates = cardStates;
    await saveCardState(uid, courseId, card.id, graduated);
  }

  // ── Review submit ─────────────────────────────────────────────────────────────
  async function submitReview(button) {
    const card = revCurrent;
    if (!card) return;

    const correct = compare(processFinalSigma(revTyped.trim()), card.surface);
    triggerRevFlash(correct ? 'correct' : 'wrong');

    const rating = correct
      ? (button === 'easy' ? Rating.Easy : Rating.Good)
      : Rating.Again;

    const existing = cardStates.get(card.id) ?? newCard();
    const updated  = scheduleCard(existing, rating);
    cardStates.set(card.id, updated);
    cardStates = cardStates;
    await saveCardState(uid, courseId, card.id, updated);

    if (!correct) {
      const insertAt = Math.min(3, revQueue.length);
      revQueue.splice(insertAt, 0, card);
    }

    setTimeout(() => {
      revCurrent = revQueue.length > 0 ? revQueue.shift() : null;
      revTyped   = '';
      focusInput();
    }, 400);
  }

  // ── Review: send back to learning ─────────────────────────────────────────────
  async function sendBackToLearning() {
    const card = revCurrent;
    if (!card) return;
    cardStates.delete(card.id);
    cardStates = cardStates;
    await deleteCardState(uid, courseId, card.id);
    revCurrent = revQueue.length > 0 ? revQueue.shift() : null;
    revTyped   = '';
    focusInput();
  }

  function triggerRevFlash(type) {
    if (revFlashTimer) clearTimeout(revFlashTimer);
    revFlash = type;
    revFlashTimer = setTimeout(() => { revFlash = null; }, 400);
  }

  // ── Comparison ────────────────────────────────────────────────────────────────
  function compare(a, b) {
    if (!a || !b) return false;
    if (enforceAccents) return a.normalize('NFC') === b.normalize('NFC');
    return stripGreekDiacritics(a) === stripGreekDiacritics(b);
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  const WORD_END_KEYS = new Set([' ', '.', ',', ';']);

  function handleKeydown(e) {
    if (activeTab === 'acquisition' && acqCurrent) {
      if (e.key === 'ArrowLeft')                          { e.preventDefault(); goBack(); return; }
      if (e.key === 'ArrowRight')                         { e.preventDefault(); goForward(); return; }
      if (e.key === 'ArrowUp')                            { e.preventDefault(); sendAllToReview(); return; }
      if (e.key === 'Enter' && e.shiftKey)                { e.preventDefault(); markDone(); return; }
      if (e.key === 'Enter' && !e.shiftKey && acqFlash === null) { e.preventDefault(); submitAcquisition(); return; }
    }

    if (activeTab === 'review' && e.key === 'Enter' && !e.shiftKey && revFlash === null) {
      e.preventDefault();
      submitReview('hard');
      return;
    }

    const SKIP = new Set([
      'Tab','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
      'Enter','Delete','Control','Shift','Alt','Meta',
      'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
    ]);
    if (SKIP.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;

    e.preventDefault();

    if (e.key === 'Backspace') {
      if (activeTab === 'acquisition') typed    = [...typed].slice(0, -1).join('');
      else                             revTyped = [...revTyped].slice(0, -1).join('');
      return;
    }

    if (e.key in DIACRITIC_MAP) {
      if (activeTab === 'acquisition') typed    = applyDiacritic(typed, e.key);
      else                             revTyped = applyDiacritic(revTyped, e.key);
      return;
    }

    const greek = keyToGreek(e.key);
    if (!greek) return;

    if (activeTab === 'acquisition') {
      typed    = (WORD_END_KEYS.has(greek) ? processFinalSigma(typed) : typed) + greek;
    } else {
      revTyped = (WORD_END_KEYS.has(greek) ? processFinalSigma(revTyped) : revTyped) + greek;
    }
  }

  function handleInput(e) {
    const char = e.data;
    hiddenInput.value = '';
    if (!char) return;
    if (/[Ͱ-Ͽἀ-῿]/u.test(char)) {
      if (activeTab === 'acquisition') typed    = typed + char;
      else                             revTyped = revTyped + char;
      return;
    }
    const greek = keyToGreek(char);
    if (!greek) return;
    if (activeTab === 'acquisition') typed    = typed + greek;
    else                             revTyped = revTyped + greek;
  }

  onDestroy(() => {
    if (acqFlashTimer) clearTimeout(acqFlashTimer);
    if (revFlashTimer) clearTimeout(revFlashTimer);
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
  on:keydown={handleKeydown}
  on:input={handleInput}
/>

<div class="exercise-wrap" on:click={focusInput} role="presentation">

  {#if loading}
    <div class="state-msg">Loading…</div>

  {:else if error}
    <div class="state-msg error">{error}</div>

  {:else if vocabList.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📖</div>
      <div class="empty-title">No vocab for this lesson</div>
      <p class="empty-note">Switch to the Story tab to read the passage.</p>
    </div>

  {:else}

    <!-- Tab bar -->
    <div class="tab-bar">
      <button class="tab-btn" class:active={activeTab === 'acquisition'}
        on:click|stopPropagation={() => switchTab('acquisition')}>
        Learning
        {#if newRemaining > 0}<span class="tab-count">{newRemaining}</span>{/if}
      </button>
      <button class="tab-btn" class:active={activeTab === 'review'}
        on:click|stopPropagation={() => switchTab('review')}>
        Review
        {#if dueCount > 0}<span class="tab-count due">{dueCount}</span>{/if}
      </button>
    </div>

    <!-- ── Acquisition tab ── -->
    {#if activeTab === 'acquisition'}

      {#if acqCurrent}
        <div class="card-status">
          <span class="status-count">{acqDone.length} / {vocabList.length} done</span>
        </div>

        <div class="prompt-card"
          class:flash-correct={acqFlash === 'correct'}
          class:flash-wrong={acqFlash === 'wrong'}
        >
          <div class="prompt-gloss">{acqCurrent.shortDef ?? acqCurrent.dictEntry}</div>
          {#if acqCurrent.dictEntry && acqCurrent.dictEntry !== acqCurrent.surface}
            <div class="prompt-dict">{acqCurrent.dictEntry}</div>
          {/if}
          {#if acqCurrent.morph && typeof acqCurrent.morph === 'object'}
            {@const m = acqCurrent.morph}
            <div class="prompt-morph">{m.pos ?? ''}{m.number ? ` ${m.number}` : ''}{m.case ? ` ${m.case}` : ''}</div>
          {:else if acqCurrent.morph && typeof acqCurrent.morph === 'string'}
            <div class="prompt-morph">{acqCurrent.morph}</div>
          {/if}

          <div class="surface-word">{acqCurrent.surface}</div>

          <div class="greek-display">{typed}<span class="cursor">|</span></div>

          {#if currentHints.length > 0}
            <div class="key-hints">
              {#each currentHints as hint}<kbd>{hint}</kbd>{/each}
            </div>
          {/if}
        </div>

        <div class="nav-row">
          <button class="nav-btn" on:click={goBack} title="Previous (←)">←</button>
          <button class="nav-btn" on:click={goForward} title="Next (→)">→</button>
        </div>

        <div class="btn-row">
          <button class="rate-btn done-btn" on:click={markDone} title="Remove from rotation (Shift+Enter)">
            Remove
          </button>
          <button class="rate-btn review-btn" on:click={sendAllToReview} title="Send all to review (↑)">
            Send to Review ↑
          </button>
        </div>

        <div class="acq-hint">Enter to check · ← → navigate · Shift+Enter remove · ↑ send all to review</div>

      {:else if acqDone.length > 0}
        <div class="done-panel">
          <div class="done-sub">{acqDone.length} word{acqDone.length === 1 ? '' : 's'} ready</div>
          <p class="done-note">Send them to review, or keep practicing.</p>
          <div class="btn-row">
            <button class="rate-btn done-btn" on:click={() => { acqActive = [...acqDone]; acqDone = []; acqPos = 0; focusInput(); }}>
              Practice Again
            </button>
            <button class="rate-btn review-btn" on:click={sendAllToReview}>
              Send to Review
            </button>
          </div>
        </div>

      {:else}
        <div class="done-panel">
          <div class="done-sub">All words sent to review!</div>
          <p class="done-note">Switch to Review to practice with spaced repetition.</p>
          <button class="rate-btn review-btn" on:click|stopPropagation={() => switchTab('review')}>
            Go to Review →
          </button>
        </div>
      {/if}

    <!-- ── Review tab ── -->
    {:else}

      {#if revCurrent}
        <div class="prompt-card"
          class:flash-correct={revFlash === 'correct'}
          class:flash-wrong={revFlash === 'wrong'}
        >
          <div class="prompt-gloss">{revCurrent.shortDef ?? revCurrent.dictEntry}</div>
          {#if revCurrent.morph && typeof revCurrent.morph === 'object'}
            {@const m = revCurrent.morph}
            <div class="prompt-morph">{m.pos ?? ''}{m.number ? ` ${m.number}` : ''}{m.case ? ` ${m.case}` : ''}</div>
          {:else if revCurrent.morph && typeof revCurrent.morph === 'string'}
            <div class="prompt-morph">{revCurrent.morph}</div>
          {/if}

          <div class="greek-display"
            class:correct={revFlash === 'correct'}
            class:wrong={revFlash === 'wrong'}
          >{revTyped || ' '}</div>

          {#if revFlash === 'wrong'}
            <div class="correct-answer">{revCurrent.surface}</div>
          {/if}
        </div>

        <div class="phase-label">review · {revQueue.length} remaining</div>

        <div class="btn-row">
          <button class="rate-btn hard-btn" on:click={() => submitReview('hard')}>Hard</button>
          <button class="rate-btn easy-btn" on:click={() => submitReview('easy')}>Easy</button>
        </div>

        <div class="acq-hint">Enter → Hard</div>

        <button class="back-to-learning-btn" on:click={sendBackToLearning}>
          ↩ Back to Learning
        </button>

      {:else}
        <div class="done-panel">
          <div class="done-sub">No reviews due</div>
          <p class="done-note">
            {#if vocabList.length > 0}
              Complete the Learning tab to add words to your review queue.
            {:else}
              Words you've learned will appear here for spaced repetition review.
            {/if}
          </p>
        </div>
      {/if}

    {/if}

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

  .exercise-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 1.5rem 1rem 3rem;
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

  .tab-btn.active { background: #6366f1; color: white; font-weight: 600; }

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

  .tab-count.due { background: #fbbf24; color: #78350f; }

  /* ── Card status ── */
  .card-status { font-size: 0.8rem; color: #9ca3af; }

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

  .prompt-dict {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 0.95rem;
    color: #6b7280;
  }

  .prompt-morph {
    font-size: 0.8rem;
    color: #6b7280;
    font-style: italic;
    margin-top: -0.25rem;
  }

  .surface-word {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 3.5rem;
    line-height: 1.2;
    color: #1e293b;
    user-select: text;
  }

  /* ── Greek typed display ── */
  .greek-display {
    width: 100%;
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 2.25rem;
    text-align: center;
    border-bottom: 2px solid #e5e7eb;
    color: #1e293b;
    padding: 0.25rem 0;
    min-height: 3.5rem;
    transition: border-color 0.15s;
  }

  .greek-display.correct { border-bottom-color: #16a34a; }
  .greek-display.wrong   { border-bottom-color: #dc2626; }

  .cursor {
    opacity: 0.4;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0; }
  }

  .correct-answer {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 1.5rem;
    color: #16a34a;
    font-weight: 600;
  }

  /* ── Key hints ── */
  .key-hints {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
    justify-content: center;
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

  /* ── Nav row ── */
  .nav-row { display: flex; gap: 1rem; }

  .nav-btn {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    border: 1.5px solid #e2e8f0;
    background: white;
    font-size: 1.2rem;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s;
  }

  .nav-btn:hover { background: #f1f5f9; border-color: #cbd5e1; }

  /* ── Action buttons ── */
  .btn-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .rate-btn {
    padding: 0.6em 1.5em;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.1s;
  }

  .done-btn   { background: #e2e8f0; color: #475569; }
  .done-btn:hover   { background: #cbd5e1; }
  .review-btn { background: #6366f1; color: white; }
  .review-btn:hover { background: #4f46e5; }
  .hard-btn   { background: #e2e8f0; color: #475569; }
  .hard-btn:hover   { background: #cbd5e1; }
  .easy-btn   { background: #d1fae5; color: #065f46; }
  .easy-btn:hover   { background: #a7f3d0; }

  /* ── Phase label ── */
  .phase-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #cbd5e1;
  }

  /* ── Hint text ── */
  .acq-hint { font-size: 0.7rem; color: #e2e8f0; text-align: center; }

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

  /* ── Empty / done states ── */
  .state-msg { margin-top: 4rem; font-size: 1rem; color: #9ca3af; text-align: center; }
  .state-msg.error { color: #dc2626; }

  .empty-state {
    margin-top: 3rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .empty-icon  { font-size: 2.5rem; }
  .empty-title { font-size: 1rem; font-weight: 600; color: #374151; }
  .empty-note  { font-size: 0.85rem; color: #9ca3af; margin: 0; }

  .done-panel {
    margin-top: 3rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .done-sub  { font-size: 1.1rem; font-weight: 600; color: #16a34a; }
  .done-note { font-size: 0.85rem; color: #9ca3af; max-width: 280px; margin: 0; }
</style>

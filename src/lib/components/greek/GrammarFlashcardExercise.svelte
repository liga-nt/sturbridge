<script>
  import { tick } from 'svelte';
  import { keyToGreek, applyDiacritic, processFinalSigma, DIACRITIC_MAP, greekToQwerty } from '$lib/utils/greekKeyboard.js';

  export let sets      = [];   // { id, label, cards[] }[]
  export let hintKeys  = [];
  export let inputMode = null; // null = standalone; else 'greek-hints'|'greek'|'translit'

  let localInputMode = 'greek-hints';
  $: effectiveMode   = inputMode ?? localInputMode;

  function cycleLocalMode() {
    localInputMode = localInputMode === 'greek-hints' ? 'greek'
                   : localInputMode === 'greek'       ? 'translit'
                   :                                    'greek-hints';
  }

  const MARK_TO_EKEY = {
    '́': ';', '̀': '`', '̓': '[', '̔': '{', '͂': '=', 'ͅ': '|', '̈': '"',
  };

  function keysForChar(ch) {
    if (!ch || ch === ' ') return ch === ' ' ? [' '] : [];
    const base = [...ch.normalize('NFD')][0];
    const baseKey = greekToQwerty(base.toLowerCase());
    return baseKey ? [baseKey.toLowerCase()] : [];
  }

  function nextCharKeys(target, typed) {
    const targetChars = [...(target ?? '')];
    const typedChars  = [...(typed  ?? '')];
    const pos = typedChars.length;
    if (pos > 0 && typedChars[pos - 1] !== ' ') {
      const lastChar     = typedChars[pos - 1];
      const targetAtLast = targetChars[pos - 1];
      if (targetAtLast && targetAtLast !== ' ') {
        const lastBase   = [...lastChar.normalize('NFD')][0];
        const targetBase = [...targetAtLast.normalize('NFD')][0];
        if (lastBase === targetBase && lastChar !== targetAtLast) return keysForChar(targetAtLast);
      }
    }
    for (let i = 0; i < targetChars.length; i++) {
      if ((typedChars[i] ?? '') !== targetChars[i]) return keysForChar(targetChars[i]);
    }
    return [];
  }

  const SKIP_KEYS = new Set([
    'Tab','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
    'Enter','Delete','Control','Shift','Alt','Meta','CapsLock',
    'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  ]);

  // ── Set selection ─────────────────────────────────────────────────────────────
  let activeSetIdx = 0;
  $: sets, resetAll();
  $: activeSet = sets[activeSetIdx] ?? null;
  $: cards     = activeSet?.cards ?? [];

  // ── Shared helpers ────────────────────────────────────────────────────────────
  function compare(a, b) {
    if (!a || !b) return false;
    return a.normalize('NFC') === b.normalize('NFC');
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── Greek keyboard handler (shared for both tabs) ─────────────────────────────
  function applyKey(e, curChars, targetChars) {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    if (SKIP_KEYS.has(e.key)) return null;
    e.preventDefault();

    if (e.key === 'Backspace') {
      if (curChars.length === 0) return curChars.join('');
      const lastNFD = [...curChars[curChars.length - 1].normalize('NFD')];
      if (lastNFD.length > 1) {
        lastNFD.pop();
        curChars[curChars.length - 1] = lastNFD.join('').normalize('NFC');
      } else {
        curChars.pop();
      }
      return curChars.join('');
    }

    // Allow space when target has space at this position
    if (e.key === ' ') {
      const pos = curChars.length;
      if (pos < targetChars.length && targetChars[pos] === ' ') {
        curChars.push(' ');
        return curChars.join('');
      }
      return null;
    }

    if (e.key in DIACRITIC_MAP) return null;
    const greek = keyToGreek(e.key);
    if (!greek) return null;

    const pos = curChars.length;
    const isUpper = e.key.length === 1 && e.key === e.key.toUpperCase() && e.key !== e.key.toLowerCase();
    const greekCased = isUpper ? greek.toUpperCase() : greek;

    // Cycling mode: last char has same base as target but is incomplete
    if (pos > 0 && curChars[pos - 1] !== ' ') {
      const lastChar        = curChars[pos - 1];
      const lastNFD         = [...lastChar.normalize('NFD')];
      const lastBase        = lastNFD[0];
      const targetAtLast    = targetChars[pos - 1];
      const targetAtLastNFD = targetAtLast ? [...targetAtLast.normalize('NFD')] : [];
      if (targetAtLastNFD[0] === lastBase && lastChar !== targetAtLast) {
        if (greekCased === lastBase) {
          const lastMarkSet = new Set(lastNFD.slice(1));
          const nextMark = targetAtLastNFD.slice(1).find(m => !lastMarkSet.has(m));
          if (nextMark) {
            const ekey = MARK_TO_EKEY[nextMark];
            if (ekey) { curChars[pos - 1] = applyDiacritic(lastChar, ekey); return curChars.join(''); }
          }
        }
        return null;
      }
    }

    if (pos >= targetChars.length) return null;
    const targetBase = [...targetChars[pos].normalize('NFD')][0];
    if (greekCased !== targetBase) return null;
    curChars.push(greekCased);
    return curChars.join('');
  }

  // ── List tab ──────────────────────────────────────────────────────────────────
  let showPrompt    = true;
  let showFormRef   = false;
  let typedValues   = {};
  let focusedId     = null;

  // Only show the first noun's forms in the list (so students see one full paradigm)
  $: listCards = (() => {
    if (!cards.length) return [];
    const firstLemma = cards[0]?.lemma;
    return firstLemma ? cards.filter(c => c.lemma === firstLemma) : cards;
  })();

  $: listCards, (typedValues = {});

  $: statusMap = Object.fromEntries(
    listCards.map(c => {
      const t = typedValues[c.id] ?? '';
      if (!t) return [c.id, 'empty'];
      return [c.id, compare(processFinalSigma(t), c.form) ? 'correct' : 'typing'];
    })
  );
  $: listDoneCount = listCards.filter(c => statusMap[c.id] === 'correct').length;

  function handleListKey(e, card) {
    const cur = [...(typedValues[card.id] ?? '')];
    const result = applyKey(e, cur, [...card.form]);
    if (result !== null) typedValues = { ...typedValues, [card.id]: result };
  }

  // ── Flashcard tab ─────────────────────────────────────────────────────────────
  let deck        = [];
  let currentIdx  = 0;
  let flipped     = false;
  let cardResults = {};
  let flashTyping = false;
  let flashTyped  = '';
  let flashFront  = 'prompt'; // 'prompt' | 'greek'

  $: currentCard  = deck[currentIdx] ?? null;
  $: correctCount = Object.values(cardResults).filter(r => r === 'correct').length;
  $: allDone      = deck.length > 0 && correctCount === deck.length;

  $: flashCorrect = flashTyped.length > 0 && currentCard
    ? compare(processFinalSigma(flashTyped), currentCard.form)
    : false;

  $: if (subTab === 'flashcards' && deck.length === 0 && cards.length > 0) tick().then(initDeck);

  function resetAll() {
    activeSetIdx = 0;
    typedValues  = {};
    resetDeck();
  }

  function resetDeck() {
    deck        = [];
    currentIdx  = 0;
    flipped     = false;
    cardResults = {};
    flashTyped  = '';
  }

  function initDeck() {
    deck        = shuffle([...cards]);
    currentIdx  = 0;
    flipped     = false;
    cardResults = {};
    flashTyped  = '';
  }

  function reshuffle() {
    deck        = shuffle([...cards]);
    currentIdx  = 0;
    flipped     = false;
    cardResults = {};
    flashTyped  = '';
  }

  function flipCard() {
    flipped = !flipped;
  }

  function markCard(result) {
    if (!currentCard) return;
    cardResults = { ...cardResults, [currentCard.id]: result };
    flipped    = false;
    flashTyped = '';
    for (let i = 1; i <= deck.length; i++) {
      const idx = (currentIdx + i) % deck.length;
      if (cardResults[deck[idx]?.id] !== 'correct') { currentIdx = idx; return; }
    }
  }

  function handleFlashKey(e) {
    const cur    = [...flashTyped];
    const target = [...(currentCard?.form ?? '')];
    const result = applyKey(e, cur, target);
    if (result !== null) flashTyped = result;
  }

  // Hint keys
  $: {
    if (subTab === 'flashcards' && flashTyping && currentCard && effectiveMode === 'greek-hints') {
      hintKeys = nextCharKeys(currentCard.form, flashTyped);
    } else if (subTab === 'list' && focusedId && effectiveMode === 'greek-hints') {
      const card = listCards.find(c => c.id === focusedId);
      hintKeys = card ? nextCharKeys(card.form, typedValues[card.id] ?? '') : [];
    } else {
      hintKeys = [];
    }
  }
</script>

<div class="gfe-wrap">

  <!-- Set selector pills -->
  {#if sets.length > 1}
    <div class="set-pills">
      {#each sets as set, i}
        <button
          class="set-pill"
          class:active={activeSetIdx === i}
          on:click={() => { activeSetIdx = i; resetDeck(); typedValues = {}; }}
        >{set.label}</button>
      {/each}
    </div>
  {/if}

  <!-- Sub-tabs -->
  <div class="sub-tabs">
    <button class="sub-tab" class:active={subTab === 'list'}       on:click={() => subTab = 'list'}>List</button>
    <button class="sub-tab" class:active={subTab === 'flashcards'} on:click={() => { subTab = 'flashcards'; if (!deck.length) initDeck(); }}>Flashcards</button>
  </div>

  <!-- ── List tab ── -->
  {#if subTab === 'list'}
    <div class="list-wrap">
      <div class="list-controls">
        <button class="toggle-btn" class:on={showPrompt}  on:click={() => showPrompt  = !showPrompt}>Label</button>
        <button class="toggle-btn" class:on={showFormRef} on:click={() => showFormRef = !showFormRef}>Form</button>
        {#if inputMode === null}
          <button class="input-mode-btn mode-{localInputMode}" on:click={cycleLocalMode}>
            {localInputMode === 'greek-hints' ? 'Greek + keyboard' : localInputMode === 'greek' ? 'Greek' : 'Transliterate'}
          </button>
        {/if}
        <span class="list-progress">{listDoneCount} / {listCards.length}</span>
        <button class="reset-btn" on:click={() => typedValues = {}}>Reset</button>
      </div>

      <table class="list-table">
        <thead>
          <tr>
            {#if showPrompt}  <th class="th-prompt">Case / Number</th>{/if}
            {#if showFormRef} <th class="th-form">Form</th>{/if}
            <th class="th-input">Type it</th>
          </tr>
        </thead>
        <tbody>
          {#each listCards as card (card.id)}
            {@const status = statusMap[card.id] ?? 'empty'}
            <tr class="list-row" class:row-correct={status === 'correct'}>
              {#if showPrompt}
                <td class="td-prompt">{card.prompt}</td>
              {/if}
              {#if showFormRef}
                <td class="td-form">
                  {#if 'article' in card}
                    <span class="form-article">{card.article}</span>
                    <span class="form-stem">{card.stem}</span><strong class="form-ending">{card.ending}</strong>
                  {:else if 'stem' in card}
                    <span class="form-stem">{card.stem}</span><strong class="form-ending">{card.ending}</strong>
                  {:else}
                    <span class="form-stem">{card.form}</span>
                  {/if}
                </td>
              {/if}
              <td class="td-input">
                <div class="input-wrap"
                  class:inp-correct={status === 'correct'}
                  class:inp-typing={status === 'typing'}>
                  <input
                    class="greek-input"
                    value={typedValues[card.id] ?? ''}
                    on:focus={() => focusedId = card.id}
                    on:blur={() => focusedId = null}
                    on:keydown={(e) => handleListKey(e, card)}
                    spellcheck="false"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    placeholder="type Greek…"
                  />
                  {#if status === 'correct'}<span class="check-icon">✓</span>{/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if listDoneCount === listCards.length && listCards.length > 0}
        <div class="list-done">All {listCards.length} forms typed correctly!</div>
      {/if}
    </div>

  <!-- ── Flashcard tab ── -->
  {:else}
    <div class="flash-wrap">
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

      <div class="flash-toolbar">
        <button class="toggle-btn" on:click={() => { flashFront = flashFront === 'prompt' ? 'greek' : 'prompt'; flipped = false; }}>
          {flashFront === 'prompt' ? 'Greek front' : 'Label front'}
        </button>
        <button class="toggle-btn" class:on={flashTyping} on:click={() => { flashTyping = !flashTyping; flashTyped = ''; }}>Typing</button>
        {#if inputMode === null}
          <button class="input-mode-btn mode-{localInputMode}" on:click={cycleLocalMode}>
            {localInputMode === 'greek-hints' ? 'Greek + keyboard' : localInputMode === 'greek' ? 'Greek' : 'Transliterate'}
          </button>
        {/if}
      </div>

      {#if allDone}
        <div class="flash-done">
          <div class="done-text">All done!</div>
          <button class="reshuffle-btn" on:click={reshuffle}>Shuffle again</button>
        </div>
      {:else if currentCard}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="card-scene" class:card-green={flashCorrect} on:click={flipCard}>
          <div class="card-inner" class:flipped>

            <!-- Front face -->
            <div class="card-face card-front" class:face-green={flashCorrect}>
              {#if flashFront === 'prompt'}
                <span class="card-label">{currentCard.prompt}</span>
              {:else}
                <span class="card-greek">
                  {#if 'article' in currentCard}
                    {currentCard.article} {currentCard.stem}<strong>{currentCard.ending}</strong>
                  {:else if 'stem' in currentCard}
                    {currentCard.stem}<strong>{currentCard.ending}</strong>
                  {:else}
                    {currentCard.form}
                  {/if}
                </span>
              {/if}
              <span class="card-hint">{flashCorrect ? '✓' : 'tap to reveal'}</span>
            </div>

            <!-- Back face -->
            <div class="card-face card-back">
              {#if flashFront === 'prompt'}
                <!-- Back shows Greek form -->
                <span class="card-label card-label-sm">{currentCard.prompt}</span>
                <span class="card-greek">
                  {#if 'article' in currentCard}
                    {currentCard.article} {currentCard.stem}<strong>{currentCard.ending}</strong>
                  {:else if 'stem' in currentCard}
                    {currentCard.stem}<strong>{currentCard.ending}</strong>
                  {:else}
                    {currentCard.form}
                  {/if}
                </span>
                {#if currentCard.meaning}
                  <span class="card-meaning">{currentCard.meaning}</span>
                {/if}
              {:else}
                <!-- Back shows label -->
                <span class="card-greek card-greek-sm">
                  {#if 'article' in currentCard}
                    {currentCard.article} {currentCard.stem}<strong>{currentCard.ending}</strong>
                  {:else if 'stem' in currentCard}
                    {currentCard.stem}<strong>{currentCard.ending}</strong>
                  {:else}
                    {currentCard.form}
                  {/if}
                </span>
                <span class="card-label">{currentCard.prompt}</span>
                {#if currentCard.meaning}
                  <span class="card-meaning">{currentCard.meaning}</span>
                {/if}
              {/if}
            </div>

          </div>
        </div>

        {#if flashTyping}
          <div class="flash-input-wrap" class:inp-correct={flashCorrect}>
            <input
              class="flash-greek-input"
              value={flashTyped}
              on:keydown={handleFlashKey}
              spellcheck="false"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              placeholder="type Greek…"
            />
            {#if flashCorrect}<span class="flash-check">✓</span>{/if}
          </div>
        {/if}

        <div class="flash-buttons">
          <button class="mark-btn mark-wrong" on:click={() => markCard('wrong')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <button class="mark-btn mark-correct" on:click={() => markCard('correct')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
        </div>

        <button class="reshuffle-btn" on:click={reshuffle}>Reshuffle</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .gfe-wrap {
    display: flex;
    flex-direction: column;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    padding: 0 0 48px;
  }

  /* Set pills */
  .set-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .set-pill {
    padding: 5px 14px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #6b7280;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .set-pill.active {
    background: #eef2ff;
    border-color: #a5b4fc;
    color: #4338ca;
  }

  /* Sub-tabs */
  .sub-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 20px;
  }
  .sub-tab {
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 500;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #9ca3af;
    cursor: pointer;
    margin-bottom: -1px;
    transition: color 0.15s, border-color 0.15s;
  }
  .sub-tab:hover { color: #374151; }
  .sub-tab.active { color: #4338ca; border-bottom-color: #4338ca; }

  /* List tab */
  .list-wrap { max-width: 700px; margin: 0 auto; width: 100%; }

  .list-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .toggle-btn {
    padding: 4px 14px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #6b7280;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .toggle-btn.on { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }

  .input-mode-btn {
    padding: 4px 14px;
    border-radius: 999px;
    border: 1px solid;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: filter 0.15s;
  }
  .input-mode-btn:hover { filter: brightness(0.97); }
  .input-mode-btn.mode-greek-hints { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }
  .input-mode-btn.mode-greek       { background: #f9fafb; border-color: #d1d5db; color: #6b7280; }
  .input-mode-btn.mode-translit    { background: #fdf4ff; border-color: #e9d5ff; color: #7e22ce; }

  .list-progress { margin-left: auto; font-size: 12px; color: #9ca3af; }
  .reset-btn {
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #6b7280;
    font-size: 12px;
    cursor: pointer;
  }
  .reset-btn:hover { background: #f9fafb; }

  .list-table { width: 100%; border-collapse: collapse; }
  .list-table th {
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #9ca3af;
    padding: 0 12px 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  .th-prompt { width: 40%; }
  .th-form   { width: 25%; }
  .th-input  { width: 35%; }

  .list-row { border-bottom: 1px solid #f3f4f6; }
  .list-row:hover { background: #fafafa; }
  .list-row.row-correct { background: #f0fdf4; }

  .td-prompt {
    font-size: 13px;
    color: #374151;
    padding: 10px 12px;
  }
  .td-form {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 17px;
    color: #111827;
    padding: 10px 12px;
  }
  .td-input { padding: 8px 12px; }

  .form-article { color: #6b7280; margin-right: 4px; }
  .form-stem    { color: #111827; }
  .form-ending  { color: #4338ca; }

  .input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 4px 8px;
    background: white;
    transition: border-color 0.15s, background 0.15s;
  }
  .input-wrap:focus-within { border-color: #6366f1; }
  .input-wrap.inp-typing   { border-color: #fbbf24; background: #fffbeb; }
  .input-wrap.inp-correct  { border-color: #22c55e; background: #f0fdf4; }

  .greek-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 16px;
    color: #111827;
    min-width: 0;
    width: 100%;
  }
  .greek-input::placeholder { color: #d1d5db; font-size: 13px; font-family: inherit; }

  .check-icon { color: #22c55e; font-size: 14px; flex-shrink: 0; }

  .list-done {
    text-align: center;
    margin-top: 24px;
    padding: 16px;
    background: #f0fdf4;
    border-radius: 10px;
    color: #16a34a;
    font-weight: 600;
    font-size: 15px;
  }

  /* Flashcards */
  .flash-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding-top: 8px;
  }

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

  .flash-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(640px, 92vw);
    flex-wrap: wrap;
  }

  .card-scene {
    width: min(640px, 92vw);
    height: 360px;
    perspective: 1200px;
    cursor: pointer;
  }
  .card-scene.card-green .card-front,
  .card-face.face-green { border-color: #86efac; background: #f0fdf4; }

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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 28px 32px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  }
  .card-front { background: white; border: 1px solid #e5e7eb; }
  .card-back  { background: #eef2ff; border: 1px solid #c7d2fe; transform: rotateY(180deg); }

  .card-label {
    font-size: 20px;
    font-weight: 500;
    color: #374151;
    line-height: 1.3;
  }
  .card-label-sm {
    font-size: 13px;
    color: #6366f1;
    font-weight: 500;
  }

  .card-greek {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 38px;
    color: #111827;
    line-height: 1.2;
  }
  .card-greek strong { color: #4338ca; }
  .card-greek-sm { font-size: 20px; color: #6366f1; }
  .card-greek-sm strong { color: #4338ca; }

  .card-meaning {
    font-size: 14px;
    color: #9ca3af;
    font-style: italic;
  }
  .card-hint { font-size: 11px; color: #d1d5db; text-transform: uppercase; letter-spacing: 0.08em; }

  .flash-input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1.5px solid #d1d5db;
    border-radius: 8px;
    padding: 6px 12px;
    background: white;
    width: min(320px, 80vw);
    transition: border-color 0.15s, background 0.15s;
  }
  .flash-input-wrap:focus-within { border-color: #6366f1; }
  .flash-input-wrap.inp-correct  { border-color: #22c55e; background: #f0fdf4; }

  .flash-greek-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 18px;
    text-align: center;
    color: #111827;
    min-width: 0;
  }
  .flash-greek-input::placeholder { color: #d1d5db; font-size: 13px; font-family: inherit; }

  .flash-check { color: #22c55e; font-size: 16px; flex-shrink: 0; }

  .flash-buttons { display: flex; gap: 32px; }
  .mark-btn {
    width: 60px; height: 60px;
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

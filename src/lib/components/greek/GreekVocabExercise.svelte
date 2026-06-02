<script>
  import { keyToGreek, applyDiacritic, processFinalSigma, stripGreekDiacritics, DIACRITIC_MAP, greekToQwerty } from '$lib/utils/greekKeyboard.js';

  // ── Transliteration ──────────────────────────────────────────────────────────
  const GREEK_TO_TRANSLIT = {
    'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'e',
    'θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x',
    'ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y',
    'φ':'ph','χ':'ch','ψ':'ps','ω':'o',
  };
  function greekToTranslit(str) {
    const base = str.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
    return [...base].map(ch => GREEK_TO_TRANSLIT[ch.toLowerCase()] ?? '').join('');
  }

  export let vocabList  = [];
  export let hintKeys   = [];
  export let inputMode  = null; // null = standalone (shows own button); else 'greek-hints'|'greek'|'translit'

  let localInputMode = 'greek-hints';
  $: effectiveMode   = inputMode ?? localInputMode;

  function cycleLocalMode() {
    localInputMode = localInputMode === 'greek-hints' ? 'greek'
                   : localInputMode === 'greek'       ? 'translit'
                   :                                    'greek-hints';
  }

  // Combining mark → e.key value
  const MARK_TO_EKEY = {
    '́': ';', '̀': '`', '̓': '[',
    '̔': '{', '͂': '=', 'ͅ': '|', '̈': '"',
  };

  // With cycling input, only the base key is needed — marks come from repeated presses.
  function keysForChar(ch) {
    if (!ch) return [];
    const base = [...ch.normalize('NFD')][0];
    const baseKey = greekToQwerty(base.toLowerCase());
    return baseKey ? [baseKey.toLowerCase()] : [];
  }

  // Return hint keys for the next keystroke needed.
  // If the last typed char is in "cycling mode" (base matches target but marks are missing),
  // hint the base key again; otherwise hint the base key for the next unmatched position.
  function nextCharKeys(target, typed) {
    const targetChars = [...(target ?? '')];
    const typedChars  = [...(typed  ?? '')];
    const pos = typedChars.length;
    if (pos > 0) {
      const lastChar = typedChars[pos - 1];
      const targetAtLast = targetChars[pos - 1];
      if (targetAtLast) {
        const lastBase = [...lastChar.normalize('NFD')][0];
        const targetBase = [...targetAtLast.normalize('NFD')][0];
        if (lastBase === targetBase && lastChar !== targetAtLast) {
          return keysForChar(targetAtLast);
        }
      }
    }
    for (let i = 0; i < targetChars.length; i++) {
      if ((typedChars[i] ?? '') !== targetChars[i]) return keysForChar(targetChars[i]);
    }
    return [];
  }

  let focusedDictEntry = null;

  let vocabTab = 'typing';

  const TIER_COLORS  = { intro: '#1d4ed8', beginning: '#065f46', intermediate: '#92400e', prose: '#4b5563', glossed: '#6b7280' };
  const TIER_BG      = { intro: '#dbeafe', beginning: '#d1fae5', intermediate: '#fef3c7', prose: '#f3f4f6', glossed: '#f9fafb' };
  const TIER_BORDER  = { intro: '#bfdbfe', beginning: '#6ee7b7', intermediate: '#fde68a', prose: '#e5e7eb', glossed: '#f3f4f6' };
  const TIER_LABELS_SHORT = { intro: 'Intro', beginning: 'Beginning', intermediate: 'Intermediate', prose: 'Prose', glossed: 'Glossed' };
  function tierKey(t) { return t ?? 'glossed'; }

  export let playingDictEntry = null;

  // ── Typing tab ────────────────────────────────────────────────────────────────
  export let showGreek   = true;
  export let showEnglish = true;
  let typedValues = {};

  $: translitMode = effectiveMode === 'translit';
  $: translitMode, (typedValues = {});

  $: vocabList, (typedValues = {});

  // List tier filter
  let excludedTiers = new Set();
  $: presentTiers = ['intro', 'beginning', 'intermediate', 'prose', null].filter(
    t => vocabList.some(w => (w.vocabTier ?? null) === t)
  );
  const TIER_ORDER = ['intro', 'beginning', 'intermediate', 'prose', null];
  $: filteredList = vocabList
    .filter(w => !excludedTiers.has(w.vocabTier ?? null))
    .sort((a, b) => {
      const ai = TIER_ORDER.indexOf(a.vocabTier ?? null);
      const bi = TIER_ORDER.indexOf(b.vocabTier ?? null);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  $: if (vocabTab === 'typing' && focusedDictEntry && !translitMode && effectiveMode === 'greek-hints') {
    hintKeys = nextCharKeys(focusedDictEntry, typedValues[focusedDictEntry] ?? '');
  } else if (vocabTab === 'flashcards' && flashTyping && currentCard && !flashTranslitMode && effectiveMode === 'greek-hints') {
    hintKeys = nextCharKeys(currentCard.dictEntry, flashTyped);
  } else {
    hintKeys = [];
  }

  function compare(a, b) {
    if (!a || !b) return false;
    return stripGreekDiacritics(a) === stripGreekDiacritics(b);
  }

  const SKIP_KEYS = new Set([
    'Tab','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
    'Enter','Delete','Control','Shift','Alt','Meta','CapsLock',
    'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  ]);

  function handleTypingKey(e, dictEntry) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (SKIP_KEYS.has(e.key)) return;
    e.preventDefault();
    const cur = typedValues[dictEntry] ?? '';
    const curChars = [...cur];

    if (e.key === 'Backspace') {
      if (curChars.length === 0) return;
      const lastNFD = [...curChars[curChars.length - 1].normalize('NFD')];
      if (lastNFD.length > 1) {
        lastNFD.pop();
        curChars[curChars.length - 1] = lastNFD.join('').normalize('NFC');
      } else {
        curChars.pop();
      }
      typedValues = { ...typedValues, [dictEntry]: curChars.join('') };
      return;
    }

    // Diacritic keys ignored — diacritics come from cycling (press base key repeatedly)
    if (e.key in DIACRITIC_MAP) return;

    const greek = keyToGreek(e.key);
    if (!greek) return;

    const targetChars = [...dictEntry];
    const pos = curChars.length;

    // Shift+letter → uppercase Greek; plain letter → lowercase
    const isUpper = e.key.length === 1 && e.key === e.key.toUpperCase() && e.key !== e.key.toLowerCase();
    const greekCased = isUpper ? greek.toUpperCase() : greek;

    // Cycling mode: last char has same base as target at that position but is incomplete
    if (pos > 0) {
      const lastChar = curChars[pos - 1];
      const lastNFD = [...lastChar.normalize('NFD')];
      const lastBase = lastNFD[0];
      const targetAtLast = targetChars[pos - 1];
      const targetAtLastNFD = targetAtLast ? [...targetAtLast.normalize('NFD')] : [];
      if (targetAtLastNFD[0] === lastBase && lastChar !== targetAtLast) {
        if (greekCased === lastBase) {
          const lastMarkSet = new Set(lastNFD.slice(1));
          const nextMark = targetAtLastNFD.slice(1).find(m => !lastMarkSet.has(m));
          if (nextMark) {
            const ekey = MARK_TO_EKEY[nextMark];
            if (ekey) {
              curChars[pos - 1] = applyDiacritic(lastChar, ekey);
              typedValues = { ...typedValues, [dictEntry]: curChars.join('') };
            }
          }
        }
        return;
      }
    }

    if (pos >= targetChars.length) return;
    const targetBase = [...targetChars[pos].normalize('NFD')][0];
    if (greekCased !== targetBase) return;
    curChars.push(greekCased);
    typedValues = { ...typedValues, [dictEntry]: curChars.join('') };
  }

  $: statusMap = Object.fromEntries(
    filteredList.map(w => {
      const t = typedValues[w.dictEntry] ?? '';
      if (!t) return [w.dictEntry, 'empty'];
      if (translitMode) {
        const target = greekToTranslit(w.dictEntry).toLowerCase();
        const inp    = t.toLowerCase();
        if (target === inp) return [w.dictEntry, 'correct'];
        return [w.dictEntry, target.startsWith(inp) ? 'typing' : 'wrong'];
      }
      return [w.dictEntry, compare(processFinalSigma(t), w.dictEntry) ? 'correct' : 'typing'];
    })
  );

  $: typingDoneCount = filteredList.filter(w => statusMap[w.dictEntry] === 'correct').length;

  // ── Flashcard tab ─────────────────────────────────────────────────────────────
  $: flashList = vocabList.filter(w => !excludedTiers.has(w.vocabTier ?? null));

  let deck = [];
  let currentIdx = 0;
  let flipped = false;
  let cardResults = {};
  let flashTyping = false;
  let flashTyped  = '';
  let flashFront  = 'greek'; // 'greek' | 'english'

  $: flashTranslitMode = effectiveMode === 'translit';
  $: flashTranslitMode, (flashTyped = '');

  $: flashCorrect = flashTyped.length > 0 && currentCard
    ? (flashTranslitMode
        ? greekToTranslit(currentCard.dictEntry).toLowerCase() === flashTyped.toLowerCase()
        : compare(processFinalSigma(flashTyped), currentCard.dictEntry))
    : false;

  function handleFlashKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (SKIP_KEYS.has(e.key)) return;
    e.preventDefault();

    const target = currentCard?.dictEntry ?? '';
    const targetChars = [...target];
    const curChars = [...flashTyped];

    if (e.key === 'Backspace') {
      if (curChars.length === 0) return;
      const lastNFD = [...curChars[curChars.length - 1].normalize('NFD')];
      if (lastNFD.length > 1) {
        lastNFD.pop();
        curChars[curChars.length - 1] = lastNFD.join('').normalize('NFC');
      } else {
        curChars.pop();
      }
      flashTyped = curChars.join('');
      return;
    }

    if (e.key in DIACRITIC_MAP) return;

    const greek = keyToGreek(e.key);
    if (!greek) return;

    const isUpper = e.key.length === 1 && e.key === e.key.toUpperCase() && e.key !== e.key.toLowerCase();
    const greekCased = isUpper ? greek.toUpperCase() : greek;

    const pos = curChars.length;

    if (pos > 0) {
      const lastChar = curChars[pos - 1];
      const lastNFD = [...lastChar.normalize('NFD')];
      const lastBase = lastNFD[0];
      const targetAtLast = targetChars[pos - 1];
      const targetAtLastNFD = targetAtLast ? [...targetAtLast.normalize('NFD')] : [];
      if (targetAtLastNFD[0] === lastBase && lastChar !== targetAtLast) {
        if (greekCased === lastBase) {
          const lastMarkSet = new Set(lastNFD.slice(1));
          const nextMark = targetAtLastNFD.slice(1).find(m => !lastMarkSet.has(m));
          if (nextMark) {
            const ekey = MARK_TO_EKEY[nextMark];
            if (ekey) {
              curChars[pos - 1] = applyDiacritic(lastChar, ekey);
              flashTyped = curChars.join('');
            }
          }
        }
        return;
      }
    }

    if (pos >= targetChars.length) return;
    const targetBase = [...targetChars[pos].normalize('NFD')][0];
    if (greekCased !== targetBase) return;
    curChars.push(greekCased);
    flashTyped = curChars.join('');
  }

  $: currentCard  = deck[currentIdx] ?? null;
  $: correctCount = Object.values(cardResults).filter(r => r === 'correct').length;
  $: allDone      = deck.length > 0 && correctCount === deck.length;

  // ── Audio ─────────────────────────────────────────────────────────────────────
  $: audioMap = Object.fromEntries(
    vocabList.filter(w => w.audioGreekUrl).map(w => [w.dictEntry, w.audioGreekUrl])
  );

  $: enAudioMap = Object.fromEntries(
    vocabList.filter(w => w.audioEnUrl).map(w => [w.dictEntry, w.audioEnUrl])
  );

  function playVocabAudio(dictEntry) {
    const url = audioMap[dictEntry];
    if (url) new Audio(url).play().catch(() => {});
  }

  function playWordAudio(dictEntry) {
    const grUrl = audioMap[dictEntry];
    const enUrl = enAudioMap[dictEntry];
    if (grUrl) {
      const a = new Audio(grUrl);
      a.addEventListener('ended', () => {
        if (enUrl) setTimeout(() => new Audio(enUrl).play().catch(() => {}), 300);
      }, { once: true });
      a.play().catch(() => {});
    } else if (enUrl) {
      new Audio(enUrl).play().catch(() => {});
    }
  }

  // Play when a word first becomes correct in typing tab
  let _prevCorrect = new Set();
  $: {
    const now = new Set(Object.entries(statusMap).filter(([, v]) => v === 'correct').map(([k]) => k));
    for (const de of now) { if (!_prevCorrect.has(de)) playVocabAudio(de); }
    _prevCorrect = now;
  }

  // Flip card and play audio
  function flipCard() {
    flipped = !flipped;
    if (flipped && currentCard) playWordAudio(currentCard.dictEntry);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function initDeck() {
    const list = vocabList.filter(w => !excludedTiers.has(w.vocabTier ?? null));
    deck = shuffle([...list]);
    currentIdx  = 0;
    flipped     = false;
    cardResults = {};
  }

  function markCard(result) {
    if (!currentCard) return;
    playWordAudio(currentCard.dictEntry);
    cardResults = { ...cardResults, [currentCard.dictEntry]: result };
    flipped = false;
    flashTyped = '';
    for (let i = 1; i <= deck.length; i++) {
      const idx = (currentIdx + i) % deck.length;
      if (cardResults[deck[idx]?.dictEntry] !== 'correct') {
        currentIdx = idx;
        return;
      }
    }
  }

  function reshuffle() {
    const list = vocabList.filter(w => !excludedTiers.has(w.vocabTier ?? null));
    deck = shuffle([...list]);
    currentIdx  = 0;
    flipped     = false;
    cardResults = {};
    flashTyped  = '';
  }

  $: if (vocabTab === 'flashcards' && deck.length === 0 && vocabList.length > 0) initDeck();
</script>

<div class="vocab-wrap">
  <!-- Sub-tabs -->
  <div class="sub-tabs">
    <button class="sub-tab" class:active={vocabTab === 'typing'} on:click={() => vocabTab = 'typing'}>List</button>
    <button class="sub-tab" class:active={vocabTab === 'flashcards'} on:click={() => { vocabTab = 'flashcards'; if (!deck.length) initDeck(); }}>Flashcards</button>
  </div>

  <!-- ── Typing ── -->
  {#if vocabTab === 'typing'}
    <div class="typing-wrap">
      <div class="typing-controls">
        <button class="toggle-btn" class:on={showGreek} on:click={() => showGreek = !showGreek}>Greek</button>
        <button class="toggle-btn" class:on={showEnglish} on:click={() => showEnglish = !showEnglish}>English</button>
        {#if inputMode === null}
          <button class="input-mode-btn mode-{localInputMode}" on:click={cycleLocalMode}>
            {localInputMode === 'greek-hints' ? 'Greek + keyboard' : localInputMode === 'greek' ? 'Greek' : 'Transliterate'}
          </button>
        {/if}
        <span class="typing-progress">{typingDoneCount} / {filteredList.length}</span>
        <button class="reset-btn" on:click={() => typedValues = {}}>Reset</button>
        <div class="tier-pills-group">
          {#each presentTiers as tier}
            {@const tkey = tierKey(tier)}
            {@const excluded = excludedTiers.has(tier ?? null)}
            <button
              class="tier-pill"
              style={excluded
                ? 'color:#9ca3af;background:#f3f4f6;border-color:#e5e7eb;opacity:0.55'
                : `color:${TIER_COLORS[tkey]};background:${TIER_BG[tkey]};border-color:${TIER_BORDER[tkey]}`}
              on:click={() => { const k = tier ?? null; const s = new Set(excludedTiers); s.has(k) ? s.delete(k) : s.add(k); excludedTiers = s; }}
            >{TIER_LABELS_SHORT[tkey]}</button>
          {/each}
        </div>
      </div>

      <table class="typing-table">
        <thead>
          <tr>
            {#if showGreek}<th class="th-greek">Greek</th>{/if}
            {#if showEnglish}<th class="th-eng">English</th>{/if}
            <th class="th-input">Type it</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredList as w (w.dictEntry)}
            {@const status = statusMap[w.dictEntry] ?? 'empty'}
            <tr class="typing-row" class:row-correct={status === 'correct'} class:row-playing={w.dictEntry === playingDictEntry}>
              {#if showGreek}
                <td class="td-greek" style="color:{TIER_COLORS[tierKey(w.vocabTier)]}">{w.dictEntry}</td>
              {/if}
              {#if showEnglish}
                <td class="td-eng">{w.shortDef ?? '—'}</td>
              {/if}
              <td class="td-input">
                <div class="input-wrap"
                  class:inp-correct={status === 'correct'}
                  class:inp-typing={status === 'typing'}
                  class:inp-wrong={status === 'wrong'}>
                  {#if translitMode}
                    <input
                      class="greek-input translit-input"
                      value={typedValues[w.dictEntry] ?? ''}
                      on:input={(e) => { typedValues = { ...typedValues, [w.dictEntry]: e.target.value }; }}
                      on:focus={() => focusedDictEntry = w.dictEntry}
                      on:blur={() => focusedDictEntry = null}
                      spellcheck="false"
                      autocomplete="off"
                      autocorrect="off"
                      autocapitalize="off"
                      placeholder="e.g. archo…"
                    />
                  {:else}
                    <input
                      class="greek-input"
                      value={typedValues[w.dictEntry] ?? ''}
                      on:focus={() => focusedDictEntry = w.dictEntry}
                      on:blur={() => focusedDictEntry = null}
                      on:keydown={(e) => handleTypingKey(e, w.dictEntry)}
                      spellcheck="false"
                      autocomplete="off"
                      autocorrect="off"
                      autocapitalize="off"
                      placeholder="type Greek…"
                    />
                  {/if}
                  {#if status === 'correct'}
                    <span class="check-icon">✓</span>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if typingDoneCount === filteredList.length && filteredList.length > 0}
        <div class="typing-done">All {filteredList.length} words typed correctly!</div>
      {/if}
    </div>

  <!-- ── Flashcards ── -->
  {:else}
    <div class="flash-wrap">
      <div class="flash-progress">
        {#each deck as w (w.dictEntry)}
          {@const r = cardResults[w.dictEntry]}
          <span class="dot"
            class:dot-correct={r === 'correct'}
            class:dot-wrong={r === 'wrong'}
            class:dot-current={!allDone && deck[currentIdx]?.dictEntry === w.dictEntry}
          ></span>
        {/each}
        <span class="progress-label">{correctCount} / {deck.length}</span>
      </div>

      <div class="flash-toolbar">
        <button class="toggle-btn" on:click={() => { flashFront = flashFront === 'greek' ? 'english' : 'greek'; flipped = false; }}>
          {flashFront === 'greek' ? 'English front' : 'Greek front'}
        </button>
        <button class="toggle-btn" class:on={flashTyping} on:click={() => { flashTyping = !flashTyping; flashTyped = ''; }}>Typing</button>
        {#if inputMode === null}
          <button class="input-mode-btn mode-{localInputMode}" on:click={cycleLocalMode}>
            {localInputMode === 'greek-hints' ? 'Greek + keyboard' : localInputMode === 'greek' ? 'Greek' : 'Transliterate'}
          </button>
        {/if}
        <div class="tier-pills-group">
          {#each presentTiers as tier}
            {@const tkey = tierKey(tier)}
            {@const excluded = excludedTiers.has(tier ?? null)}
            <button
              class="tier-pill"
              style={excluded
                ? 'color:#9ca3af;background:#f3f4f6;border-color:#e5e7eb;opacity:0.55'
                : `color:${TIER_COLORS[tkey]};background:${TIER_BG[tkey]};border-color:${TIER_BORDER[tkey]}`}
              on:click={() => { const k = tier ?? null; const s = new Set(excludedTiers); s.has(k) ? s.delete(k) : s.add(k); excludedTiers = s; initDeck(); }}
            >{TIER_LABELS_SHORT[tkey]}</button>
          {/each}
        </div>
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
            <div class="card-face card-front" class:face-green={flashCorrect}>
              {#if flashFront === 'greek'}
                <span class="card-greek">{currentCard.dictEntry}</span>
              {:else}
                <span class="card-english">{currentCard.shortDef ?? '—'}</span>
              {/if}
              <span class="card-hint">{flashCorrect ? '✓' : 'tap to reveal'}</span>
            </div>
            <div class="card-face card-back">
              {#if flashFront === 'greek'}
                <span class="card-greek card-sm">{currentCard.dictEntry}</span>
                <span class="card-english">{currentCard.shortDef ?? '—'}</span>
              {:else}
                <span class="card-english card-eng-sm">{currentCard.shortDef ?? '—'}</span>
                <span class="card-greek">{currentCard.dictEntry}</span>
              {/if}
            </div>
          </div>
        </div>

        {#if flashTyping}
          <div class="flash-input-wrap" class:inp-correct={flashCorrect}>
            {#if flashTranslitMode}
              <input
                class="flash-greek-input flash-translit-input"
                value={flashTyped}
                on:input={(e) => { flashTyped = e.target.value; }}
                spellcheck="false"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                placeholder="e.g. archo…"
              />
            {:else}
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
            {/if}
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
  .vocab-wrap {
    display: flex;
    flex-direction: column;
    padding: 16px 0 64px;
  }

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

  /* Typing */
  .typing-wrap { max-width: 700px; margin: 0 auto; width: 100%; }

  .typing-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .tier-pills-group {
    display: flex;
    gap: 6px;
    margin-left: auto;
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

  .typing-progress { margin-left: auto; font-size: 12px; color: #9ca3af; }

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

  .tier-pill {
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
  }

  .typing-table { width: 100%; border-collapse: collapse; }

  .typing-table th {
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #9ca3af;
    padding: 0 12px 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  .th-greek { width: 28%; }
  .th-eng   { width: 36%; }
  .th-input { width: 36%; }

  .typing-row { border-bottom: 1px solid #f3f4f6; }
  .typing-row:hover { background: #fafafa; }
  .typing-row.row-correct { background: #f0fdf4; }
  .typing-row.row-playing { background: #fef9c3; }
  .typing-row.row-playing .td-greek { color: #854d0e; }

  .td-greek {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 18px;
    color: #111827;
    padding: 10px 12px;
  }
  .td-eng { font-size: 13px; color: #6b7280; padding: 10px 12px; }
  .td-input { padding: 8px 12px; }

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
  .input-wrap.inp-wrong    { border-color: #ef4444; background: #fef2f2; }
  .input-wrap.inp-correct  { border-color: #22c55e; background: #f0fdf4; }
  .input-wrap.inp-correct .greek-input { color: #15803d; }

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
  .translit-input { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 14px; }

  .check-icon { color: #22c55e; font-size: 14px; flex-shrink: 0; }

  .typing-done {
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

  .flash-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(640px, 92vw);
  }

  .card-scene.card-green .card-front,
  .card-face.face-green {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .flash-input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1.5px solid #d1d5db;
    border-radius: 8px;
    padding: 6px 12px;
    background: white;
    width: min(280px, 80vw);
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
  .flash-translit-input { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 15px; }

  .flash-check { color: #22c55e; font-size: 16px; flex-shrink: 0; }

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

  .card-scene {
    width: min(640px, 92vw);
    height: 440px;
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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  }

  .card-front { background: white; border: 1px solid #e5e7eb; }
  .card-back  { background: #eef2ff; border: 1px solid #c7d2fe; transform: rotateY(180deg); }

  .card-greek { font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif; font-size: 36px; color: #111827; line-height: 1.2; }
  .card-greek.card-sm { font-size: 18px; color: #6366f1; }
  .card-english { font-size: 22px; color: #1f2937; font-weight: 500; }
  .card-english.card-eng-sm { font-size: 14px; color: #6366f1; font-weight: 500; }
  .card-hint { font-size: 11px; color: #d1d5db; text-transform: uppercase; letter-spacing: 0.08em; }

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

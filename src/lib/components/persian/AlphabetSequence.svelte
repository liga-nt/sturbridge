<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToPersian } from '$lib/utils/persianKeyboard.js';

  export let alphabet = [];
  export let letterForms = [];
  export let showQwertyHint = true;
  export let showRomanization = true;

  const FATHA = '\u064E';
  const KASRA = '\u0650';
  const DAMMA = '\u064F';

  const GROUPS = [
    ['be', 'pe', 'te', 'se'],
    ['jim', 'che', 'he_jooti', 'khe'],
    ['dal', 'zal'],
    ['re', 'ze', 'zhe'],
    ['sin', 'shin'],
    ['sad', 'zad'],
    ['ta', 'za'],
    ['ain', 'ghain'],
    ['fe', 'qaf'],
    ['kaf', 'gaf'],
    ['alef', 'lam', 'mim', 'nun', 'vav', 'he', 'ye'],
  ];

  // ── Mode ─────────────────────────────────────────────────────────
  let mode = 'sequence'; // 'sequence' | 'groups' | 'practice'

  // ── Sequence mode ────────────────────────────────────────────────
  let currentIndex = 0;
  let flash = null;
  let flashTimer = null;
  let activeVowel = null;
  let audioEl = null;
  let rafId = null;

  $: currentLetter = alphabet[currentIndex] ?? null;

  // ── Group mode ───────────────────────────────────────────────────
  let groupIndex = 0;
  let groupProgress = 0;
  let groupChecks = [];
  let groupDone = false;
  let completedGroups = Array(GROUPS.length).fill(false);

  $: groupLetters = alphabet.length
    ? (GROUPS[groupIndex] ?? []).map(id => alphabet.find(l => l.id === id)).filter(Boolean)
    : [];

  $: groupFirstLetters = alphabet.length
    ? GROUPS.map(g => alphabet.find(l => l.id === g[0])?.char ?? '')
    : [];

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── Practice mode ────────────────────────────────────────────────
  let practiceDeck = [];
  let practiceTotal = 0;
  let practiceDone = false;

  $: practiceLetter = practiceDeck[0] ?? null;

  function startPractice() {
    practiceDeck = shuffle([...alphabet]);
    practiceTotal = practiceDeck.length;
    practiceDone = false;
  }

  function practiceCorrect() {
    const letter = practiceDeck[0];
    const advance = () => {
      practiceDeck = practiceDeck.slice(1);
      if (practiceDeck.length === 0) practiceDone = true;
    };
    if (letter?.audio_url) {
      const a = new Audio(letter.audio_url);
      a.addEventListener('ended', advance);
      a.play().catch(() => setTimeout(advance, 400));
    } else {
      setTimeout(advance, 400);
    }
  }

  // ── Shared ───────────────────────────────────────────────────────
  $: activeLetter = mode === 'groups'   ? (groupLetters[groupProgress] ?? null)
                  : mode === 'practice' ? practiceLetter
                  : currentLetter;

  $: vowelChars = activeLetter && activeLetter.id !== 'alef'
    ? [activeLetter.char + FATHA, activeLetter.char + KASRA, activeLetter.char + DAMMA]
    : null;

  const VOWEL_COLORS = ['#fbbf24', '#34d399', '#60a5fa'];

  $: formsByLetterId = letterForms.length
    ? Object.fromEntries(letterForms.map(l => [l.id, l.forms]))
    : {};

  $: activeForms = activeLetter ? (formsByLetterId[activeLetter.id] ?? []) : [];

  const ZWJ = '\u200D';

  function formDisplay(char, label) {
    switch (label) {
      case 'initial':         return char + ZWJ;
      case 'medial':          return ZWJ + char + ZWJ;
      case 'final':
      case 'after-connector': return ZWJ + char;
      default:                return char;
    }
  }

  const FORM_LABELS = {
    isolated: 'Isolated',
    initial: 'Initial',
    medial: 'Medial',
    final: 'Final',
    'after-connector': 'After ◌',
  };

  function handleKey(e) {
    if (!activeLetter) return;
    if (['Tab','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
         'Enter','Backspace','Delete','Control','Shift','Alt','Meta'].includes(e.key)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    const persian = keyToPersian(e.key);
    if (!persian) return;
    if (persian === activeLetter.char) {
      triggerFlash('correct');
      if (mode === 'groups') groupCorrect();
      else if (mode === 'practice') practiceCorrect();
      else playLetter();
    } else {
      triggerFlash('wrong');
    }
  }

  // ── Normal mode helpers ──────────────────────────────────────────
  function playLetter() {
    if (!activeLetter?.audio_url) { advanceAfterDelay(); return; }
    if (audioEl) { audioEl.pause(); cancelAnimationFrame(rafId); }
    audioEl = new Audio(activeLetter.audio_url);
    const timestamps = activeLetter.audio_timestamps ?? [0];
    activeVowel = timestamps.length > 1 ? 0 : null;
    function tick() {
      const t = audioEl.currentTime;
      if (timestamps.length >= 3) {
        if (t >= timestamps[2]) activeVowel = 2;
        else if (t >= timestamps[1]) activeVowel = 1;
        else activeVowel = 0;
      }
      rafId = requestAnimationFrame(tick);
    }
    audioEl.addEventListener('play', () => { if (timestamps.length > 1) rafId = requestAnimationFrame(tick); });
    audioEl.addEventListener('ended', () => {
      cancelAnimationFrame(rafId);
      activeVowel = null;
      if (currentIndex < alphabet.length - 1) currentIndex++;
    });
    audioEl.play().catch(() => {
      cancelAnimationFrame(rafId);
      activeVowel = null;
      advanceAfterDelay();
    });
  }

  function advanceAfterDelay() {
    setTimeout(() => { if (currentIndex < alphabet.length - 1) currentIndex++; }, 600);
  }

  // ── Group mode helpers ───────────────────────────────────────────
  function groupCorrect() {
    const checks = [...groupChecks];
    checks[groupProgress] = true;
    groupChecks = checks;
    const isLast = groupProgress === groupLetters.length - 1;

    function advance() {
      if (isLast) {
        completedGroups = completedGroups.map((v, i) => i === groupIndex ? true : v);
        if (groupIndex < GROUPS.length - 1) {
          setTimeout(() => {
            const nextIdx = groupIndex + 1;
            groupIndex = nextIdx;
            groupProgress = 0;
            groupChecks = Array(
              (GROUPS[nextIdx] ?? []).map(id => alphabet.find(l => l.id === id)).filter(Boolean).length
            ).fill(false);
          }, 700);
        } else {
          groupDone = true;
        }
      } else {
        groupProgress++;
      }
    }

    if (activeLetter?.audio_url) {
      const a = new Audio(activeLetter.audio_url);
      a.addEventListener('ended', advance);
      a.play().catch(() => setTimeout(advance, 400));
    } else {
      setTimeout(advance, 400);
    }
  }

  function groupWrong() {
    // stay on current letter — flash already triggered in handleKey
  }

  function jumpToGroup(gi) {
    groupIndex = gi;
    groupProgress = 0;
    groupDone = false;
    groupChecks = Array(
      (GROUPS[gi] ?? []).map(id => alphabet.find(l => l.id === id)).filter(Boolean).length
    ).fill(false);
  }

  function setMode(m) {
    mode = m;
    if (m === 'groups') {
      groupIndex = 0;
      groupProgress = 0;
      groupDone = false;
      completedGroups = Array(GROUPS.length).fill(false);
      groupChecks = Array(
        (GROUPS[0] ?? []).map(id => alphabet.find(l => l.id === id)).filter(Boolean).length
      ).fill(false);
    } else if (m === 'practice') {
      startPractice();
    }
    focusInput();
  }

  // ── Shared helpers ───────────────────────────────────────────────
  function triggerFlash(type) {
    if (flashTimer) clearTimeout(flashTimer);
    flash = type;
    flashTimer = setTimeout(() => { flash = null; }, 400);
  }

  function goToIndex(i) {
    if (mode !== 'sequence') return;
    currentIndex = i;
    activeVowel = null;
    if (audioEl) { audioEl.pause(); cancelAnimationFrame(rafId); }
  }

  // ── Mobile keyboard support ──────────────────────────────────────
  let hiddenInput;

  function focusInput() {
    hiddenInput?.focus();
  }

  function handleInput(e) {
    const char = e.data;
    if (!char || !activeLetter) return;
    hiddenInput.value = '';
    // Persian keyboard → direct char; QWERTY keyboard → map it
    const persian = /[\u0600-\u06FF]/.test(char) ? char : keyToPersian(char);
    if (!persian) return;
    if (persian === activeLetter.char) {
      triggerFlash('correct');
      if (mode === 'groups') groupCorrect();
      else if (mode === 'practice') practiceCorrect();
      else playLetter();
    } else {
      triggerFlash('wrong');
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    hiddenInput?.focus();
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    if (flashTimer) clearTimeout(flashTimer);
    if (audioEl) audioEl.pause();
    cancelAnimationFrame(rafId);
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

<div class="sequence-wrapper" on:click={focusInput} role="presentation">

  <!-- Mode toggle -->
  <div class="mode-row">
    <button class="mode-btn" class:active={mode === 'sequence'} on:click={() => setMode('sequence')}>Sequence</button>
    <button class="mode-btn" class:active={mode === 'groups'}   on:click={() => setMode('groups')}>Groups</button>
    <button class="mode-btn" class:active={mode === 'practice'} on:click={() => setMode('practice')}>Practice</button>
  </div>

  {#if mode === 'groups'}
    <div class="group-label">Group {groupIndex + 1} <span class="group-of">of {GROUPS.length}</span></div>
    <div class="group-nav">
      {#each GROUPS as _, gi}
        <button
          class="group-nav-card"
          class:active={gi === groupIndex}
          class:done={completedGroups[gi]}
          on:click={() => jumpToGroup(gi)}
          title="Group {gi + 1}"
        >
          <span class="group-nav-char" dir="rtl">{groupFirstLetters[gi]}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if mode === 'practice' && practiceDone}
    <!-- Practice complete -->
    <div class="letter-card">
      <div class="complete-message">All {practiceTotal} letters!</div>
    </div>
    <button class="restart-practice-btn" on:click={startPractice}>Try again</button>

  {:else}
    <!-- Letter card -->
    <div class="letter-card" class:flash-correct={flash === 'correct'} class:flash-wrong={flash === 'wrong'}>
      {#if activeLetter && !(mode === 'groups' && groupDone)}
        <div class="persian-char" dir="rtl">{activeLetter.char}</div>
        {#if showRomanization}
          <div class="letter-name">{activeLetter.name_en}</div>
          <div class="letter-translit">{activeLetter.transliteration}</div>
        {/if}
        {#if showQwertyHint}
          <div class="qwerty-hint"><kbd>{activeLetter.qwerty_key}</kbd></div>
        {/if}
        {#if activeForms.length > 1}
          <div class="forms-row">
            {#each activeForms as form}
              <div class="form-cell">
                <div class="form-text" dir="rtl">{formDisplay(activeLetter.char, form.label)}</div>
                <div class="form-label-name">{FORM_LABELS[form.label] ?? form.label}</div>
              </div>
            {/each}
          </div>
        {/if}
        {#if vowelChars && mode !== 'practice'}
          <div class="vowel-strip" dir="rtl">
            {#each vowelChars as vc, vi}
              <div class="vowel-badge" class:active={activeVowel === vi}
                style={activeVowel === vi ? `background:${VOWEL_COLORS[vi]}22; border-color:${VOWEL_COLORS[vi]}; color:${VOWEL_COLORS[vi]}` : ''}>
                {vc}
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="complete-message">{mode === 'groups' ? 'All groups complete!' : 'All 32 letters complete!'}</div>
      {/if}
    </div>

    <!-- Progress -->
    {#if mode === 'practice'}
      <div class="practice-progress">
        <div class="practice-track">
          <div class="practice-fill" style="width:{((practiceTotal - practiceDeck.length) / practiceTotal) * 100}%"></div>
        </div>
        <span class="practice-count">{practiceTotal - practiceDeck.length} / {practiceTotal}</span>
      </div>
    {:else if mode === 'groups'}
      <div class="progress-strip" dir="ltr">
        {#each groupLetters as letter, i}
          <div class="strip-tile" class:current={i === groupProgress} class:passed={groupChecks[i]}>
            {#if groupChecks[i]}
              <span class="check">✓</span>
            {:else}
              <span class="tile-char" dir="rtl">{letter.char}</span>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="progress-strip" dir="ltr">
        {#each alphabet as letter, i}
          <button class="strip-tile" class:current={i === currentIndex} class:passed={i < currentIndex}
            on:click={() => goToIndex(i)} title="{letter.name_en} ({letter.transliteration})">
            {#if i < currentIndex}
              <span class="check">✓</span>
            {:else}
              <span class="tile-char" dir="rtl">{letter.char}</span>
            {/if}
          </button>
        {/each}
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

  .sequence-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    padding: 2rem 1rem;
  }

  .letter-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2.5rem 3rem;
    background: white;
    border-radius: 1.25rem;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    min-width: 240px;
    transition: background 0.15s;
  }

  .letter-card.flash-correct { background: #d1fae5; }
  .letter-card.flash-wrong   { background: #fee2e2; }

  .persian-char {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 7rem;
    line-height: 1;
    color: #1e293b;
    user-select: none;
  }

  .letter-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #374151;
    margin-top: 0.25rem;
  }

  .letter-translit {
    font-size: 0.9rem;
    color: #6b7280;
    font-style: italic;
  }

  .qwerty-hint { margin-top: 0.25rem; }

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

  /* Vowel strip */
  .vowel-strip {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .vowel-badge {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 1.6rem;
    padding: 0.25em 0.6em;
    border-radius: 8px;
    border: 1.5px solid #e5e7eb;
    color: #9ca3af;
    background: #f9fafb;
    transition: all 0.1s;
    min-width: 2.4rem;
    text-align: center;
    user-select: none;
  }

  .vowel-badge.active {
    font-weight: 700;
    transform: scale(1.1);
  }

  .complete-message {
    font-size: 1.2rem;
    color: #059669;
    font-weight: 600;
  }

  /* Practice progress */
  .practice-progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 360px;
  }

  .practice-track {
    flex: 1;
    height: 6px;
    background: #e5e7eb;
    border-radius: 999px;
    overflow: hidden;
  }

  .practice-fill {
    height: 100%;
    background: #6366f1;
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  .practice-count {
    font-size: 0.75rem;
    color: #9ca3af;
    white-space: nowrap;
  }

  .restart-practice-btn {
    padding: 0.5em 1.5em;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 999px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .restart-practice-btn:hover { background: #4f46e5; }

  /* Progress strip */
  .progress-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: center;
    max-width: 480px;
  }

  .strip-tile {
    width: 2.2rem;
    height: 2.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1.5px solid #e5e7eb;
    background: white;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.1s;
  }

  .strip-tile:hover        { border-color: #94a3b8; background: #f8fafc; }
  .strip-tile.current      { border-color: #6366f1; background: #eef2ff; box-shadow: 0 0 0 2px #818cf8; }
  .strip-tile.passed       { border-color: #86efac; background: #f0fdf4; }

  .check      { color: #16a34a; font-size: 0.9rem; font-weight: bold; }
  .tile-char  { font-family: "Noto Naskh Arabic", "Scheherazade New", serif; font-size: 1.1rem; color: #374151; }

  .mode-row {
    display: flex;
    gap: 0.35rem;
    background: #f1f5f9;
    padding: 0.25rem;
    border-radius: 999px;
  }

  .mode-btn {
    padding: 0.3em 1.1em;
    border-radius: 999px;
    border: none;
    background: transparent;
    font-size: 0.85rem;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }

  .mode-btn.active {
    background: white;
    color: #4338ca;
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .group-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #4338ca;
    margin-top: -1rem;
  }

  .group-of {
    font-weight: 400;
    color: #9ca3af;
  }

  .group-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: center;
    max-width: 480px;
    margin-top: -0.75rem;
  }

  .group-nav-card {
    width: 2.4rem;
    height: 2.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1.5px solid #e5e7eb;
    background: white;
    cursor: pointer;
    transition: all 0.12s;
  }

  .group-nav-card:hover {
    border-color: #94a3b8;
    background: #f8fafc;
  }

  .group-nav-card.active {
    border-color: #6366f1;
    background: #eef2ff;
    box-shadow: 0 0 0 2px #818cf8;
  }

  .group-nav-card.done {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .group-nav-card.done.active {
    border-color: #6366f1;
    background: #eef2ff;
    box-shadow: 0 0 0 2px #818cf8;
  }

  .group-nav-char {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 1.3rem;
    color: #374151;
    user-select: none;
    line-height: 1;
  }

  .group-nav-card.done .group-nav-char {
    color: #16a34a;
  }

  .group-nav-card.active .group-nav-char {
    color: #4338ca;
  }

  /* Forms row */
  .forms-row {
    display: flex;
    flex-direction: row;
    gap: 1.25rem;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 0.25rem;
    padding-top: 0.75rem;
    border-top: 1px solid #f1f5f9;
    width: 100%;
  }

  .form-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }

  .form-text {
    font-family: "Noto Naskh Arabic", "Scheherazade New", serif;
    font-size: 2.4rem;
    line-height: 1.3;
    color: #1e293b;
    user-select: none;
  }

  .form-label-name {
    font-size: 0.6rem;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>

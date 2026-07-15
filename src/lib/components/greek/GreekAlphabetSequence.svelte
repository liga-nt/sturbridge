<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyToGreek } from '$lib/utils/greekKeyboard.js';

  export let alphabet   = [];
  export let showQwertyHint = true; // kept for compat
  export let hintKeys   = [];
  export let inputMode  = 'greek-hints'; // 'greek-hints' | 'greek' | 'translit'

  // Groups: vowels / stops / fricatives / nasals+liquids / other
  const GROUPS = [
    ['alpha', 'epsilon', 'eta', 'iota', 'omicron', 'upsilon', 'omega'],
    ['beta', 'gamma', 'delta', 'kappa', 'pi', 'tau'],
    ['theta', 'phi', 'chi'],
    ['lambda', 'mu', 'nu', 'rho'],
    ['zeta', 'xi', 'sigma', 'psi'],
  ];
  const GROUP_NAMES = ['Vowels', 'Stops', 'Fricatives', 'Nasals & Liquids', 'Other'];

  // ── Mode ─────────────────────────────────────────────────────────
  let mode = 'sequence'; // 'sequence' | 'groups' | 'practice'

  // ── Sequence mode ────────────────────────────────────────────────
  let currentIndex = 0;
  let flash = null;
  let flashTimer = null;
  let audioEl = null;

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
    ? GROUPS.map(g => alphabet.find(l => l.id === g[0])?.char_lower ?? '')
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
    const advance = () => {
      practiceDeck = practiceDeck.slice(1);
      if (practiceDeck.length === 0) practiceDone = true;
    };
    if (activeLetter?.audio_url) {
      const a = new Audio(activeLetter.audio_url);
      a.addEventListener('ended', advance);
      a.play().catch(() => setTimeout(advance, 400));
    } else {
      setTimeout(advance, 400);
    }
  }

  // ── Transliteration mode ─────────────────────────────────────────
  $: translitMode = inputMode === 'translit';
  let translitBuffer = '';

  function bareTranslit(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  $: activeLetter, (translitBuffer = '');
  $: if (!translitMode) translitBuffer = '';

  // ── Shared ───────────────────────────────────────────────────────
  $: activeLetter = mode === 'groups'   ? (groupLetters[groupProgress] ?? null)
                  : mode === 'practice' ? practiceLetter
                  : currentLetter;

  $: hintKeys = (inputMode === 'greek-hints' && activeLetter && !translitMode)
      ? [activeLetter.qwerty_key.toLowerCase()] : [];

  function handleKey(e) {
    if (!activeLetter) return;
    if (['Tab','Escape','Delete','Control','Shift','Alt','Meta'].includes(e.key)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (translitMode) {
      if (e.key === 'Backspace') { translitBuffer = translitBuffer.slice(0, -1); return; }
      if (e.key.length !== 1) return;
      e.preventDefault();
      const target = bareTranslit(activeLetter.transliteration);
      const buf    = translitBuffer + e.key.toLowerCase();
      if (buf === target) {
        translitBuffer = buf;
        triggerFlash('correct');
        if (mode === 'practice') practiceCorrect();
        else if (mode === 'groups') groupCorrect();
        else playLetter();
      } else if (target.startsWith(buf)) {
        translitBuffer = buf;
      } else {
        translitBuffer = '';
        triggerFlash('wrong');
      }
      return;
    }

    // Arrow key navigation in sequence mode
    if (e.key === 'ArrowRight' && mode === 'sequence') {
      e.preventDefault();
      if (currentIndex < alphabet.length - 1) currentIndex++;
      return;
    }
    if (e.key === 'ArrowLeft' && mode === 'sequence') {
      e.preventDefault();
      if (currentIndex > 0) currentIndex--;
      return;
    }

    e.preventDefault();
    const greek = keyToGreek(e.key);
    if (!greek) return;

    if (mode === 'sequence') {
      playLetter();
    } else if (greek === activeLetter.char_lower) {
      triggerFlash('correct');
      if (mode === 'practice') {
        practiceCorrect();
      } else if (mode === 'groups') {
        groupCorrect();
      }
    } else {
      triggerFlash('wrong');
    }
  }

  function playLetter() {
    if (!activeLetter?.audio_url) {
      setTimeout(() => { if (currentIndex < alphabet.length - 1) currentIndex++; }, 400);
      return;
    }
    if (audioEl) audioEl.pause();
    audioEl = new Audio(activeLetter.audio_url);
    audioEl.addEventListener('ended', () => {
      if (currentIndex < alphabet.length - 1) currentIndex++;
    });
    audioEl.play().catch(() => {});
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
          }, 200);
        } else {
          setTimeout(() => { groupDone = true; }, 200);
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
    flash = null;
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

  function triggerFlash(type) {
    if (flashTimer) clearTimeout(flashTimer);
    flash = type;
    flashTimer = setTimeout(() => { flash = null; }, 400);
  }

  function goToIndex(i) {
    if (mode !== 'sequence') return;
    currentIndex = i;
    const letter = alphabet[i];
    if (letter?.audio_url) {
      if (audioEl) audioEl.pause();
      audioEl = new Audio(letter.audio_url);
      audioEl.play().catch(() => {});
    }
    // Re-focus hidden input after the click so keyboard input keeps working
    setTimeout(focusInput, 0);
  }

  let hiddenInput;
  function focusInput() { hiddenInput?.focus(); }

  function handleInput(e) {
    const char = e.data;
    if (!char || !activeLetter) return;
    hiddenInput.value = '';
    const greek = /[Ͱ-Ͽἀ-῿]/.test(char) ? char : keyToGreek(char);
    if (!greek) return;
    if (mode === 'sequence') {
      playLetter();
    } else if (greek === activeLetter.char_lower) {
      triggerFlash('correct');
      if (mode === 'practice') practiceCorrect();
      else if (mode === 'groups') groupCorrect();
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

{#if mode === 'groups'}
    <div class="group-label">{GROUP_NAMES[groupIndex]} <span class="group-of">({groupIndex + 1} of {GROUPS.length})</span></div>
    <div class="group-nav">
      {#each GROUPS as _, gi}
        <button
          class="group-nav-card"
          class:active={gi === groupIndex}
          class:done={completedGroups[gi]}
          on:click={() => jumpToGroup(gi)}
          title={GROUP_NAMES[gi]}
        >
          <span class="group-nav-char">{groupFirstLetters[gi]}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if mode === 'practice' && practiceDone}
    <div class="letter-card">
      <div class="complete-message">All {practiceTotal} letters!</div>
    </div>
    <button class="restart-practice-btn" on:click={startPractice}>Try again</button>

  {:else}
    <!-- Letter card -->
    <div class="letter-card" class:flash-correct={flash === 'correct'} class:flash-wrong={flash === 'wrong'}>
      {#if activeLetter && !(mode === 'groups' && groupDone)}
        <div class="greek-char">{activeLetter.char_upper}</div>
        <div class="greek-char greek-char-lower">{activeLetter.char_lower}</div>
        {#if translitMode}
          <div class="translit-buffer">
            {#if translitBuffer}<span class="buf-typed">{translitBuffer}</span><span class="buf-cursor">|</span>
            {:else}<span class="buf-idle">—</span>{/if}
          </div>
        {/if}
      {:else}
        <div class="complete-message">{mode === 'groups' ? 'Group complete!' : 'All 24 letters!'}</div>
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
      <div class="progress-strip">
        {#each groupLetters as letter, i}
          <div class="strip-tile" class:current={i === groupProgress} class:passed={groupChecks[i]}>
            {#if groupChecks[i]}
              <span class="check">✓</span>
            {:else}
              <span class="tile-char">{letter.char_lower}</span>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="progress-strip">
        {#each alphabet as letter, i}
          <button class="strip-tile" class:current={i === currentIndex}
            on:click|stopPropagation={() => goToIndex(i)} title="{letter.name_en} ({letter.transliteration})">
            <span class="tile-char">{letter.char_lower}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}

  {#if translitMode}
    <div class="seq-hint">Type the transliteration (e.g. th · ph · ch · ps)</div>
  {:else if mode === 'sequence'}
    <div class="seq-hint">Press ← → or any key to explore · click any letter to jump</div>
  {:else if mode === 'practice'}
    <div class="seq-hint">Press the QWERTY key shown — type the Greek letter</div>
  {:else}
    <div class="seq-hint">Press the QWERTY key for each letter in the group</div>
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

  .sequence-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.75rem;
    padding: 1.25rem 1rem 2rem;
  }

  .seq-controls { display: flex; gap: 8px; }

  .mode-pill {
    padding: 4px 14px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #9ca3af;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: line-through;
    transition: all 0.15s;
  }
  .mode-pill:hover { color: #6b7280; background: #f3f4f6; }
  .mode-pill.pill-on {
    background: #eef2ff;
    border-color: #a5b4fc;
    color: #4338ca;
    text-decoration: none;
  }

  .translit-buffer {
    margin-top: 0.5rem;
    font-size: 1.5rem;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: #4f46e5;
    min-height: 2rem;
    display: flex;
    align-items: center;
    gap: 1px;
  }
  .buf-typed  { color: #4f46e5; }
  .buf-cursor { color: #a5b4fc; animation: blink 1s step-end infinite; }
  .buf-idle   { color: #e2e8f0; font-weight: 400; }

  @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }

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

  .greek-char {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 7rem;
    line-height: 1;
    color: #1e293b;
    user-select: none;
  }

  .greek-char-lower {
    color: #64748b;
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

  .complete-message {
    font-size: 1.2rem;
    color: #059669;
    font-weight: 600;
  }

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

  .progress-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: center;
    max-width: 480px;
  }

  .strip-tile {
    width: 2.4rem;
    height: 2.4rem;
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

  .check     { color: #16a34a; font-size: 0.9rem; font-weight: bold; }
  .tile-char {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 1.2rem;
    color: #374151;
  }

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
    font-size: 0.95rem;
    font-weight: 600;
    color: #4338ca;
    margin-top: -0.75rem;
  }

  .group-of {
    font-weight: 400;
    color: #9ca3af;
    font-size: 0.85rem;
  }

  .group-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: center;
    max-width: 320px;
    margin-top: -0.75rem;
  }

  .group-nav-card {
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1.5px solid #e5e7eb;
    background: white;
    cursor: pointer;
    transition: all 0.12s;
  }

  .group-nav-card:hover  { border-color: #94a3b8; background: #f8fafc; }
  .group-nav-card.active { border-color: #6366f1; background: #eef2ff; box-shadow: 0 0 0 2px #818cf8; }
  .group-nav-card.done   { border-color: #86efac; background: #f0fdf4; }
  .group-nav-card.done.active { border-color: #6366f1; background: #eef2ff; box-shadow: 0 0 0 2px #818cf8; }

  .group-nav-char {
    font-family: "GFS Didot", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 1.4rem;
    color: #374151;
    user-select: none;
    line-height: 1;
  }

  .group-nav-card.done   .group-nav-char { color: #16a34a; }
  .group-nav-card.active .group-nav-char { color: #4338ca; }

  .seq-hint {
    font-size: 0.75rem;
    color: #d1d5db;
    text-align: center;
    margin-top: -0.5rem;
  }
</style>

<script>
  import { onMount, onDestroy } from 'svelte';

  export let alphabet = [];
  export let showQwertyHint = true;

  const PATAH = 'ַ';

  const NIKUD = [
    { mark: 'ַ', sound: 'a', name: 'Patah' },
    { mark: 'ָ', sound: 'a', name: 'Qamats' },
    { mark: 'ֵ', sound: 'e', name: 'Tsere' },
    { mark: 'ֶ', sound: 'e', name: 'Segol' },
    { mark: 'ִ', sound: 'i', name: 'Hiriq' },
    { mark: 'ֹ', sound: 'o', name: 'Holam' },
    { mark: 'ֻ', sound: 'u', name: 'Qibbuts' },
    { mark: 'ְ', sound: '',  name: 'Shva' },
  ];

  const HATAFIM = [
    { mark: 'ֲ', sound: 'a', name: 'Hataf Patah' },
    { mark: 'ֱ', sound: 'e', name: 'Hataf Segol' },
    { mark: 'ֳ', sound: 'o', name: 'Hataf Qamats' },
  ];

  const SHURUK = { char: 'וּ', sound: 'u', name: 'Shuruk' };

  const SOUND_COLOR  = { a: '#92400e', e: '#065f46', i: '#1d4ed8', o: '#5b21b6', u: '#991b1b', '': '#4b5563' };
  const SOUND_BORDER = { a: '#fbbf24', e: '#34d399', i: '#93c5fd', o: '#c4b5fd', u: '#fca5a5', '': '#d1d5db' };
  const SOUND_BG     = { a: '#fef9c3', e: '#d1fae5', i: '#dbeafe', o: '#ede9fe', u: '#fee2e2', '': '#f9fafb' };

  const GROUPS = [
    ['alef', 'he', 'het', 'ayin'],
    ['bet', 'vav', 'mem', 'pe'],
    ['zayin', 'samekh', 'tsadi', 'shin'],
    ['dalet', 'tet', 'lamed', 'nun', 'tav', 'resh'],
    ['gimel', 'yod', 'kaf', 'qof'],
  ];
  const GROUP_NAMES = ['Gutturals', 'Labials', 'Sibilants', 'Dentals & Liquids', 'Velars & Palatals'];

  // ── Mode ──────────────────────────────────────────────────────────
  let mode = 'sequence'; // 'sequence' | 'groups' | 'practice'

  // ── Sequence mode ─────────────────────────────────────────────────
  let currentIndex = 0;
  let flash = null;
  let flashTimer = null;
  let audioEl = null;
  let dageshMode = null; // 'hard' | 'soft' | null
  let lastLetterId = null;

  $: currentLetter = alphabet[currentIndex] ?? null;

  // ── Group mode ────────────────────────────────────────────────────
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

  // ── Practice mode ─────────────────────────────────────────────────
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
    const url = letter?.name_audio_url ?? letter?.audio_url;
    if (url) {
      const a = new Audio(url);
      a.addEventListener('ended', advance);
      a.play().catch(() => setTimeout(advance, 400));
    } else {
      setTimeout(advance, 400);
    }
  }

  // ── Shared ────────────────────────────────────────────────────────
  $: activeLetter = mode === 'groups'   ? (groupLetters[groupProgress] ?? null)
                  : mode === 'practice' ? practiceLetter
                  : currentLetter;

  $: displayChar = dageshMode === 'hard' && activeLetter?.dagesh_char
    ? activeLetter.dagesh_char + PATAH
    : activeLetter
    ? activeLetter.char + PATAH
    : '';

  $: if (activeLetter?.id !== lastLetterId) {
    lastLetterId = activeLetter?.id ?? null;
    dageshMode = null;
  }

  $: activeChar = dageshMode === 'hard' && activeLetter?.dagesh_char
    ? activeLetter.dagesh_char
    : activeLetter?.char ?? '';

  $: vowelItems = activeLetter
    ? NIKUD.map(n => ({ ...n, char: activeChar + n.mark }))
    : null;
  $: hatafItems = activeLetter?.guttural
    ? HATAFIM.map(n => ({ ...n, char: activeChar + n.mark }))
    : null;

function handleKey(e) {
    if (!activeLetter) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'ArrowRight' && mode === 'sequence') {
      e.preventDefault();
      stopAudio();
      if (currentIndex < alphabet.length - 1) currentIndex++;
    } else if (e.key === 'ArrowLeft' && mode === 'sequence') {
      e.preventDefault();
      stopAudio();
      if (currentIndex > 0) currentIndex--;
    } else if (e.key === 'ArrowRight' && mode === 'practice') {
      e.preventDefault();
      practiceCorrect();
    } else if (e.key === 'ArrowRight' && mode === 'groups') {
      e.preventDefault();
      groupCorrect();
    }
  }


  function stopAudio() {
    if (audioEl) { audioEl.pause(); audioEl = null; }
  }

  function playLetter() {
    const url = activeLetter?.name_audio_url ?? activeLetter?.audio_url;
    if (!url) { advanceAfterDelay(); return; }
    stopAudio();
    audioEl = new Audio(url);
    audioEl.addEventListener('ended', () => {
      if (mode === 'sequence' && currentIndex < alphabet.length - 1) currentIndex++;
    });
    audioEl.play().catch(() => advanceAfterDelay());
  }

  function playVowel(item) {
    const key = item.name.toLowerCase().replace(/ /g, '_');
    const map = dageshMode === 'hard' && activeLetter?.dagesh_char
      ? activeLetter?.dagesh_vowel_audio
      : activeLetter?.vowel_audio;
    const url = map?.[key];
    if (!url) return;
    stopAudio();
    audioEl = new Audio(url);
    audioEl.play().catch(() => {});
  }

  function playDagesh(m) {
    dageshMode = m;
  }

  function advanceAfterDelay() {
    setTimeout(() => { if (mode === 'sequence' && currentIndex < alphabet.length - 1) currentIndex++; }, 600);
  }

  // ── Group mode helpers ────────────────────────────────────────────
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

    const url = activeLetter?.name_audio_url ?? activeLetter?.audio_url;
    if (url) {
      const a = new Audio(url);
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
    stopAudio();
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
  }

  function triggerFlash(type) {
    if (flashTimer) clearTimeout(flashTimer);
    flash = type;
    flashTimer = setTimeout(() => { flash = null; }, 400);
  }

  function goToIndex(i) {
    if (mode !== 'sequence') return;
    stopAudio();
    currentIndex = i;
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    if (flashTimer) clearTimeout(flashTimer);
    stopAudio();
  });
</script>

<div class="sequence-wrapper" role="presentation">

  <!-- Mode toggle -->
  <div class="mode-row">
    <button class="mode-btn" class:active={mode === 'sequence'} on:click={() => setMode('sequence')}>Sequence</button>
    <button class="mode-btn" class:active={mode === 'groups'}   on:click={() => setMode('groups')}>Groups</button>
    <button class="mode-btn" class:active={mode === 'practice'} on:click={() => setMode('practice')}>Practice</button>
  </div>

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
    <button class="restart-btn" on:click={startPractice}>Try again</button>

  {:else}
    <div class="letter-card" class:flash-correct={flash === 'correct'}>
      {#if activeLetter && !(mode === 'groups' && groupDone)}

        <!-- Main letter -->
        <div class="hebrew-char" dir="rtl">{displayChar}</div>

        <!-- Name + transliteration -->
        {#if mode !== 'practice'}
          <div class="letter-meta">
            <span class="letter-name">{activeLetter.name_en}</span>
            {#if activeLetter.transliteration}
              <span class="letter-roman">/{activeLetter.transliteration}/</span>
            {/if}
          </div>
        {:else}
          <div class="letter-meta-hidden">?</div>
        {/if}

        {#if showQwertyHint}
          <div class="qwerty-hint">
            <kbd>{activeLetter.qwerty_key.length === 1 && activeLetter.qwerty_key === activeLetter.qwerty_key.toUpperCase() && activeLetter.qwerty_key !== activeLetter.qwerty_key.toLowerCase()
              ? '⇧' + activeLetter.qwerty_key
              : activeLetter.qwerty_key}</kbd>
          </div>
        {/if}

        <!-- Vowel strip — shown in sequence and groups modes -->
        {#if vowelItems && mode !== 'practice'}
          <div class="nikud-section">
            <div class="vowel-grid" dir="rtl">
              {#each vowelItems as item}
                <button class="vowel-badge"
                  on:click={() => playVowel(item)}
                  style="border-color:{SOUND_BORDER[item.sound]};background:{SOUND_BG[item.sound]};color:{SOUND_COLOR[item.sound]}">
                  <span class="vowel-char">{item.char}</span>
                  <span class="vowel-name">{item.name}</span>
                </button>
              {/each}
              <button class="vowel-badge"
                on:click={() => playVowel(SHURUK)}
                style="border-color:{SOUND_BORDER[SHURUK.sound]};background:{SOUND_BG[SHURUK.sound]};color:{SOUND_COLOR[SHURUK.sound]}">
                <span class="vowel-char">{SHURUK.char}</span>
                <span class="vowel-name">{SHURUK.name}</span>
              </button>
            </div>
            {#if hatafItems}
              <div class="hataf-note">Guttural — Hataf forms replace Shva</div>
              <div class="vowel-grid" dir="rtl">
                {#each hatafItems as item}
                  <button class="vowel-badge"
                    on:click={() => playVowel(item)}
                    style="border-color:{SOUND_BORDER[item.sound]};background:{SOUND_BG[item.sound]};color:{SOUND_COLOR[item.sound]}">
                    <span class="vowel-char">{item.char}</span>
                    <span class="vowel-name">{item.name}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Dagesh pair (bet/kaf/pe) -->
        {#if activeLetter.dagesh_char}
          <div class="pair-section">
            <div class="pair-label">Hard / soft</div>
            <div class="pair-row">
              <button class="pair-tile" class:active={dageshMode === 'hard'} on:click={() => playDagesh('hard')}>
                <span class="pair-char" dir="rtl">{activeLetter.dagesh_char + PATAH}</span>
                <span class="pair-roman">{activeLetter.dagesh_transliteration}</span>
                <span class="pair-sublabel">hard</span>
              </button>
              <button class="pair-tile" class:active={dageshMode === 'soft'} on:click={() => playDagesh('soft')}>
                <span class="pair-char" dir="rtl">{activeLetter.char + PATAH}</span>
                <span class="pair-roman">{activeLetter.no_dagesh_transliteration}</span>
                <span class="pair-sublabel">soft</span>
              </button>
            </div>
          </div>
        {/if}

        <!-- Sofit pair (kaf/mem/nun/pe/tsadi) -->
        {#if activeLetter.sofit_char}
          <div class="pair-section">
            <div class="pair-label">Standard / final form</div>
            <div class="pair-row">
              <div class="pair-tile">
                <span class="pair-char" dir="rtl">{activeLetter.char}</span>
                <span class="pair-sublabel">standard</span>
              </div>
              <div class="pair-tile">
                <span class="pair-char" dir="rtl">{activeLetter.sofit_char}</span>
                <span class="pair-sublabel">סוֹפִית</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Sin variant (shin only) -->
        {#if activeLetter.sin_variant}
          <div class="pair-section">
            <div class="pair-label">Two forms of this letter</div>
            <div class="pair-row">
              <div class="pair-tile">
                <span class="pair-char" dir="rtl">{activeLetter.char}</span>
                <span class="pair-roman">sh</span>
                <span class="pair-sublabel">Shin</span>
              </div>
              <div class="pair-tile">
                <span class="pair-char" dir="rtl">{activeLetter.sin_variant.char}</span>
                <span class="pair-roman">s</span>
                <span class="pair-sublabel">Sin</span>
              </div>
            </div>
          </div>
        {/if}

      {:else}
        <div class="complete-message">{mode === 'groups' ? 'Group complete!' : 'All 22 letters!'}</div>
      {/if}
    </div>

    <!-- Progress strip -->
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
          <button class="strip-tile" class:current={i === groupProgress} class:passed={groupChecks[i]}
            on:click={() => { groupProgress = i; }} title="{letter.name_en}">
            {#if groupChecks[i]}
              <span class="check">✓</span>
            {:else}
              <span class="tile-char" dir="rtl">{letter.char}</span>
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <div class="progress-strip">
        {#each alphabet as letter, i}
          <button class="strip-tile" class:current={i === currentIndex} class:passed={i < currentIndex}
            on:click={() => goToIndex(i)} title="{letter.name_en}">
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

  {#if mode === 'sequence'}
    <div class="seq-hint">Press ← → or click a tile to navigate</div>
  {:else if mode === 'practice'}
    <div class="seq-hint">Press → or click a tile to advance</div>
  {:else}
    <div class="seq-hint">Press → or click a tile to advance through the group</div>
  {/if}
</div>

<style>
.sequence-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.75rem;
    padding: 2rem 1rem;
  }

  .letter-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    padding: 2rem 2.5rem;
    background: white;
    border-radius: 1.25rem;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    min-width: 520px;
    max-width: 760px;
    width: 100%;
    transition: background 0.15s;
  }

  .letter-card.flash-correct { background: #d1fae5; }

  .hebrew-char {
    font-family: "Noto Sans Hebrew", "SBL Hebrew", "Times New Roman", serif;
    font-size: 7rem;
    line-height: 1.2;
    color: #1e293b;
    user-select: none;
    text-align: center;
    min-height: 9rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .letter-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: -0.25rem;
  }

  .letter-name {
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
  }

  .letter-roman {
    font-size: 0.85rem;
    color: #6b7280;
    font-style: italic;
  }

  .qwerty-hint { margin-top: 0.1rem; }

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

  /* Vowel / nikud section */
  .nikud-section {
    width: 100%;
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .vowel-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: center;
  }

  .vowel-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.6em 1em;
    border-radius: 12px;
    border: 1.5px solid #e5e7eb;
    background: #f9fafb;
    color: #9ca3af;
    min-width: 5.5rem;
    user-select: none;
    cursor: pointer;
    font-family: inherit;
    transition: filter 0.1s, transform 0.1s;
  }

  .vowel-badge:hover { filter: brightness(0.93); transform: translateY(-1px); }
  .vowel-badge:active { transform: translateY(0); filter: brightness(0.86); }

  .vowel-char {
    font-family: "Noto Sans Hebrew", "SBL Hebrew", "Times New Roman", serif;
    font-size: 4rem;
    line-height: 1.2;
  }

  .vowel-name {
    font-size: 0.7rem;
    white-space: nowrap;
    opacity: 0.9;
  }

  .hataf-note {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #9ca3af;
    font-weight: 600;
    margin-top: 0.15rem;
  }

  /* Dagesh / sofit / sin variant pairs */
  .pair-section {
    width: 100%;
    margin-top: 0.5rem;
    border-top: 1px solid #f1f5f9;
    padding-top: 0.75rem;
  }

  .pair-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    font-weight: 600;
    text-align: center;
    margin-bottom: 0.5rem;
  }

  .pair-row {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .pair-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.6rem 1rem;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 0.75rem;
    min-width: 80px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.12s;
  }

  .pair-tile:hover { border-color: #94a3b8; background: #f1f5f9; }

  .pair-tile.active {
    border-color: #6366f1;
    background: #eef2ff;
    box-shadow: 0 0 0 2px #818cf8;
  }

  .pair-char {
    font-family: "Noto Sans Hebrew", "SBL Hebrew", "Times New Roman", serif;
    font-size: 2.4rem;
    line-height: 1.3;
    color: #1e293b;
    user-select: none;
    min-height: 3.2rem;
    display: flex;
    align-items: center;
  }

  .pair-roman {
    font-size: 0.8rem;
    color: #4338ca;
    font-style: italic;
    font-weight: 600;
  }

  .pair-sublabel {
    font-size: 0.7rem;
    color: #9ca3af;
  }

  .complete-message {
    font-size: 1.2rem;
    color: #059669;
    font-weight: 600;
    padding: 2rem 0;
  }

  .practice-progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 720px;
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

  .restart-btn {
    padding: 0.5em 1.5em;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 999px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .restart-btn:hover { background: #4f46e5; }

  .progress-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: center;
    max-width: 960px;
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
    font-family: "Noto Sans Hebrew", "SBL Hebrew", "Times New Roman", serif;
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
    gap: 0.5rem;
    justify-content: center;
    margin-top: -0.75rem;
  }

  .group-nav-card {
    width: 3.2rem;
    height: 3.2rem;
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
    font-family: "Noto Sans Hebrew", "SBL Hebrew", "Times New Roman", serif;
    font-size: 1.5rem;
    color: #374151;
    user-select: none;
    line-height: 1;
  }

  .group-nav-card.done   .group-nav-char { color: #16a34a; }
  .group-nav-card.active .group-nav-char { color: #4338ca; }

  .letter-meta-hidden {
    font-size: 1.4rem;
    color: #d1d5db;
    font-weight: 300;
    letter-spacing: 0.3em;
    min-height: 1.8rem;
    display: flex;
    align-items: center;
  }

  .seq-hint {
    font-size: 0.75rem;
    color: #d1d5db;
    text-align: center;
    margin-top: -0.5rem;
  }
</style>

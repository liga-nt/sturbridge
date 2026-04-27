<script>
  import { page } from '$app/stores';
  import { onMount, onDestroy, getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { doc, getDoc } from 'firebase/firestore';
  import { db } from '$lib/firebase/client';
  import GreekPassage from '$lib/components/greek/GreekPassage.svelte';
  import VocabPanel from '$lib/components/greek/VocabPanel.svelte';
  import ConjugationTable from '$lib/components/greek/ConjugationTable.svelte';
  import MediterraneanMap from '$lib/components/greek/MediterraneanMap.svelte';
  import GreekVocabExercise from '$lib/components/greek/GreekVocabExercise.svelte';

  const ctx = getContext('student');

  // ── Lesson data ──────────────────────────────────────────────────────────────
  let lesson = null;
  let loading = true;
  let error = null;

  // ── Word forms cache (for paradigm table) ────────────────────────────────────
  let wordFormsCache = null;

  async function loadWordFormsCache() {
    try {
      const res = await fetch('/data/Greek/word_forms.json');
      const raw = await res.json();
      // Merge Firestore glosses
      const snap = await getDoc(doc(db, 'word_glosses', 'grade7-greek'));
      if (snap.exists()) Object.assign(raw, snap.data().forms ?? {});
      // Build a stripped-key secondary map so lookup works even without diacritics,
      // without needing pre-stored unaccented duplicates in the JSON.
      const stripped = {};
      for (const [k, v] of Object.entries(raw)) {
        const bare = stripGreekDiacritics(k);
        if (bare !== k) stripped[bare] = v;  // only add if different
      }
      wordFormsCache = { ...raw, ...stripped };
    } catch (e) {
      console.warn('loadWordFormsCache failed:', e.message);
    }
  }

  const PUNCT_RE = /[.,;:·?!]/g;

  function morphToDisplay(m) {
    if (!m || typeof m !== 'object') return typeof m === 'string' ? m : '';
    const { pos } = m;
    if (!pos || ['prep','conj','adv','interj','particle','prefix'].includes(pos)) return pos ?? '';
    if (pos === 'verb') {
      if (m.mood === 'inf') return `${m.tense} inf. ${m.voice}`;
      return `${m.tense} ${m.mood} ${m.voice} ${m.person}${m.number}`;
    }
    if (pos === 'pron') {
      const sub = m.subtype ? `${m.subtype} ` : '';
      return m.person
        ? `pron ${sub}${m.person}${m.number} ${m.case}`
        : `pron ${sub}${m.gender} ${m.number} ${m.case}`;
    }
    return `${pos} ${m.gender ?? ''} ${m.number ?? ''} ${m.case ?? ''}`.trim().replace(/\s+/g, ' ');
  }

  function stripGreekDiacritics(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /**
   * Scan sentence tokens against wordFormsCache — same logic as dev scanVocab.
   * Returns { dictEntry, shortDef, vocabTier }[] deduplicated.
   */
  function scanVocabFromCache(sents, cache) {
    if (!cache) return [];
    const seen = new Set();
    const list = [];
    for (const sent of sents) {
      for (const token of (sent.greek ?? '').trim().split(/\s+/).filter(Boolean)) {
        const bare = token.replace(PUNCT_RE, '');
        if (!bare || seen.has(bare)) continue;
        seen.add(bare);
        const entry = cache[bare] || cache[token] || cache[stripGreekDiacritics(bare)];
        if (entry?.dictEntry && entry.vocabTier) {
          if (!list.find(w => w.dictEntry === entry.dictEntry)) {
            list.push({ dictEntry: entry.dictEntry, shortDef: entry.shortDef ?? '', vocabTier: entry.vocabTier });
          }
        }
      }
    }
    return list;
  }

  /**
   * Build nested forms for a specific dictEntry from the flat cache.
   * Stores forms both with gender key (for multi-gender paradigms like adjectives/articles)
   * AND without gender key (for simple noun paradigms like 2nd_declension_masculine).
   */
  function hasDiacritics(s) {
    return s !== s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function preferForm(existing, candidate) {
    if (!existing) return candidate;
    if (hasDiacritics(candidate) && !hasDiacritics(existing)) return candidate;
    return existing;
  }

  /**
   * Build nested forms for a specific dictEntry from the flat cache.
   *
   * Verbs are grouped by tense.mood.voice so different tenses don't clobber each other.
   *   result['pres.indic.act'] = { sg: { 1: 'λύω', 2: 'λύεις', ... }, pl: { ... } }
   *   result['aor.indic.act']  = { sg: { 1: 'ἔλυσα', ... }, pl: { ... } }
   *
   * Non-verbs use the standard nested shape:
   *   Noun:        { sg: { nom, gen, ... }, pl: { ... } }
   *   Multi-gender: { masc: { sg: { nom, ... }, pl: { ... } }, fem: ..., neut: ... }
   */
  function buildWordForms(de) {
    if (!de || !wordFormsCache) return null;
    const result = {};
    for (const [form, entry] of Object.entries(wordFormsCache)) {
      if (entry.dictEntry !== de) continue;
      const m = entry.morph;
      if (!m || typeof m !== 'object') continue;
      const { pos, number: num, case: case_, gender, person, tense, mood, voice } = m;
      if (!num && !pos) continue;

      if (pos === 'verb') {
        if (!tense || !voice) continue;
        // Infinitives are included in the parent indicative paradigm group
        const moodKey = mood === 'inf' ? 'indic' : mood;
        if (!moodKey) continue;
        const key = `${tense}.${moodKey}.${voice}`;
        result[key] ??= {};
        if (mood === 'inf') {
          result[key]['inf'] = preferForm(result[key]['inf'], form);
        } else if (num && person) {
          result[key][num] ??= {};
          result[key][num][person] = preferForm(result[key][num]?.[person], form);
        }
      } else if (case_ && num) {
        if (gender) {
          result[gender] ??= {};
          result[gender][num] ??= {};
          result[gender][num][case_] = preferForm(result[gender][num][case_], form);
        }
        result[num] ??= {};
        result[num][case_] = preferForm(result[num][case_], form);
      }
    }
    return Object.keys(result).length ? result : null;
  }

  /**
   * Select the relevant sub-paradigm for the hovered word.
   * For verbs: extracts the tense.mood.voice slice (using indic as fallback for inf).
   * For others: returns the full forms object.
   */
  function selectWordForms(allForms, morph) {
    if (!allForms || !morph) return null;
    if (morph.pos !== 'verb') return allForms;
    const { tense, voice, mood } = morph;
    if (!tense || !voice) return null;
    // Infinitives show the corresponding indicative paradigm
    const moodKey = mood === 'inf' ? 'indic' : mood;
    const key = `${tense}.${moodKey}.${voice}`;
    const sub = allForms[key];
    if (!sub) return null;
    // Return the number/person grid (drop the 'inf' key from the sub object)
    const { inf: _inf, ...grid } = sub;
    return Object.keys(grid).length ? grid : null;
  }

  onMount(async () => {
    try {
      const [lessonSnap] = await Promise.all([
        getDoc(doc(db, 'lessons', $page.params.lessonId)),
        loadWordFormsCache()
      ]);
      if (lessonSnap.exists()) lesson = { id: lessonSnap.id, ...lessonSnap.data() };
      else error = 'Lesson not found.';
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });

  $: sentences = lesson?.sentences ?? [];
  // Same scan+merge logic as dev page — fresh, accurate, uses loaded cache
  $: vocabList = wordFormsCache ? scanVocabFromCache(sentences, wordFormsCache) : (lesson?.vocab_list ?? []);

  // ── Hover word ────────────────────────────────────────────────────────────────
  let hoveredWord = null;

  function handleWordHover(e) {
    hoveredWord = e.detail?.word ?? null;
  }

  $: paradigmKey = hoveredWord?.paradigmKey ?? null;
  $: highlightMorph = hoveredWord?.morph ?? null;
  // Build forms for the hovered word, then select the relevant sub-paradigm
  $: _allWordForms = hoveredWord && wordFormsCache ? buildWordForms(hoveredWord.dictEntry) : null;
  $: wordForms = selectWordForms(_allWordForms, highlightMorph);
  $: dictEntry = hoveredWord?.dictEntry ?? null;

  // ── Lesson part navigation ────────────────────────────────────────────────────
  let lessonPart = 'overview'; // 'overview' | 'vocab' | 'story' | 'map'

  // Available parts in order — derived once lesson loads
  $: availableParts = lesson ? [
    lesson.overview?.text                          ? 'overview' : null,
    'vocab',
    (lesson.sentences?.length ?? 0) > 0           ? 'story'    : null,
    lesson.map?.description                        ? 'map'      : null,
  ].filter(Boolean) : [];

  // Default to first available part when lesson loads
  $: if (lesson && !availableParts.includes(lessonPart)) lessonPart = availableParts[0] ?? 'story';

  const PART_LABELS = { overview: 'Overview', vocab: 'Vocab', story: 'Story', map: 'Map' };

  // ── Enforce accents toggle (persisted in localStorage) ───────────────────────
  let enforceAccents = false;

  function toggleEnforceAccents() {
    enforceAccents = !enforceAccents;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('greek_enforce_accents', String(enforceAccents));
    }
  }

  // Load enforce-accents preference on mount
  $: if (typeof localStorage !== 'undefined') {
    enforceAccents = localStorage.getItem('greek_enforce_accents') === 'true';
  }

  // ── Simple audio highlighting for overview / map ───────────────────────────
  let simpleHighlightIndex = -1;  // index into alignment array
  let simpleAudio = null;
  let simpleAudioPlaying = false;
  let simpleAudioPart = null;

  function playSimpleAudio(part) {
    const data = lesson?.[part];
    if (!data?.audioUrl) return;
    stopSimpleAudio();
    simpleAudioPart = part;
    simpleAudioPlaying = true;
    simpleHighlightIndex = -1;
    const audio = new Audio(data.audioUrl);
    simpleAudio = audio;
    const alignment = data.alignment ?? [];
    let rafId;
    function tick() {
      if (!simpleAudio || simpleAudio !== audio) return;
      const t = audio.currentTime;
      let idx = -1;
      for (let i = 0; i < alignment.length; i++) {
        if (t >= alignment[i].start && t <= alignment[i].end) { idx = i; break; }
      }
      simpleHighlightIndex = idx;
      rafId = requestAnimationFrame(tick);
    }
    audio.addEventListener('play', () => requestAnimationFrame(tick));
    audio.addEventListener('ended', () => {
      simpleAudioPlaying = false;
      simpleHighlightIndex = -1;
      cancelAnimationFrame(rafId);
    });
    audio.play();
  }

  function stopSimpleAudio() {
    if (simpleAudio) { simpleAudio.pause(); simpleAudio.src = ''; simpleAudio = null; }
    simpleAudioPlaying = false;
    simpleHighlightIndex = -1;
  }

  $: if (lessonPart) stopSimpleAudio();

  // ── Audio state ───────────────────────────────────────────────────────────────
  let audioMode = 'greek'; // 'greek' | 'english' | 'alternating'
  let greekRate = 1.0;
  let englishRate = 1.0;
  let highlightingEnabled = true;
  let isPlaying = false;
  let currentAudio = null;
  let currentSentenceIdx = -1;
  let currentPlayingMode = 'greek';

  // currentWords drives GreekPassage highlighting
  let currentWords = [];
  let highlightVersion = 0;

  // ── UI state ──────────────────────────────────────────────────────────────────
  let showSettingsModal = false;
  let showInfoModal = false;
  let infoModalTab = 'desktop';

  onDestroy(stopAudio);

  function clearHighlights() {
    highlightVersion++;
    currentWords = [];
  }

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
    clearHighlights();
    isPlaying = false;
    currentSentenceIdx = -1;
  }

  function handleRateChange(variant, newRate) {
    if (variant === 'greek') greekRate = newRate;
    else englishRate = newRate;
    // If currently playing this variant, stop so highlights stay in sync
    if (isPlaying && currentAudio) {
      const isCurrentVariant = variant === currentPlayingMode;
      if (isCurrentVariant) stopAudio();
    }
  }

  const MIN_HIGHLIGHT_DURATION = 0.15;

  function setupHighlighting(timepoints, sentenceNum, audioRef, offset = 0, rate = 1.0) {
    clearHighlights();
    const version = highlightVersion;
    if (!timepoints) return;

    const entries = Object.entries(timepoints).filter(([, tp]) => tp?.start !== undefined);
    if (entries.length === 0) return;

    const allWords = entries
      .map(([sentPos, tp]) => ({ sentPos, start: tp.start, end: tp.end }))
      .sort((a, b) => a.start - b.start);

    // Group words sharing the same start time
    const groups = [];
    for (const w of allWords) {
      const last = groups.at(-1);
      if (last && Math.abs(last[0].start - w.start) < 0.001) last.push(w);
      else groups.push([w]);
    }

    function schedule(delayMs, words, phase) {
      let t0;
      const cb = (ts) => {
        if (highlightVersion !== version || currentAudio !== audioRef) return;
        if (t0 === undefined) t0 = ts;
        if (ts - t0 >= delayMs) {
          if (phase === 'clear') {
            currentWords = [];
          } else {
            currentWords = words.map(w => ({
              sentenceNum: String(sentenceNum),
              sentPos: String(w.sentPos),
              phase
            }));
          }
        } else {
          requestAnimationFrame(cb);
        }
      };
      requestAnimationFrame(cb);
    }

    for (const group of groups) {
      const start = group[0].start;
      if (start < offset - 0.1) continue;
      schedule(Math.max(0, (start - offset) / rate * 1000), group, 'full');

      group.forEach(word => {
        const idx = allWords.findIndex(w => w.sentPos === word.sentPos && w.start === word.start);
        if (idx < allWords.length - 1) {
          const fadeTime = Math.max(word.end, word.start + MIN_HIGHLIGHT_DURATION);
          const fadeDelay = Math.max(0, (fadeTime - offset) / rate * 1000);
          const next = allWords[idx + 1];
          schedule(fadeDelay, [word], 'fadeOut');
          schedule(fadeDelay, [next], 'fadeIn');
        }
      });
    }

    const lastGroup = groups.at(-1);
    if (lastGroup) {
      const maxEnd = Math.max(...lastGroup.map(w => w.end));
      schedule(Math.max(0, (maxEnd - offset) / rate * 1000), [], 'clear');
    }
  }

  function getUrl(sentence, mode) {
    if (mode === 'english') return sentence.english_audio_url ?? null;
    return sentence.greek_audio_url ?? sentence.audio_url ?? null;
  }

  function getTimepoints(sentence, mode) {
    if (mode === 'english') return sentence.timepoints?.english ?? {};
    return sentence.timepoints?.greek ?? {};
  }

  // ── playSentence — single-sentence playback helper ─────────────────────────
  function playSentence(sentence, mode, sentenceIdx) {
    const url = getUrl(sentence, mode);
    const rate = mode === 'greek' ? greekRate : englishRate;
    currentSentenceIdx = sentenceIdx;
    currentPlayingMode = mode;

    if (!url || !isPlaying) return Promise.resolve();

    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.playbackRate = rate;
      currentAudio = audio;

      function checkInterrupt() {
        if (currentAudio !== audio || !isPlaying) { resolve(); return; }
        requestAnimationFrame(checkInterrupt);
      }

      audio.addEventListener('ended', () => { clearHighlights(); resolve(); }, { once: true });
      audio.addEventListener('error', resolve, { once: true });

      audio.play().then(() => {
        if (highlightingEnabled) {
          setupHighlighting(getTimepoints(sentence, mode), sentence.num, audio, 0, rate);
        }
        requestAnimationFrame(checkInterrupt);
      }).catch(resolve);
    });
  }

  // ── handleWordClick — start from a specific word ───────────────────────────
  function handleWordClick(e) {
    const { word, sentence } = e.detail;
    const mode = audioMode === 'alternating' ? 'greek' : audioMode;
    const url = getUrl(sentence, mode);
    if (!url) return;

    const rate = mode === 'greek' ? greekRate : englishRate;
    const timepoints = getTimepoints(sentence, mode);
    const tp = timepoints[String(word.sentPos)];
    const offset = tp?.start ?? 0;

    stopAudio();
    const audio = new Audio(url);
    audio.playbackRate = rate;
    currentAudio = audio;
    currentPlayingMode = mode;
    isPlaying = true;
    currentSentenceIdx = sentences.indexOf(sentence);

    // Immediate feedback
    currentWords = [{ sentenceNum: String(sentence.num), sentPos: String(word.sentPos), phase: 'full' }];

    audio.addEventListener('ended', () => {
      clearHighlights();
      isPlaying = false;
      currentSentenceIdx = -1;
      currentAudio = null;
    }, { once: true });

    audio.play().then(() => {
      if (offset > 0) audio.currentTime = offset;
      if (highlightingEnabled) {
        setupHighlighting(timepoints, sentence.num, audio, offset, rate);
      }
    }).catch(() => { isPlaying = false; });
  }

  // ── playAll — play all sentences; alternating plays each sentence twice ─────
  async function playAll() {
    stopAudio();
    isPlaying = true;

    for (let i = 0; i < sentences.length; i++) {
      if (!isPlaying) break;
      const sentence = sentences[i];
      const modes = audioMode === 'alternating' ? ['greek', 'english'] : [audioMode];
      for (const mode of modes) {
        if (!isPlaying) break;
        await playSentence(sentence, mode, i);
      }
    }

    isPlaying = false;
    currentAudio = null;
    currentSentenceIdx = -1;
  }

  function togglePlayPause() {
    if (isPlaying) stopAudio();
    else playAll();
  }
</script>

<svelte:head>
  <title>{lesson?.title ?? 'Lesson'} — Greek</title>
</svelte:head>

<div class="lesson-page">

  <!-- ── Fixed top bar ─────────────────────────────────────────────────────── -->
  <div class="top-bar">
    <div class="controls-row">
      <div class="controls-inner">
      <!-- Back -->
      <button class="back-btn" on:click={() => goto('/student/greek')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      <!-- Play / Pause -->
      <button class="play-pause-btn" on:click={togglePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'} disabled={!lesson}>
        {#if isPlaying}
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <line x1="10" y1="4" x2="10" y2="43"/>
            <line x1="30" y1="4" x2="30" y2="43"/>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="3 3 40 23 3 43 3 3"/>
          </svg>
        {/if}
      </button>

      <!-- Settings button -->
      <button
        class="icon-btn"
        on:click={() => showSettingsModal = true}
        aria-label="Settings"
        title="Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>

      <!-- Info button -->
      <button
        class="icon-btn"
        on:click={() => showInfoModal = true}
        aria-label="Help"
        title="Help"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </button>

      <!-- Title -->
      {#if lesson}
        <span class="lesson-title">{lesson.title}</span>
        {#if lesson.chapter}
          <span class="chapter-badge">Ch. {lesson.chapter}</span>
        {/if}
      {/if}

      <!-- Enforce accents toggle (vocab tab) -->
      {#if lessonPart === 'vocab'}
        <button
          class="accent-toggle"
          class:accent-on={enforceAccents}
          on:click={toggleEnforceAccents}
          title={enforceAccents ? 'Accents required — click to relax' : 'Accents optional — click to require'}
        >
          {enforceAccents ? 'Accents: on' : 'Accents: off'}
        </button>
      {/if}

      <!-- Part tabs -->
      {#if availableParts.length > 1}
        <div class="part-tabs">
          {#each availableParts as part}
            <button
              on:click={() => { stopAudio(); lessonPart = part; }}
              class="part-tab {lessonPart === part ? 'part-tab-active' : ''}"
            >{PART_LABELS[part]}</button>
          {/each}
        </div>
      {/if}
      </div>
    </div>

    <!-- Analysis bar — Reader.svelte style -->
    <div class="analysis-bar" class:analysis-placeholder={!hoveredWord}>
      <div class="analysis-inner">
        {#if hoveredWord}
          <strong class="word-form">{hoveredWord.dictEntry ?? hoveredWord.text}</strong>
          {#if hoveredWord.shortDef}
            <span class="sep">|</span>
            <span class="definition">"{hoveredWord.shortDef}"</span>
          {/if}
          {#if hoveredWord.morph}
            <span class="sep">|</span>
            <span class="morph-tag">{morphToDisplay(hoveredWord.morph)}</span>
          {/if}
        {:else}
          Hover a word to see analysis
        {/if}
      </div>
    </div>
  </div>

  <!-- ── Single scrollable area ─────────────────────────────────────────────── -->
  {#if loading}
    <div class="state-msg">Loading lesson…</div>
  {:else if error}
    <div class="state-msg error">{error}</div>
  {:else if lesson}

    <!-- ── Vocab part ───────────────────────────────────────────────────────── -->
    {#if lessonPart === 'vocab'}
      <div class="scroll-area">
        <div class="vocab-exercise-wrap">
          <GreekVocabExercise
            vocabList={lesson.vocab_list ?? []}
            uid={ctx.uid}
            courseId="grade7-greek"
            {enforceAccents}
          />
        </div>
      </div>

    <!-- ── Overview part ───────────────────────────────────────────────────── -->
    {:else if lessonPart === 'overview'}
      {@const ov = lesson.overview ?? {}}
      {@const alignment = ov.alignment ?? []}
      {@const words = ov.text ? ov.text.match(/\S+/g) ?? [] : []}
      <div class="scroll-area">
        <div class="simple-part">
          {#if ov.imageUrl}
            <img src={ov.imageUrl} alt="Chapter overview illustration" class="part-image" />
          {/if}
          <div class="part-text">
            {#each words as word, i}
              <span class="simple-word {simpleAudioPart === 'overview' && simpleHighlightIndex >= 0 && alignment[simpleHighlightIndex]?.word === word ? 'word-highlight' : ''}">{word} </span>
            {/each}
          </div>
          {#if ov.audioUrl}
            <button on:click={() => simpleAudioPlaying && simpleAudioPart === 'overview' ? stopSimpleAudio() : playSimpleAudio('overview')}
              class="audio-play-btn">
              {simpleAudioPlaying && simpleAudioPart === 'overview' ? '⏹ Stop' : '▶ Listen'}
            </button>
          {/if}
        </div>
      </div>

    <!-- ── Story part ──────────────────────────────────────────────────────── -->
    {:else if lessonPart === 'story'}
      <div class="scroll-area">
        <div class="three-col">
          <aside class="col col-vocab">
            <div class="col-label">Vocabulary</div>
            <VocabPanel {vocabList} headless />
          </aside>
          <main class="col col-passage">
            {#if sentences.length > 0}
              <GreekPassage
                {sentences}
                {currentWords}
                on:wordHover={handleWordHover}
                on:wordClick={handleWordClick}
              />
            {:else}
              <p class="empty-note">{lesson.intro ?? 'No content yet.'}</p>
            {/if}
            {#if lesson.image_url}
              <div class="lesson-image-wrap">
                <img src={lesson.image_url} alt="Chapter illustration" class="lesson-image" />
              </div>
            {/if}
          </main>
          <aside class="col col-paradigm">
            {#if paradigmKey || wordForms}
              <div class="col-label">Paradigm</div>
              <ConjugationTable {paradigmKey} {highlightMorph} {wordForms} {dictEntry} />
            {:else if hoveredWord}
              <p class="empty-note">No paradigm for this word.</p>
            {:else}
              <p class="empty-note muted">Hover a word…</p>
            {/if}
          </aside>
        </div>
      </div>

    <!-- ── Map part ────────────────────────────────────────────────────────── -->
    {:else if lessonPart === 'map'}
      {@const mp = lesson.map ?? {}}
      {@const alignment = mp.alignment ?? []}
      {@const words = mp.description ? mp.description.match(/\S+/g) ?? [] : []}
      <div class="scroll-area">
        <div class="simple-part">
          <div class="part-text">
            {#each words as word, i}
              <span class="simple-word {simpleAudioPart === 'map' && simpleHighlightIndex >= 0 && alignment[simpleHighlightIndex]?.word === word ? 'word-highlight' : ''}">{word} </span>
            {/each}
          </div>
          {#if mp.audioUrl}
            <button on:click={() => simpleAudioPlaying && simpleAudioPart === 'map' ? stopSimpleAudio() : playSimpleAudio('map')}
              class="audio-play-btn">
              {simpleAudioPlaying && simpleAudioPart === 'map' ? '⏹ Stop' : '▶ Listen'}
            </button>
          {/if}
          <div class="map-wrap">
            {#if mp.imageUrl}
              <img src={mp.imageUrl} alt="Mediterranean map" style="width:100%;height:auto;display:block;border-radius:8px;" />
            {:else}
              <MediterraneanMap
                highlighted={new Set(mp.highlighted ?? [])}
                activeRouteId={mp.activeRouteId ?? null}
                showControls={false}
              />
            {/if}
          </div>
        </div>
      </div>
    {/if}

  {/if}

</div>

<!-- ── Settings modal ─────────────────────────────────────────────────────── -->
{#if showSettingsModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={() => showSettingsModal = false}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-content settings-modal" on:click={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>Reader Settings</h2>
        <button class="modal-close" on:click={() => showSettingsModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-body">

        <section class="settings-section">
          <h3>Audio Language</h3>
          <div class="settings-options">
            <label class="setting-option">
              <input type="radio" name="audioMode" value="greek"
                checked={audioMode === 'greek'}
                on:change={() => { stopAudio(); audioMode = 'greek'; }} />
              <span>Greek</span>
            </label>
            <label class="setting-option">
              <input type="radio" name="audioMode" value="english"
                checked={audioMode === 'english'}
                on:change={() => { stopAudio(); audioMode = 'english'; }} />
              <span>English</span>
            </label>
            <label class="setting-option">
              <input type="radio" name="audioMode" value="alternating"
                checked={audioMode === 'alternating'}
                on:change={() => { stopAudio(); audioMode = 'alternating'; }} />
              <span>Alternating (Greek then English per sentence)</span>
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h3>Playback Speed</h3>
          <div class="settings-options">
            <div class="rate-control">
              <label>Greek Speed</label>
              <div class="rate-control-slider">
                <input
                  type="range" min="0.5" max="2" step="0.05"
                  value={greekRate}
                  on:input={(e) => handleRateChange('greek', Number(e.target.value))}
                />
                <span class="rate-value">{greekRate.toFixed(2)}x</span>
              </div>
            </div>
            <div class="rate-control">
              <label>English Speed</label>
              <div class="rate-control-slider">
                <input
                  type="range" min="0.5" max="2" step="0.05"
                  value={englishRate}
                  on:input={(e) => handleRateChange('english', Number(e.target.value))}
                />
                <span class="rate-value">{englishRate.toFixed(2)}x</span>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h3>Highlighting</h3>
          <div class="settings-options">
            <label class="setting-option">
              <input
                type="checkbox"
                checked={highlightingEnabled}
                on:change={(e) => { highlightingEnabled = e.target.checked; }}
              />
              <span>Enable word highlighting during playback</span>
            </label>
          </div>
        </section>

      </div>
    </div>
  </div>
{/if}

<!-- ── Info / help modal ───────────────────────────────────────────────────── -->
{#if showInfoModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={() => showInfoModal = false}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-content" on:click={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>Reader Guide</h2>
        <button class="modal-close" on:click={() => showInfoModal = false} aria-label="Close">×</button>
      </div>
      <div class="modal-tabs">
        <button class="modal-tab" class:active={infoModalTab === 'desktop'}
          on:click={() => infoModalTab = 'desktop'}>Desktop</button>
        <button class="modal-tab" class:active={infoModalTab === 'mobile'}
          on:click={() => infoModalTab = 'mobile'}>Mobile</button>
      </div>
      <div class="modal-body">
        {#if infoModalTab === 'desktop'}
          <section class="help-section">
            <h3>Interacting with Words</h3>
            <ul>
              <li><strong>Single Click:</strong> Click a word to start audio playback from that word</li>
              <li><strong>Hover:</strong> Hover over any word to see its Greek form, definition, and morphology in the bar above</li>
            </ul>
          </section>
          <section class="help-section">
            <h3>Audio Modes</h3>
            <ul>
              <li><strong>Greek:</strong> Play the Greek audio for each sentence</li>
              <li><strong>English:</strong> Play the English translation audio for each sentence</li>
              <li><strong>Alternating:</strong> Play Greek then English for each sentence in sequence</li>
            </ul>
          </section>
          <section class="help-section">
            <h3>Reference Panels</h3>
            <ul>
              <li><strong>Left column:</strong> Vocabulary list for this lesson, grouped by tier</li>
              <li><strong>Right column:</strong> Paradigm table for the hovered word (when available)</li>
            </ul>
          </section>
        {:else}
          <section class="help-section">
            <h3>Interacting with Words</h3>
            <ul>
              <li><strong>Single Tap:</strong> Tap a word to start audio playback from that word</li>
              <li><strong>Tap and hold:</strong> Hold a word briefly to see its analysis</li>
            </ul>
          </section>
          <section class="help-section">
            <h3>Audio Modes</h3>
            <ul>
              <li><strong>Greek:</strong> Play the Greek audio for each sentence</li>
              <li><strong>English:</strong> Play the English translation audio</li>
              <li><strong>Alternating:</strong> Greek then English for each sentence</li>
            </ul>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Full-viewport layout */
  .lesson-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #fff;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    overflow: hidden;
  }

  /* ── Top bar ── */
  .top-bar {
    flex-shrink: 0;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.12);
    z-index: 10;
  }

  .controls-row {
    border-bottom: 1px solid #e5e7eb;
  }

  .controls-inner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 4px 16px;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .back-btn {
    display: flex;
    align-items: center;
    padding: 4px;
    border: none;
    background: none;
    cursor: pointer;
    color: #6b7280;
    flex-shrink: 0;
  }

  .back-btn:hover { color: #111; }

  /* Large play/pause (Reader style) */
  .play-pause-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: none;
    background: none;
    cursor: pointer;
    color: #111827;
    flex-shrink: 0;
    padding: 0;
  }

  .play-pause-btn:hover { color: #1d4ed8; }
  .play-pause-btn:disabled { opacity: 0.35; cursor: default; }

  /* Settings / info icon buttons */
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    cursor: pointer;
    color: #6b7280;
    border-radius: 6px;
    flex-shrink: 0;
    transition: background 0.2s, color 0.2s;
  }

  .icon-btn:hover {
    background: #f3f4f6;
    color: #111827;
  }

  .lesson-title {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .chapter-badge {
    font-size: 11px;
    background: #f3f4f6;
    color: #6b7280;
    padding: 2px 7px;
    border-radius: 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Analysis bar — Reader.svelte pattern */
  .analysis-bar {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 15px;
    line-height: 1.5;
    min-height: 32px;
    background: #fff;
    color: #111;
  }

  .analysis-inner {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 16px;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .analysis-placeholder {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
  }

  .word-form {
    font-size: 17px;
    font-weight: 700;
  }

  .sep { color: #9ca3af; }
  .definition { color: #374151; font-style: italic; }
  .morph-tag { color: #6b7280; }

  /* ── Scroll area ── */
  .scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Three-column layout — all columns flow with the page scroll */
  .three-col {
    display: grid;
    grid-template-columns: 200px 1fr 260px;
    align-items: start;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }

  .col {
    padding: 20px 16px;
  }

  .col-vocab {
    border-right: 1px solid #e5e7eb;
  }

  .col-passage {
    min-width: 0; /* allow grid cell to shrink and text to wrap */
  }

  .col-paradigm {
    border-left: 1px solid #e5e7eb;
  }

  .lesson-image-wrap {
    margin-top: 32px;
    border-top: 1px solid #f3f4f6;
    padding-top: 24px;
  }

  .lesson-image {
    width: 100%;
    max-width: 480px;
    border-radius: 8px;
    display: block;
  }

  /* ── Part tabs ── */
  .part-tabs {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .part-tab {
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    background: transparent;
    border: 1px solid transparent;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s;
  }
  .part-tab:hover { color: #374151; background: #f3f4f6; }
  .part-tab-active { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }

  /* ── Enforce-accents toggle ── */
  .accent-toggle {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #9ca3af;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s;
  }

  .accent-toggle:hover  { background: #f3f4f6; color: #374151; }
  .accent-toggle.accent-on { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; font-weight: 600; }

  /* ── Vocab tab wrapper ── */
  .vocab-exercise-wrap {
    max-width: 640px;
    margin: 0 auto;
    width: 100%;
  }

  /* ── Simple part layout (overview, map) ── */
  .simple-part {
    max-width: 640px;
    margin: 0 auto;
    padding: 32px 0 64px;
  }
  .part-image {
    width: 100%;
    border-radius: 10px;
    margin-bottom: 24px;
    display: block;
  }
  .part-text {
    font-size: 16px;
    line-height: 28px;
    color: #1f2937;
    margin-bottom: 20px;
  }
  .simple-word { display: inline; }
  .word-highlight {
    background: #fef08a;
    border-radius: 3px;
    padding: 0 2px;
  }
  .audio-play-btn {
    padding: 8px 20px;
    background: #4338ca;
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    margin-bottom: 24px;
    transition: background 0.15s;
  }
  .audio-play-btn:hover { background: #3730a3; }
  .map-wrap {
    margin-top: 8px;
    border-radius: 10px;
    overflow: hidden;
  }

  .col-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #f3f4f6;
  }

  /* States */
  .state-msg {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: #6b7280;
    padding: 48px;
  }

  .state-msg.error { color: #ef4444; }

  .empty-note {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: #6b7280;
    font-style: italic;
    margin: 0;
  }

  .empty-note.muted { color: #d1d5db; }

  /* ── Modals ── */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 2rem;
    line-height: 1;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s, color 0.2s;
  }

  .modal-close:hover {
    background: #f3f4f6;
    color: #111827;
  }

  .modal-tabs {
    display: flex;
    gap: 1rem;
    padding: 0 24px;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .modal-tab {
    background: none;
    border: none;
    padding: 12px 16px;
    font-size: 0.95rem;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.2s, border-color 0.2s;
  }

  .modal-tab:hover { color: #111827; }

  .modal-tab.active {
    color: #111827;
    border-bottom-color: #111827;
  }

  .modal-body {
    padding: 20px 24px;
    overflow-y: auto;
  }

  /* Settings modal */
  .settings-modal {
    max-width: 500px;
  }

  .settings-section {
    margin-bottom: 24px;
  }

  .settings-section:last-child {
    margin-bottom: 0;
  }

  .settings-section h3 {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    margin: 0 0 12px 0;
  }

  .settings-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .setting-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .setting-option:hover {
    background: #f3f4f6;
  }

  .setting-option input[type="radio"],
  .setting-option input[type="checkbox"] {
    cursor: pointer;
  }

  .setting-option span {
    color: #374151;
    font-size: 0.938rem;
  }

  .rate-control {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 6px;
    background: #f9fafb;
  }

  .rate-control label {
    font-size: 0.938rem;
    font-weight: 500;
    color: #374151;
  }

  .rate-control-slider {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .rate-control-slider input[type="range"] {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    accent-color: #111827;
  }

  .rate-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    min-width: 40px;
    text-align: right;
  }

  /* Help modal */
  .help-section {
    margin-bottom: 20px;
  }

  .help-section:last-child {
    margin-bottom: 0;
  }

  .help-section h3 {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    margin: 0 0 8px 0;
  }

  .help-section ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .help-section li {
    padding: 8px 0;
    color: #374151;
    line-height: 1.6;
    border-bottom: 1px solid #f3f4f6;
  }

  .help-section li:last-child {
    border-bottom: none;
  }

  .help-section li strong {
    color: #111827;
    font-weight: 600;
  }
</style>

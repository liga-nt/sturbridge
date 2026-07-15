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
  import HistMythFlashcard from '$lib/components/greek/HistMythFlashcard.svelte';
  import GrammarFlashcardExercise from '$lib/components/greek/GrammarFlashcardExercise.svelte';
  import { QWERTY_TO_GREEK } from '$lib/utils/greekKeyboard.js';

  const LETTER_ROW1 = ['q','w','e','r','t','y','u','i','o','p'];
  const LETTER_ROW2 = ['a','s','d','f','g','h','j','k','l'];
  const LETTER_ROW3 = ['z','x','c','v','b','n','m'];

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
      // Merge Firestore glosses — preserve vocabTier from static file when Firestore has null
      const snap = await getDoc(doc(db, 'word_glosses', 'grade7-greek'));
      if (snap.exists()) {
        for (const [k, v] of Object.entries(snap.data().forms ?? {})) {
          if (!v.vocabTier && raw[k]?.vocabTier) v.vocabTier = raw[k].vocabTier;
          raw[k] = v;
        }
      }
      // Build a stripped-key secondary map so lookup works even without diacritics,
      // without needing pre-stored unaccented duplicates in the JSON.
      const stripped = {};
      const withNu = {};
      for (const [k, v] of Object.entries(raw)) {
        const bare = stripGreekDiacritics(k);
        if (bare !== k) stripped[bare] = v;
        // Add nu-variant so tokens written with movable nu resolve to the same entry
        const kb = stripGreekDiacritics(k);
        if (kb.endsWith('σι') || (v.morph?.pos === 'verb' && kb.endsWith('ε'))) {
          withNu[k + 'ν'] = v;
        }
      }
      wordFormsCache = { ...raw, ...stripped, ...withNu };
    } catch (e) {
      console.warn('loadWordFormsCache failed:', e.message);
    }
  }

  const PUNCT_RE = /[.,;:·?!]/g;

  function splitByCurly(str) {
    return str.split(/(\{[^}]*\})/).map(part => {
      const isCurly = /^\{.*\}$/.test(part);
      return { text: isCurly ? part.slice(1, -1) : part, isCurly };
    });
  }

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
  function scanVocabFromCache(sents, cache, audioMap = {}) {
    if (!cache) return [];
    const seen = new Set();
    const list = [];
    for (const sent of sents) {
      for (const token of (sent.greek ?? '').trim().split(/\s+/).filter(Boolean)) {
        const bare = token.replace(PUNCT_RE, '');
        if (!bare || seen.has(bare)) continue;
        seen.add(bare);
        const entry = cache[bare] || cache[token] || cache[stripGreekDiacritics(bare)];
        if (entry?.dictEntry && (entry.vocabTier || entry.paradigmKey)) {
          if (!list.find(w => w.dictEntry === entry.dictEntry)) {
            list.push({ dictEntry: entry.dictEntry, shortDef: entry.shortDef ?? '', vocabTier: entry.vocabTier ?? null, audioGreekUrl: audioMap[entry.dictEntry] ?? null });
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
    // Nom/voc syncretism: where nom is absent but voc exists, copy voc → nom
    const NUMS = ['sg','pl'];
    const GENS = ['masc','fem','neut'];
    for (const n of NUMS) {
      if (result[n] && !result[n].nom && result[n].voc) result[n].nom = result[n].voc;
    }
    for (const g of GENS) {
      if (!result[g]) continue;
      for (const n of NUMS) {
        if (result[g][n] && !result[g][n].nom && result[g][n].voc) result[g][n].nom = result[g][n].voc;
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

  // ── Vocab audio map ───────────────────────────────────────────────────────────
  let vocabAudioMap = {};   // dictEntry → audio_greek_url
  let vocabEnAudioMap = {}; // dictEntry → audio_en_url
  let vocabDefMap = {};     // dictEntry → full definition

  async function loadVocabAudioMap() {
    try {
      const res = await fetch('/data/Greek/nge_vocabulary.json');
      const raw = await res.json();
      for (const e of raw.entries ?? []) {
        if (e.greek && e.audio_greek_url) vocabAudioMap[e.greek]   = e.audio_greek_url;
        if (e.greek && e.audio_en_url)    vocabEnAudioMap[e.greek] = e.audio_en_url;
        if (e.greek && e.definition)      vocabDefMap[e.greek]     = e.definition;
      }
    } catch (e) {
      console.warn('loadVocabAudioMap failed:', e.message);
    }
  }

  // ── Standards coverage (history/myth flashcards) ─────────────────────────────
  let allStandardsCoverage = [];

  async function loadStandardsCoverage() {
    try {
      const res = await fetch('/data/Greek/standards_coverage.json');
      const raw = await res.json();
      allStandardsCoverage = raw.standards ?? [];
    } catch (e) {
      console.warn('loadStandardsCoverage failed:', e.message);
    }
  }

  onMount(async () => {
    try {
      const [lessonSnap] = await Promise.all([
        getDoc(doc(db, 'lessons', $page.params.lessonId)),
        loadWordFormsCache(),
        loadStandardsCoverage(),
        loadVocabAudioMap(),
        fetch('/data/Greek/lesson_hints.json').then(r => r.json()).then(d => { lessonHints = d; }).catch(() => {})
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
  $: vocabList = wordFormsCache
    ? scanVocabFromCache(sentences, wordFormsCache, vocabAudioMap).map(w => ({
        ...w,
        shortDef:   vocabDefMap[w.dictEntry]    ?? w.shortDef,
        audioEnUrl: vocabEnAudioMap[w.dictEntry] ?? null
      }))
    : (lesson?.vocab_list ?? []);

  // ── Term highlighting (history/myth standards in overview text) ──────────────
  let selectedTermStandard = null;

  const TERM_STOP_WORDS = new Set([
    'the','of','in','at','and','or','for','with','age','war','wars',
    'era','rise','battle','peace','great','know','upon','from','their',
    'king','queen','lord','lady','prince','princess','general','emperor',
  ]);

  const TERM_SUBTYPE_LABELS = {
    period: 'Period', figure: 'Figure', battle: 'Battle',
    event: 'Event', author: 'Author', deity: 'Deity', myth: 'Myth',
  };

  const TERM_DOMAIN_COLORS = {
    history:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
    mythology: { bg: '#fdf4ff', border: '#e9d5ff', text: '#7e22ce' },
  };

  // Maps normalized word → standard for ALL hist/myth standards (not just this chapter).
  $: termStandardMap = (() => {
    const map = {};
    for (const s of allStandardsCoverage) {
      if (s.domain === 'geography' || !s.detail || !s.name) continue;
      for (const w of s.name.split(/\s+/)) {
        const key = w.toLowerCase().replace(/[^a-z]/g, '');
        if (key.length > 3 && !TERM_STOP_WORDS.has(key) && !map[key]) map[key] = s;
      }
    }
    return map;
  })();

  function termToStandard(text) {
    const key = text.toLowerCase().replace(/[.,;:·?!'"'""]/g, '').replace(/[^a-z]/g, '');
    if (key.length < 4) return null;
    return termStandardMap[key] ?? null;
  }

  function handleTermClick(std) {
    selectedTermStandard = selectedTermStandard?.id === std.id ? null : std;
  }

  // Parse image caption into { title, author, url }
  // Format: "Title. By Author. https://..."
  function parseCaption(text) {
    if (!text) return { title: '', author: '', url: null };
    const urlMatch = text.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0] : null;
    const rest = text.replace(/https?:\/\/\S+/, '').trim().replace(/[.\s]+$/, '');
    const parts = rest.split(/\.\s+/);
    return {
      title:  parts[0]?.replace(/\.$/, '').trim() ?? '',
      author: parts[1]?.replace(/\.$/, '').trim() ?? '',
      url,
    };
  }

  // History/myth standards for this chapter (excludes geography).
  // lesson.chapter is a number (1, 2, …); standards_coverage uses "ch_01" strings.
  $: chapterStandards = (() => {
    const num = lesson?.chapter;
    if (!num || !allStandardsCoverage.length) return [];
    const chKey = `ch_${String(num).padStart(2, '0')}`;
    return allStandardsCoverage.filter(s =>
      s.domain !== 'geography' &&
      s.detail &&
      Array.isArray(s.chapters) && s.chapters.includes(chKey)
    );
  })();
  $: chapterHistStandards = chapterStandards.filter(s => s.domain === 'history');
  $: chapterMythStandards = chapterStandards.filter(s => s.domain === 'mythology');

  // ── Lightbox ─────────────────────────────────────────────────────────────────
  let lightboxSrc = null;

  // Split overview text into word spans for highlighting.
  // Each token is { type: 'word'|'space', text, idx? } where idx maps to alignment array.
  // When multi-voice segments exist, build from segments so word indices stay in sync with
  // overviewSegWordOffsets (both use the same source, no drift from text-vs-segments mismatch).
  $: overviewWordParas = (() => {
    const segs = lesson?.overview?.segments ?? [];
    let idx = 0;
    const tokenizePara = para => {
      const tokens = [];
      for (const { text: seg, isCurly } of splitByCurly(para)) {
        for (const tok of seg.split(/(\s+)/)) {
          if (/^\s+$/.test(tok)) { tokens.push({ type: 'space', text: tok }); continue; }
          if (!tok) continue;
          tokens.push({ type: 'word', text: tok, idx: isCurly ? null : idx++, isCurly: isCurly || undefined });
        }
      }
      return tokens;
    };

    if (segs.length) {
      const allParas = [];
      for (const seg of segs) {
        const plain = seg.text.replace(/\[[^\]]*\]/g, '').replace(/[ \t]+/g, ' ');
        for (const para of plain.split(/\n\n+/).map(p => p.trim()).filter(Boolean)) {
          const tokens = tokenizePara(para);
          if (tokens.some(t => t.type === 'word')) allParas.push(tokens);
        }
      }
      return allParas;
    }

    const raw = lesson?.overview?.text ?? '';
    const text = raw.replace(/<\/\w+>/gi, ' ').replace(/<[^>]+>/gi, '').replace(/\[[^\]]*\]/g, '').replace(/[ \t]+/g, ' ');
    return text.split(/\n\n+/).map(p => p.trim()).filter(Boolean).map(tokenizePara);
  })();

  // Grammar word spans for highlighting — strip [short pause] tags, tokenize like overview.
  // Splits on single \n to preserve line breaks. Marks tokens containing Greek characters.
  $: grammarWordParas = (() => {
    const raw = lesson?.grammar?.text ?? '';
    if (!raw) return [];
    let idx = 0;
    return raw.split(/\n/).map(p => p.trim()).filter(Boolean).map(line => {
      // Strip [short pause] markers, collapse spaces
      const clean = line.replace(/\[[^\]]*\]/g, '').replace(/[ \t]+/g, ' ').trim();
      if (!clean) return null;
      // Whole-line bold: **entire line**
      const lineBold = /^\*\*[^*].+[^*]\*\*$/.test(clean) || /^\*\*\S+\*\*$/.test(clean);
      const src = lineBold ? clean.slice(2, -2) : clean;
      const tokens = [];
      for (const { text: cseg, isCurly } of splitByCurly(src)) {
        cseg.split(/(\s+)/).forEach(tok => {
          if (/^\s+$/.test(tok)) { tokens.push({ type: 'space', text: tok }); return; }
          if (!tok) return;
          if (isCurly) { tokens.push({ type: 'word', text: tok, idx: null, isCurly: true }); return; }
          // Whole-token bold (line-level or **word**)
          if (lineBold) {
            const isGreek = /[Ͱ-Ͽἀ-῿]/.test(tok);
            tokens.push({ type: 'word', text: tok, idx: idx++, isGreek, bold: true }); return;
          }
          if (/^\*\*\S/.test(tok) && tok.endsWith('**')) {
            const display = tok.slice(2, -2);
            const isGreek = /[Ͱ-Ͽἀ-῿]/.test(display);
            tokens.push({ type: 'word', text: display, idx: idx++, isGreek, bold: true }); return;
          }
          // Mid-word bold: split into parts sharing one idx
          if (tok.includes('**')) {
            const parts = [];
            const re = /\*\*([^*]*)\*\*/g;
            let last = 0, m;
            while ((m = re.exec(tok)) !== null) {
              if (m.index > last) parts.push({ text: tok.slice(last, m.index), bold: false });
              if (m[1]) parts.push({ text: m[1], bold: true });
              last = m.index + m[0].length;
            }
            if (last < tok.length) parts.push({ text: tok.slice(last), bold: false });
            if (parts.length > 1) {
              const fullText = parts.map(p => p.text).join('');
              tokens.push({ type: 'word', text: fullText, parts, idx: idx++, isGreek: /[Ͱ-Ͽἀ-῿]/.test(fullText) }); return;
            }
          }
          const isGreek = /[Ͱ-Ͽἀ-῿]/.test(tok);
          tokens.push({ type: 'word', text: tok, idx: idx++, isGreek, bold: false });
        });
      }
      return tokens.length ? tokens : null;
    }).filter(Boolean);
  })();

  function handleGrammarWordHover(text) {
    if (!wordFormsCache) return;
    const bare = text.replace(PUNCT_RE, '');
    const entry = wordFormsCache[bare] || wordFormsCache[stripGreekDiacritics(bare)];
    hoveredWord = entry
      ? { text: bare, dictEntry: entry.dictEntry ?? bare, shortDef: entry.shortDef ?? entry.short_def ?? null, paradigmKey: entry.paradigmKey ?? entry.paradigm_key ?? null, morph: entry.morph ?? null }
      : { text: bare, dictEntry: bare, shortDef: null, paradigmKey: null, morph: null };
  }

  // ── Hover word ────────────────────────────────────────────────────────────────
  let hoveredWord = null;

  function handleWordHover(e) {
    const word = e.detail?.word ?? null;
    if (word !== null) hoveredWord = word;
  }

  $: paradigmKey = hoveredWord?.paradigmKey ?? null;

  // Resolve morph from cache when possible — canonical and accent-variant safe.
  // Words annotated by Claude (e.g. grave-accented forms missed by the cloud function's
  // non-stripped lookup) may have null or inconsistent morph objects in Firestore.
  // The student-page cache has a stripped fallback map, so grave ↔ acute variants resolve correctly.
  $: _hoveredCacheEntry = (() => {
    if (!hoveredWord?.text || !wordFormsCache) return null;
    const bare = hoveredWord.text.replace(PUNCT_RE, '');
    return wordFormsCache[bare]
      || wordFormsCache[stripGreekDiacritics(bare)]
      || null;
  })();
  $: highlightMorph = _hoveredCacheEntry?.morph ?? hoveredWord?.morph ?? null;

  // Build forms for the hovered word, then select the relevant sub-paradigm
  $: _allWordForms = hoveredWord && wordFormsCache ? buildWordForms(hoveredWord.dictEntry) : null;
  $: wordForms = selectWordForms(_allWordForms, highlightMorph);
  $: dictEntry = hoveredWord?.dictEntry ?? null;

  // ── Grammar flashcards ────────────────────────────────────────────────────────
  let grammarSubTab = 'lesson'; // 'lesson' | 'flashcards'
  let grammarFlashcards = null; // loaded once on demand

  async function loadGrammarFlashcards() {
    if (grammarFlashcards) return;
    try {
      const res = await fetch('/data/Greek/grammar_flashcards.json');
      grammarFlashcards = await res.json();
    } catch (e) {
      console.warn('loadGrammarFlashcards failed:', e.message);
    }
  }

  $: grammarFlashSets = (() => {
    if (!grammarFlashcards || !lesson) return [];
    return (lesson.standardIds ?? [])
      .filter(sid => sid.startsWith('lang.'))
      .flatMap(sid => grammarFlashcards[sid]?.sets ?? []);
  })();

  // Load flashcard data reactively when the flashcards sub-tab is opened
  $: if (lessonPart === 'grammar' && grammarSubTab === 'flashcards') loadGrammarFlashcards();

  // ── Lesson part navigation ────────────────────────────────────────────────────
  let lessonPart = 'overview'; // 'overview' | 'vocab' | 'story' | 'map'

  // Available parts in order — derived once lesson loads
  $: availableParts = lesson ? [
    lesson.overview?.text                          ? 'overview'   : null,
    lesson.grammar?.text                           ? 'grammar'    : null,
    'vocab',
    (lesson.sentences?.length ?? 0) > 0           ? 'story'      : null,
    chapterHistStandards.length > 0               ? 'history'    : null,
    chapterMythStandards.length > 0               ? 'mythology'  : null,
    'quiz',
  ].filter(Boolean) : [];

  // Default to first available part when lesson loads
  $: if (lesson && !availableParts.includes(lessonPart)) lessonPart = availableParts[0] ?? 'story';

  const PART_LABELS = { overview: 'Story', grammar: 'Grammar', vocab: 'Vocab', story: 'Reading', map: 'Map', history: 'History', mythology: 'Mythology', quiz: 'Quiz' };

  // ── Simple audio highlighting for overview / map ─────────────────────────
  let simpleHighlightIndex = -1;
  let simpleAudio = null;
  let simpleAudioPlaying = false;
  let simpleAudioPart = null;
  let simpleAudioCurrentTime = 0;
  let simpleAudioDuration = 0;

  // Segment queue state (overview multi-voice)
  let overviewSegIdx = 0;
  let overviewPauseTimer = null;

  // Derived from lesson.overview.segments — cumulative time offset before each segment
  // and cumulative word-index offset before each segment (for global highlight mapping).
  $: overviewSegments = lesson?.overview?.segments ?? [];

  $: overviewSegOffsets = (() => {
    let t = 0;
    return overviewSegments.map(s => {
      const off = t;
      t += s.alignment?.at(-1)?.end ?? 0;
      return off;
    });
  })();

  $: overviewTotalDuration = overviewSegments.length
    ? (overviewSegOffsets.at(-1) ?? 0) + (overviewSegments.at(-1)?.alignment?.at(-1)?.end ?? 0)
    : 0;

  // Word count offset per segment — maps local alignment index to global display word index.
  // Must strip brackets (voice directives) the same way overviewWordParas does, or offsets drift.
  $: overviewSegWordOffsets = (() => {
    let w = 0;
    return overviewSegments.map(s => {
      const off = w;
      const plain = s.text.replace(/\{[^}]*\}/g, '').replace(/<\/\w+>/g, ' ').replace(/<[^>]+>/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
      w += plain.split(/\s+/).filter(Boolean).length;
      return off;
    });
  })();

  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // Play a single segment, update global time + highlight, chain to next on end.
  function playSegment(segIdx, startOffset = 0) {
    if (!simpleAudioPlaying || simpleAudioPart !== 'overview') return;
    const seg = overviewSegments[segIdx];
    if (!seg?.audioUrl) { simpleAudioPlaying = false; return; }

    if (simpleAudio) { simpleAudio.pause(); simpleAudio.src = ''; simpleAudio = null; }
    overviewSegIdx = segIdx;

    const audio = new Audio(seg.audioUrl);
    audio.playbackRate = englishRate;
    simpleAudio = audio;

    const al = seg.alignment ?? [];
    const segOffset = overviewSegOffsets[segIdx] ?? 0;
    const wordOffset = overviewSegWordOffsets[segIdx] ?? 0;

    let rafId;
    function tick() {
      if (!simpleAudio || simpleAudio !== audio) return;
      const t = audio.currentTime;
      simpleAudioCurrentTime = segOffset + t;
      let localIdx = -1;
      for (let i = 0; i < al.length; i++) {
        if (t >= al[i].start && t <= al[i].end) { localIdx = i; break; }
      }
      simpleHighlightIndex = localIdx >= 0 ? wordOffset + localIdx : -1;
      rafId = requestAnimationFrame(tick);
    }
    audio.addEventListener('play', () => { rafId = requestAnimationFrame(tick); }, { once: true });
    audio.addEventListener('ended', () => {
      cancelAnimationFrame(rafId);
      if (segIdx + 1 < overviewSegments.length) {
        const nextSeg = overviewSegments[segIdx + 1];
        const speakerChange = nextSeg?.speaker !== seg?.speaker;
        if (speakerChange) {
          overviewPauseTimer = setTimeout(() => { overviewPauseTimer = null; playSegment(segIdx + 1, 0); }, 450);
        } else {
          playSegment(segIdx + 1, 0);
        }
      } else {
        simpleAudioPlaying = false;
        simpleHighlightIndex = -1;
        simpleAudioCurrentTime = 0;
        overviewSegIdx = 0;
      }
    }, { once: true });

    if (startOffset > 0) {
      audio.addEventListener('loadedmetadata', () => { audio.currentTime = startOffset; }, { once: true });
    }
    audio.play().catch(() => {});
  }

  function playSimpleAudio(part) {
    stopSimpleAudio();
    simpleAudioPart = part;
    simpleAudioPlaying = true;
    simpleHighlightIndex = -1;

    if (part === 'overview' && overviewSegments.length) {
      playSegment(0, 0);
    } else {
      // Single-audio path (map, or overview without segments)
      const data = lesson?.[part];
      if (!data?.audioUrl) { simpleAudioPlaying = false; return; }
      const audio = new Audio(data.audioUrl);
      audio.playbackRate = englishRate;
      simpleAudio = audio;
      const al = data.alignment ?? [];
      let rafId;
      function tick() {
        if (!simpleAudio || simpleAudio !== audio) return;
        const t = audio.currentTime;
        simpleAudioCurrentTime = t;
        let idx = -1;
        for (let i = 0; i < al.length; i++) {
          if (t >= al[i].start && t <= al[i].end) { idx = i; break; }
        }
        simpleHighlightIndex = idx;
        rafId = requestAnimationFrame(tick);
      }
      audio.addEventListener('loadedmetadata', () => { simpleAudioDuration = audio.duration; }, { once: true });
      audio.addEventListener('play', () => { rafId = requestAnimationFrame(tick); }, { once: true });
      audio.addEventListener('ended', () => {
        simpleAudioPlaying = false;
        simpleHighlightIndex = -1;
        simpleAudioCurrentTime = 0;
        cancelAnimationFrame(rafId);
      }, { once: true });
      audio.play();
    }
  }

  function stopSimpleAudio() {
    if (overviewPauseTimer) { clearTimeout(overviewPauseTimer); overviewPauseTimer = null; }
    if (simpleAudio) { simpleAudio.pause(); simpleAudio.src = ''; simpleAudio = null; }
    simpleAudioPlaying = false;
    simpleHighlightIndex = -1;
    simpleAudioCurrentTime = 0;
    overviewSegIdx = 0;
  }

  function seekSimpleAudio(e) {
    const T = Number(e.target.value);
    simpleAudioCurrentTime = T;

    if (simpleAudioPart === 'overview' && overviewSegments.length) {
      // Find which segment T falls in
      let segIdx = 0;
      for (let i = overviewSegOffsets.length - 1; i >= 0; i--) {
        if (T >= overviewSegOffsets[i]) { segIdx = i; break; }
      }
      const within = T - (overviewSegOffsets[segIdx] ?? 0);
      // Update highlight immediately
      const al = overviewSegments[segIdx]?.alignment ?? [];
      const wordOffset = overviewSegWordOffsets[segIdx] ?? 0;
      let localIdx = -1;
      for (let i = 0; i < al.length; i++) {
        if (within >= al[i].start && within <= al[i].end) { localIdx = i; break; }
      }
      simpleHighlightIndex = localIdx >= 0 ? wordOffset + localIdx : -1;
      // If playing, jump to new segment/offset
      if (simpleAudioPlaying) playSegment(segIdx, within);
      else overviewSegIdx = segIdx;
    } else {
      if (simpleAudio) simpleAudio.currentTime = T;
      const al = lesson?.[simpleAudioPart ?? 'overview']?.alignment ?? [];
      let idx = -1;
      for (let i = 0; i < al.length; i++) {
        if (T >= al[i].start && T <= al[i].end) { idx = i; break; }
      }
      simpleHighlightIndex = idx;
    }
  }

  $: if (lessonPart) { stopSimpleAudio(); stopVocabList(); simpleAudioDuration = 0; }

  // Duration: computed from alignment data for segments (no audio probe needed),
  // or from audio loadedmetadata for single-audio (map).
  $: if (lessonPart === 'overview' && overviewTotalDuration > 0) simpleAudioDuration = overviewTotalDuration;
  $: if (lessonPart === 'map' && lesson?.map?.audioUrl && simpleAudioDuration === 0) {
    const probe = new Audio(lesson.map.audioUrl);
    probe.addEventListener('loadedmetadata', () => { simpleAudioDuration = probe.duration; }, { once: true });
  }
  $: if (lessonPart === 'grammar' && lesson?.grammar?.audioUrl && simpleAudioDuration === 0) {
    const probe = new Audio(lesson.grammar.audioUrl);
    probe.addEventListener('loadedmetadata', () => { simpleAudioDuration = probe.duration; }, { once: true });
  }

  // ── Lesson hints (tab instruction voiceovers) ─────────────────────────────────
  let lessonHints = {};
  let lessonHintAudio = null;
  let lessonHintPlayingTab = null;
  let lessonHintWordIdx = -1;
  let lessonHintRaf = null;

  function stopLessonHintAudio() {
    if (lessonHintRaf) { cancelAnimationFrame(lessonHintRaf); lessonHintRaf = null; }
    if (lessonHintAudio) { lessonHintAudio.pause(); lessonHintAudio.src = ''; lessonHintAudio = null; }
    lessonHintPlayingTab = null;
    lessonHintWordIdx = -1;
  }

  function toggleLessonHintAudio(tabId) {
    if (lessonHintPlayingTab === tabId) { stopLessonHintAudio(); return; }
    stopLessonHintAudio();
    const hint = lessonHints[tabId];
    if (!hint?.audioUrl) return;
    const audio = new Audio(hint.audioUrl);
    lessonHintAudio = audio;
    lessonHintPlayingTab = tabId;
    lessonHintWordIdx = -1;
    const al = hint.alignment ?? [];
    function tick() {
      if (!lessonHintAudio || lessonHintAudio !== audio) return;
      const t = audio.currentTime;
      let idx = -1;
      for (let i = 0; i < al.length; i++) {
        if (t >= al[i].start && t <= al[i].end) { idx = i; break; }
      }
      lessonHintWordIdx = idx;
      lessonHintRaf = requestAnimationFrame(tick);
    }
    audio.addEventListener('play', () => { lessonHintRaf = requestAnimationFrame(tick); }, { once: true });
    audio.addEventListener('ended', () => {
      cancelAnimationFrame(lessonHintRaf); lessonHintRaf = null;
      lessonHintPlayingTab = null; lessonHintWordIdx = -1;
    }, { once: true });
    audio.play().catch(() => {});
  }

  $: lessonPart, stopLessonHintAudio();

  // ── Vocab input mode + keyboard ───────────────────────────────────────────────
  let vocabInputMode = 'greek-hints'; // 'greek-hints' | 'greek' | 'translit'
  let hintKeys = [];
  let lastKey = null;
  let lastKeyTimer = null;

  $: showKeyboard = vocabInputMode === 'greek-hints' && lessonPart === 'vocab';
  $: if (lessonPart !== 'vocab') hintKeys = [];

  function cycleVocabInputMode() {
    vocabInputMode = vocabInputMode === 'greek-hints' ? 'greek'
                  : vocabInputMode === 'greek'       ? 'translit'
                  :                                    'greek-hints';
  }

  function handleKeyMap(e) {
    if (!showKeyboard) return;
    if (lastKeyTimer) clearTimeout(lastKeyTimer);
    lastKey = e.key;
    lastKeyTimer = setTimeout(() => { lastKey = null; }, 800);
  }

  // ── Vocab playback ────────────────────────────────────────────────────────────
  let vocabPlaying = false;
  let vocabPlayingDictEntry = null;
  let vocabShowGreek   = true;
  let vocabShowEnglish = true;
  let _vocabAudioEl = null;

  async function playOne(url) {
    return new Promise(resolve => {
      const audio = new Audio(url);
      _vocabAudioEl = audio;
      audio.addEventListener('ended', resolve, { once: true });
      audio.addEventListener('error', resolve, { once: true });
      audio.play().catch(resolve);
    });
  }

  const VOCAB_TIER_ORDER = ['intro', 'beginning', 'intermediate', 'prose'];

  async function playVocabList() {
    stopVocabList();
    vocabPlaying = true;
    const pause = (ms) => new Promise(r => setTimeout(r, ms));

    const toPlay = vocabList
      .sort((a, b) => {
        const ai = VOCAB_TIER_ORDER.indexOf(a.vocabTier);
        const bi = VOCAB_TIER_ORDER.indexOf(b.vocabTier);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

    for (const word of toPlay) {
      if (!vocabPlaying) break;
      vocabPlayingDictEntry = word.dictEntry;

      if (vocabShowGreek && word.audioGreekUrl) {
        await playOne(word.audioGreekUrl);
        _vocabAudioEl = null;
        if (!vocabPlaying) break;
        if (vocabShowEnglish && word.audioEnUrl) await pause(250);
      }

      if (!vocabPlaying) break;

      if (vocabShowEnglish && word.audioEnUrl) {
        await playOne(word.audioEnUrl);
        _vocabAudioEl = null;
      }

      if (!vocabPlaying) break;
      await pause(700);
    }

    vocabPlayingDictEntry = null;
    vocabPlaying = false;
  }

  function stopVocabList() {
    vocabPlaying = false;
    vocabPlayingDictEntry = null;
    if (_vocabAudioEl) { _vocabAudioEl.pause(); _vocabAudioEl.src = ''; _vocabAudioEl = null; }
  }

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

  onDestroy(() => { stopAudio(); stopVocabList(); stopLessonHintAudio(); });

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

    const pause = (ms) => new Promise(r => setTimeout(r, ms));

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
    if (lessonPart === 'overview' || lessonPart === 'map' || lessonPart === 'grammar') {
      if (simpleAudioPlaying && simpleAudioPart === lessonPart) stopSimpleAudio();
      else playSimpleAudio(lessonPart);
    } else if (lessonPart === 'vocab') {
      if (vocabPlaying) stopVocabList();
      else playVocabList();
    } else {
      if (isPlaying) stopAudio();
      else playAll();
    }
  }

  $: effectivePlaying = (lessonPart === 'overview' || lessonPart === 'map' || lessonPart === 'grammar')
    ? (simpleAudioPlaying && simpleAudioPart === lessonPart)
    : lessonPart === 'vocab'
    ? vocabPlaying
    : isPlaying;
</script>

<svelte:window on:keydown={handleKeyMap} />

<svelte:head>
  <title>{lesson?.title ?? 'Lesson'} — Greek</title>
</svelte:head>

<div class="lesson-page" class:has-keyboard={showKeyboard}>

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
      <button class="play-pause-btn" on:click={togglePlayPause} aria-label={effectivePlaying ? 'Pause' : 'Play'} disabled={!lesson || lessonPart === 'quiz' || (lessonPart === 'overview' && !overviewSegments.length && !lesson.overview?.audioUrl) || (lessonPart === 'map' && !lesson.map?.audioUrl) || (lessonPart === 'grammar' && !lesson.grammar?.audioUrl) || (lessonPart === 'vocab' && vocabList.length === 0)}>
        {#if effectivePlaying}
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

      <!-- Info button (Greek tab only) -->
      {#if lessonPart === 'story'}
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
      {/if}

      <!-- Title -->
      {#if lesson}
        <span class="lesson-title">{lesson.title}</span>
        {#if lesson.chapter}
          <span class="chapter-badge">Ch. {lesson.chapter}</span>
        {/if}
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

    <!-- Progress bar — Story tab only -->
    {#if (lessonPart === 'overview' || lessonPart === 'grammar') && simpleAudioDuration > 0}
      <div class="progress-bar-row">
        <span class="progress-time">{formatTime(simpleAudioCurrentTime)}</span>
        <input
          type="range"
          min="0"
          max={simpleAudioDuration}
          step="0.1"
          value={simpleAudioCurrentTime}
          on:input={seekSimpleAudio}
          class="progress-slider"
        />
        <span class="progress-time">{formatTime(simpleAudioDuration)}</span>
      </div>
    {/if}

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
          <div class="tab-hint">
            <button class="hint-play-btn" class:hint-playing={lessonHintPlayingTab === 'vocab'} disabled={!lessonHints.vocab?.audioUrl} on:click={() => toggleLessonHintAudio('vocab')} aria-label="Play instructions">
              {#if lessonHintPlayingTab === 'vocab'}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>{:else}<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>{/if}
            </button>
            <span class="hint-text">
              {#each (lessonHints.vocab?.alignment ?? []) as w, i}<span class="hw" class:hw-active={lessonHintPlayingTab === 'vocab' && lessonHintWordIdx === i}>{w.word}</span>{' '}{/each}{#if !lessonHints.vocab?.alignment}Type each Greek word. Use the buttons to choose the vocab you want to practice and to hide the Greek or English columns. Select your input style here:{/if}
            </span>
            <button class="input-mode-btn mode-{vocabInputMode}" on:click={cycleVocabInputMode}>
              {vocabInputMode === 'greek-hints' ? 'Greek + keyboard' : vocabInputMode === 'greek' ? 'Greek' : 'Transliterate'}
            </button>
          </div>
          <GreekVocabExercise
            {vocabList}
            inputMode={vocabInputMode}
            bind:hintKeys
            bind:showGreek={vocabShowGreek}
            bind:showEnglish={vocabShowEnglish}
            playingDictEntry={vocabPlayingDictEntry}
          />
        </div>
      </div>

    <!-- ── Overview part ───────────────────────────────────────────────────── -->
    {:else if lessonPart === 'overview'}
      {@const ov = lesson.overview ?? {}}
      <div class="scroll-area">
        <div class="overview-layout" class:overview-has-sidebar={!!selectedTermStandard}>
          <div class="simple-part">
            {#if ov.imageUrl}
              <figure class="part-image-figure">
                <img src={ov.imageUrl} alt="Chapter overview illustration" class="part-image" />
                {#if ov.imageCaption}
                  {@const cap = parseCaption(ov.imageCaption)}
                  <figcaption class="part-image-caption">
                    {#if cap.title}<strong>{cap.title}.</strong>{/if}
                    {#if cap.author} <strong>{cap.author}.</strong>{/if}
                    {#if cap.url}
                      {' '}<a href={cap.url} target="_blank" rel="noopener noreferrer" class="caption-info-link" title="View image source">ℹ</a>
                    {/if}
                  </figcaption>
                {/if}
              </figure>
            {/if}
            <div class="part-text prose">
              {#each overviewWordParas as paraWords}
                <p>{#each paraWords as tok}{#if tok.type === 'space'}{tok.text}{:else}{@const std = termToStandard(tok.text)}{#if std}<span
                    class="story-word term-word"
                    class:word-highlight={tok.idx === simpleHighlightIndex}
                    class:term-active={selectedTermStandard?.id === std.id}
                    on:click={() => handleTermClick(std)}
                    role="button" tabindex="0"
                    on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleTermClick(std)}
                  >{tok.text}</span>{:else if tok.isCurly}<span class="story-word display-only">{tok.text}</span>{:else}<span class="story-word" class:word-highlight={tok.idx === simpleHighlightIndex}>{tok.text}</span>{/if}{/if}{/each}</p>
              {/each}
            </div>
          </div>

          <!-- Term info sidebar -->
          {#if selectedTermStandard}
            {@const dc = TERM_DOMAIN_COLORS[selectedTermStandard.domain] ?? TERM_DOMAIN_COLORS.history}
            <aside class="term-sidebar">
              <button class="term-sidebar-close" on:click={() => selectedTermStandard = null} aria-label="Close">×</button>
              <span class="term-sidebar-badge" style="background:{dc.bg};border-color:{dc.border};color:{dc.text}">
                {TERM_SUBTYPE_LABELS[selectedTermStandard.subtype] ?? selectedTermStandard.domain}
              </span>
              {#if selectedTermStandard.subtype === 'deity'}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <img
                  src="/images/divinities/{selectedTermStandard.name}.png"
                  alt={selectedTermStandard.name}
                  class="term-sidebar-deity-img"
                  on:click={() => lightboxSrc = `/images/divinities/${selectedTermStandard.name}.png`}
                />
              {/if}
              <h2 class="term-sidebar-name">{selectedTermStandard.name}</h2>
              <p class="term-sidebar-detail">
                {#if selectedTermStandard.description}
                  <strong>{selectedTermStandard.description.replace(/^Know\s+/, '')}</strong>{' '}
                {/if}
                {selectedTermStandard.detail}
              </p>
            </aside>
          {/if}
        </div>
      </div>

    <!-- ── Story part ──────────────────────────────────────────────────────── -->
    {:else if lessonPart === 'story'}
      <div class="scroll-area">
        <div class="two-col">
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

            <!-- Inline word analysis -->
            <div class="inline-analysis">
              {#if hoveredWord}
                <strong class="ia-form">{hoveredWord.dictEntry ?? hoveredWord.text}</strong>
                {#if hoveredWord.shortDef}
                  {' '}<span class="ia-def">"{hoveredWord.shortDef}"</span>
                {/if}
                {#if highlightMorph}
                  {' '}<span class="ia-morph">{morphToDisplay(highlightMorph)}</span>
                {/if}
              {:else}
                <span class="ia-placeholder">hover a word</span>
              {/if}
            </div>

            {#if paradigmKey || wordForms}
              <div class="inline-paradigm">
                <ConjugationTable {paradigmKey} {highlightMorph} {wordForms} {dictEntry} hoveredForm={hoveredWord?.text} />
              </div>
            {/if}
          </main>
        </div>
      </div>

    <!-- ── Map part ────────────────────────────────────────────────────────── -->
    {:else if lessonPart === 'map'}
      {@const mp = lesson.map ?? {}}
      {@const mapParas = (mp.description ?? '').split(/\n\n+/).map(p => p.trim()).filter(Boolean)}
      <div class="scroll-area">
        <div class="simple-part">
          {#if mapParas.length > 0}
            <div class="part-text prose">
              {#each mapParas as para}
                <p>{para}</p>
              {/each}
            </div>
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

    <!-- ── Grammar part ─────────────────────────────────────────────────────── -->
    {:else if lessonPart === 'grammar'}
      <div class="scroll-area">

        <!-- Grammar sub-tab bar -->
        <div class="grammar-sub-tabs">
          <button class="grammar-sub-tab" class:active={grammarSubTab === 'lesson'}
            on:click={() => grammarSubTab = 'lesson'}>Lesson</button>
          <button class="grammar-sub-tab" class:active={grammarSubTab === 'flashcards'}
            on:click={() => { grammarSubTab = 'flashcards'; stopSimpleAudio(); }}>Flashcards</button>
        </div>

        {#if grammarSubTab === 'lesson'}
          <div class="grammar-two-col">
            <main class="grammar-col-text">
              <div class="part-text prose">
                {#each grammarWordParas as paraWords}
                  <p>{#each paraWords as tok}{#if tok.type === 'space'}{tok.text}{:else if tok.parts}<!-- svelte-ignore a11y-mouse-events-have-key-events --><span
                      class="story-word"
                      class:gw={tok.isGreek}
                      class:word-highlight={tok.idx === simpleHighlightIndex}
                      on:mouseenter={() => tok.isGreek && handleGrammarWordHover(tok.text)}
                      on:mouseleave={() => tok.isGreek && (hoveredWord = null)}
                    >{#each tok.parts as p}{#if p.bold}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}</span>{:else if tok.isGreek}<!-- svelte-ignore a11y-mouse-events-have-key-events --><span
                      class="story-word gw"
                      class:word-highlight={tok.idx === simpleHighlightIndex}
                      class:gw-bold={tok.bold}
                      on:mouseenter={() => handleGrammarWordHover(tok.text)}
                      on:mouseleave={() => hoveredWord = null}
                    >{tok.text}</span>{:else if tok.isCurly}<span class="story-word display-only">{tok.text}</span>{:else if tok.bold}<strong class="story-word" class:word-highlight={tok.idx === simpleHighlightIndex}>{tok.text}</strong>{:else}<span class="story-word" class:word-highlight={tok.idx === simpleHighlightIndex}>{tok.text}</span>{/if}{/each}</p>
                {/each}
              </div>
            </main>
            <aside class="grammar-col-paradigm">
              <div class="inline-analysis">
                {#if hoveredWord?.text}
                  <strong class="ia-form">{hoveredWord.dictEntry ?? hoveredWord.text}</strong>
                  {#if hoveredWord.shortDef}
                    {' '}<span class="ia-def">"{hoveredWord.shortDef}"</span>
                  {/if}
                  {#if highlightMorph}
                    {' '}<span class="ia-morph">{morphToDisplay(highlightMorph)}</span>
                  {/if}
                {:else}
                  <span class="ia-placeholder">hover a Greek word</span>
                {/if}
              </div>
              {#if paradigmKey || wordForms}
                <div class="inline-paradigm">
                  <ConjugationTable {paradigmKey} {highlightMorph} {wordForms} {dictEntry} hoveredForm={hoveredWord?.text} />
                </div>
              {/if}
            </aside>
          </div>

        {:else}
          <!-- Flashcards sub-tab -->
          <div class="grammar-flashcard-wrap">
            {#if grammarFlashSets.length}
              <GrammarFlashcardExercise sets={grammarFlashSets} />
            {:else if !grammarFlashcards}
              <p class="grammar-flash-empty">Loading…</p>
            {:else}
              <p class="grammar-flash-empty">No flashcard exercises for this lesson yet.</p>
            {/if}
          </div>
        {/if}

      </div>

    <!-- ── History part ─────────────────────────────────────────────────────── -->
    {:else if lessonPart === 'history'}
      <div class="scroll-area">
        <div class="vocab-exercise-wrap">
          <HistMythFlashcard standards={chapterHistStandards} />
        </div>
      </div>

    <!-- ── Mythology part ────────────────────────────────────────────────────── -->
    {:else if lessonPart === 'mythology'}
      <div class="scroll-area">
        <div class="vocab-exercise-wrap">
          <HistMythFlashcard standards={chapterMythStandards} />
        </div>
      </div>

    <!-- ── Quiz part (placeholder) ───────────────────────────────────────────── -->
    {:else if lessonPart === 'quiz'}
      <div class="scroll-area">
        <div class="quiz-placeholder">
          <p class="quiz-placeholder-text">Quiz coming soon.</p>
        </div>
      </div>
    {/if}

  {/if}

</div>

<!-- ── Keyboard panel ─────────────────────────────────────────────────────── -->
{#if showKeyboard}
  <div class="keyboard-panel">
    <div class="keyboard-inner">
      <div class="key-row">
        {#each LETTER_ROW1 as k}
          <div class="key-cap"
            class:key-active={lastKey === k || lastKey === k.toUpperCase()}
            class:hint-0={hintKeys[0] === k || hintKeys[0] === k.toUpperCase()}>
            <span class="key-qwerty">{k}</span>
            <span class="key-greek">{QWERTY_TO_GREEK[k] ?? ''}</span>
          </div>
        {/each}
      </div>
      <div class="key-row">
        {#each LETTER_ROW2 as k}
          <div class="key-cap"
            class:key-active={lastKey === k || lastKey === k.toUpperCase()}
            class:hint-0={hintKeys[0] === k || hintKeys[0] === k.toUpperCase()}>
            <span class="key-qwerty">{k}</span>
            <span class="key-greek">{QWERTY_TO_GREEK[k] ?? ''}</span>
          </div>
        {/each}
      </div>
      <div class="key-row">
        {#each LETTER_ROW3 as k}
          <div class="key-cap"
            class:key-active={lastKey === k || lastKey === k.toUpperCase()}
            class:hint-0={hintKeys[0] === k || hintKeys[0] === k.toUpperCase()}>
            <span class="key-qwerty">{k}</span>
            <span class="key-greek">{QWERTY_TO_GREEK[k] ?? ''}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- ── Lightbox ────────────────────────────────────────────────────────────── -->
{#if lightboxSrc}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="lightbox-overlay" on:click={() => lightboxSrc = null}>
    <img src={lightboxSrc} alt="Full size" class="lightbox-img" />
  </div>
{/if}

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

        {#if lessonPart === 'story'}
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
        {/if}

        <section class="settings-section">
          <h3>Playback Speed</h3>
          <div class="settings-options">
            {#if lessonPart === 'story'}
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
            {/if}
            <div class="rate-control">
              <label>{lessonPart === 'story' ? 'English Speed' : 'Playback Speed'}</label>
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

        {#if lessonPart === 'story'}
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
        {/if}

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
  .quiz-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 60px 20px;
  }
  .quiz-placeholder-text {
    font-size: 16px;
    color: #9ca3af;
  }

  /* Full-viewport layout */
  .lesson-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #fff;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    overflow: hidden;
  }

  .lesson-page.has-keyboard { padding-bottom: 140px; }

  /* ── Keyboard panel ── */
  .keyboard-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #1e293b;
    border-top: 1px solid #334155;
    padding: 8px 10px 12px;
    z-index: 50;
  }
  .keyboard-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    max-width: 780px;
    margin: 0 auto;
  }
  .key-row { display: flex; gap: 3px; justify-content: center; align-items: flex-end; }
  .key-cap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 48px;
    background: #334155;
    border-radius: 6px;
    border: 1px solid #475569;
    transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
    gap: 2px;
  }
  .key-cap.key-active { background: #4f46e5; border-color: #818cf8; box-shadow: 0 0 0 2px rgba(129,140,248,0.4); }
  .key-cap.hint-0 { background: #1e3a5f; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.35); }
  .key-qwerty { font-size: 9px; color: #64748b; text-transform: uppercase; line-height: 1; }
  .key-greek  { font-size: 16px; color: #e2e8f0; font-family: "Palatino Linotype", Georgia, serif; line-height: 1; }

  /* ── Progress bar ── */
  .progress-bar-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 16px;
    border-top: 1px solid #f3f4f6;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .progress-slider {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    accent-color: #4338ca;
    cursor: pointer;
  }

  .progress-time {
    font-size: 11px;
    color: #9ca3af;
    font-variant-numeric: tabular-nums;
    min-width: 32px;
  }

  .progress-time:last-child { text-align: right; }

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
    padding: 8px 16px;
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
    width: 42px;
    height: 42px;
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
    font-size: 17px;
    font-weight: 600;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .chapter-badge {
    font-size: 13px;
    background: #f3f4f6;
    color: #6b7280;
    padding: 3px 9px;
    border-radius: 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── Scroll area ── */
  .scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Two-column layout — vocab strip + passage */
  .two-col {
    display: grid;
    grid-template-columns: 200px 1fr;
    align-items: start;
    max-width: 960px;
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
    min-width: 0;
  }

  /* Grammar sub-tabs */
  .grammar-sub-tabs {
    display: flex;
    gap: 4px;
    padding: 12px 16px 0;
    max-width: 960px;
    margin: 0 auto;
    width: 100%;
  }

  .grammar-sub-tab {
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px 6px 0 0;
    border: 1px solid #e5e7eb;
    border-bottom: none;
    background: #f9fafb;
    color: #6b7280;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .grammar-sub-tab.active {
    background: white;
    color: #111827;
    border-color: #d1d5db;
  }

  .grammar-flashcard-wrap {
    padding: 16px;
    max-width: 960px;
    margin: 0 auto;
    width: 100%;
  }

  .grammar-flash-empty {
    text-align: center;
    color: #9ca3af;
    font-size: 14px;
    font-style: italic;
    padding: 40px 0;
  }

  /* Grammar two-column: prose left, paradigm right */
  .grammar-two-col {
    display: grid;
    grid-template-columns: 1fr 280px;
    align-items: start;
    max-width: 960px;
    margin: 0 auto;
    width: 100%;
  }

  .grammar-col-text {
    padding: 20px 24px 20px 16px;
    min-width: 0;
  }

  .grammar-col-paradigm {
    padding: 20px 16px;
    border-left: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
  }

  /* Inline word analysis — below passage, no box */
  .inline-analysis {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #f3f4f6;
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 18px;
    line-height: 1.5;
    min-height: 2em;
    color: #111;
  }

  .ia-form { font-weight: 700; }
  .ia-def  { color: #374151; font-style: italic; }
  .ia-morph { color: #6b7280; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 16px; }
  .ia-placeholder { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 12px; color: #d1d5db; font-style: italic; }

  /* Paradigm below analysis */
  .inline-paradigm {
    margin-top: 16px;
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
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    background: transparent;
    border: 1px solid transparent;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s;
  }
  .part-tab:hover { color: #374151; background: #f3f4f6; }
  .part-tab-active { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }


  /* ── Vocab tab wrapper ── */
  .vocab-exercise-wrap {
    max-width: 640px;
    margin: 0 auto;
    width: 100%;
  }

  .tab-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    text-align: center;
    font-size: 0.95rem;
    font-weight: 600;
    color: #374151;
    margin: 12px 0 0;
    padding: 0 1rem;
    line-height: 2;
  }

  .hint-play-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1.5px solid #a5b4fc;
    background: #eef2ff;
    color: #4338ca;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .hint-play-btn:hover:not(:disabled) { background: #e0e7ff; border-color: #818cf8; }
  .hint-play-btn.hint-playing { background: #4338ca; border-color: #4338ca; color: white; }
  .hint-play-btn:disabled { opacity: 0.35; cursor: default; }

  .hint-text { display: inline; font-weight: 600; }

  .hw { display: inline; border-radius: 3px; transition: background 0.08s; }
  .hw-active { background: #fef08a; }

  .input-mode-btn {
    font-size: 0.8rem;
    border-radius: 999px;
    padding: 0.25em 0.9em;
    cursor: pointer;
    border: 1px solid #e5e7eb;
    font-weight: 500;
    transition: filter 0.15s;
  }
  .input-mode-btn.mode-greek-hints { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }
  .input-mode-btn.mode-greek       { background: #f9fafb; border-color: #e5e7eb; color: #6b7280; }
  .input-mode-btn.mode-translit    { background: #fdf4ff; border-color: #e9d5ff; color: #7e22ce; }
  .input-mode-btn:hover            { filter: brightness(0.97); }

  /* ── Video + text layout (overview with HeyGen avatar) ── */
  .overview-video-layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 48px;
    align-items: start;
    padding: 32px 48px 64px;
    max-width: 1100px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .avatar-col {
    position: sticky;
    top: 16px;
  }

  .avatar-video {
    width: 100%;
    aspect-ratio: 9 / 16;
    object-fit: cover;
    object-position: center;
    display: block;
    border-radius: 8px;
  }

  .story-text-col {
    padding-top: 4px;
  }

  /* ── Simple part layout (overview, map) ── */
  .simple-part {
    max-width: 640px;
    margin: 0 auto;
    padding: 32px 0 64px;
  }
  .part-image-figure {
    margin: 0 0 24px;
  }
  .part-image {
    width: 100%;
    border-radius: 10px;
    display: block;
    margin-bottom: 0;
  }
  .part-image-caption {
    margin-top: 8px;
    font-size: 12px;
    color: #6b7280;
    text-align: center;
  }

  .caption-info-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #e5e7eb;
    color: #6b7280;
    font-size: 10px;
    font-style: normal;
    text-decoration: none;
    vertical-align: middle;
    transition: background 0.15s, color 0.15s;
  }
  .caption-info-link:hover { background: #d1d5db; color: #374151; }
  .part-text {
    font-size: 16px;
    line-height: 28px;
    color: #1f2937;
    margin-bottom: 20px;
  }
  .simple-word { display: inline; }

  .part-text.prose p {
    margin: 0 0 1.2em 0;
    font-size: 16px;
    line-height: 1.75;
    color: #1f2937;
  }
  .part-text.prose p:last-child { margin-bottom: 0; }
  .story-word {
    display: inline;
    border-radius: 3px;
    padding: 0 2px;
  }
  .word-highlight {
    background: #fef08a;
  }
  .display-only {
    color: #94a3b8;
    font-style: italic;
  }

  /* ── Overview layout with term sidebar ── */
  .overview-layout {
    max-width: 640px;
    margin: 0 auto;
  }
  .overview-layout.overview-has-sidebar {
    max-width: min(1080px, 95vw);
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 48px;
    align-items: start;
    padding: 0 24px;
  }

  /* Highlighted key terms */
  .term-word {
    color: #92400e;
    cursor: pointer;
    border-bottom: 1px dotted #d97706;
    border-radius: 0;
    background: none;
    font-weight: 500;
  }
  .term-word:hover { background: #fef3c7; border-radius: 2px; }
  .term-active { background: #fef3c7 !important; border-bottom-style: solid; border-bottom-color: #92400e; }

  /* Term info sidebar */
  .term-sidebar {
    position: sticky;
    top: 24px;
    background: white;
    border-radius: 14px;
    border: 1px solid #e5e7eb;
    padding: 24px 22px 28px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 32px;
  }
  .term-sidebar-close {
    position: absolute;
    top: 10px;
    right: 12px;
    background: none;
    border: none;
    font-size: 1.4rem;
    line-height: 1;
    color: #9ca3af;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .term-sidebar-close:hover { background: #f3f4f6; color: #374151; }
  .term-sidebar-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid;
    align-self: flex-start;
  }
  .term-sidebar-name {
    font-size: 26px;
    font-weight: 700;
    color: #111827;
    line-height: 1.2;
    margin: 0;
  }

  .term-sidebar-deity-img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 8px;
    cursor: zoom-in;
  }

  /* ── Lightbox ── */
  .lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.88);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    cursor: zoom-out;
  }
  .lightbox-img {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  }
  .term-sidebar-detail {
    font-size: 14.5px;
    line-height: 1.7;
    color: #374151;
    margin: 0;
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

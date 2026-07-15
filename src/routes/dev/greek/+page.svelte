<script>
  import { onMount } from 'svelte';
  import { db, storage } from '$lib/firebase/client';
  import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
  import { doc, getDoc, getDocs, addDoc, collection, query, where, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import { getApp } from 'firebase/app';
  import VocabPanel from '$lib/components/greek/VocabPanel.svelte';
  import MediterraneanMap from '$lib/components/greek/MediterraneanMap.svelte';
  import GrammarFlashcardExercise from '$lib/components/greek/GrammarFlashcardExercise.svelte';

  export let data; // from +page.server.js

  const functions = getFunctions(getApp());
  const STORY_BIBLE_ID = 'grade7-greek';
  const COURSE_ID = 'grade7-greek';
  const INTRO_LESSON_ID = 'grade7-greek-intro';
  const INTRO_TABS = [
    { id: 'introduction', label: 'Introduction' },
    { id: 'pronunciation', label: 'Pronunciation' },
    { id: 'typing',        label: 'Typing' },
  ];

  // ── Curriculum data derived from Firestore lessons ────────────────────────
  $: curriculumByChapter = Object.fromEntries(
    allLessons
      .filter(l => l.chapter_id)
      .map(l => [l.chapter_id, { chapter_id: l.chapter_id, grammar: l.standardIds ?? [] }])
  );
  $: bibleChapters = allLessons
    .filter(l => l.chapter_id)
    .map(l => {
      const chNum = l.chapter;
      const vocab = Object.entries(storyBible?.vocab?.introduced ?? {})
        .filter(([, v]) => v.chapter === chNum && v.tier === 'intro')
        .map(([word]) => word)
        .sort();
      const langIds = (l.standardIds ?? []).filter(sid => sid.startsWith('lang.'));
      return { chapter_id: l.chapter_id, grammar: langIds, num: chNum, title: data.chapterTitles?.[l.chapter_id] ?? l.chapter_id, vocab };
    });
  $: bibleVocabMap = (() => {
    const map = {};
    for (const ch of bibleChapters) {
      for (const word of ch.vocab ?? []) {
        map[word] = ch.chapter_id;
      }
    }
    return map;
  })();
  $: unusedIntroVocab = (data.introVocab ?? []).filter(
    e => !storyBible?.vocab?.introduced?.[e.greek]
  );
  $: bibleGrammarRows = allLessons
    .filter(l => l.chapter_id)
    .flatMap(l =>
      (l.standardIds ?? []).filter(sid => sid.startsWith('lang.')).map(gid => {
        const std = (data.grammarStandards ?? []).find(s => s.id === gid);
        return { chNum: l.chapter, chapterId: l.chapter_id, id: gid, description: std?.description ?? gid };
      })
    );
  // { chapter_id → non-language standardIds[] } — for the story bible chapters table
  $: coverageByChapter = Object.fromEntries(
    allLessons.filter(l => l.chapter_id).map(l => [
      l.chapter_id,
      (l.standardIds ?? []).filter(sid => !sid.startsWith('lang.'))
    ])
  );
  // { standardId → chapter_ids[] } — non-language only, for the story bible coverage section
  $: coverageByStandard = (() => {
    const map = {};
    for (const lesson of allLessons) {
      for (const sid of (lesson.standardIds ?? []).filter(s => !s.startsWith('lang.'))) {
        (map[sid] ??= []).push(lesson.chapter_id);
      }
    }
    return map;
  })();

  // ── Tab state ─────────────────────────────────────────────────────────────────
  let activeTab = 'story-bible'; // 'story-bible' | 'workshop' | 'images'

  // ── Story Bible ───────────────────────────────────────────────────────────────
  let storyBible = null;
  let bibleLoading = true;
  let bibleError = null;
  let recomputeStatus = 'idle'; // 'idle' | 'running' | 'done' | 'error'
  let recomputeError = null;

  async function loadStoryBible() {
    bibleLoading = true;
    bibleError = null;
    try {
      const snap = await getDoc(doc(db, 'story_bible', STORY_BIBLE_ID));
      storyBible = snap.exists() ? snap.data() : {};
    } catch (e) {
      bibleError = e.message;
    } finally {
      bibleLoading = false;
    }
  }

  // ── Standards — sourced from nge_intro_standards.json via server load ─────────
  $: allStandards = data.allNgeStandards ?? [];

  function groupStandardsByDomain(standards, coveredIds) {
    const covered = new Set(coveredIds ?? []);
    return standards.reduce((acc, std) => {
      const domain = std.domain ?? std.id.split('.')[0] ?? 'other';
      if (!acc[domain]) acc[domain] = [];
      acc[domain].push({ ...std, covered: covered.has(std.id) });
      return acc;
    }, {});
  }

  $: coveredIds = storyBible?.standards?.covered ?? [];
  $: standardGroups = groupStandardsByDomain(allStandards, coveredIds);
  $: charList = Object.entries(storyBible?.characters ?? {});
  $: vocabEntries = Object.entries(storyBible?.vocab?.introduced ?? {})
    .sort((a, b) => {
      const cd = (a[1].chapter ?? 999) - (b[1].chapter ?? 999);
      if (cd !== 0) return cd;
      const tierOrder = { intro: 0, beginning: 1, intermediate: 2, prose: 3 };
      return (tierOrder[a[1].tier] ?? 9) - (tierOrder[b[1].tier] ?? 9);
    });
  $: grammarEntries = Object.entries(storyBible?.grammar?.introduced ?? {});

  // ── NGE Vocabulary list ───────────────────────────────────────────────────────
  let ngeVocab = [];
  let vocabFilter = 'all';

  async function loadNgeVocab() {
    const res = await fetch('/data/nge_vocabulary.json');
    const data = await res.json();
    ngeVocab = data.entries ?? [];
  }

  const TIER_ORDER = ['intro', 'beginning', 'intermediate', 'prose'];
  const TIER_LABELS = { intro: 'Intro', beginning: 'Beginning', intermediate: 'Intermediate', prose: 'Prose' };
  $: introducedVocab = storyBible?.vocab?.introduced ?? {};
  $: vocabByTier = TIER_ORDER.map(tier => ({
    tier,
    words: ngeVocab
      .filter(w => w.introduced === tier)
      .filter(w => vocabFilter === 'all' || !introducedVocab[w.greek])
      .map(w => ({ ...w, chapter: introducedVocab[w.greek]?.chapter ?? null }))
  })).filter(g => g.words.length > 0);

  // ── Lessons ───────────────────────────────────────────────────────────────────
  let allLessons = [];

  async function loadAllLessons() {
    const snap = await getDocs(query(collection(db, 'lessons'), where('courseId', '==', COURSE_ID)));
    allLessons = snap.docs
      .map(d => ({ lessonId: d.id, ...d.data() }))
      .sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
  }

  // ── Workshop state ────────────────────────────────────────────────────────────
  let selectedLessonId = null;
  let selectedLesson = null;
  let newChapterMode = false;

  // Generation controls
  let grammarLevel = 'intro';
  let sentenceCount = 8;
  let directorsNote = '';
  let chatHistory = [];
  let refineFeedback = '';

  // Actions
  let workshopAction = 'idle'; // 'generating' | 'aligning' | 'accepting' | 'saving'
  let workshopError = null;

  // Intro mode (Introduction chapter)
  let introMode = false;
  let introDoc = null;
  let introTab = 'introduction';
  let introTabText = {};
  let introTabSaving = {};
  let introTabAudioStatus = {};

  // Block composer state
  let editorBlocks = [];
  let editorBlocksSaving = false;
  const CELL_STYLES = ['', 'greek-xl', 'greek-md', 'label', 'em', 'dim'];
  const PARA_STYLES = ['', 'em', 'dim'];
  const HEADING_STYLES = ['h3', 'h2'];

  function newHeading() { return { type: 'heading', text: '', style: 'h3' }; }
  function newParagraph() { return { type: 'paragraph', voiced: '' }; }
  function newTable() { return { type: 'table', headers: [], rows: [{ cells: [newCell(), newCell()] }] }; }
  function newCell() { return { voiced: '' }; }
  function newRow(colCount) { return { cells: Array.from({ length: colCount }, newCell) }; }

  function blockUp(i) { if (i > 0) { const b = [...editorBlocks]; [b[i-1], b[i]] = [b[i], b[i-1]]; editorBlocks = b; } }
  function blockDown(i) { if (i < editorBlocks.length - 1) { const b = [...editorBlocks]; [b[i], b[i+1]] = [b[i+1], b[i]]; editorBlocks = b; } }
  function removeBlock(i) { editorBlocks = editorBlocks.filter((_, j) => j !== i); }
  function addRow(blockIdx) { const b = [...editorBlocks]; const cols = b[blockIdx].rows[0]?.cells?.length ?? 2; b[blockIdx] = { ...b[blockIdx], rows: [...b[blockIdx].rows, newRow(cols)] }; editorBlocks = b; }
  function removeRow(blockIdx, rowIdx) { const b = [...editorBlocks]; b[blockIdx] = { ...b[blockIdx], rows: b[blockIdx].rows.filter((_, i) => i !== rowIdx) }; editorBlocks = b; }
  function addCol(blockIdx) { const b = [...editorBlocks]; b[blockIdx] = { ...b[blockIdx], headers: [...(b[blockIdx].headers ?? []), ''], rows: b[blockIdx].rows.map(r => ({ cells: [...r.cells, newCell()] })) }; editorBlocks = b; }
  function removeCol(blockIdx, colIdx) { const b = [...editorBlocks]; b[blockIdx] = { ...b[blockIdx], headers: (b[blockIdx].headers ?? []).filter((_, i) => i !== colIdx), rows: b[blockIdx].rows.map(r => ({ cells: r.cells.filter((_, i) => i !== colIdx) })) }; editorBlocks = b; }

  // cell mode: 'voiced' | 'display' | 'both'
  function cellMode(cell) {
    if (cell.voiced && cell.display) return 'both';
    if (cell.display && !cell.voiced) return 'display';
    return 'voiced';
  }
  function setCellMode(blockIdx, rowIdx, cellIdx, mode) {
    const b = [...editorBlocks];
    const cell = { ...b[blockIdx].rows[rowIdx].cells[cellIdx] };
    if (mode === 'voiced') { cell.voiced = cell.voiced || cell.display || ''; delete cell.display; }
    else if (mode === 'display') { cell.display = cell.display || cell.voiced || ''; delete cell.voiced; }
    else { cell.display = cell.display || cell.voiced || ''; cell.voiced = cell.voiced || ''; }
    b[blockIdx] = { ...b[blockIdx], rows: b[blockIdx].rows.map((r, ri) => ri !== rowIdx ? r : { cells: r.cells.map((c, ci) => ci !== cellIdx ? c : cell) }) };
    editorBlocks = b;
  }
  function updateCell(blockIdx, rowIdx, cellIdx, field, value) {
    const b = [...editorBlocks];
    b[blockIdx] = { ...b[blockIdx], rows: b[blockIdx].rows.map((r, ri) => ri !== rowIdx ? r : { cells: r.cells.map((c, ci) => ci !== cellIdx ? c : { ...c, [field]: value }) }) };
    editorBlocks = b;
  }

  function headingMode(block) {
    if (block.voiced === undefined) return 'display';
    if (block.voiced === (block.text ?? '')) return 'voiced';
    return 'both';
  }
  function setHeadingMode(bi, mode) {
    const b = [...editorBlocks];
    const c = b[bi];
    if (mode === 'display') b[bi] = { ...c, voiced: undefined };
    else if (mode === 'voiced') b[bi] = { ...c, voiced: c.text ?? '' };
    else b[bi] = { ...c, voiced: c.voiced !== undefined ? c.voiced : (c.text ?? '') };
    editorBlocks = b;
  }

  function paraMode(block) {
    const hasV = block.voiced !== undefined;
    const hasD = block.display !== undefined;
    if (hasV && hasD) return 'both';
    if (!hasV && hasD) return 'display';
    return 'voiced';
  }
  function setParaMode(bi, mode) {
    const b = [...editorBlocks];
    const c = b[bi];
    if (mode === 'voiced') { b[bi] = { ...c, voiced: c.voiced ?? c.display ?? '', display: undefined }; }
    else if (mode === 'display') { b[bi] = { ...c, display: c.display ?? c.voiced ?? '', voiced: undefined }; }
    else { b[bi] = { ...c, voiced: c.voiced ?? '', display: c.display ?? c.voiced ?? '' }; }
    editorBlocks = b;
  }
  function toggleCellVoiced(bi, ri, ci) {
    const m = cellMode(editorBlocks[bi].rows[ri].cells[ci]);
    setCellMode(bi, ri, ci, m === 'both' ? 'display' : m === 'display' ? 'both' : 'display');
  }
  function toggleCellDisplay(bi, ri, ci) {
    const m = cellMode(editorBlocks[bi].rows[ri].cells[ci]);
    setCellMode(bi, ri, ci, m === 'both' ? 'voiced' : m === 'voiced' ? 'both' : 'voiced');
  }

  function parseCell(raw) {
    const t = raw.trim();
    const fullMatch = t.match(/^\{([^}]*)\}$/);
    if (fullMatch) return { display: fullMatch[1].trim() };
    const voiced = t.replace(/\*\*/g, '').replace(/\*/g, '').trim();
    return { voiced };
  }

  function convertToBlocks(tab) {
    const text = introTabText[tab] ?? '';
    if (!text.trim()) { editorBlocks = [newParagraph()]; return; }

    const lines = text.split('\n');
    const blocks = [];
    let paraLines = [];
    let i = 0;

    function flushPara() {
      const joined = paraLines.join(' ').trim();
      paraLines = [];
      if (!joined) return;
      const voiced = joined
        .replace(/\{[^}]*\}/g, '')
        .replace(/\*\*/g, '').replace(/\*/g, '')
        .replace(/\s+/g, ' ').trim();
      if (voiced) blocks.push({ type: 'paragraph', voiced });
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) { flushPara(); i++; continue; }

      // {## Title} or {### Title}
      const curlyHeading = trimmed.match(/^\{(#{2,3})\s+([^}]+)\}$/);
      if (curlyHeading) {
        flushPara();
        blocks.push({ type: 'heading', text: curlyHeading[2].trim(), style: curlyHeading[1].length === 3 ? 'h3' : 'h2' });
        i++; continue;
      }

      // ## Title or ### Title (bare markdown)
      const bareHeading = trimmed.match(/^(#{2,3})\s+(.+)$/);
      if (bareHeading) {
        flushPara();
        blocks.push({ type: 'heading', text: bareHeading[2].trim(), style: bareHeading[1].length === 3 ? 'h3' : 'h2' });
        i++; continue;
      }

      // Table: collect consecutive | lines
      if (trimmed.startsWith('|')) {
        flushPara();
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        const rows = tableLines.map(l => l.split('|').slice(1, -1).map(c => c.trim()));
        const isSepRow = row => row.every(c => /^\{?-+\}?$/.test(c));
        const sepIdx = rows.findIndex(isSepRow);
        let headers = [];
        let dataRows = rows;
        if (sepIdx > 0) {
          headers = rows[0].map(h => h.replace(/\{([^}]*)\}/g, '$1').replace(/\*\*/g, '').replace(/\*/g, '').trim());
          dataRows = rows.slice(sepIdx + 1);
        } else if (sepIdx === 0) {
          dataRows = rows.slice(1);
        }
        const parsedRows = dataRows
          .map(row => ({ cells: row.map(c => parseCell(c)) }))
          .filter(r => r.cells.some(c => c.voiced || c.display));
        if (parsedRows.length) blocks.push({ type: 'table', headers, rows: parsedRows });
        continue;
      }

      paraLines.push(trimmed);
      i++;
    }

    flushPara();
    editorBlocks = blocks.length ? blocks : [newParagraph()];
  }

  let editorBlocksSaveStatus = ''; // '' | 'saving' | 'saved' | 'error'
  async function saveIntroTabBlocks(tab) {
    editorBlocksSaving = true;
    editorBlocksSaveStatus = 'saving';
    try {
      await updateDoc(doc(db, 'lessons', INTRO_LESSON_ID), { [`${tab}.blocks`]: editorBlocks });
      introDoc = { ...introDoc, [tab]: { ...introDoc?.[tab], blocks: editorBlocks } };
      editorBlocksSaveStatus = 'saved';
      setTimeout(() => { editorBlocksSaveStatus = ''; }, 2000);
    } catch (e) {
      console.error('saveIntroTabBlocks error:', e);
      editorBlocksSaveStatus = 'error';
    } finally {
      editorBlocksSaving = false;
    }
  }
  let audioProgress = '';

  // Alignment editor
  let editedSentences = [];
  let dirtyIndices = new Set();  // content-changed sentences — need new audio
  let reorderPending = false;    // order changed only — audio still valid, just needs num update
  let expandedSentence = null;
  let saveTimer = null;

  // Vocab scan
  let wordFormsCache = null;
  let ngeDefCache        = null;   // { greek → full definition string } from nge_vocabulary.json
  let ngeTierByDictEntry = null;   // { greek → introduced tier } from nge_vocabulary.json
  let vocabScanList = null;   // { dictEntry, shortDef, vocabTier }[] for VocabPanel
  let vocabUnrecognized = []; // surface forms not found in word_forms
  let glossLoading = false;
  let glossError = null;
  let scanLoading = false;

  // ── Story 2.0 ─────────────────────────────────────────────────────────────
  let s2SelectedVocab    = new Set();  // chapter vocab — persistent, saved to Firestore
  let s2TranslationVocab = new Set();  // session selection passed to → Gk API
  let s2TierFilter       = 'all';      // 'all' | 'intro' | 'beginning' | 'intermediate'
  let lessonStandardIds = new Set(); // chapter-level standards (top-level standardIds)
  let s2Search        = '';
  let s2ParagraphText = '';         // raw paragraph input before splitting into sentences

  // Lesson parts (tabs in the right panel)
  let lessonPartTab = 'overview'; // 'overview' | 'grammar' | 'story' | 'story2' | 'map'

  // Story (English narrative markdown, read from chapters_v2/)
  let storyText = '';
  let storyLoading = false;

  // Overview editor
  let overviewText = '';
  let overviewSaving = false;
  let overviewAudioStatus = 'idle'; // 'idle' | 'generating' | 'done' | 'error'
  let speakerRegenStatus  = {}; // { [speaker]: 'idle' | 'generating' | 'done' | 'error' }
  let segmentRegenStatus = {}; // { [index]: 'idle' | 'generating' | 'done' | 'error' }

  // Client-side mirrors of the Cloud Function helpers — kept in sync manually.
  function clientParseTaggedText(text) {
    const segs = [], re = /<(\w+)>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(text)) !== null) { const t = m[2].trim(); if (t) segs.push({ speaker: m[1].toLowerCase(), text: t }); }
    return segs;
  }
  function clientSplitLongText(text, maxLen = 4800) {
    if (text.length <= maxLen) return [text];
    const chunks = []; let remaining = text;
    while (remaining.length > maxLen) {
      const numLeft = Math.ceil(remaining.length / maxLen);
      const target  = Math.ceil(remaining.length / numLeft);
      const slack   = Math.floor(target * 0.25);
      let splitAt = -1;
      for (let d = 0; d <= slack && splitAt < 0; d++) for (const i of [target-d, target+d]) { if (i<2||i>=remaining.length) continue; if (remaining[i-1]==='\n'&&remaining[i-2]==='\n'){splitAt=i;break;} }
      for (let d = 0; d <= slack && splitAt < 0; d++) for (const i of [target-d, target+d]) { if (i<1||i>=remaining.length) continue; if (/[.!?]/.test(remaining[i-1])&&/\s/.test(remaining[i])){splitAt=i;break;} }
      if (splitAt < 0) { splitAt = remaining.lastIndexOf(' ', target+slack); if (splitAt<0) splitAt=target; }
      chunks.push(remaining.slice(0, splitAt).trim()); remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  $: mergedSegments = (() => {
    const savedText = selectedLesson?.overview?.text ?? '';
    if (!savedText.trim()) return [];
    const parsed = clientParseTaggedText(savedText).flatMap(s => clientSplitLongText(s.text).map(chunk => ({ speaker: s.speaker, text: chunk })));
    if (!parsed.length) return [];
    const byKey = {};
    for (const s of (selectedLesson?.overview?.segments ?? [])) { if (s.text) byKey[`${s.speaker}::${s.text}`] = s; }
    return parsed.map(seg => { const stored = byKey[`${seg.speaker}::${seg.text}`]; return { speaker: seg.speaker, text: seg.text, audioUrl: stored?.audioUrl ?? null, hasAudio: !!stored?.audioUrl }; });
  })();
  let overviewVideoStatus = 'idle'; // 'idle' | 'generating' | 'done' | 'error'
  let overviewVideoError = null;
  let overviewImagePrompt = '';
  let overviewImageGenStatus = 'idle'; // 'idle' | 'generating' | 'error'
  let overviewGeneratedImageB64 = null;
  let overviewImageSaveStatus = 'idle'; // 'idle' | 'saving' | 'saved'
  let overviewImageError = null;
  let overviewImageUploadStatus = 'idle'; // 'idle' | 'uploading' | 'done' | 'error'
  let overviewImageCaption = '';
  let overviewImageCaptionSaving = false;

  // Grammar module
  let grammarText = '';
  let grammarTextSaving = false;
  let grammarAudioStatus = 'idle';

  // Map module
  let mapDescription = '';
  let mapDescSaving = false;
  let mapAudioStatus = 'idle';
  let mapImageSaveStatus = 'idle'; // 'idle' | 'saving' | 'saved' | 'error'
  let mapHighlighted = new Set();
  let mapActiveRouteId = null;
  let mapComponent = null; // bound to MediterraneanMap

  // Standards picker — per part
  let stdPickerDomain = 'all';
  let stdPickerSaving = false;
  let partStandardIds = { overview: new Set(), grammar: new Set(), story: new Set(), map: new Set() };

  // ── Quiz tab state ────────────────────────────────────────────────────────────
  let quizMode = 'single';              // 'single' | 'passage'
  let quizStandardId = null;
  let quizPendingQuestion = null;
  let quizGenStatus = 'idle';           // 'idle' | 'generating' | 'error'
  let quizGenError = null;
  let quizStoredQuestions = [];
  let quizStoredLoading = false;
  let quizEditingId = null;
  let quizEditDraft = null;
  let quizDirectorNotes = {};           // { [standardId]: string }
  let quizSelectedExampleIds = {};      // { [standardId]: nge question id | null }
  let passageDirectorNote = '';
  let passagePending = null;            // { passage: { title, lines, wordAnnotations }, questions: [] }
  let passageGenStatus = 'idle';
  let passageGenError = null;
  let passageStoredQuizzes = [];
  let passageStoredLoading = false;
  let passageEditingQuestionIdx = null;
  let passageStandardsToTest = new Set();

  $: stdDomains = ['all', ...[...new Set(allStandards.map(s => s.domain ?? s.id.split('.')[0]))]];
  $: filteredStandards = (stdPickerDomain === 'all'
    ? allStandards
    : allStandards.filter(s => (s.domain ?? s.id.split('.')[0]) === stdPickerDomain)
  ).slice().sort((a, b) => {
    const ac = lessonStandardIds.has(a.id), bc = lessonStandardIds.has(b.id);
    if (ac && !bc) return -1;
    if (!ac && bc) return 1;
    return 0;
  });
  $: lessonStandardCoverage = (() => {
    const counts = {};
    for (const lesson of allLessons) {
      const ids = [
        ...(lesson.overview?.standardIds ?? []),
        ...(lesson.grammar?.standardIds  ?? []),
        ...(lesson.story?.standardIds    ?? lesson.standardIds ?? []),
        ...(lesson.map?.standardIds      ?? []),
      ];
      for (const sid of ids) counts[sid] = (counts[sid] ?? 0) + 1;
    }
    return counts;
  })();

  // Auto-select geo domain when switching to map tab
  $: if (lessonPartTab === 'map' && stdPickerDomain === 'all') stdPickerDomain = 'geography';

  // ── Quiz tab reactive computations ───────────────────────────────────────────
  // Index NGE reference questions by standard_id (one question can map to multiple standards)
  $: ngeByStandard = (() => {
    const map = {};
    for (const q of (data.ngeQuestions?.questions ?? [])) {
      for (const sid of (q.standard_ids ?? [])) {
        (map[sid] ??= []).push(q);
      }
    }
    return map;
  })();

  // All standard IDs for the current chapter — union of all lesson part standardIds + chapter-level standardIds
  $: quizChapterStandardIds = [
    ...new Set([
      ...partStandardIds.overview,
      ...partStandardIds.grammar,
      ...partStandardIds.map,
      ...(curriculumByChapter[selectedLesson?.chapter_id]?.grammar ?? []),
    ])
  ];
  $: quizKnownStandardIds   = quizChapterStandardIds.filter(sid => !!ngeStandardsById[sid]);
  $: quizOrphanedStandardIds = quizChapterStandardIds.filter(sid => !ngeStandardsById[sid]);

  // All NGE standards indexed by id for description lookups
  $: ngeStandardsById = Object.fromEntries(
    (data.allNgeStandards ?? []).map(s => [s.id, s])
  );

  // Cumulative vocab (all dict entries introduced up to and including this chapter)
  $: cumulativeVocab = (() => {
    const chapterNum = selectedLesson?.chapter ?? 0;
    return Object.entries(storyBible?.vocab?.introduced ?? {})
      .filter(([, v]) => (v.chapter ?? 999) <= chapterNum)
      .map(([word]) => word);
  })();

  // Cumulative grammar standard IDs through this chapter
  $: cumulativeGrammar = (() => {
    const chapterNum = selectedLesson?.chapter ?? 0;
    return (data.curriculum ?? [])
      .filter((_, i) => i + 1 <= chapterNum)
      .flatMap(c => c.grammar ?? []);
  })();

  // Quiz stored questions count per standard (for pill badges)
  $: quizCountByStandard = (() => {
    const counts = {};
    for (const q of quizStoredQuestions) {
      const sid = q.standardId ?? q.standard_ids?.[0];
      if (sid) counts[sid] = (counts[sid] ?? 0) + 1;
    }
    return counts;
  })();

  // Per-sentence Greek translation suggestions
  let greekSuggestions = {};  // { [i]: { greek, loading } }

  // Per-sentence re-align / re-voice status
  let sentenceAlignStatus = {}; // { [i]: 'idle'|'running'|'done'|'error' }
  let sentenceVoiceStatus = {}; // { [i]: 'idle'|'running'|'done'|'error' }

  $: nextChapterNum = (allLessons.length
    ? Math.max(...allLessons.map(l => l.chapter ?? 0))
    : 0) + 1;

  async function selectLesson(lessonId) {
    introMode = false;
    // Flush any pending edits to the current lesson before switching
    if (saveTimer !== null && (dirtyIndices.size > 0 || reorderPending)) {
      clearTimeout(saveTimer);
      saveTimer = null;
      await saveEdits();
    }
    selectedLessonId = lessonId;
    newChapterMode = false;
    workshopError = null;
    const snap = await getDoc(doc(db, 'lessons', lessonId));
    selectedLesson = snap.exists() ? { lessonId: snap.id, ...snap.data() } : null;
    editedSentences = selectedLesson?.sentences
      ? JSON.parse(JSON.stringify(selectedLesson.sentences))
      : [];
    dirtyIndices = new Set();
    reorderPending = false;
    expandedSentence = null;
    chatHistory = [];
    refineFeedback = '';
    greekSuggestions = {};
    sentenceAlignStatus = {};
    sentenceVoiceStatus = {};
    const savedScan = sessionStorage.getItem(`greek-scan-${lessonId}`);
    if (savedScan) {
      const { list, unrecog } = JSON.parse(savedScan);
      vocabScanList = list ?? null;
      vocabUnrecognized = unrecog ?? [];
    } else {
      vocabScanList = null;
      vocabUnrecognized = [];
    }
    lessonPartTab = 'overview';
    partStandardIds = {
      overview: new Set(selectedLesson?.overview?.standardIds ?? []),
      grammar:  new Set(selectedLesson?.grammar?.standardIds  ?? []),
      story:    new Set(selectedLesson?.story?.standardIds    ?? (selectedLesson?.standardIds ?? [])),
      story2:   new Set(selectedLesson?.story2?.standardIds   ?? []),
      map:      new Set(selectedLesson?.map?.standardIds      ?? []),
    };
    overviewText         = selectedLesson?.overview?.text         ?? '';
    overviewImagePrompt  = selectedLesson?.overview?.imagePrompt  ?? '';
    overviewImageCaption = selectedLesson?.overview?.imageCaption ?? '';
    overviewAudioStatus  = (selectedLesson?.overview?.segments?.length || selectedLesson?.overview?.audioUrl) ? 'done' : 'idle';
    overviewVideoStatus  = selectedLesson?.overview?.videoUrl     ? 'done' : 'idle';
    overviewVideoError   = null;
    speakerRegenStatus   = {};
    segmentRegenStatus   = {};
    grammarText          = selectedLesson?.grammar?.text           ?? '';
    grammarAudioStatus   = selectedLesson?.grammar?.audioUrl      ? 'done' : 'idle';
    mapDescription       = selectedLesson?.map?.description       ?? '';
    mapAudioStatus       = selectedLesson?.map?.audioUrl          ? 'done' : 'idle';
    lessonStandardIds    = new Set(selectedLesson?.standardIds ?? []);
    s2SelectedVocab      = new Set((selectedLesson?.vocab_list ?? []).map(v => v.dictEntry));
    vocabDirty           = false;
    s2TranslationVocab   = new Set();
    // Fetch English story text from chapters_v2/
    storyText = '';
    const chapterId = selectedLesson?.chapter_id;
    if (chapterId) {
      storyLoading = true;
      try {
        const r = await fetch(`/dev/chapters/api?file=${chapterId}.md&draft=2`);
        const d = await r.json();
        storyText = d.content ?? '';
      } catch { storyText = ''; }
      finally { storyLoading = false; }
    }
    mapHighlighted       = new Set(selectedLesson?.map?.highlighted  ?? []);
    mapActiveRouteId     = selectedLesson?.map?.activeRouteId        ?? null;
    mapImageSaveStatus   = 'idle';
  }

  async function selectIntroMode() {
    if (saveTimer !== null && (dirtyIndices.size > 0 || reorderPending)) {
      clearTimeout(saveTimer);
      saveTimer = null;
      await saveEdits();
    }
    introMode = true;
    selectedLessonId = INTRO_LESSON_ID;
    selectedLesson = null;
    newChapterMode = false;
    introTab = 'introduction';
    const ref = doc(db, 'lessons', INTRO_LESSON_ID);
    const snap = await getDoc(ref);
    introDoc = snap.exists() ? snap.data() : {};
    if (!snap.exists()) await setDoc(ref, { courseType: 'intro' });
    introTabText = {
      introduction: introDoc?.introduction?.text ?? '',
      pronunciation: introDoc?.pronunciation?.text ?? '',
      typing:        introDoc?.typing?.text        ?? '',
    };
    introTabSaving      = { introduction: false, pronunciation: false, typing: false };
    introTabAudioStatus = {
      introduction: (introDoc?.introduction?.segments?.length || introDoc?.introduction?.audioUrl) ? 'done' : 'idle',
      pronunciation: (introDoc?.pronunciation?.segments?.length || introDoc?.pronunciation?.audioUrl) ? 'done' : 'idle',
      typing:        (introDoc?.typing?.segments?.length        || introDoc?.typing?.audioUrl)        ? 'done' : 'idle',
    };
    editorBlocks = introDoc?.[introTab]?.blocks ?? [];
  }

  async function saveIntroTab(tab) {
    introTabSaving = { ...introTabSaving, [tab]: true };
    try {
      await setDoc(doc(db, 'lessons', INTRO_LESSON_ID),
        { [tab]: { ...(introDoc?.[tab] ?? {}), text: introTabText[tab] } },
        { merge: true }
      );
      introDoc = { ...introDoc, [tab]: { ...(introDoc?.[tab] ?? {}), text: introTabText[tab] } };
    } finally {
      introTabSaving = { ...introTabSaving, [tab]: false };
    }
  }

  async function generateIntroAudio(tab, { force = false } = {}) {
    const isBlocks = !!(introDoc?.[tab]?.blocks?.length);
    if (!isBlocks && !introTabText[tab]?.trim()) return;
    if (!isBlocks) await saveIntroTab(tab);
    introTabAudioStatus = { ...introTabAudioStatus, [tab]: 'generating' };
    try {
      const fn = httpsCallable(functions, 'generateOverviewAudio', { timeout: 540000 });
      await fn({ lessonId: INTRO_LESSON_ID, part: tab, force });
      introTabAudioStatus = { ...introTabAudioStatus, [tab]: 'done' };
      const snap = await getDoc(doc(db, 'lessons', INTRO_LESSON_ID));
      if (snap.exists()) introDoc = snap.data();
    } catch (e) {
      console.error('generateIntroAudio error:', e);
      introTabAudioStatus = { ...introTabAudioStatus, [tab]: 'error' };
    }
  }

  async function startNewChapter() {
    workshopError = null;
    directorsNote = '';
    chatHistory = [];
    refineFeedback = '';
    const ref = await addDoc(collection(db, 'lessons'), {
      courseId: COURSE_ID,
      chapter: nextChapterNum,
      title: '',
      status: 'draft',
      standardIds: [],
      sentences: [],
      vocab_list: [],
      overview: { text: '' },
      createdAt: serverTimestamp()
    });
    await loadAllLessons();
    await selectLesson(ref.id);
    newChapterMode = true;
  }

  async function generateChapter() {
    workshopAction = 'generating';
    workshopError = null;
    chatHistory = [];
    try {
      const fn = httpsCallable(functions, 'generateGreekLesson', { timeout: 540000 });
      const result = await fn({
        storyBibleId: STORY_BIBLE_ID,
        grammarLevel,
        sentenceCount,
        chapter: nextChapterNum,
        directorsNote: directorsNote.trim() || null
      });
      await loadAllLessons();
      await selectLesson(result.data.lessonId);
      chatHistory = [{ role: 'assistant', text: 'Chapter draft generated.' }];
    } catch (e) {
      console.error('generateGreekLesson error:', e);
      // Function may have completed on the server despite a timeout on the client.
      // Reload lessons so any landed draft becomes visible.
      await loadAllLessons();
      const latestForChapter = allLessons.find(l => l.chapter === nextChapterNum);
      if (latestForChapter) {
        await selectLesson(latestForChapter.lessonId);
        workshopError = 'Connection timed out, but the draft landed — loaded it automatically.';
      } else {
        workshopError = e.message;
      }
    } finally {
      workshopAction = 'idle';
    }
  }

  async function refineChapter() {
    if (!refineFeedback.trim() || !selectedLessonId) return;
    const feedback = refineFeedback.trim();
    refineFeedback = '';
    chatHistory = [...chatHistory, { role: 'user', text: feedback }];
    workshopAction = 'generating';
    workshopError = null;
    try {
      const fn = httpsCallable(functions, 'refineGreekLesson', { timeout: 120000 });
      const result = await fn({ lessonId: selectedLessonId, feedback });
      // Update local state directly — no need to reload from Firestore
      editedSentences = JSON.parse(JSON.stringify(result.data.sentences));
      selectedLesson = { ...selectedLesson, sentences: result.data.sentences, title: result.data.title };
      dirtyIndices = new Set();
      greekSuggestions = {};
      vocabScanList = null;
      chatHistory = [...chatHistory, { role: 'assistant', text: 'Draft revised.' }];
    } catch (e) {
      console.error('refine error:', e);
      workshopError = e.message;
      chatHistory = [...chatHistory, { role: 'assistant', text: `Error: ${e.message}` }];
    } finally {
      workshopAction = 'idle';
    }
  }

  async function translateSentenceToGreek(i) {
    const english = editedSentences[i]?.english?.trim();
    if (!english) return;

    // Build brief context from surrounding sentences
    const context = editedSentences
      .filter((_, j) => j !== i && editedSentences[j]?.greek)
      .slice(Math.max(0, i - 2), i + 2)
      .map(s => `${s.greek}  (${s.english})`)
      .join('\n');

    greekSuggestions = { ...greekSuggestions, [i]: { greek: null, loading: true } };
    try {
      const fn = httpsCallable(functions, 'translateToGreek', { timeout: 30000 });
      const result = await fn({ english, context: context || null });
      greekSuggestions = { ...greekSuggestions, [i]: { greek: result.data.greek, loading: false } };
    } catch (e) {
      greekSuggestions = { ...greekSuggestions, [i]: { greek: null, loading: false, error: e.message } };
    }
  }

  function acceptGreekSuggestion(i) {
    const greek = greekSuggestions[i]?.greek;
    if (!greek) return;
    editedSentences[i] = { ...editedSentences[i], greek, words: retokenize(greek) };
    markDirty(i);
    const { [i]: _, ...rest } = greekSuggestions;
    greekSuggestions = rest;
  }

  async function alignChapter() {
    if (!selectedLessonId) return;
    workshopAction = 'aligning';
    workshopError = null;
    try {
      // Always flush before aligning — CF reads from Firestore
      clearTimeout(saveTimer);
      await saveEdits();
      const fn = httpsCallable(functions, 'alignGreekLesson', { timeout: 300000 });
      await fn({ lessonId: selectedLessonId });
      await selectLesson(selectedLessonId);
      await loadAllLessons();
    } catch (e) {
      console.error('align error:', e);
      workshopError = e.message;
    } finally {
      workshopAction = 'idle';
    }
  }

  async function reopenLesson() {
    if (!selectedLessonId) return;
    await updateDoc(doc(db, 'lessons', selectedLessonId), { status: 'aligned' });
    await selectLesson(selectedLessonId);
    await loadAllLessons();
  }

  async function alignSentence(i) {
    if (!selectedLessonId) return;
    clearTimeout(saveTimer);
    await saveEdits();
    sentenceAlignStatus = { ...sentenceAlignStatus, [i]: 'running' };
    try {
      const fn = httpsCallable(functions, 'alignGreekLesson', { timeout: 300000 });
      await fn({ lessonId: selectedLessonId, sentenceIndex: i });
      const snap = await getDoc(doc(db, 'lessons', selectedLessonId));
      if (snap.exists()) {
        selectedLesson = { lessonId: snap.id, ...snap.data() };
        editedSentences = JSON.parse(JSON.stringify(snap.data().sentences));
        dirtyIndices = new Set();
      }
      sentenceAlignStatus = { ...sentenceAlignStatus, [i]: 'done' };
    } catch (e) {
      console.error('alignSentence error:', e);
      sentenceAlignStatus = { ...sentenceAlignStatus, [i]: 'error' };
    }
  }

  async function voiceSentence(i) {
    if (!selectedLessonId) return;
    // Ensure audioGenerated: false is written so the CF doesn't skip
    editedSentences[i] = { ...editedSentences[i], audioGenerated: false };
    dirtyIndices = new Set([...dirtyIndices, i]);
    clearTimeout(saveTimer);
    await saveEdits();
    sentenceVoiceStatus = { ...sentenceVoiceStatus, [i]: 'running' };
    try {
      const fn = httpsCallable(functions, 'generateGreekAudio');
      await fn({ lessonId: selectedLessonId, sentenceIndex: i });
      const snap = await getDoc(doc(db, 'lessons', selectedLessonId));
      if (snap.exists()) {
        selectedLesson = { lessonId: snap.id, ...snap.data() };
        editedSentences = JSON.parse(JSON.stringify(snap.data().sentences));
      }
      sentenceVoiceStatus = { ...sentenceVoiceStatus, [i]: 'done' };
    } catch (e) {
      console.error('voiceSentence error:', e);
      sentenceVoiceStatus = { ...sentenceVoiceStatus, [i]: 'error' };
    }
  }

  async function acceptAndGenerateAudio() {
    if (!selectedLessonId) return;
    workshopAction = 'accepting';
    workshopError = null;
    // Save any pending edits first
    if (dirtyIndices.size > 0) await saveEdits();

    // Fire image prompt generation concurrently — don't await, runs alongside audio
    httpsCallable(functions, 'generateImagePrompt')({ lessonId: selectedLessonId, storyBibleId: STORY_BIBLE_ID })
      .then(res => {
        // Pre-fill the image prompt for the Images tab
        imageGenPrompt = res.data.image_prompt ?? imageGenPrompt;
        imageGenChapterId = selectedLessonId;
        allLessons = allLessons.map(l =>
          l.lessonId === selectedLessonId ? { ...l, image_prompt: res.data.image_prompt } : l
        );
      })
      .catch(e => console.warn('Image prompt generation failed:', e.message));

    const fn = httpsCallable(functions, 'generateGreekAudio');
    // Use editedSentences — it has audioGenerated: false immediately on markDirty,
    // so it's always up-to-date regardless of whether saveEdits has flushed.
    const sentences = editedSentences;

    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].audioGenerated === true) {
        audioProgress = `Sentence ${i + 1}/${sentences.length} — already done, skipping.`;
        continue;
      }
      audioProgress = `Generating audio for sentence ${i + 1}/${sentences.length}...`;
      try {
        await fn({ lessonId: selectedLessonId, sentenceIndex: i });
      } catch (e) {
        workshopError = `Audio failed for sentence ${i + 1}: ${e.message}`;
        workshopAction = 'idle';
        audioProgress = '';
        return;
      }
    }

    audioProgress = 'Saving to story bible...';
    try {
      const acceptFn = httpsCallable(functions, 'acceptGreekLesson');
      await acceptFn({ lessonId: selectedLessonId, storyBibleId: STORY_BIBLE_ID });
      await loadAllLessons();
      await selectLesson(selectedLessonId);
      await loadStoryBible();
    } catch (e) {
      workshopError = e.message;
    } finally {
      workshopAction = 'idle';
      audioProgress = '';
    }
  }

  // ── Alignment helpers ─────────────────────────────────────────────────────────

  /** Build { 1: "the", 2: "boy", ... } from a plain English sentence string. */
  function buildPositionMap(english) {
    const map = {};
    english.trim().split(/\s+/).forEach((w, i) => { map[i + 1] = w; });
    return map;
  }

  /**
   * Recompute english, preEng, postEng for every word in a sentence
   * after any engSentPos change. Returns a new sentence object.
   */
  function recomputeAlignment(sentence) {
    const posMap = buildPositionMap(sentence.english);
    const maxPos = Math.max(...Object.keys(posMap).map(Number));

    // Deep-copy words, clear derived fields
    const words = sentence.words.map(w => ({ ...w, english: '', preEng: '', postEng: '' }));

    const aligned = words
      .filter(w => w.engSentPos != null)
      .sort((a, b) => a.engSentPos - b.engSentPos);

    if (aligned.length === 0) return { ...sentence, words };

    // Group by engSentPos, sorted by sentPos within each group
    const byPos = {};
    for (const w of aligned) {
      const p = w.engSentPos;
      if (!byPos[p]) byPos[p] = [];
      byPos[p].push(w);
    }
    for (const group of Object.values(byPos)) {
      group.sort((a, b) => a.sentPos - b.sentPos);
    }
    const positions = Object.keys(byPos).map(Number).sort((a, b) => a - b);

    for (let i = 0; i < positions.length; i++) {
      const cur = positions[i];
      const next = positions[i + 1] ?? null;
      const group = byPos[cur];
      const firstInGroup = group[0];
      const lastInGroup  = group[group.length - 1];

      // ALL words in the group get the English surface word (for alignment visibility).
      // The student view deduplicates at render time.
      group.forEach(w => { w.english = posMap[cur] ?? ''; });

      if (i === 0) {
        // preEng on the FIRST word of the first group
        const pre = [];
        for (let p = 1; p < cur; p++) if (posMap[p]) pre.push(posMap[p]);
        if (pre.length) firstInGroup.preEng = pre.join(' ');
      }

      if (next != null) {
        // preEng for the FIRST word of the next group
        const gap = [];
        for (let p = cur + 1; p < next; p++) if (posMap[p]) gap.push(posMap[p]);
        if (gap.length) byPos[next][0].preEng = gap.join(' ');
      }

      if (i === positions.length - 1) {
        // postEng on the LAST word of the last group
        const post = [];
        for (let p = cur + 1; p <= maxPos; p++) if (posMap[p]) post.push(posMap[p]);
        if (post.length) lastInGroup.postEng = post.join(' ');
      }
    }

    return { ...sentence, words };
  }

  // Strip all Greek diacritics (accents + breathings) for fallback lookup.
  // Greek words may appear with grave accent (contextual) vs acute (citation form),
  // or with/without breathings — the dict stores both accented and stripped keys.
  function stripGreekDiacritics(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // Look up a surface form in wordFormsCache with multiple fallbacks:
  //   1. exact form
  //   2. strip diacritics
  //   3. strip movable-ν (ἐστιν→ἐστί, -ουσιν→-ουσι, etc.)
  //   4. strip movable-ν + strip diacritics
  function lookupForm(bare) {
    if (!wordFormsCache) return null;
    return wordFormsCache[bare]
      || wordFormsCache[stripGreekDiacritics(bare)]
      || (bare.endsWith('ν') && wordFormsCache[bare.slice(0, -1)])
      || (bare.endsWith('ν') && wordFormsCache[stripGreekDiacritics(bare.slice(0, -1))])
      || null;
  }

  async function scanVocab() {
    scanLoading = true;
    vocabScanList = null;
    vocabUnrecognized = [];
    try {
      // Always reload via loadWordGlosses — it initialises the cache with
      // stripped-key fallback map and merges Firestore glosses.
      await loadWordGlosses();
      const PUNCT_RE = /[.,;:·?!]/g;
      const seen = new Set();
      const list = [];
      const unrecog = new Set();
      for (const sent of editedSentences) {
        for (const token of (sent.greek ?? '').trim().split(/\s+/).filter(Boolean)) {
          const bare = token.replace(PUNCT_RE, '');
          if (!bare || seen.has(bare)) continue;
          seen.add(bare);
          const entry = lookupForm(bare);
          if (entry?.dictEntry) {
            if (!list.find(w => w.dictEntry === entry.dictEntry)) {
              list.push({ dictEntry: entry.dictEntry, shortDef: entry.shortDef ?? '', vocabTier: entry.vocabTier ?? null });
            }
          } else {
            unrecog.add(bare);
          }
        }
      }
      vocabScanList = list;
      vocabUnrecognized = [...unrecog];
    } finally {
      scanLoading = false;
    }
  }

  // ── Story 2.0 helpers ──────────────────────────────────────────────────────
  // Unique lemma list derived from cache + lesson appearances
  $: s2LemmaList = (() => {
    if (!wordFormsCache) return [];
    const byLemma = {};
    for (const entry of Object.values(wordFormsCache)) {
      const de = entry.dictEntry;
      if (!de || byLemma[de]) continue;
      const fullDef = ngeDefCache?.[de] || entry.shortDef || '';
      byLemma[de] = { lemma: de, def: fullDef, tier: entry.vocabTier ?? 'unknown' };
    }
    const appearances = {};
    for (const lesson of allLessons) {
      for (const item of (lesson.vocab_list ?? [])) {
        if (!appearances[item.dictEntry]) appearances[item.dictEntry] = [];
        if (!appearances[item.dictEntry].includes(lesson.chapter))
          appearances[item.dictEntry].push(lesson.chapter);
      }
    }
    return Object.values(byLemma)
      .map(l => ({ ...l, chapters: (appearances[l.lemma] ?? []).sort((a,b) => a-b) }))
      .sort((a, b) => a.lemma.localeCompare(b.lemma, 'el'));
  })();

  $: s2LemmaFiltered = s2LemmaList
    .filter(l =>
      (s2TierFilter === 'all' || l.tier === s2TierFilter) &&
      (!s2Search || l.lemma.includes(s2Search) || l.def.toLowerCase().includes(s2Search.toLowerCase()))
    )
    .sort((a, b) => {
      const ac = s2SelectedVocab.has(a.lemma), bc = s2SelectedVocab.has(b.lemma);
      if (ac && !bc) return -1;
      if (!ac && bc) return 1;
      return 0;
    });

  // Load cache when story2 tab becomes active
  $: if (lessonPartTab === 'story2' && !wordFormsCache) loadWordGlosses();

  async function translateS2Sentence(i) {
    const english = editedSentences[i]?.english?.trim();
    if (!english) return;
    const context = editedSentences
      .filter((_, j) => j !== i && editedSentences[j]?.greek)
      .slice(Math.max(0, i - 2), i + 2)
      .map(s => `${s.greek}  (${s.english})`)
      .join('\n');
    greekSuggestions = { ...greekSuggestions, [i]: { greek: null, loading: true } };
    try {
      const fn = httpsCallable(functions, 'translateToGreek', { timeout: 30000 });
      const result = await fn({
        english,
        context: context || null,
        vocabWords: s2TranslationVocab.size ? [...s2TranslationVocab] : null,
      });
      greekSuggestions = { ...greekSuggestions, [i]: { greek: result.data.greek, loading: false } };
    } catch (e) {
      greekSuggestions = { ...greekSuggestions, [i]: { greek: null, loading: false, error: e.message } };
    }
  }

  function acceptS2Suggestion(i) {
    const greek = greekSuggestions[i]?.greek;
    if (!greek) return;
    editedSentences[i] = { ...editedSentences[i], greek, words: retokenize(greek) };
    markDirty(i);
    s2SelectedVocab = new Set();
    const { [i]: _, ...rest } = greekSuggestions;
    greekSuggestions = rest;
  }

  function addS2Sentence() {
    const next = { num: editedSentences.length, greek: '', english: '', words: [], audioGenerated: false };
    editedSentences = [...editedSentences, next];
    markDirty(editedSentences.length - 1);
  }

  function parseParagraphIntoSentences() {
    const raw = s2ParagraphText.trim();
    if (!raw) return;
    const parts = raw
      .split(/[.;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    editedSentences = parts.map((english, i) => ({ num: i, greek: '', english, words: [], audioGenerated: false }));
    dirtyIndices = new Set(editedSentences.map((_, i) => i));
    greekSuggestions = {};
    vocabScanList = null;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveEdits, 1500);
  }

  async function s2ScanVocab() {
    // Run scanVocab against s2Sentences
    scanLoading = true;
    vocabScanList = null;
    vocabUnrecognized = [];
    try {
      await loadWordGlosses();
      const PUNCT_RE = /[.,;:·?!]/g;
      const seen = new Set();
      const list = [];
      const unrecog = new Set();
      for (const sent of editedSentences) {
        for (const token of (sent.greek ?? '').trim().split(/\s+/).filter(Boolean)) {
          const bare = token.replace(PUNCT_RE, '');
          if (!bare || seen.has(bare)) continue;
          seen.add(bare);
          const entry = lookupForm(bare);
          if (entry?.dictEntry) {
            if (!list.find(w => w.dictEntry === entry.dictEntry))
              list.push({ dictEntry: entry.dictEntry, shortDef: entry.shortDef ?? '', vocabTier: entry.vocabTier ?? null });
          } else {
            unrecog.add(bare);
          }
        }
      }
      vocabScanList = list;
      vocabUnrecognized = [...unrecog];
      sessionStorage.setItem(`greek-scan-${selectedLessonId}`, JSON.stringify({ list, unrecog: [...unrecog] }));
    } finally {
      scanLoading = false;
    }
  }

  async function loadWordGlosses() {
    try {
      if (!wordFormsCache) {
        const res = await fetch('/data/Greek/word_forms.json');
        const raw = await res.json();
        // Build stripped-key secondary map for diacritic-insensitive lookup
        const stripped = {};
        for (const [k, v] of Object.entries(raw)) {
          const bare = stripGreekDiacritics(k);
          if (bare !== k) stripped[bare] = v;
        }
        wordFormsCache = { ...raw, ...stripped };
      }
      if (!ngeDefCache) {
        const res = await fetch('/data/Greek/nge_vocabulary.json');
        const nge = await res.json();
        ngeDefCache = {};
        ngeTierByDictEntry = {};
        for (const entry of (nge.entries ?? [])) {
          if (entry.greek && entry.definition) ngeDefCache[entry.greek] = entry.definition;
          if (entry.greek && entry.introduced) ngeTierByDictEntry[entry.greek] = entry.introduced;
        }
      }
      // Patch vocabTier on static cache entries
      if (wordFormsCache && ngeTierByDictEntry) {
        for (const v of Object.values(wordFormsCache)) {
          if (!v.vocabTier && v.dictEntry && ngeTierByDictEntry[v.dictEntry]) {
            v.vocabTier = ngeTierByDictEntry[v.dictEntry];
          }
        }
      }
      const snap = await getDoc(doc(db, 'word_glosses', 'grade7-greek'));
      if (!snap.exists()) return;
      const forms = snap.data().forms ?? {};
      // Patch vocabTier on Firestore glosses before merging
      if (ngeTierByDictEntry) {
        for (const v of Object.values(forms)) {
          if (!v.vocabTier && v.dictEntry && ngeTierByDictEntry[v.dictEntry]) {
            v.vocabTier = ngeTierByDictEntry[v.dictEntry];
          }
        }
      }
      Object.assign(wordFormsCache, forms);
    } catch (e) {
      console.warn('loadWordGlosses failed:', e.message);
    }
  }

  async function generateGlosses() {
    glossLoading = true;
    glossError = null;
    try {
      const fn = httpsCallable(functions, 'glossGreekWords', { timeout: 120000 });
      const result = await fn({ tokens: vocabUnrecognized, courseId: 'grade7-greek' });
      const { glossed, formCount } = result.data;

      // Reload from Firestore to get the actual persisted forms
      await loadWordGlosses();

      // Add new dict_entries to the scan list (dedup)
      for (const entry of Object.values(glossed)) {
        if (!vocabScanList.find(w => w.dictEntry === entry.dictEntry)) {
          vocabScanList = [...vocabScanList, { dictEntry: entry.dictEntry, shortDef: entry.shortDef, vocabTier: null }];
        }
      }
      // Only clear tokens that are now actually findable in the cache.
      // Form generation silently fails for some words — if Firestore wasn't
      // updated for a token, keep it in vocabUnrecognized so the user can retry.
      vocabUnrecognized = vocabUnrecognized.filter(tok => !lookupForm(tok));
      sessionStorage.setItem(`greek-scan-${selectedLessonId}`, JSON.stringify({ list: vocabScanList, unrecog: vocabUnrecognized }));
    } catch (e) {
      glossError = e.message;
    } finally {
      glossLoading = false;
    }
  }

  function markDirty(index) {
    // Immediately clear audioGenerated so the audio loop always sees the correct state,
    // regardless of whether saveEdits has flushed yet.
    editedSentences[index] = { ...editedSentences[index], audioGenerated: false };
    dirtyIndices = new Set([...dirtyIndices, index]);
    vocabScanList = null; // stale after any edit
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveEdits, 1500);
  }

  /** Rebuild a minimal words array from a Greek string (used after manual Greek edits). */
  function retokenize(greekText) {
    return (greekText ?? '').trim().split(/\s+/).filter(Boolean).map((text, idx) => ({
      sentPos: idx, text,
      dictEntry: null, shortDef: null, morph: null,
      vocabTier: null, paradigmKey: null, engSentPos: null
    }));
  }

  function addSentence() {
    const next = { num: editedSentences.length, greek: '', english: '', words: [], audioGenerated: false };
    editedSentences = [...editedSentences, next];
    markDirty(editedSentences.length - 1);
  }

  // ── Drag-to-reorder sentences ─────────────────────────────────────────────────
  let dragIndex = null;
  let dragOverIndex = null;

  function handleDragStart(e, i) {
    dragIndex = i;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, i) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverIndex = i;
  }

  function handleDrop(e, i) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) { handleDragEnd(); return; }
    const next = [...editedSentences];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(i, 0, moved);
    editedSentences = next;
    reorderPending = true;
    vocabScanList = null;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveEdits, 1500);
    handleDragEnd();
  }

  function handleDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }

  async function saveEdits() {
    if (!selectedLessonId || (dirtyIndices.size === 0 && !reorderPending)) return;
    workshopAction = 'saving';
    const sentences = editedSentences.map((s, i) => ({
      ...s,
      num: i,
      // Only clear audioGenerated for content-changed sentences, not reorders
      audioGenerated: dirtyIndices.has(i) ? false : (s.audioGenerated ?? false)
    }));
    try {
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        sentences,
        updatedAt: serverTimestamp()
      });
      // Sync back
      selectedLesson = { ...selectedLesson, sentences };
      dirtyIndices = new Set();
      reorderPending = false;
    } catch (e) {
      console.error('Save edits failed:', e);
    } finally {
      workshopAction = 'idle';
    }
  }


  async function toggleStandard(stdId) {
    if (!selectedLessonId) return;
    const part = lessonPartTab;
    const next = new Set(partStandardIds[part]);
    if (next.has(stdId)) next.delete(stdId); else next.add(stdId);
    partStandardIds = { ...partStandardIds, [part]: next };
    stdPickerSaving = true;
    try {
      const ids = [...next];
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        [`${part}.standardIds`]: ids, updatedAt: serverTimestamp()
      });
      allLessons = allLessons.map(l =>
        l.lessonId === selectedLessonId
          ? { ...l, [part]: { ...(l[part] ?? {}), standardIds: ids } }
          : l
      );
    } finally {
      stdPickerSaving = false;
    }
  }

  async function toggleLessonStandard(stdId) {
    if (!selectedLessonId) return;
    const next = new Set(lessonStandardIds);
    if (next.has(stdId)) next.delete(stdId); else next.add(stdId);
    lessonStandardIds = next;
    const ids = [...next];
    stdPickerSaving = true;
    try {
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        standardIds: ids, updatedAt: serverTimestamp()
      });
      allLessons = allLessons.map(l =>
        l.lessonId === selectedLessonId ? { ...l, standardIds: ids } : l
      );
    } finally {
      stdPickerSaving = false;
    }
  }

  async function removeOrphanedStandard(stdId) {
    if (!selectedLessonId) return;
    const ids = (selectedLesson?.standardIds ?? []).filter(id => id !== stdId);
    await updateDoc(doc(db, 'lessons', selectedLessonId), { standardIds: ids, updatedAt: serverTimestamp() });
    lessonStandardIds = new Set(ids);
    allLessons = allLessons.map(l =>
      l.lessonId === selectedLessonId ? { ...l, standardIds: ids } : l
    );
  }

  let vocabDirty = false;
  let vocabSaving = false;

  function toggleLessonVocab(lemma) {
    if (!selectedLessonId) return;
    const next = new Set(s2SelectedVocab);
    if (next.has(lemma)) next.delete(lemma); else next.add(lemma);
    s2SelectedVocab = next;
    vocabDirty = true;
  }

  async function saveVocab() {
    if (!selectedLessonId) return;
    vocabSaving = true;
    const vocabArray = [...s2SelectedVocab];
    const vocabList  = vocabArray.map(dictEntry => ({ dictEntry }));
    try {
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        vocab_list: vocabList, updatedAt: serverTimestamp()
      });
      allLessons = allLessons.map(l =>
        l.lessonId === selectedLessonId ? { ...l, vocab_list: vocabList } : l
      );
      vocabDirty = false;
    } finally {
      vocabSaving = false;
    }
  }

  async function saveGrammarText() {
    if (!selectedLessonId) return;
    grammarTextSaving = true;
    try {
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        'grammar.text': grammarText, updatedAt: serverTimestamp()
      });
      selectedLesson = { ...selectedLesson, grammar: { ...(selectedLesson.grammar ?? {}), text: grammarText } };
    } finally {
      grammarTextSaving = false;
    }
  }

  async function generateGrammarAudio() {
    if (!selectedLessonId || !grammarText.trim()) return;
    await saveGrammarText();
    grammarAudioStatus = 'generating';
    try {
      const fn = httpsCallable(functions, 'generateOverviewAudio', { timeout: 540000 });
      await fn({ lessonId: selectedLessonId, part: 'grammar' });
      grammarAudioStatus = 'done';
      const snap = await getDoc(doc(db, 'lessons', selectedLessonId));
      selectedLesson = snap.exists() ? { lessonId: snap.id, ...snap.data() } : selectedLesson;
    } catch (e) {
      console.error('generateGrammarAudio error:', e);
      grammarAudioStatus = 'error';
    }
  }

  async function saveMapDescription() {
    if (!selectedLessonId) return;
    mapDescSaving = true;
    try {
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        'map.description': mapDescription, updatedAt: serverTimestamp()
      });
    } finally {
      mapDescSaving = false;
    }
  }

  async function saveMapConfig() {
    if (!selectedLessonId) return;
    await updateDoc(doc(db, 'lessons', selectedLessonId), {
      'map.highlighted':   [...mapHighlighted],
      'map.activeRouteId': mapActiveRouteId,
      updatedAt: serverTimestamp(),
    });
  }

  async function saveMapImage() {
    if (!selectedLessonId || !mapComponent) return;
    mapImageSaveStatus = 'saving';
    try {
      // Save current config first
      await saveMapConfig();
      // Export PNG blob from the SVG
      const blob = await mapComponent.getBlob();
      const path = `lessons/${selectedLessonId}/map.png`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, blob, { contentType: 'image/png' });
      const url = await getDownloadURL(sRef);
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        'map.imageUrl': url, updatedAt: serverTimestamp()
      });
      // Reflect in local lesson
      if (selectedLesson) selectedLesson = { ...selectedLesson, map: { ...selectedLesson.map, imageUrl: url } };
      mapImageSaveStatus = 'saved';
    } catch (e) {
      console.error('saveMapImage failed', e);
      mapImageSaveStatus = 'error';
    }
  }

  async function saveOverviewImageCaption() {
    if (!selectedLessonId) return;
    overviewImageCaptionSaving = true;
    try {
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        'overview.imageCaption': overviewImageCaption, updatedAt: serverTimestamp()
      });
      selectedLesson = { ...selectedLesson, overview: { ...(selectedLesson.overview ?? {}), imageCaption: overviewImageCaption } };
    } finally {
      overviewImageCaptionSaving = false;
    }
  }

  async function uploadOverviewImage(file) {
    if (!selectedLessonId || !file) return;
    overviewImageUploadStatus = 'uploading';
    overviewImageError = null;
    try {
      const ext = file.name.split('.').pop().toLowerCase() || 'png';
      const mime = file.type || 'image/png';
      const sRef = storageRef(storage, `lessons/${selectedLessonId}/overview-image.${ext}`);
      await uploadBytes(sRef, file, { contentType: mime });
      const url = await getDownloadURL(sRef);
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        'overview.imageUrl': url, updatedAt: serverTimestamp()
      });
      selectedLesson = { ...selectedLesson, overview: { ...(selectedLesson.overview ?? {}), imageUrl: url } };
      overviewGeneratedImageB64 = null;
      overviewImageSaveStatus = 'idle';
      overviewImageUploadStatus = 'done';
    } catch (e) {
      console.error('uploadOverviewImage error:', e);
      overviewImageError = e.message;
      overviewImageUploadStatus = 'error';
    }
  }

  async function generateOverviewVideo() {
    if (!selectedLessonId || !selectedLesson?.overview?.audioUrl) return;
    overviewVideoStatus = 'generating';
    overviewVideoError = null;
    try {
      const fn = httpsCallable(functions, 'generateOverviewVideo', { timeout: 620000 });
      await fn({ lessonId: selectedLessonId });
      overviewVideoStatus = 'done';
      const snap = await getDoc(doc(db, 'lessons', selectedLessonId));
      selectedLesson = snap.exists() ? { lessonId: snap.id, ...snap.data() } : selectedLesson;
    } catch (e) {
      console.error('generateOverviewVideo error:', e);
      overviewVideoError = e.message;
      overviewVideoStatus = 'error';
    }
  }

  async function regenerateSegment(index) {
    if (!selectedLessonId) return;
    segmentRegenStatus = { ...segmentRegenStatus, [index]: 'generating' };
    try {
      const fn = httpsCallable(functions, 'regenerateOverviewSegment', { timeout: 120000 });
      await fn({ lessonId: selectedLessonId, segmentIndex: index });
      const snap = await getDoc(doc(db, 'lessons', selectedLessonId));
      selectedLesson = snap.exists() ? { lessonId: snap.id, ...snap.data() } : selectedLesson;
      segmentRegenStatus = { ...segmentRegenStatus, [index]: 'done' };
    } catch (e) {
      console.error('regenerateSegment error:', e);
      segmentRegenStatus = { ...segmentRegenStatus, [index]: 'error' };
    }
  }

  async function regenerateSpeaker(speaker) {
    if (!selectedLessonId) return;
    speakerRegenStatus = { ...speakerRegenStatus, [speaker]: 'generating' };
    try {
      const fn = httpsCallable(functions, 'regenerateOverviewSpeaker', { timeout: 300000 });
      await fn({ lessonId: selectedLessonId, speaker });
      const snap = await getDoc(doc(db, 'lessons', selectedLessonId));
      selectedLesson = snap.exists() ? { lessonId: snap.id, ...snap.data() } : selectedLesson;
      speakerRegenStatus = { ...speakerRegenStatus, [speaker]: 'done' };
    } catch (e) {
      console.error('regenerateSpeaker error:', e);
      speakerRegenStatus = { ...speakerRegenStatus, [speaker]: 'error' };
    }
  }

  async function generateOverviewAudio() {
    if (!selectedLessonId || !overviewText.trim()) return;
    overviewAudioStatus = 'generating';
    try {
      const fn = httpsCallable(functions, 'generateOverviewAudio', { timeout: 540000 });
      await fn({ lessonId: selectedLessonId });
      overviewAudioStatus = 'done';
      // Refresh lesson doc to pick up audioUrl
      const snap = await getDoc(doc(db, 'lessons', selectedLessonId));
      selectedLesson = snap.exists() ? { lessonId: snap.id, ...snap.data() } : selectedLesson;
    } catch (e) {
      console.error('generateOverviewAudio error:', e);
      overviewAudioStatus = 'error';
    }
  }

  async function generateOverviewImage() {
    if (!selectedLessonId || !overviewImagePrompt.trim()) return;
    overviewImageGenStatus = 'generating';
    overviewImageError = null;
    overviewGeneratedImageB64 = null;
    try {
      const fn = httpsCallable(functions, 'generateGreekImage', { timeout: 120000 });
      const result = await fn({ prompt: overviewImagePrompt, characterImageUrls: [] });
      overviewGeneratedImageB64 = result.data.b64_json;
      overviewImageGenStatus = 'idle';
    } catch (e) {
      overviewImageError = e.message;
      overviewImageGenStatus = 'error';
    }
  }

  async function saveOverviewImage() {
    if (!selectedLessonId || !overviewGeneratedImageB64) return;
    overviewImageSaveStatus = 'saving';
    try {
      const blob = await (await fetch(`data:image/png;base64,${overviewGeneratedImageB64}`)).blob();
      const sRef = storageRef(storage, `lessons/${selectedLessonId}/overview-image.png`);
      await uploadBytes(sRef, blob, { contentType: 'image/png' });
      const url = await getDownloadURL(sRef);
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        'overview.imageUrl': url, 'overview.imagePrompt': overviewImagePrompt, updatedAt: serverTimestamp()
      });
      selectedLesson = { ...selectedLesson, overview: { ...(selectedLesson.overview ?? {}), imageUrl: url, imagePrompt: overviewImagePrompt } };
      overviewImageSaveStatus = 'saved';
    } catch (e) {
      console.error('saveOverviewImage error:', e);
      overviewImageSaveStatus = 'idle';
    }
  }

  async function generateMapAudio() {
    if (!selectedLessonId || !mapDescription.trim()) return;
    // Save description first
    await saveMapDescription();
    mapAudioStatus = 'generating';
    try {
      const fn = httpsCallable(functions, 'generateOverviewAudio', { timeout: 540000 });
      await fn({ lessonId: selectedLessonId, part: 'map' });
      mapAudioStatus = 'done';
      const snap = await getDoc(doc(db, 'lessons', selectedLessonId));
      selectedLesson = snap.exists() ? { lessonId: snap.id, ...snap.data() } : selectedLesson;
    } catch (e) {
      console.error('generateMapAudio error:', e);
      mapAudioStatus = 'error';
    }
  }

  async function saveOverview() {
    if (!selectedLessonId) return;
    overviewSaving = true;
    try {
      await updateDoc(doc(db, 'lessons', selectedLessonId), {
        'overview.text': overviewText, updatedAt: serverTimestamp()
      });
      selectedLesson = { ...selectedLesson, overview: { ...(selectedLesson.overview ?? {}), text: overviewText } };
    } finally {
      overviewSaving = false;
    }
  }


  $: acceptedLessons = allLessons.filter(l => normalizeStatus(l.status) === 'accepted');

  // ── Character Voices ──────────────────────────────────────────────────────────
  const VOICE_CHARS = ['narrator', 'dolios', 'pallas', 'kleio', 'phoebe', 'plato'];
  const VOICE_LABELS = { narrator: 'Narrator (Socrates)', dolios: 'Dolios', pallas: 'Pallas', kleio: 'Kleio', phoebe: 'Phoebe', plato: 'Plato' };
  const DEFAULT_VOICE_IDS = {
    narrator: '62eXAzXYsxMOUszcxeJ4',
    dolios:   'bTrXJpbeuC5KgriLhQeC',
    pallas:   'iukn3a1vSSNFmdi5NZS4',
    kleio:    'n7Wi4g1bhpw4Bs8HK5ph',
    phoebe:   'wJqPPQ618aTW29mptyoc',
    plato:    ''
  };
  let voiceIds = { ...DEFAULT_VOICE_IDS };
  let voicesSaving = false;
  let voicesSaved = false;

  async function loadVoices() {
    const snap = await getDoc(doc(db, 'courses', COURSE_ID));
    if (snap.exists() && snap.data().voices) {
      voiceIds = { ...DEFAULT_VOICE_IDS, ...snap.data().voices };
    }
  }

  async function saveVoices() {
    voicesSaving = true;
    voicesSaved = false;
    try {
      await updateDoc(doc(db, 'courses', COURSE_ID), { voices: voiceIds });
      voicesSaved = true;
      setTimeout(() => { voicesSaved = false; }, 2000);
    } finally {
      voicesSaving = false;
    }
  }

  // ── Image generation ──────────────────────────────────────────────────────────
  let charImages = {}; // { 1: { name, url }, 2: ..., 3: ..., 4: ... }
  let compositeDataUrl = null; // 2×2 grid of character images for reference

  async function buildComposite() {
    const urls = [1,2,3,4].map(s => charImages[s]?.url).filter(Boolean);
    if (urls.length < 4) { compositeDataUrl = null; return; }
    const SIZE = 512; // each quadrant
    const canvas = document.createElement('canvas');
    canvas.width = SIZE * 2;
    canvas.height = SIZE * 2;
    const ctx = canvas.getContext('2d');
    const positions = [[0,0],[SIZE,0],[0,SIZE],[SIZE,SIZE]];
    await Promise.all(urls.map((url, i) => new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, positions[i][0], positions[i][1], SIZE, SIZE);
        resolve();
      };
      img.onerror = resolve;
      img.src = url;
    })));
    compositeDataUrl = canvas.toDataURL('image/png');
  }

  // Rebuild composite whenever charImages changes
  $: if (typeof document !== 'undefined') buildComposite();
  let charImageUploading = {};
  let imageGenChapterId = null;
  $: if (selectedLessonId) imageGenChapterId = selectedLessonId;
  let imageGenPrompt = '';
  let generatedImageB64 = null;
  let imageGenStatus = 'idle';
  let imageGenError = null;
  let imageSaveStatus = 'idle'; // 'idle' | 'saving' | 'saved'

  async function saveImageToLesson() {
    if (!generatedImageB64 || !imageGenChapterId) return;
    imageSaveStatus = 'saving';
    try {
      const blob = await (await fetch(`data:image/png;base64,${generatedImageB64}`)).blob();
      const sRef = storageRef(storage, `greek/lessons/${imageGenChapterId}/chapter-image.png`);
      await uploadBytes(sRef, blob, { contentType: 'image/png' });
      const url = await getDownloadURL(sRef);
      await updateDoc(doc(db, 'lessons', imageGenChapterId), { image_url: url });
      // Update in-memory lesson list
      allLessons = allLessons.map(l => l.lessonId === imageGenChapterId ? { ...l, image_url: url } : l);
      imageSaveStatus = 'saved';
    } catch (e) {
      imageGenError = e.message;
      imageSaveStatus = 'idle';
    }
  }

  async function uploadCharImage(slot, file) {
    charImageUploading = { ...charImageUploading, [slot]: true };
    try {
      const sRef = storageRef(storage, `greek/characters/slot-${slot}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      charImages = { ...charImages, [slot]: { ...(charImages[slot] ?? {}), url } };
      await updateDoc(doc(db, 'story_bible', STORY_BIBLE_ID), {
        [`characterImages.${slot}`]: charImages[slot]
      });
    } catch (e) {
      console.error('uploadCharImage error:', e);
    } finally {
      charImageUploading = { ...charImageUploading, [slot]: false };
    }
  }

  async function updateCharName(slot, name) {
    charImages = { ...charImages, [slot]: { ...(charImages[slot] ?? {}), name } };
    await updateDoc(doc(db, 'story_bible', STORY_BIBLE_ID), {
      [`characterImages.${slot}`]: charImages[slot]
    });
  }

  async function removeCharImage(slot) {
    try {
      const sRef = storageRef(storage, `greek/characters/slot-${slot}`);
      await deleteObject(sRef);
    } catch (e) { /* may not exist yet */ }
    const updated = { ...charImages };
    delete updated[slot];
    charImages = updated;
    await updateDoc(doc(db, 'story_bible', STORY_BIBLE_ID), {
      [`characterImages.${slot}`]: null
    });
  }

  function selectImageChapter(lessonId) {
    imageGenChapterId = lessonId;
    imageSaveStatus = 'idle';
    const lesson = allLessons.find(l => l.lessonId === lessonId);
    if (!lesson) return;
    // Use AI-generated prompt if available, otherwise fall back to simple description
    if (lesson.image_prompt) {
      imageGenPrompt = lesson.image_prompt;
    } else {
      const parts = [
        lesson.title ? `Chapter ${lesson.chapter}: ${lesson.title}` : `Chapter ${lesson.chapter}`
      ];
      if (lesson.narrative_summary) parts.push(lesson.narrative_summary);
      else if (lesson.summary) parts.push(lesson.summary);
      imageGenPrompt = parts.join('\n\n') +
        '\n\nAncient Greek vase painting aesthetic, warm ochre and terracotta tones, suitable for 7th grade students.';
    }
  }

  async function generateChapterImage() {
    if (!imageGenPrompt.trim()) return;
    imageGenStatus = 'generating';
    imageGenError = null;
    generatedImageB64 = null;
    try {
      // Use the composite reference sheet (single 2×2 image) so the model sees
      // all four characters together rather than four separate images.
      const characterImageUrls = compositeDataUrl ? [compositeDataUrl]
        : Object.values(charImages).filter(c => c?.url).map(c => c.url);

      // Prepend a reference key so the model knows which quadrant is which character
      const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      const refKey = compositeDataUrl
        ? 'Reference image is a 2×2 grid of character portraits: ' +
          [1,2,3,4].map((s, i) => {
            const name = charImages[s]?.name;
            return name ? `${positions[i]} = ${name}` : null;
          }).filter(Boolean).join(', ') + '. Depict all characters in the scene. '
        : '';

      const fn = httpsCallable(functions, 'generateGreekImage', { timeout: 120000 });
      const result = await fn({ prompt: refKey + imageGenPrompt, characterImageUrls });
      generatedImageB64 = result.data.b64_json;
      imageSaveStatus = 'idle';
    } catch (e) {
      imageGenError = e.message;
    } finally {
      imageGenStatus = 'idle';
    }
  }

  // ── Quiz functions ────────────────────────────────────────────────────────────
  async function loadQuizData(lessonId) {
    if (!lessonId) return;
    quizStoredLoading = true;
    passageStoredLoading = true;
    try {
      const [qSnap, pSnap] = await Promise.all([
        getDocs(query(collection(db, 'greek_questions'), where('lessonId', '==', lessonId))),
        getDocs(query(collection(db, 'greek_passage_quizzes'), where('lessonId', '==', lessonId)))
      ]);
      quizStoredQuestions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      passageStoredQuizzes = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('loadQuizData error', e);
    } finally {
      quizStoredLoading = false;
      passageStoredLoading = false;
    }
  }

  async function generateQuizQuestion() {
    if (!quizStandardId) return;
    quizGenStatus = 'generating';
    quizGenError = null;
    quizPendingQuestion = null;
    try {
      const std = ngeStandardsById[quizStandardId];
      const selectedId = quizSelectedExampleIds[quizStandardId];
      const allExamples = ngeByStandard[quizStandardId] ?? [];
      const selectedExample = selectedId
        ? allExamples.find(q => q.id === selectedId)
        : null;
      const examples = selectedExample
        ? [{ text: selectedExample.text, choices: selectedExample.choices, correct: selectedExample.correct }]
        : [];
      const fn = httpsCallable(functions, 'generateGreekQuestion');
      const result = await fn({
        standardId: quizStandardId,
        standardDescription: std?.description ?? quizStandardId,
        level: 'intro',
        chapterTitle: selectedLesson?.title ? `Chapter ${selectedLesson.chapter}: ${selectedLesson.title}` : '',
        directorNote: quizDirectorNotes[quizStandardId] ?? '',
        exampleQuestions: examples
      });
      quizPendingQuestion = result.data.question;
    } catch (e) {
      quizGenError = e.message ?? 'Generation failed';
    } finally {
      quizGenStatus = 'idle';
    }
  }

  async function approveQuizQuestion() {
    if (!quizPendingQuestion || !selectedLessonId) return;
    try {
      await addDoc(collection(db, 'greek_questions'), {
        ...quizPendingQuestion,
        lessonId: selectedLessonId,
        standardId: quizStandardId,
        source: 'generated',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      quizPendingQuestion = null;
      await loadQuizData(selectedLessonId);
    } catch (e) {
      quizGenError = e.message;
    }
  }

  async function deleteQuizQuestion(docId) {
    try {
      await deleteDoc(doc(db, 'greek_questions', docId));
      quizStoredQuestions = quizStoredQuestions.filter(q => q.id !== docId);
    } catch (e) {
      console.error('deleteQuizQuestion error', e);
    }
  }

  async function saveQuizEdit(docId) {
    if (!quizEditDraft) return;
    try {
      await updateDoc(doc(db, 'greek_questions', docId), {
        ...quizEditDraft,
        updatedAt: serverTimestamp()
      });
      quizStoredQuestions = quizStoredQuestions.map(q => q.id === docId ? { ...q, ...quizEditDraft } : q);
      quizEditingId = null;
      quizEditDraft = null;
    } catch (e) {
      console.error('saveQuizEdit error', e);
    }
  }

  async function generatePassageQuiz() {
    passageGenStatus = 'generating';
    passageGenError = null;
    passagePending = null;
    try {
      const fn = httpsCallable(functions, 'generateGreekPassageQuiz');
      const result = await fn({
        directorNote: passageDirectorNote,
        chapterTitle: selectedLesson?.title ? `Chapter ${selectedLesson.chapter}: ${selectedLesson.title}` : '',
        cumulativeVocab,
        cumulativeGrammar,
        standardsToTest: [...passageStandardsToTest]
      });
      passagePending = result.data;
    } catch (e) {
      passageGenError = e.message ?? 'Generation failed';
    } finally {
      passageGenStatus = 'idle';
    }
  }

  async function approvePassageQuiz() {
    if (!passagePending || !selectedLessonId) return;
    try {
      await addDoc(collection(db, 'greek_passage_quizzes'), {
        lessonId: selectedLessonId,
        level: 'intro',
        ...passagePending.passage,
        questions: passagePending.questions,
        standardsTestedIds: [...passageStandardsToTest],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      passagePending = null;
      passageDirectorNote = '';
      passageStandardsToTest = new Set();
      await loadQuizData(selectedLessonId);
    } catch (e) {
      console.error('approvePassageQuiz error', e);
    }
  }

  async function deletePassageQuiz(docId) {
    try {
      await deleteDoc(doc(db, 'greek_passage_quizzes', docId));
      passageStoredQuizzes = passageStoredQuizzes.filter(q => q.id !== docId);
    } catch (e) {
      console.error('deletePassageQuiz error', e);
    }
  }

  // Load quiz data reactively when quiz tab is activated
  $: if (lessonPartTab === 'quiz' && selectedLessonId) loadQuizData(selectedLessonId);

  // ── Init ──────────────────────────────────────────────────────────────────────
  onMount(async () => {
    await Promise.all([
      loadStoryBible(),
      loadNgeVocab(),
      loadAllLessons(),
      loadVoices()
    ]);
    charImages = { ...(storyBible?.characterImages ?? {}) };
    loadWordGlosses(); // non-blocking — merges Firestore glosses into wordFormsCache when ready
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const STATUS_COLORS = {
    draft:       'bg-yellow-100 text-yellow-700',
    aligned:     'bg-blue-100 text-blue-700',
    accepted:    'bg-green-100 text-green-700',
    audio_ready: 'bg-green-100 text-green-700'
  };

  const LEVEL_COLORS = {
    introductory: { border: 'border-l-2 border-sky-400',    badge: 'bg-sky-100 text-sky-700' },
    beginning:    { border: 'border-l-2 border-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
    intermediate: { border: 'border-l-2 border-amber-400',  badge: 'bg-amber-100 text-amber-700' },
    prose:        { border: 'border-l-2 border-purple-400', badge: 'bg-purple-100 text-purple-700' },
  };

  // Normalize legacy status
  function normalizeStatus(status) {
    return status === 'audio_ready' ? 'accepted' : status;
  }
</script>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- Page header                                                               -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="mb-6">
  <h1 class="text-2xl font-bold text-gray-800">Greek Course Workshop</h1>
  <p class="text-sm text-gray-500 mt-1">grade7-greek — story bible · chapter generation</p>
</div>

<!-- Tab switcher -->
<div class="flex gap-1 mb-6 border-b border-gray-200">
  {#each [['story-bible','Story Bible'],['workshop','Workshop']] as [tab, label]}
    <button
      on:click={() => activeTab = tab}
      class="px-4 py-2 text-sm font-medium transition-colors
        {activeTab === tab
          ? 'text-indigo-700 border-b-2 border-indigo-600 -mb-px'
          : 'text-gray-500 hover:text-gray-800'}"
    >{label}</button>
  {/each}
</div>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- TAB 1: Story Bible                                                        -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
{#if activeTab === 'story-bible'}

  <!-- Chapters -->
  <div class="bg-white rounded-xl border border-gray-200 p-5 mb-5">
    <h2 class="font-semibold text-gray-800 mb-3">Chapters</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
          <tr>
            <th class="text-left px-3 py-2 w-10">#</th>
            <th class="text-left px-3 py-2">Title</th>
            <th class="text-left px-3 py-2">Vocab introduced</th>
            <th class="text-left px-3 py-2">Grammar introduced</th>
            <th class="text-left px-3 py-2">Standards</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          {#each bibleChapters as ch}
            {@const stdIds = coverageByChapter[ch.chapter_id] ?? []}
            <tr class="hover:bg-gray-50 align-top">
              <td class="px-3 py-2 text-gray-400">{ch.num}</td>
              <td class="px-3 py-2 font-medium text-gray-800">{ch.title}</td>
              <td class="px-3 py-2 text-gray-500">
                {#if ch.vocab?.length}
                  <span class="font-mono">{ch.vocab.join(', ')}</span>
                {:else}
                  <span class="text-gray-300 italic">—</span>
                {/if}
              </td>
              <td class="px-3 py-2">
                {#if ch.grammar?.length}
                  <div class="flex flex-wrap gap-1">
                    {#each ch.grammar as gid}
                      <span class="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs">{gid.split('.').pop()}</span>
                    {/each}
                  </div>
                {:else}
                  <span class="text-gray-300 italic text-xs">consolidation</span>
                {/if}
              </td>
              <td class="px-3 py-2">
                <div class="flex flex-wrap gap-1">
                  {#each stdIds.slice(0, 4) as sid}
                    <span class="px-1 py-0 rounded bg-gray-100 text-gray-500 text-xs">{sid}</span>
                  {/each}
                  {#if stdIds.length > 4}
                    <span class="text-gray-400 text-xs">+{stdIds.length - 4}</span>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Vocab by chapter -->
  <div class="bg-white rounded-xl border border-gray-200 p-5 mb-5">
    <h2 class="font-semibold text-gray-800 mb-4">Intro Vocabulary by Chapter</h2>
    <div class="space-y-5">
      {#each bibleChapters as ch}
        {#if ch.vocab?.length}
          <div>
            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Ch.{ch.num} — {ch.title}
            </div>
            <div class="grid grid-cols-3 gap-x-6 gap-y-0.5">
              {#each ch.vocab as word}
                {@const entry = (data.introVocab ?? []).find(e => e.greek === word)}
                <div class="flex items-baseline gap-2 text-sm">
                  <span class="font-mono text-gray-800 shrink-0">{word}</span>
                  {#if entry}
                    <span class="text-gray-400 text-xs truncate">{entry.definition}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>

  <!-- Unused intro vocab -->
  {#if unusedIntroVocab.length}
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-5">
      <h2 class="font-semibold text-gray-800 mb-1">Unused Intro Vocabulary</h2>
      <p class="text-xs text-gray-400 mb-4">{unusedIntroVocab.length} NGE intro words not yet introduced in any accepted chapter.</p>
      <div class="grid grid-cols-3 gap-x-6 gap-y-0.5">
        {#each unusedIntroVocab as entry}
          <div class="flex items-baseline gap-2 text-sm">
            <span class="font-mono text-gray-500 shrink-0">{entry.greek}</span>
            <span class="text-gray-300 text-xs truncate">{entry.definition}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Grammar progression -->
  <div class="bg-white rounded-xl border border-gray-200 p-5 mb-5">
    <h2 class="font-semibold text-gray-800 mb-3">Grammar Progression</h2>
    {#if !bibleGrammarRows.length}
      <p class="text-sm text-gray-400 italic">No grammar assigned yet.</p>
    {:else}
      <div class="space-y-1">
        {#each bibleGrammarRows as row}
          <div class="flex items-start gap-3 text-sm">
            <span class="shrink-0 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs whitespace-nowrap">Ch.{row.chNum}</span>
            <span class="text-xs font-mono text-indigo-600 shrink-0 w-48 truncate">{row.id}</span>
            <span class="text-gray-700 leading-snug">{row.description}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Standards coverage -->
  <div class="bg-white rounded-xl border border-gray-200 p-5">
    <h2 class="font-semibold text-gray-800 mb-1">Standards Coverage</h2>
    <p class="text-xs text-gray-400 mb-4">Derived from lesson standardIds — {Object.keys(coverageByStandard).length} standards covered across {allLessons.length} chapters.</p>
    <div class="space-y-0.5">
      {#each Object.entries(coverageByStandard).sort(([a],[b]) => a.localeCompare(b)) as [sid, chapters]}
        <div class="flex items-start gap-3 text-sm">
          <span class="text-xs font-mono text-gray-500 shrink-0 w-40 truncate">{sid}</span>
          <div class="flex flex-wrap gap-1">
            {#each chapters as ch}
              <span class="px-1.5 py-0 rounded bg-indigo-50 text-indigo-700 text-xs">{ch}</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Recompute -->
  <div class="flex items-center justify-end gap-3 mt-2">
    {#if recomputeError}
      <span class="text-xs text-red-500">{recomputeError}</span>
    {:else if recomputeStatus === 'done'}
      <span class="text-xs text-green-600">Recomputed.</span>
    {/if}
    <button
      disabled={recomputeStatus === 'running'}
      on:click={async () => {
        recomputeStatus = 'running';
        recomputeError = null;
        try {
          const fn = httpsCallable(functions, 'recomputeStoryBible');
          await fn({ storyBibleId: STORY_BIBLE_ID });
          await loadStoryBible();
          recomputeStatus = 'done';
        } catch (e) {
          recomputeError = e.message;
          recomputeStatus = 'error';
        }
      }}
      class="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg bg-white transition-colors disabled:opacity-50"
    >
      {recomputeStatus === 'running' ? 'Recomputing…' : 'Recompute Story Bible'}
    </button>
  </div>

{/if}

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- TAB 2: Workshop                                                           -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
{#if activeTab === 'workshop'}

  <!-- Lesson tile strip -->
  <div class="flex flex-wrap gap-2 mb-6">
    <!-- Intro pseudo-lesson -->
    <button
      on:click={selectIntroMode}
      class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors
        {introMode
          ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'}"
    >
      <span class="font-semibold">Intro</span>
    </button>

    {#each allLessons as lesson}
      <button
        on:click={() => selectLesson(lesson.lessonId)}
        class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors
          {selectedLessonId === lesson.lessonId
            ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'}"
      >
        <span class="font-semibold">Ch.{lesson.chapter}</span>
        {#if lesson.title}
          <span class="text-gray-400 text-xs max-w-32 truncate">{lesson.title}</span>
        {/if}
        <span class="px-1.5 py-0.5 rounded text-xs font-medium {STATUS_COLORS[lesson.status] ?? 'bg-gray-100 text-gray-500'}">
          {lesson.status}
        </span>
      </button>
    {/each}
    <button
      on:click={startNewChapter}
      class="flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed border-indigo-300 text-indigo-600 text-sm hover:bg-indigo-50 transition-colors
        {newChapterMode && !selectedLessonId ? 'bg-indigo-50' : ''}"
    >
      + New Chapter
    </button>
  </div>

  <!-- Editor -->
  {#if !selectedLesson && !newChapterMode && !introMode}
    <div class="flex items-center justify-center h-48 text-gray-300 text-sm">
      Select a chapter above or generate a new one.
    </div>

  {:else}

    <!-- ── Part tabs — above both columns ── -->
    {#if selectedLesson}
      <div class="flex gap-1 mb-4 border-b border-gray-200">
        {#each [['overview','S · Story'],['grammar','G · Grammar'],['flashcards','F · Flashcards'],['story2','G · Greek'],['map','M · Map'],['quiz','Q · Quiz']] as [tab, label]}
          <button
            on:click={() => lessonPartTab = tab}
            class="px-4 py-2 text-sm font-medium transition-colors
              {lessonPartTab === tab
                ? 'text-indigo-700 border-b-2 border-indigo-600 -mb-px'
                : 'text-gray-500 hover:text-gray-800'}"
          >{label}</button>
        {/each}
      </div>
    {:else if introMode}
      <div class="flex gap-1 mb-4 border-b border-gray-200">
        {#each INTRO_TABS as tab}
          <button
            on:click={() => { introTab = tab.id; editorBlocks = introDoc?.[tab.id]?.blocks ?? []; }}
            class="px-4 py-2 text-sm font-medium transition-colors
              {introTab === tab.id
                ? 'text-indigo-700 border-b-2 border-indigo-600 -mb-px'
                : 'text-gray-500 hover:text-gray-800'}"
          >{tab.label}</button>
        {/each}
      </div>
    {/if}

    <div class="grid grid-cols-3 gap-6">

      <!-- ── Left: controls ── -->
      <div class="col-span-1 space-y-4">

        <!-- Story-only controls -->
        {#if lessonPartTab === 'story'}

        <!-- Generation controls (draft or new) -->
        {#if newChapterMode || normalizeStatus(selectedLesson?.status) === 'draft'}
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h2 class="font-semibold text-gray-800 mb-3">
              {selectedLesson ? `Chapter ${selectedLesson.chapter} — Draft` : `New Chapter ${nextChapterNum}`}
            </h2>

            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <label class="text-xs text-gray-500 w-28 shrink-0">Grammar level</label>
                <select bind:value={grammarLevel} disabled={workshopAction !== 'idle'}
                  class="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm disabled:opacity-50">
                  <option value="intro">intro</option>
                  <option value="basic">basic</option>
                  <option value="intermediate">intermediate</option>
                  <option value="advanced">advanced</option>
                </select>
              </div>
              <div class="flex items-center gap-3">
                <label class="text-xs text-gray-500 w-28 shrink-0">Sentence count</label>
                <input type="number" bind:value={sentenceCount} min="4" max="20"
                  disabled={workshopAction !== 'idle'}
                  class="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm disabled:opacity-50" />
              </div>
            </div>

            <div class="mt-3">
              <label class="block text-xs text-gray-500 mb-1">
                Director's note <span class="text-gray-400">(optional)</span>
              </label>
              <textarea bind:value={directorsNote} rows="3"
                disabled={workshopAction !== 'idle'}
                placeholder="e.g. Introduce Φοίβη and Παλλάς below the Acropolis. Use θεός and βασιλεύς."
                class="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none disabled:opacity-50"
              ></textarea>
            </div>

            {#if workshopAction === 'generating'}
              <div class="mt-4 flex items-center gap-2 text-sm text-gray-500">
                <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                Generating...
              </div>
            {:else}
              <button on:click={generateChapter}
                class="mt-4 w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                {selectedLesson ? 'Regenerate Draft' : 'Generate Chapter'}
              </button>
            {/if}
          </div>

          <!-- Refine (only when a draft exists) -->
          {#if selectedLesson?.status === 'draft'}
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              <h2 class="font-semibold text-gray-800 mb-3">Refine</h2>
              {#if chatHistory.length}
                <div class="space-y-2 mb-3 max-h-40 overflow-y-auto">
                  {#each chatHistory as msg}
                    <div class="text-xs {msg.role === 'user' ? 'text-right' : 'text-left'}">
                      <span class="inline-block px-2 py-1 rounded
                        {msg.role === 'user' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-700'}">
                        {msg.text}
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}
              <textarea bind:value={refineFeedback} rows="3"
                disabled={workshopAction !== 'idle'}
                placeholder="e.g. Make the tone more tense. Add a third kid..."
                class="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none disabled:opacity-50"
              ></textarea>
              <button on:click={refineChapter}
                disabled={workshopAction !== 'idle' || !refineFeedback.trim()}
                class="mt-2 w-full px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                {workshopAction === 'generating' ? 'Refining...' : 'Send'}
              </button>
            </div>

            <!-- Vocab Scan -->
            <button on:click={scanVocab}
              disabled={workshopAction !== 'idle' || scanLoading || !editedSentences.length}
              class="w-full px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {scanLoading ? 'Scanning...' : 'Vocab Scan'}
            </button>

            <!-- Align -->
            <button on:click={alignChapter}
              disabled={workshopAction !== 'idle'}
              class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
              {workshopAction === 'aligning' ? 'Annotating & Aligning...' : 'Annotate & Align →'}
            </button>
          {/if}

        <!-- Aligned controls -->
        {:else if normalizeStatus(selectedLesson?.status) === 'aligned'}
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h2 class="font-semibold text-gray-800 mb-1">Chapter {selectedLesson.chapter} — Aligned</h2>
            <p class="text-xs text-gray-400 mb-4">Edit translations and alignment below, then accept.</p>

            {#if dirtyIndices.size > 0}
              <div class="flex items-center gap-2 text-xs text-amber-600 mb-3">
                <span class="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
                {dirtyIndices.size} sentence{dirtyIndices.size > 1 ? 's' : ''} unsaved
                {#if workshopAction === 'saving'}— saving...{/if}
              </div>
            {/if}

            {#if workshopAction === 'accepting'}
              <div class="flex items-center gap-2 text-sm text-gray-500 mb-3">
                <span class="inline-block w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></span>
                {audioProgress || 'Processing...'}
              </div>
            {:else}
              <button on:click={acceptAndGenerateAudio}
                disabled={workshopAction !== 'idle'}
                class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 mb-2">
                Accept &amp; Generate Audio
              </button>
            {/if}

            <button on:click={() => { selectedLesson = { ...selectedLesson, status: 'draft' }; }}
              disabled={workshopAction !== 'idle'}
              class="w-full px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              ← Back to Draft
            </button>
          </div>

        <!-- Accepted controls -->
        {:else if normalizeStatus(selectedLesson?.status) === 'accepted'}
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h2 class="font-semibold text-gray-800 mb-1">Chapter {selectedLesson.chapter} — Accepted</h2>
            <p class="text-xs text-gray-400 mb-4">{selectedLesson.title ?? ''}</p>
            <p class="text-xs text-gray-500 mb-4">
              {selectedLesson.sentences?.length ?? 0} sentences ·
              {selectedLesson.vocab_list?.length ?? 0} vocab items
            </p>
            <button on:click={reopenLesson}
              class="w-full px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors">
              Reopen for Editing
            </button>
          </div>
        {/if}

        {#if workshopError}
          <p class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-3">{workshopError}</p>
        {/if}

        <!-- Character references (story tab only) -->
        {#if selectedLessonId}
          <details class="bg-white rounded-xl border border-gray-200">
            <summary class="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700 select-none">
              Character References
            </summary>
            <div class="px-4 pb-4">
              <p class="text-xs text-gray-400 mb-3">Upload portraits for visual consistency across image generations.</p>
              <div class="grid grid-cols-2 gap-2">
                {#each [1,2,3,4] as slot}
                  {@const char = charImages[slot]}
                  <div class="flex flex-col gap-1">
                    <div class="aspect-square rounded border-2 border-dashed border-gray-200 overflow-hidden relative bg-gray-50 flex items-center justify-center group">
                      {#if char?.url}
                        <img src={char.url} alt="Character {slot}" class="w-full h-full object-cover" />
                        <button on:click={() => removeCharImage(slot)}
                          class="absolute top-1 right-1 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                      {:else if charImageUploading[slot]}
                        <span class="text-xs text-gray-400">Uploading…</span>
                      {:else}
                        <label class="cursor-pointer flex flex-col items-center gap-1 p-2 w-full h-full justify-center">
                          <span class="text-2xl text-gray-300">+</span>
                          <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only"
                            on:change={e => { if (e.target.files[0]) uploadCharImage(slot, e.target.files[0]); e.target.value = ''; }} />
                        </label>
                      {/if}
                    </div>
                    <input value={char?.name ?? ''} placeholder="Name"
                      on:blur={e => { if (e.target.value !== (char?.name ?? '')) updateCharName(slot, e.target.value); }}
                      class="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-indigo-400 text-gray-700 placeholder-gray-300" />
                  </div>
                {/each}
              </div>
            </div>
          </details>
        {/if}

        {/if}<!-- end story-only controls -->

        <!-- Story 2.0 controls -->
        {#if lessonPartTab === 'story2'}

          {#if normalizeStatus(selectedLesson?.status) === 'draft'}
            <!-- Draft actions -->
            <button on:click={s2ScanVocab}
              disabled={workshopAction !== 'idle' || scanLoading || !editedSentences.length}
              class="w-full px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {scanLoading ? 'Scanning…' : 'Vocab Scan'}
            </button>
            <button on:click={alignChapter}
              disabled={workshopAction !== 'idle'}
              class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
              {workshopAction === 'aligning' ? 'Annotating & Aligning…' : 'Annotate & Align →'}
            </button>

          {:else if normalizeStatus(selectedLesson?.status) === 'aligned'}
            <!-- Aligned actions -->
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <h2 class="font-semibold text-gray-800 mb-1 text-sm">Chapter {selectedLesson.chapter} — Aligned</h2>
              <p class="text-xs text-gray-400 mb-3">Review alignment, then accept.</p>
              {#if dirtyIndices.size > 0}
                <div class="flex items-center gap-2 text-xs text-amber-600 mb-3">
                  <span class="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
                  {dirtyIndices.size} unsaved
                  {#if workshopAction === 'saving'}— saving…{/if}
                </div>
              {/if}
              {#if workshopAction === 'accepting'}
                <div class="flex items-center gap-2 text-sm text-gray-500 mb-3">
                  <span class="inline-block w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></span>
                  {audioProgress || 'Processing…'}
                </div>
              {:else}
                <button on:click={acceptAndGenerateAudio}
                  disabled={workshopAction !== 'idle'}
                  class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 mb-2">
                  Accept &amp; Generate Audio
                </button>
              {/if}
              <button on:click={() => { selectedLesson = { ...selectedLesson, status: 'draft' }; }}
                disabled={workshopAction !== 'idle'}
                class="w-full px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                ← Back to Draft
              </button>
            </div>

          {:else if normalizeStatus(selectedLesson?.status) === 'accepted'}
            <!-- Accepted actions -->
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <h2 class="font-semibold text-gray-800 mb-1 text-sm">Chapter {selectedLesson.chapter} — Accepted</h2>
              <p class="text-xs text-gray-400 mb-3">{selectedLesson.title ?? ''}</p>
              <p class="text-xs text-gray-500 mb-3">
                {selectedLesson.sentences?.length ?? 0} sentences ·
                {selectedLesson.vocab_list?.length ?? 0} vocab items
              </p>
              <button on:click={s2ScanVocab}
                disabled={scanLoading || !editedSentences.length}
                class="w-full px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 mb-2">
                {scanLoading ? 'Scanning…' : 'Vocab Scan'}
              </button>
              <button on:click={reopenLesson}
                class="w-full px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors">
                Reopen for Editing
              </button>
            </div>
          {/if}

          {#if workshopError}
            <p class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-3">{workshopError}</p>
          {/if}

        {/if}<!-- end story2 controls -->

        <!-- Standards picker — chapter level (hidden on Greek tab and intro mode) -->
        {#if selectedLessonId && lessonPartTab !== 'story2' && !introMode}
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="flex items-center justify-between mb-2">
              <h2 class="font-semibold text-gray-800 text-sm">Standards</h2>
              {#if stdPickerSaving}
                <span class="text-xs text-gray-400">Saving…</span>
              {:else}
                <span class="text-xs text-indigo-600">{lessonStandardIds.size} selected</span>
              {/if}
            </div>

            <!-- Domain filter -->
            <div class="flex flex-wrap gap-1 mb-3">
              {#each stdDomains as d}
                <button
                  on:click={() => stdPickerDomain = d}
                  class="px-2 py-0.5 rounded text-xs font-medium transition-colors
                    {stdPickerDomain === d ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'}"
                >{d}</button>
              {/each}
            </div>

            <!-- Standards list -->
            <div class="space-y-1 max-h-72 overflow-y-auto pr-1">
              {#each filteredStandards as std (std.id)}
                {@const checked = lessonStandardIds.has(std.id)}
                {@const coverage = lessonStandardCoverage[std.id] ?? 0}
                {@const lvl = LEVEL_COLORS[std.introduced_in]}
                <label class="flex items-start gap-2 cursor-pointer select-none group pl-1.5 {lvl?.border ?? ''}">
                  <input type="checkbox" checked={checked}
                    on:change={() => toggleLessonStandard(std.id)}
                    class="mt-0.5 shrink-0 accent-indigo-600"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs font-medium text-gray-700 truncate">{std.shortName ?? std.id}</span>
                      {#if std.introduced_in && lvl}
                        <span class="shrink-0 px-1 py-0.5 rounded {lvl.badge} text-xs leading-none">{std.introduced_in.slice(0,4)}</span>
                      {/if}
                      {#if coverage > 0}
                        <span class="shrink-0 px-1 py-0.5 rounded bg-green-100 text-green-700 text-xs leading-none">{coverage}</span>
                      {/if}
                    </div>
                    {#if std.description}
                      <span class="text-xs text-gray-400 leading-snug line-clamp-2">{std.description}</span>
                    {/if}
                  </div>
                </label>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Delete chapter -->
        {#if selectedLessonId && !introMode}
          <button
            on:click={async () => {
              if (!confirm(`Delete Chapter ${selectedLesson?.chapter}? This cannot be undone.`)) return;
              const wasAccepted = normalizeStatus(selectedLesson?.status) === 'accepted';
              await deleteDoc(doc(db, 'lessons', selectedLessonId));
              selectedLesson = null;
              selectedLessonId = null;
              newChapterMode = false;
              await loadAllLessons();
              if (wasAccepted) {
                const fn = httpsCallable(functions, 'recomputeStoryBible');
                await fn({ storyBibleId: STORY_BIBLE_ID });
                await loadStoryBible();
              }
            }}
            class="w-full px-4 py-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
          >
            Delete Chapter {selectedLesson?.chapter}
          </button>
        {/if}
      </div>

      <!-- ── Right: content ── -->
      <div class="col-span-2">

        <!-- Story tab (English narrative) -->
        {#if selectedLesson && lessonPartTab === 'overview'}
          <div class="space-y-4">

            <!-- Overview text (editable) -->
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              <h2 class="font-semibold text-gray-800 mb-1">Story Text</h2>
              <p class="text-xs text-gray-400 mb-3">Editable overview text. Supports <code class="bg-gray-100 px-1 rounded">&lt;narrator&gt;</code> <code class="bg-gray-100 px-1 rounded">&lt;phoebe&gt;</code> <code class="bg-gray-100 px-1 rounded">&lt;dolios&gt;</code> <code class="bg-gray-100 px-1 rounded">&lt;kleio&gt;</code> <code class="bg-gray-100 px-1 rounded">&lt;pallas&gt;</code> voice tags — tags are stripped in the student view.</p>
              <textarea
                bind:value={overviewText}
                rows="20"
                class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-indigo-400 mb-2"
              ></textarea>
              <button on:click={saveOverview} disabled={overviewSaving}
                class="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                {overviewSaving ? 'Saving…' : 'Save'}
              </button>
            </div>


            <!-- Character Voices -->
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              <h2 class="font-semibold text-gray-800 mb-1">Character Voices</h2>
              <p class="text-xs text-gray-400 mb-3">ElevenLabs voice IDs — saved to <code class="bg-gray-100 px-1 rounded">courses/grade7-greek</code> and read by Cloud Functions at audio generation time.</p>
              <div class="space-y-2 mb-3">
                {#each VOICE_CHARS as char}
                  <div class="flex items-center gap-3">
                    <span class="w-40 text-sm font-medium text-gray-700 shrink-0">{VOICE_LABELS[char]}</span>
                    <input
                      type="text"
                      bind:value={voiceIds[char]}
                      placeholder="ElevenLabs voice ID"
                      class="flex-1 font-mono text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                {/each}
              </div>
              <div class="flex items-center gap-3">
                <button
                  on:click={saveVoices}
                  disabled={voicesSaving}
                  class="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >{voicesSaving ? 'Saving…' : 'Save Voices'}</button>
                {#if voicesSaved}
                  <span class="text-sm text-green-600 font-medium">Saved</span>
                {/if}
              </div>
            </div>

            <!-- Audio -->
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              <h2 class="font-semibold text-gray-800 mb-1">Story Audio</h2>
              <div class="mt-1 flex items-center gap-3">
                {#if overviewAudioStatus === 'generating'}
                  <span class="flex items-center gap-2 text-sm text-gray-500">
                    <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                    Generating audio…
                  </span>
                {:else}
                  <button on:click={generateOverviewAudio}
                    disabled={!overviewText.trim() || overviewAudioStatus === 'generating'}
                    class="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {overviewAudioStatus === 'done' ? '↺ Regenerate Audio' : '▶ Generate Audio'}
                  </button>
                  {#if overviewAudioStatus === 'done'}
                    <span class="text-xs text-green-600">Audio ready</span>
                  {:else if overviewAudioStatus === 'error'}
                    <span class="text-xs text-red-500">Audio failed</span>
                  {/if}
                {/if}
              </div>
              {#if selectedLesson?.overview?.audioUrl}
                <audio controls src={selectedLesson.overview.audioUrl} class="mt-3 w-full h-8" />
              {/if}
            </div>

            <!-- Segments -->
            {#if mergedSegments.length}
              {@const speakers = [...new Set(mergedSegments.map(s => s.speaker))]}
              {@const missingCount = mergedSegments.filter(s => !s.hasAudio).length}
              <div class="bg-white rounded-xl border border-gray-200 p-5">
                <div class="flex items-center justify-between mb-3">
                  <h2 class="font-semibold text-gray-800">Audio Segments</h2>
                  <span class="text-xs text-gray-400">{mergedSegments.length} segments{missingCount ? ` · ${missingCount} missing` : ''}</span>
                </div>

                <!-- Per-speaker regenerate buttons -->
                <div class="flex flex-wrap gap-2 mb-4">
                  {#each speakers as speaker}
                    {@const status = speakerRegenStatus[speaker] ?? 'idle'}
                    <button
                      on:click={() => regenerateSpeaker(speaker)}
                      disabled={status === 'generating'}
                      class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50
                        {status === 'done' ? 'border-green-300 bg-green-50 text-green-700' :
                         status === 'error' ? 'border-red-300 bg-red-50 text-red-600' :
                         'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
                    >
                      {#if status === 'generating'}
                        <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                      {/if}
                      ↺ {speaker}
                    </button>
                  {/each}
                </div>

                <!-- Segment list -->
                <div class="space-y-1.5 max-h-96 overflow-y-auto">
                  {#each mergedSegments as seg, i}
                    <div class="flex items-center gap-3 p-2 rounded-lg transition-colors
                      {seg.hasAudio ? 'bg-gray-50 hover:bg-gray-100' : 'bg-amber-50 hover:bg-amber-100'}">
                      <span class="shrink-0 px-2 py-0.5 rounded text-xs font-medium
                        {seg.speaker === 'narrator' ? 'bg-gray-200 text-gray-600' :
                         seg.speaker === 'phoebe'   ? 'bg-pink-100 text-pink-700' :
                         seg.speaker === 'dolios'   ? 'bg-blue-100 text-blue-700' :
                         seg.speaker === 'kleio'    ? 'bg-purple-100 text-purple-700' :
                         seg.speaker === 'pallas'   ? 'bg-amber-100 text-amber-700' :
                                                      'bg-gray-100 text-gray-600'}">
                        {seg.speaker}
                      </span>
                      <span class="text-xs flex-1 truncate {seg.hasAudio ? 'text-gray-500' : 'text-amber-700'}">{seg.text.replace(/\[[^\]]*\]/g, '').trim().slice(0, 80)}{seg.text.replace(/\[[^\]]*\]/g, '').trim().length > 80 ? '…' : ''}</span>
                      {#if seg.audioUrl}
                        <audio controls src={seg.audioUrl} class="h-7 shrink-0" style="width:160px" />
                      {:else}
                        <span class="text-xs text-amber-400 italic shrink-0">no audio</span>
                      {/if}
                      <button
                        on:click={() => regenerateSegment(i)}
                        disabled={segmentRegenStatus[i] === 'generating'}
                        title="Regenerate this segment"
                        class="shrink-0 w-7 h-7 flex items-center justify-center rounded border text-xs transition-colors disabled:opacity-50
                          {segmentRegenStatus[i] === 'done'  ? 'border-green-300 text-green-600 bg-green-50' :
                           segmentRegenStatus[i] === 'error' ? 'border-red-300 text-red-500 bg-red-50' :
                           segmentRegenStatus[i] === 'generating' ? 'border-gray-200 text-gray-300' :
                           'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-700 bg-white'}"
                      >
                        {#if segmentRegenStatus[i] === 'generating'}
                          <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                        {:else}
                          ↺
                        {/if}
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Avatar Video (hidden — re-enable when ready to use) -->
            <!--
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              Avatar video generation UI goes here
            </div>
            -->

            <!-- Image -->
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              <h2 class="font-semibold text-gray-800 mb-1">Overview Image</h2>
              <p class="text-xs text-gray-400 mb-3">Illustration shown with the overview text.</p>

              <!-- Upload photo -->
              <div class="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <label class="flex items-center gap-2 cursor-pointer">
                  {#if overviewImageUploadStatus === 'uploading'}
                    <span class="flex items-center gap-2 text-sm text-gray-500">
                      <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                      Uploading…
                    </span>
                  {:else}
                    <span class="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm text-gray-700 font-medium transition-colors">
                      Upload Photo
                    </span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only"
                      on:change={e => { if (e.target.files[0]) { uploadOverviewImage(e.target.files[0]); e.target.value = ''; } }} />
                  {/if}
                </label>
                {#if overviewImageUploadStatus === 'done'}
                  <span class="text-xs text-green-600">Uploaded ✓</span>
                {:else if overviewImageUploadStatus === 'error'}
                  <span class="text-xs text-red-500">Upload failed</span>
                {:else}
                  <span class="text-xs text-gray-400">or generate via AI below</span>
                {/if}
              </div>

              <!-- AI generation -->
              <textarea bind:value={overviewImagePrompt} rows="4"
                placeholder="Describe the scene: setting, mood, art style…"
                class="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400 mb-3"
              ></textarea>
              <div class="flex gap-2 mb-3">
                {#if overviewImageGenStatus === 'generating'}
                  <span class="flex items-center gap-2 text-sm text-gray-500">
                    <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                    Generating…
                  </span>
                {:else}
                  <button on:click={generateOverviewImage} disabled={!overviewImagePrompt.trim()}
                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    Generate Image
                  </button>
                {/if}
                {#if overviewGeneratedImageB64}
                  <button on:click={saveOverviewImage} disabled={overviewImageSaveStatus === 'saving'}
                    class="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50
                      {overviewImageSaveStatus === 'saved' ? 'bg-green-100 text-green-700 border border-green-200' : 'border border-gray-300 hover:bg-gray-50 text-gray-700'}">
                    {overviewImageSaveStatus === 'saving' ? 'Saving…' : overviewImageSaveStatus === 'saved' ? 'Saved ✓' : 'Save to Lesson'}
                  </button>
                {/if}
              </div>
              {#if overviewImageError}
                <p class="text-xs text-red-500 mb-3">{overviewImageError}</p>
              {/if}
              {#if overviewGeneratedImageB64}
                <img src="data:image/png;base64,{overviewGeneratedImageB64}" alt="Overview illustration"
                  class="w-full rounded-lg border border-gray-200" />
              {:else if selectedLesson?.overview?.imageUrl}
                <img src={selectedLesson.overview.imageUrl} alt="Saved overview illustration"
                  class="w-full rounded-lg border border-gray-200" />
              {/if}

              <!-- Caption -->
              {#if selectedLesson?.overview?.imageUrl || overviewGeneratedImageB64}
                <div class="mt-3 flex gap-2">
                  <input
                    type="text"
                    bind:value={overviewImageCaption}
                    placeholder="Caption (optional)"
                    class="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
                  />
                  <button on:click={saveOverviewImageCaption} disabled={overviewImageCaptionSaving}
                    class="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {overviewImageCaptionSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              {/if}
            </div>

          </div>

        <!-- Grammar tab -->
        {:else if selectedLesson && lessonPartTab === 'grammar'}
          <div class="space-y-4">

            <!-- Grammar standards covered -->
            {#if selectedLesson?.grammar?.standardIds?.length}
              <div class="bg-white rounded-xl border border-gray-200 p-5">
                <h2 class="font-semibold text-gray-800 mb-2">Standards</h2>
                <div class="flex flex-wrap gap-2">
                  {#each selectedLesson.grammar.standardIds as sid}
                    <span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded border border-indigo-200 font-mono">{sid}</span>
                  {/each}
                </div>
                <p class="text-xs text-gray-400 mt-2">Generate lesson text: <code class="bg-gray-100 px-1 rounded">node scripts/gen-greek-grammar.mjs --chapter {selectedLesson.chapter_id}</code></p>
              </div>
            {/if}

            <!-- Grammar text + audio -->
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              <h2 class="font-semibold text-gray-800 mb-1">Grammar Lesson</h2>
              <p class="text-xs text-gray-400 mb-3">Voice-ready English text read aloud on the Grammar tab. Use [short pause] markers for pacing.</p>
              <textarea bind:value={grammarText} rows="12"
                placeholder="Grammar lesson text with [short pause] markers…"
                class="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-y focus:outline-none focus:border-indigo-400 font-mono leading-relaxed"
              ></textarea>
              <div class="mt-3 flex items-center gap-3">
                <button on:click={saveGrammarText} disabled={grammarTextSaving}
                  class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {grammarTextSaving ? 'Saving…' : 'Save'}
                </button>
                {#if grammarAudioStatus === 'generating'}
                  <span class="flex items-center gap-2 text-sm text-gray-500">
                    <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                    Generating audio…
                  </span>
                {:else}
                  <button on:click={generateGrammarAudio} disabled={!grammarText.trim()}
                    class="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {grammarAudioStatus === 'done' ? '↺ Regenerate Audio' : '▶ Generate Audio'}
                  </button>
                  {#if grammarAudioStatus === 'done'}
                    <span class="text-xs text-green-600">Audio ready</span>
                  {:else if grammarAudioStatus === 'error'}
                    <span class="text-xs text-red-500">Audio failed</span>
                  {/if}
                {/if}
              </div>
              {#if selectedLesson?.grammar?.audioUrl}
                <audio controls src={selectedLesson.grammar.audioUrl} class="mt-3 w-full h-8" />
              {/if}
            </div>

          </div>

        <!-- Flashcards tab -->
        {:else if selectedLesson && lessonPartTab === 'flashcards'}
          {@const grammarStdIds = (selectedLesson?.standardIds ?? []).filter(sid => sid.startsWith('lang.'))}
          {@const flashSets = grammarStdIds.flatMap(sid => data.grammarFlashcards?.[sid]?.sets ?? [])}
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            {#if flashSets.length}
              <GrammarFlashcardExercise sets={flashSets} />
            {:else}
              <p class="text-sm text-gray-400 italic">No flashcard data for this lesson's grammar standards yet.</p>
              {#if grammarStdIds.length}
                <div class="mt-2 flex flex-wrap gap-1">
                  {#each grammarStdIds as sid}
                    <span class="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded font-mono">{sid}</span>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>

        <!-- Map tab -->
        {:else if selectedLesson && lessonPartTab === 'map'}
          <div class="space-y-4">

            <!-- Description + audio -->
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              <h2 class="font-semibold text-gray-800 mb-1">Map Description</h2>
              <p class="text-xs text-gray-400 mb-3">English text read aloud while the map is shown.</p>
              <textarea bind:value={mapDescription} rows="4"
                placeholder="Describe the geography relevant to this chapter…"
                class="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400"
              ></textarea>
              <div class="mt-3 flex items-center gap-3">
                <button on:click={saveMapDescription} disabled={mapDescSaving}
                  class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {mapDescSaving ? 'Saving…' : 'Save'}
                </button>
                {#if mapAudioStatus === 'generating'}
                  <span class="flex items-center gap-2 text-sm text-gray-500">
                    <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                    Generating audio…
                  </span>
                {:else}
                  <button on:click={generateMapAudio} disabled={!mapDescription.trim()}
                    class="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {mapAudioStatus === 'done' ? '↺ Regenerate Audio' : '▶ Generate Audio'}
                  </button>
                  {#if mapAudioStatus === 'done'}
                    <span class="text-xs text-green-600">Audio ready</span>
                  {:else if mapAudioStatus === 'error'}
                    <span class="text-xs text-red-500">Audio failed</span>
                  {/if}
                {/if}
              </div>
              {#if selectedLesson?.map?.audioUrl}
                <audio controls src={selectedLesson.map.audioUrl} class="mt-3 w-full h-8" />
              {/if}
            </div>

            <!-- Map -->
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              <div class="flex items-start justify-between mb-4">
                <div>
                  <h2 class="font-semibold text-gray-800 mb-1">Mediterranean Map</h2>
                  <p class="text-xs text-gray-400">Highlight places and select a route, then save as image for students.</p>
                </div>
                <div class="flex items-center gap-2 shrink-0 ml-4">
                  {#if mapImageSaveStatus === 'saving'}
                    <span class="flex items-center gap-1.5 text-sm text-gray-500">
                      <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                      Saving…
                    </span>
                  {:else}
                    <button on:click={saveMapImage}
                      class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                      {mapImageSaveStatus === 'saved' ? '✓ Saved' : 'Save Map Image'}
                    </button>
                    {#if mapImageSaveStatus === 'error'}
                      <span class="text-xs text-red-500">Save failed</span>
                    {/if}
                  {/if}
                  {#if selectedLesson?.map?.imageUrl}
                    <a href={selectedLesson.map.imageUrl} target="_blank"
                      class="text-xs text-indigo-600 hover:underline">Preview</a>
                  {/if}
                </div>
              </div>
              <MediterraneanMap
                bind:this={mapComponent}
                bind:highlighted={mapHighlighted}
                bind:activeRouteId={mapActiveRouteId}
              />
            </div>

          </div>

        <!-- Story tab (old builder — generate/refine workflow) -->
        {:else if lessonPartTab === 'story'}

        <!-- Draft preview -->
        {#if newChapterMode && !selectedLesson}
          <div class="flex items-center justify-center h-48 bg-white rounded-xl border border-gray-200 text-gray-300 text-sm">
            Generate a chapter to see the preview here.
          </div>

        {:else if selectedLesson?.status === 'draft' || (newChapterMode && selectedLesson)}
          <div class="flex gap-4 items-start">

            <!-- Sentence editor -->
            <div class="flex-1 bg-white rounded-xl border border-gray-200 p-5 min-w-0">
              <div class="mb-4 pb-4 border-b border-gray-100 flex items-center gap-3">
                <span class="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Chapter {selectedLesson.chapter}</span>
                {#if selectedLesson.title}
                  <span class="text-gray-400 text-xs">·</span>
                  <span class="text-sm font-medium text-gray-700">{selectedLesson.title}</span>
                {/if}
              </div>

              {#if editedSentences.length}
                <div class="space-y-3 mb-4">
                  {#each editedSentences as sentence, i}
                    {@const isDirty = dirtyIndices.has(i)}
                    {@const suggestion = greekSuggestions[i]}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                      class="rounded-lg transition-opacity {isDirty ? 'bg-amber-50 border border-amber-200 p-2 -mx-2' : ''} {dragIndex === i ? 'opacity-40' : ''} {dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}"
                      draggable="true"
                      on:dragstart={e => handleDragStart(e, i)}
                      on:dragover={e => handleDragOver(e, i)}
                      on:drop={e => handleDrop(e, i)}
                      on:dragend={handleDragEnd}
                    >
                      <div class="flex gap-3 group">
                        <div class="flex items-start gap-1 shrink-0 mt-2">
                          <span class="text-gray-200 cursor-grab active:cursor-grabbing select-none text-sm leading-none" title="Drag to reorder">⠿</span>
                          <span class="text-xs text-gray-300 font-mono w-4 text-right">{i + 1}</span>
                        </div>
                        <div class="flex-1 space-y-1">
                          <textarea
                            value={sentence.greek ?? ''}
                            on:input={e => {
                              const greek = e.target.value;
                              editedSentences[i] = { ...editedSentences[i], greek, words: retokenize(greek) };
                              markDirty(i);
                            }}
                            rows="2"
                            placeholder="Greek text..."
                            class="w-full text-gray-800 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400 resize-none bg-white"
                          ></textarea>
                          <div class="flex gap-1 items-center">
                            <input
                              value={sentence.english ?? ''}
                              on:input={e => { editedSentences[i] = { ...editedSentences[i], english: e.target.value }; markDirty(i); }}
                              placeholder="English translation..."
                              class="flex-1 text-sm text-gray-500 italic border border-dashed border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400 bg-transparent"
                            />
                            <button
                              on:click={() => translateSentenceToGreek(i)}
                              disabled={!sentence.english?.trim() || suggestion?.loading}
                              title="Get Greek translation suggestion"
                              class="shrink-0 px-2 py-1 text-xs text-indigo-500 border border-indigo-200 rounded hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-default transition-colors"
                            >{suggestion?.loading ? '…' : '→ Gk'}</button>
                          </div>
                        </div>
                        <button
                          on:click={() => {
                            editedSentences = editedSentences.filter((_, j) => j !== i);
                            dirtyIndices = new Set(editedSentences.map((_, j) => j));
                            vocabScanList = null;
                            const { [i]: _, ...rest } = greekSuggestions;
                            greekSuggestions = rest;
                            clearTimeout(saveTimer);
                            saveTimer = setTimeout(saveEdits, 1500);
                          }}
                          class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-2 text-red-400 hover:text-red-600 text-sm leading-none"
                          title="Remove sentence"
                        >✕</button>
                      </div>
                      <!-- Greek suggestion -->
                      {#if suggestion?.greek}
                        <div class="ml-8 mt-1.5 flex items-start gap-2 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
                          <span class="flex-1 text-sm text-indigo-800">{suggestion.greek}</span>
                          <button
                            on:click={() => acceptGreekSuggestion(i)}
                            class="shrink-0 text-xs px-2 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                          >Use</button>
                          <button
                            on:click={() => { const { [i]: _, ...rest } = greekSuggestions; greekSuggestions = rest; }}
                            class="shrink-0 text-xs text-indigo-400 hover:text-indigo-600"
                          >✕</button>
                        </div>
                      {/if}
                      {#if suggestion?.error}
                        <p class="ml-8 mt-1 text-xs text-red-500">{suggestion.error}</p>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
              <button
                on:click={addSentence}
                disabled={workshopAction !== 'idle'}
                class="text-xs text-indigo-500 hover:text-indigo-700 border border-dashed border-indigo-300 rounded px-3 py-1.5 w-full hover:bg-indigo-50 transition-colors disabled:opacity-40"
              >+ Add Sentence</button>
            </div>

            <!-- Vocab scan panel -->
            {#if vocabScanList !== null}
              <div class="w-52 shrink-0 bg-white rounded-xl border border-gray-200 p-4">
                <div class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">
                  Vocab Scan
                </div>
                <VocabPanel vocabList={vocabScanList} headless />
                {#if vocabUnrecognized.length}
                  <div class="mt-3 pt-3 border-t border-gray-100">
                    <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Unrecognized</div>
                    <div class="flex flex-wrap gap-1 mb-2">
                      {#each vocabUnrecognized as word}
                        <span class="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">{word}</span>
                      {/each}
                    </div>
                    {#if glossError}
                      <p class="text-xs text-red-500 mb-1">{glossError}</p>
                    {/if}
                    <button
                      on:click={generateGlosses}
                      disabled={glossLoading}
                      class="w-full text-xs px-2 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded transition-colors disabled:opacity-50"
                    >
                      {glossLoading ? 'Glossing…' : `Gloss ${vocabUnrecognized.length} word${vocabUnrecognized.length > 1 ? 's' : ''}`}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}

          </div>

        <!-- Alignment editor -->
        {:else if normalizeStatus(selectedLesson?.status) === 'aligned' || normalizeStatus(selectedLesson?.status) === 'accepted'}
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <div class="mb-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Chapter {selectedLesson.chapter}</span>
                {#if selectedLesson.title}
                  <span class="text-gray-400 text-xs">·</span>
                  <span class="text-sm font-medium text-gray-700">{selectedLesson.title}</span>
                {/if}
              </div>
              <span class="text-xs text-gray-400">Click a sentence to edit</span>
            </div>

            <div class="space-y-4">
              {#each editedSentences as sent, i}
                {@const isDirty = dirtyIndices.has(i)}
                {@const isExpanded = expandedSentence === i}
                {@const audioOk = sent.audioGenerated === true || !!sent.greek_audio_url}

                <div class="rounded-lg border {isDirty ? 'border-amber-300 bg-amber-50' : 'border-gray-100'} overflow-hidden">
                  <!-- Sentence header -->
                  <div class="p-3">
                    <div class="flex items-start gap-3 mb-2">
                      <span class="text-xs text-gray-300 font-mono mt-1 w-5 shrink-0 text-right">{i + 1}</span>
                      <div class="flex-1">
                        {#if isExpanded}
                          <textarea
                            value={sent.greek ?? ''}
                            on:input={e => {
                              editedSentences[i] = { ...editedSentences[i], greek: e.target.value, words: retokenize(e.target.value) };
                              markDirty(i);
                            }}
                            rows="2"
                            class="w-full text-gray-800 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400 resize-none mb-1"
                          ></textarea>
                        {:else}
                          <p class="text-gray-800 text-sm leading-relaxed mb-1">{sent.greek}</p>
                        {/if}
                        <input
                          value={sent.english}
                          on:input={e => { editedSentences[i] = { ...editedSentences[i], english: e.target.value }; markDirty(i); }}
                          class="w-full text-sm text-gray-600 italic border-0 border-b border-dashed border-gray-300 bg-transparent focus:outline-none focus:border-indigo-400 py-0.5 {isExpanded ? '' : 'pointer-events-none'}"
                          placeholder="English translation..."
                          readonly={!isExpanded && normalizeStatus(selectedLesson?.status) === 'accepted'}
                        />
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        {#if audioOk}
                          <span class="text-xs text-green-500" title="Audio generated">♪</span>
                        {:else}
                          <span class="text-xs text-gray-300" title="No audio yet">♪</span>
                        {/if}
                        {#if normalizeStatus(selectedLesson?.status) !== 'draft'}
                          <button
                            on:click={() => expandedSentence = isExpanded ? null : i}
                            class="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
                            {isExpanded ? 'Hide ▲' : 'Edit ▼'}
                          </button>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <!-- Word alignment table -->
                  {#if isExpanded}
                    {@const aStatus = sentenceAlignStatus[i] ?? 'idle'}
                    {@const vStatus = sentenceVoiceStatus[i] ?? 'idle'}
                    <div class="border-t border-gray-100 overflow-x-auto">
                      <table class="w-full text-xs">
                        <thead class="bg-gray-50 text-gray-400 uppercase tracking-wide">
                          <tr>
                            <th class="px-3 py-2 text-left">#</th>
                            <th class="px-3 py-2 text-left">Greek</th>
                            <th class="px-3 py-2 text-left">Morph</th>
                            <th class="px-3 py-2 text-left">Pre Eng</th>
                            <th class="px-3 py-2 text-left">English</th>
                            <th class="px-3 py-2 text-left w-16">Pos</th>
                            <th class="px-3 py-2 text-left">Post Eng</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-50">
                          {#each (sent.words ?? []) as word, wi}
                            <tr class="hover:bg-gray-50">
                              <td class="px-3 py-1.5 text-gray-300">{word.sentPos}</td>
                              <td class="px-3 py-1.5 font-medium text-gray-700">{word.text}</td>
                              <td class="px-3 py-1.5 text-gray-400 font-mono">{word.morph ?? '—'}</td>
                              <td class="px-3 py-1.5 text-gray-400">{word.preEng ?? ''}</td>
                              <td class="px-3 py-1.5 text-gray-300 italic">{word.english ?? '—'}</td>
                              <td class="px-3 py-1.5">
                                <input type="number"
                                  value={word.engSentPos ?? ''}
                                  on:input={e => {
                                    const v = e.target.value === '' ? null : parseInt(e.target.value);
                                    editedSentences[i] = { ...editedSentences[i],
                                      words: editedSentences[i].words.map((w, j) => j === wi ? { ...w, engSentPos: v } : w)
                                    };
                                    markDirty(i);
                                  }}
                                  class="w-12 border border-gray-200 rounded px-1 py-0.5 text-center text-gray-700 focus:outline-none focus:border-indigo-400"
                                />
                              </td>
                              <td class="px-3 py-1.5 text-gray-400">{word.postEng ?? ''}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                      <div class="px-3 py-2 border-t border-gray-100 flex items-center justify-between gap-2">
                        <div class="flex gap-2">
                          <button
                            on:click={() => alignSentence(i)}
                            disabled={aStatus === 'running'}
                            class="text-xs px-3 py-1 rounded border transition-colors disabled:opacity-50
                              {aStatus === 'done' ? 'border-blue-300 bg-blue-50 text-blue-700' :
                               aStatus === 'error' ? 'border-red-300 bg-red-50 text-red-600' :
                               'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'}">
                            {aStatus === 'running' ? '…aligning' : aStatus === 'done' ? '✓ Aligned' : 'Re-align ↺'}
                          </button>
                          <button
                            on:click={() => voiceSentence(i)}
                            disabled={vStatus === 'running'}
                            class="text-xs px-3 py-1 rounded border transition-colors disabled:opacity-50
                              {vStatus === 'done' ? 'border-green-300 bg-green-50 text-green-700' :
                               vStatus === 'error' ? 'border-red-300 bg-red-50 text-red-600' :
                               'border-green-200 bg-green-50 text-green-600 hover:bg-green-100'}">
                            {vStatus === 'running' ? '…voicing' : vStatus === 'done' ? '✓ Voiced' : 'Voice ↺'}
                          </button>
                        </div>
                        <button
                          on:click={async () => {
                            editedSentences[i] = recomputeAlignment(editedSentences[i]);
                            editedSentences[i] = { ...editedSentences[i], audioGenerated: false };
                            dirtyIndices = new Set([...dirtyIndices, i]);
                            vocabScanList = null;
                            clearTimeout(saveTimer);
                            saveTimer = null;
                            await saveEdits();
                          }}
                          class="text-xs px-3 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                          Recompute ↺
                        </button>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Story image (shown in story tab when lesson exists) -->
        {#if selectedLesson && lessonPartTab === 'story'}
          <div class="bg-white rounded-xl border border-gray-200 p-5 mt-4">
            <h2 class="font-semibold text-gray-800 mb-1">Chapter Image</h2>
            <p class="text-xs text-gray-400 mb-3">Illustration for this chapter's story.</p>
            <div class="grid grid-cols-2 gap-4">
              <!-- Controls -->
              <div class="space-y-2">
                <textarea bind:value={imageGenPrompt} rows="5"
                  placeholder="Describe the scene: characters, setting, action, mood, art style…"
                  class="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400"
                ></textarea>
                <p class="text-xs text-gray-400">{Object.values(charImages).filter(c => c?.url).length} of 4 character refs loaded</p>
                {#if imageGenStatus === 'generating'}
                  <div class="flex items-center gap-2 text-sm text-gray-500">
                    <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                    Generating…
                  </div>
                {:else}
                  <button on:click={generateChapterImage} disabled={!imageGenPrompt.trim()}
                    class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    Generate Image
                  </button>
                {/if}
                {#if imageGenError}
                  <p class="text-xs text-red-600">{imageGenError}</p>
                {/if}
              </div>
              <!-- Result -->
              <div class="flex flex-col gap-2">
                {#if generatedImageB64}
                  <img src="data:image/png;base64,{generatedImageB64}" alt="Chapter illustration"
                    class="w-full rounded-lg border border-gray-200" />
                  <div class="flex gap-2">
                    <a href="data:image/png;base64,{generatedImageB64}" download="chapter-image.png"
                      class="flex-1 text-center text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 rounded py-1.5 px-2 transition-colors">
                      Download
                    </a>
                    <button on:click={saveImageToLesson}
                      disabled={!imageGenChapterId || imageSaveStatus !== 'idle'}
                      class="flex-1 text-xs font-medium rounded py-1.5 px-2 transition-colors disabled:opacity-50
                        {imageSaveStatus === 'saved' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}">
                      {imageSaveStatus === 'saving' ? 'Saving…' : imageSaveStatus === 'saved' ? 'Saved ✓' : 'Save'}
                    </button>
                  </div>
                {:else}
                  <div class="flex-1 flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 min-h-32 text-gray-300 text-sm">
                    Generated image appears here
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- Story 2.0 -->
        {:else if lessonPartTab === 'story2'}{#if selectedLesson}
          <div class="flex gap-4 mt-2">

            <!-- LEFT: Sentence editor or alignment view -->
            <div class="flex-1 min-w-0 space-y-4">

              {#if normalizeStatus(selectedLesson?.status) === 'draft'}

                <!-- Paragraph box -->
                <div class="bg-white rounded-xl border border-gray-200 p-4">
                  <div class="flex items-center justify-between mb-2">
                    <h2 class="font-semibold text-gray-800 text-sm">Paragraph</h2>
                    {#if editedSentences.length > 0}
                      <span class="text-xs text-amber-500">Submitting will reset all sentences</span>
                    {/if}
                  </div>
                  <textarea
                    bind:value={s2ParagraphText}
                    rows="5"
                    placeholder="Write the full paragraph here. Sentences separated by periods or semicolons."
                    class="w-full text-sm text-gray-700 border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-indigo-400 resize-y"
                  ></textarea>
                  <button
                    on:click={parseParagraphIntoSentences}
                    disabled={!s2ParagraphText.trim()}
                    class="mt-2 w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
                  >Split into Sentences</button>
                </div>

                <!-- Vocab strip — chapter words; click to toggle for translation -->
                {#if s2SelectedVocab.size > 0}
                  <div class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="text-xs text-gray-400 font-medium">Chapter vocab — click to use for → Gk</span>
                      {#if s2TranslationVocab.size > 0}
                        <button on:click={() => s2TranslationVocab = new Set()}
                          class="text-xs text-indigo-400 hover:text-indigo-600">clear</button>
                      {/if}
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      {#each [...s2SelectedVocab].sort() as lemma}
                        {@const active = s2TranslationVocab.has(lemma)}
                        <span class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs font-medium border transition-colors cursor-pointer
                          {active
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}"
                          on:click={() => {
                            const next = new Set(s2TranslationVocab);
                            if (next.has(lemma)) next.delete(lemma); else next.add(lemma);
                            s2TranslationVocab = next;
                          }}
                          role="button" tabindex="0"
                          on:keydown={e => e.key === 'Enter' && (() => {
                            const next = new Set(s2TranslationVocab);
                            if (next.has(lemma)) next.delete(lemma); else next.add(lemma);
                            s2TranslationVocab = next;
                          })()}
                        >
                          {lemma}
                          <button on:click|stopPropagation={() => toggleLessonVocab(lemma)}
                            class="leading-none opacity-40 hover:opacity-100 ml-0.5
                              {active ? 'text-white' : 'text-gray-400'}"
                            title="Remove from chapter">&times;</button>
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}

                <!-- Sentence list -->
                <div class="bg-white rounded-xl border border-gray-200 p-5">
                  {#if editedSentences.length}
                    <div class="space-y-3 mb-4">
                      {#each editedSentences as sentence, i}
                        {@const isDirty = dirtyIndices.has(i)}
                        {@const suggestion = greekSuggestions[i]}
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div
                          class="rounded-lg transition-opacity {isDirty ? 'bg-amber-50 border border-amber-200 p-2 -mx-2' : ''} {dragIndex === i ? 'opacity-40' : ''} {dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}"
                          draggable="true"
                          on:dragstart={e => handleDragStart(e, i)}
                          on:dragover={e => handleDragOver(e, i)}
                          on:drop={e => handleDrop(e, i)}
                          on:dragend={handleDragEnd}
                        >
                          <div class="flex gap-3 group">
                            <div class="flex items-start gap-1 shrink-0 mt-2">
                              <span class="text-gray-200 cursor-grab active:cursor-grabbing select-none text-sm leading-none" title="Drag to reorder">⠿</span>
                              <span class="text-xs text-gray-300 font-mono w-4 text-right">{i + 1}</span>
                            </div>
                            <div class="flex-1 space-y-1">
                              <textarea
                                value={sentence.greek ?? ''}
                                on:input={e => {
                                  editedSentences[i] = { ...editedSentences[i], greek: e.target.value, words: retokenize(e.target.value) };
                                  markDirty(i);
                                }}
                                rows="2"
                                placeholder="Greek text..."
                                class="w-full text-gray-800 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400 resize-none bg-white"
                              ></textarea>
                              <div class="flex gap-1 items-center">
                                <input
                                  value={sentence.english ?? ''}
                                  on:input={e => { editedSentences[i] = { ...editedSentences[i], english: e.target.value }; markDirty(i); }}
                                  placeholder="English translation..."
                                  class="flex-1 text-sm text-gray-500 italic border border-dashed border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400 bg-transparent"
                                />
                                <button
                                  on:click={() => translateS2Sentence(i)}
                                  disabled={!sentence.english?.trim() || suggestion?.loading}
                                  title={s2TranslationVocab.size ? `Translate using: ${[...s2TranslationVocab].join(', ')}` : 'Get Greek translation'}
                                  class="shrink-0 px-2 py-1 text-xs border rounded transition-colors disabled:opacity-40 disabled:cursor-default
                                    {s2TranslationVocab.size
                                      ? 'text-indigo-700 border-indigo-400 bg-indigo-50 hover:bg-indigo-100'
                                      : 'text-indigo-500 border-indigo-200 hover:bg-indigo-50'}"
                                >{suggestion?.loading ? '…' : '→ Gk'}</button>
                              </div>
                            </div>
                            <button
                              on:click={() => {
                                editedSentences = editedSentences.filter((_, j) => j !== i);
                                dirtyIndices = new Set(editedSentences.map((_, j) => j));
                                vocabScanList = null;
                                const { [i]: _, ...rest } = greekSuggestions;
                                greekSuggestions = rest;
                                clearTimeout(saveTimer);
                                saveTimer = setTimeout(saveEdits, 1500);
                              }}
                              class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-2 text-red-400 hover:text-red-600 text-sm leading-none"
                              title="Remove sentence"
                            >✕</button>
                          </div>
                          <!-- Suggestion -->
                          {#if suggestion?.greek}
                            <div class="ml-8 mt-1.5 flex items-start gap-2 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
                              <span class="flex-1 text-sm text-indigo-800">{suggestion.greek}</span>
                              <button
                                on:click={() => acceptS2Suggestion(i)}
                                class="shrink-0 text-xs px-2 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                              >Use</button>
                              <button
                                on:click={() => { const { [i]: _, ...rest } = greekSuggestions; greekSuggestions = rest; }}
                                class="shrink-0 text-xs text-indigo-400 hover:text-indigo-600"
                              >✕</button>
                            </div>
                          {/if}
                          {#if suggestion?.error}
                            <p class="ml-8 mt-1 text-xs text-red-500">{suggestion.error}</p>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                  <button
                    on:click={addS2Sentence}
                    disabled={workshopAction !== 'idle'}
                    class="text-xs text-indigo-500 hover:text-indigo-700 border border-dashed border-indigo-300 rounded px-3 py-1.5 w-full hover:bg-indigo-50 transition-colors disabled:opacity-40"
                  >+ Add Sentence</button>
                </div>

                <!-- Vocab scan results -->
                {#if vocabScanList !== null}
                  <div class="bg-white rounded-xl border border-gray-200 p-4">
                    <div class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">Vocab Scan</div>
                    <VocabPanel vocabList={vocabScanList} headless />
                    {#if vocabUnrecognized.length}
                      <div class="mt-3 pt-3 border-t border-gray-100">
                        <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Unrecognized</div>
                        <div class="flex flex-wrap gap-1 mb-2">
                          {#each vocabUnrecognized as word}
                            <span class="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">{word}</span>
                          {/each}
                        </div>
                        {#if glossError}
                          <p class="text-xs text-red-500 mb-1">{glossError}</p>
                        {/if}
                        <button on:click={generateGlosses} disabled={glossLoading}
                          class="w-full text-xs px-2 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded transition-colors disabled:opacity-50">
                          {glossLoading ? 'Glossing…' : `Gloss ${vocabUnrecognized.length} word${vocabUnrecognized.length > 1 ? 's' : ''}`}
                        </button>
                      </div>
                    {/if}
                  </div>
                {/if}

              {:else if normalizeStatus(selectedLesson?.status) === 'aligned' || normalizeStatus(selectedLesson?.status) === 'accepted'}

                <!-- Alignment editor -->
                <div class="bg-white rounded-xl border border-gray-200 p-5">
                  <div class="mb-4 pb-3 border-b border-gray-100 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <span class="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Chapter {selectedLesson.chapter}</span>
                      {#if selectedLesson.title}
                        <span class="text-gray-400 text-xs">·</span>
                        <span class="text-sm font-medium text-gray-700">{selectedLesson.title}</span>
                      {/if}
                    </div>
                    <span class="text-xs text-gray-400">Click a sentence to edit</span>
                  </div>
                  <div class="space-y-4">
                    {#each editedSentences as sent, i}
                      {@const isDirty = dirtyIndices.has(i)}
                      {@const isExpanded = expandedSentence === i}
                      {@const audioOk = sent.audioGenerated === true || !!sent.greek_audio_url}
                      <div class="rounded-lg border {isDirty ? 'border-amber-300 bg-amber-50' : 'border-gray-100'} overflow-hidden">
                        <div class="p-3">
                          <div class="flex items-start gap-3 mb-2">
                            <span class="text-xs text-gray-300 font-mono mt-1 w-5 shrink-0 text-right">{i + 1}</span>
                            <div class="flex-1">
                              {#if isExpanded}
                                <textarea
                                  value={sent.greek ?? ''}
                                  on:input={e => {
                                    editedSentences[i] = { ...editedSentences[i], greek: e.target.value, words: retokenize(e.target.value) };
                                    markDirty(i);
                                  }}
                                  rows="2"
                                  class="w-full text-gray-800 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400 resize-none mb-1"
                                ></textarea>
                              {:else}
                                <p class="text-gray-800 text-sm leading-relaxed mb-1">{sent.greek}</p>
                              {/if}
                              <input
                                value={sent.english}
                                on:input={e => { editedSentences[i] = { ...editedSentences[i], english: e.target.value }; markDirty(i); }}
                                class="w-full text-sm text-gray-600 italic border-0 border-b border-dashed border-gray-300 bg-transparent focus:outline-none focus:border-indigo-400 py-0.5"
                                placeholder="English translation..."
                                readonly={!isExpanded && normalizeStatus(selectedLesson?.status) === 'accepted'}
                              />
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                              {#if audioOk}
                                <span class="text-xs text-green-500" title="Audio generated">♪</span>
                              {:else}
                                <span class="text-xs text-gray-300" title="No audio yet">♪</span>
                              {/if}
                              <button on:click={() => expandedSentence = isExpanded ? null : i}
                                class="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
                                {isExpanded ? 'Hide ▲' : 'Edit ▼'}
                              </button>
                            </div>
                          </div>
                        </div>
                        {#if isExpanded}
                          {@const aStatus = sentenceAlignStatus[i] ?? 'idle'}
                          {@const vStatus = sentenceVoiceStatus[i] ?? 'idle'}
                          <div class="border-t border-gray-100 overflow-x-auto">
                            <table class="w-full text-xs">
                              <thead class="bg-gray-50 text-gray-400 uppercase tracking-wide">
                                <tr>
                                  <th class="px-3 py-2 text-left">#</th>
                                  <th class="px-3 py-2 text-left">Greek</th>
                                  <th class="px-3 py-2 text-left">Morph</th>
                                  <th class="px-3 py-2 text-left">Pre Eng</th>
                                  <th class="px-3 py-2 text-left">English</th>
                                  <th class="px-3 py-2 text-left w-16">Pos</th>
                                  <th class="px-3 py-2 text-left">Post Eng</th>
                                </tr>
                              </thead>
                              <tbody class="divide-y divide-gray-50">
                                {#each (sent.words ?? []) as word, wi}
                                  <tr class="hover:bg-gray-50">
                                    <td class="px-3 py-1.5 text-gray-300">{word.sentPos}</td>
                                    <td class="px-3 py-1.5 font-medium text-gray-700">{word.text}</td>
                                    <td class="px-3 py-1.5 text-gray-400 font-mono">{word.morph ?? '—'}</td>
                                    <td class="px-3 py-1.5 text-gray-400">{word.preEng ?? ''}</td>
                                    <td class="px-3 py-1.5 text-gray-300 italic">{word.english ?? '—'}</td>
                                    <td class="px-3 py-1.5">
                                      <input type="number"
                                        value={word.engSentPos ?? ''}
                                        on:input={e => {
                                          const v = e.target.value === '' ? null : parseInt(e.target.value);
                                          editedSentences[i] = { ...editedSentences[i],
                                            words: editedSentences[i].words.map((w, j) => j === wi ? { ...w, engSentPos: v } : w)
                                          };
                                          markDirty(i);
                                        }}
                                        class="w-12 border border-gray-200 rounded px-1 py-0.5 text-center text-gray-700 focus:outline-none focus:border-indigo-400"
                                      />
                                    </td>
                                    <td class="px-3 py-1.5 text-gray-400">{word.postEng ?? ''}</td>
                                  </tr>
                                {/each}
                              </tbody>
                            </table>
                            <div class="px-3 py-2 border-t border-gray-100 flex items-center justify-between gap-2">
                              <div class="flex gap-2">
                                <button
                                  on:click={() => alignSentence(i)}
                                  disabled={aStatus === 'running'}
                                  class="text-xs px-3 py-1 rounded border transition-colors disabled:opacity-50
                                    {aStatus === 'done' ? 'border-blue-300 bg-blue-50 text-blue-700' :
                                     aStatus === 'error' ? 'border-red-300 bg-red-50 text-red-600' :
                                     'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'}">
                                  {aStatus === 'running' ? '…aligning' : aStatus === 'done' ? '✓ Aligned' : 'Re-align ↺'}
                                </button>
                                <button
                                  on:click={() => voiceSentence(i)}
                                  disabled={vStatus === 'running'}
                                  class="text-xs px-3 py-1 rounded border transition-colors disabled:opacity-50
                                    {vStatus === 'done' ? 'border-green-300 bg-green-50 text-green-700' :
                                     vStatus === 'error' ? 'border-red-300 bg-red-50 text-red-600' :
                                     'border-green-200 bg-green-50 text-green-600 hover:bg-green-100'}">
                                  {vStatus === 'running' ? '…voicing' : vStatus === 'done' ? '✓ Voiced' : 'Voice ↺'}
                                </button>
                              </div>
                              <button
                                on:click={async () => {
                                  editedSentences[i] = recomputeAlignment(editedSentences[i]);
                                  editedSentences[i] = { ...editedSentences[i], audioGenerated: false };
                                  dirtyIndices = new Set([...dirtyIndices, i]);
                                  vocabScanList = null;
                                  clearTimeout(saveTimer);
                                  saveTimer = null;
                                  await saveEdits();
                                }}
                                class="text-xs px-3 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                                Recompute ↺
                              </button>
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>

              {/if}
            </div>

            <!-- RIGHT: Vocab browser -->
            <div class="w-72 shrink-0 flex flex-col gap-3">
              <div class="bg-white rounded-xl border border-gray-200 p-4 flex flex-col" style="max-height:700px;">
                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Vocab Browser</h3>

                <!-- Tier filter -->
                <div class="flex gap-1 mb-2">
                  {#each [['all','All'],['intro','Intro'],['beginning','Beg.'],['intermediate','Int.']] as [val, lbl]}
                    <button on:click={() => s2TierFilter = val}
                      class="flex-1 text-xs py-1 rounded border transition-colors
                        {s2TierFilter === val
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}">
                      {lbl}
                    </button>
                  {/each}
                </div>

                <!-- Search -->
                <input bind:value={s2Search} type="text" placeholder="Search…"
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-3 focus:outline-none focus:border-indigo-400" />

                <!-- Lemma list -->
                <div class="overflow-y-auto flex-1 -mx-1 px-1 space-y-0.5">
                  {#if !wordFormsCache}
                    <p class="text-xs text-gray-400 text-center py-4">Loading…</p>
                  {:else if s2LemmaFiltered.length === 0}
                    <p class="text-xs text-gray-400 text-center py-4">No words match.</p>
                  {:else}
                    {#each s2LemmaFiltered as word (word.lemma)}
                      {@const checked = s2SelectedVocab.has(word.lemma)}
                      <label class="flex items-start gap-2 py-1.5 px-1 rounded cursor-pointer select-none hover:bg-gray-50 {checked ? 'bg-indigo-50' : ''}">
                        <input type="checkbox" checked={checked}
                          on:change={() => toggleLessonVocab(word.lemma)}
                          class="mt-0.5 shrink-0 accent-indigo-600" />
                        <div class="min-w-0">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-sm font-greek {checked ? 'text-indigo-700' : 'text-gray-900'}">{word.lemma}</span>
                            {#if word.chapters.length > 0}
                              {#each word.chapters as ch}
                                <span class="inline-block px-1 py-0 bg-amber-100 text-amber-700 rounded text-[10px] font-medium leading-4">ch{ch}</span>
                              {/each}
                            {/if}
                          </div>
                          <p class="text-[11px] text-gray-400 leading-tight">{word.def}</p>
                        </div>
                      </label>
                    {/each}
                  {/if}
                </div>

                <!-- Count + Save -->
                <div class="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                  <span class="text-xs text-gray-400">{s2LemmaFiltered.length} words · {s2SelectedVocab.size} selected</span>
                  <button
                    on:click={saveVocab}
                    disabled={!vocabDirty || vocabSaving}
                    class="px-3 py-1 rounded text-xs font-medium transition-colors
                      {vocabDirty ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-400 cursor-default'}"
                  >{vocabSaving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            </div>

          </div>
        {/if}<!-- end selectedLesson guard for story2 -->

        <!-- ── Quiz tab ── -->
        {:else if selectedLesson && lessonPartTab === 'quiz'}
          <div class="space-y-5">

            <!-- Mode toggle -->
            <div class="flex gap-2">
              {#each [['single','Single Questions'],['passage','Passage Quiz']] as [m, label]}
                <button
                  on:click={() => { quizMode = m; quizPendingQuestion = null; passagePending = null; }}
                  class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors
                    {quizMode === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
                >{label}</button>
              {/each}
            </div>

            <!-- ── SINGLE QUESTION MODE ── -->
            {#if quizMode === 'single'}

              {#if quizKnownStandardIds.length === 0 && quizOrphanedStandardIds.length === 0}
                <p class="text-sm text-gray-400 italic">No standards tagged on this chapter yet. Add standards using the other tabs.</p>
              {:else}

                <!-- One row per standard — Generate button always visible -->
                <div class="space-y-3">
                  {#each quizKnownStandardIds as sid}
                    {@const std = ngeStandardsById[sid]}
                    {@const domain = std?.domain ?? sid.split('.')[0]}
                    {@const storedForStd = quizStoredQuestions.filter(q => (q.standardId ?? q.standard_ids?.[0]) === sid)}
                    {@const ngeExamples = ngeByStandard[sid] ?? []}
                    {@const isGenerating = quizGenStatus === 'generating' && quizStandardId === sid}
                    {@const hasPending = quizPendingQuestion && quizStandardId === sid}

                    <div class="bg-white rounded-xl border {hasPending ? 'border-indigo-300' : 'border-gray-200'} overflow-hidden">

                      <!-- Standard header row -->
                      <div class="flex items-center gap-3 px-4 py-3">
                        <span class="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full
                          {domain === 'geography'  ? 'bg-emerald-100 text-emerald-700'
                          : domain === 'history'   ? 'bg-amber-100 text-amber-700'
                          : domain === 'mythology' ? 'bg-purple-100 text-purple-700'
                          : domain === 'alphabet'  ? 'bg-sky-100 text-sky-700'
                          : domain === 'language'  ? 'bg-rose-100 text-rose-700'
                          : domain === 'derivatives' ? 'bg-teal-100 text-teal-700'
                          : 'bg-gray-100 text-gray-600'}">{domain}</span>
                        <div class="flex-1 min-w-0">
                          <span class="text-xs font-mono text-gray-400">{sid}</span>
                          {#if std?.description}
                            <p class="text-sm text-gray-700 truncate">{std.description}</p>
                          {/if}
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          {#if storedForStd.length > 0}
                            <span class="text-xs text-gray-400">{storedForStd.length} saved</span>
                          {/if}
                          {#if isGenerating}
                            <span class="flex items-center gap-1.5 text-xs text-indigo-500">
                              <span class="inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                              Generating…
                            </span>
                          {/if}
                        </div>
                      </div>

                      <!-- Director's note + model selection -->
                      <div class="border-t border-gray-100 px-4 py-3 space-y-3">
                        <div>
                          <label class="text-xs font-medium text-gray-500 mb-1 block">Director's note</label>
                          <textarea
                            value={quizDirectorNotes[sid] ?? ''}
                            on:input={e => quizDirectorNotes = { ...quizDirectorNotes, [sid]: e.target.value }}
                            rows="2"
                            placeholder="Specify what you want tested — angle, difficulty, context…"
                            class="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                          ></textarea>
                        </div>

                        <!-- NGE reference questions with radio selection -->
                        {#if ngeExamples.length > 0}
                          <div>
                            <label class="text-xs font-medium text-gray-500 mb-1.5 block">
                              Model question
                              <span class="font-normal text-gray-400 ml-1">— select one to use as a style example (optional)</span>
                            </label>
                            <div class="space-y-2">
                              {#each ngeExamples as q}
                                {@const isSelected = (quizSelectedExampleIds[sid] ?? null) === q.id}
                                <label class="flex items-start gap-2.5 cursor-pointer group">
                                  <input
                                    type="radio"
                                    name="model-{sid}"
                                    value={q.id}
                                    checked={isSelected}
                                    on:change={() => {
                                      quizSelectedExampleIds = {
                                        ...quizSelectedExampleIds,
                                        [sid]: isSelected ? null : q.id
                                      };
                                    }}
                                    class="mt-0.5 shrink-0 accent-indigo-600"
                                  />
                                  <div class="flex-1 min-w-0 rounded-lg p-2 -m-2 transition-colors {isSelected ? 'bg-indigo-50' : 'group-hover:bg-gray-50'}">
                                    <div class="flex items-start gap-1.5 mb-1">
                                      <span class="text-xs text-gray-400 font-mono shrink-0">Q{q.num}</span>
                                      <p class="text-xs text-gray-800">{q.text}</p>
                                      {#if q.needs_verification}<span class="shrink-0 text-xs text-amber-400" title="Needs verification">⚠</span>{/if}
                                    </div>
                                    <div class="grid grid-cols-2 gap-x-4 ml-8">
                                      {#each q.choices as c}
                                        <span class="text-xs {c.id === q.correct ? 'text-green-600 font-medium' : 'text-gray-400'}">{c.id}) {c.text}</span>
                                      {/each}
                                    </div>
                                  </div>
                                </label>
                              {/each}
                              {#if quizSelectedExampleIds[sid]}
                                <button
                                  on:click={() => quizSelectedExampleIds = { ...quizSelectedExampleIds, [sid]: null }}
                                  class="text-xs text-gray-400 hover:text-gray-600 pl-6"
                                >✕ Clear selection</button>
                              {/if}
                            </div>
                          </div>
                        {/if}

                        <!-- Generate button (moved here, next to inputs) -->
                        <div class="flex items-center gap-3 pt-1">
                          <button
                            on:click={() => { quizStandardId = sid; quizPendingQuestion = null; quizGenError = null; generateQuizQuestion(); }}
                            disabled={quizGenStatus === 'generating'}
                            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {#if isGenerating}
                              <span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              Generating…
                            {:else}
                              + Generate Question
                            {/if}
                          </button>
                          {#if quizGenError && quizStandardId === sid}
                            <span class="text-xs text-red-500">{quizGenError}</span>
                          {/if}
                        </div>
                      </div>

                      <!-- Pending question editor (inline under its standard) -->
                      {#if hasPending}
                        <div class="border-t border-indigo-200 bg-indigo-50 p-4 space-y-3">
                          <div class="flex items-center justify-between">
                            <h3 class="text-sm font-semibold text-indigo-800">Review & Edit</h3>
                            <button on:click={() => quizPendingQuestion = null} class="text-indigo-400 hover:text-indigo-600 text-sm">✕ Discard</button>
                          </div>
                          <div>
                            <label class="text-xs text-indigo-600 font-medium mb-1 block">Question</label>
                            <textarea bind:value={quizPendingQuestion.text} rows="2"
                              class="w-full border border-indigo-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 bg-white"></textarea>
                          </div>
                          <div class="grid grid-cols-2 gap-2">
                            {#each quizPendingQuestion.choices as choice, i}
                              <div class="flex items-center gap-2">
                                <input type="radio" name="pending-correct" value={choice.id}
                                  bind:group={quizPendingQuestion.correct} class="shrink-0 accent-indigo-600" />
                                <span class="text-xs text-gray-500 shrink-0">{choice.id})</span>
                                <input type="text" bind:value={quizPendingQuestion.choices[i].text}
                                  class="flex-1 border border-indigo-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
                              </div>
                            {/each}
                          </div>
                          <p class="text-xs text-indigo-600">Correct: {quizPendingQuestion.correct ?? '—'} · Click radio to change</p>
                          <div>
                            <label class="text-xs text-indigo-600 font-medium mb-1 block">Notes (optional)</label>
                            <input type="text" bind:value={quizPendingQuestion.notes}
                              class="w-full border border-indigo-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400 bg-white" />
                          </div>
                          <button on:click={approveQuizQuestion}
                            class="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
                            ✓ Approve & Save
                          </button>
                        </div>
                      {/if}

                      <!-- Stored questions for this standard -->
                      {#if storedForStd.length > 0}
                        <div class="border-t border-gray-100 divide-y divide-gray-100">
                          {#each storedForStd as q}
                            <div class="px-4 py-3">
                              {#if quizEditingId === q.id && quizEditDraft}
                                <div class="space-y-2">
                                  <textarea bind:value={quizEditDraft.text} rows="2"
                                    class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                                  <div class="grid grid-cols-2 gap-2">
                                    {#each quizEditDraft.choices as choice, i}
                                      <div class="flex items-center gap-1.5">
                                        <input type="radio" name="edit-correct-{q.id}" value={choice.id}
                                          bind:group={quizEditDraft.correct} class="shrink-0 accent-indigo-600" />
                                        <span class="text-xs text-gray-500 shrink-0">{choice.id})</span>
                                        <input type="text" bind:value={quizEditDraft.choices[i].text}
                                          class="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400" />
                                      </div>
                                    {/each}
                                  </div>
                                  <div class="flex gap-2">
                                    <button on:click={() => saveQuizEdit(q.id)}
                                      class="px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">Save</button>
                                    <button on:click={() => { quizEditingId = null; quizEditDraft = null; }}
                                      class="px-4 py-1.5 text-gray-600 text-xs rounded-lg hover:bg-gray-100">Cancel</button>
                                  </div>
                                </div>
                              {:else}
                                <div class="flex items-start gap-2">
                                  <div class="flex-1 min-w-0">
                                    <p class="text-sm text-gray-800 mb-1">{q.text}</p>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-0">
                                      {#each (q.choices ?? []) as choice}
                                        <span class="text-xs {choice.id === q.correct ? 'text-green-700 font-medium' : 'text-gray-400'}">
                                          {choice.id}) {choice.text}
                                        </span>
                                      {/each}
                                    </div>
                                  </div>
                                  <div class="flex gap-1 shrink-0 mt-0.5">
                                    <button on:click={() => { quizEditingId = q.id; quizEditDraft = JSON.parse(JSON.stringify(q)); }}
                                      class="text-xs text-gray-400 hover:text-indigo-600 px-2 py-0.5 rounded hover:bg-indigo-50">Edit</button>
                                    <button on:click={() => deleteQuizQuestion(q.id)}
                                      class="text-xs text-gray-400 hover:text-red-500 px-2 py-0.5 rounded hover:bg-red-50">Delete</button>
                                  </div>
                                </div>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}

                    </div><!-- end standard card -->
                  {/each}
                </div>

                <!-- Orphaned standard IDs: in Firestore but not in the NGE standards index -->
                {#if quizOrphanedStandardIds.length > 0}
                  <div class="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p class="text-xs font-semibold text-amber-700 mb-2">Unrecognized standard IDs — remove to clean up</p>
                    <div class="flex flex-wrap gap-2">
                      {#each quizOrphanedStandardIds as sid}
                        <div class="flex items-center gap-1.5 px-2 py-1 rounded bg-white border border-amber-300">
                          <span class="text-xs font-mono text-amber-800">{sid}</span>
                          <button on:click={() => removeOrphanedStandard(sid)}
                            class="text-amber-400 hover:text-red-500 transition-colors text-xs leading-none">✕</button>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}

              {/if}<!-- end quizChapterStandardIds check -->

            <!-- ── PASSAGE QUIZ MODE ── -->
            {:else if quizMode === 'passage'}

              <div class="space-y-4">
                <!-- Context summary -->
                <div class="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cumulative Context</h3>
                  <p class="text-sm text-gray-700">
                    Grammar through ch_{selectedLesson?.chapter_id ?? '?'}: {cumulativeGrammar.length} standards ·
                    {cumulativeVocab.length} intro vocab words
                  </p>
                </div>

                <!-- Director's note -->
                <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                  <div>
                    <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Director's Note</label>
                    <p class="text-xs text-gray-400 mb-2">Describe the topic, characters, or scenario for the passage. Claude will use only cumulative vocabulary and grammar.</p>
                    <textarea
                      bind:value={passageDirectorNote}
                      rows="3"
                      placeholder="e.g. A student asks their teacher about the gods. Use Phoebe, Dolios, and Pallas. Focus on basic present-tense statements."
                      class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                    ></textarea>
                  </div>

                  <!-- Standards to test -->
                  <div>
                    <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Standards to Test (language)</label>
                    <div class="flex flex-wrap gap-1.5">
                      {#each quizChapterStandardIds.filter(s => s.startsWith('lang.')) as sid}
                        <button
                          on:click={() => {
                            const next = new Set(passageStandardsToTest);
                            if (next.has(sid)) next.delete(sid); else next.add(sid);
                            passageStandardsToTest = next;
                          }}
                          class="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                            {passageStandardsToTest.has(sid)
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}"
                        >{sid}</button>
                      {/each}
                    </div>
                  </div>

                  <!-- Generate button -->
                  <div class="flex items-center gap-3">
                    <button
                      on:click={generatePassageQuiz}
                      disabled={!passageDirectorNote.trim() || passageGenStatus === 'generating'}
                      class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {#if passageGenStatus === 'generating'}
                        <span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        Generating passage…
                      {:else}
                        + Generate Passage Quiz
                      {/if}
                    </button>
                    {#if passageGenError}
                      <span class="text-xs text-red-500">{passageGenError}</span>
                    {/if}
                  </div>
                </div>

                <!-- Pending passage display -->
                {#if passagePending}
                  <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-4">
                    <div class="flex items-center justify-between">
                      <h3 class="text-sm font-semibold text-indigo-800">{passagePending.passage.title || 'Generated Passage'}</h3>
                      <button on:click={() => passagePending = null} class="text-indigo-400 hover:text-indigo-600 text-sm">✕ Discard</button>
                    </div>

                    <!-- Passage lines with word annotation hover -->
                    <div class="bg-white rounded-lg border border-indigo-100 p-3 space-y-1.5">
                      {#each (passagePending.passage.lines ?? []) as line}
                        <div class="flex gap-3 text-sm">
                          <span class="text-xs text-gray-400 font-mono w-4 shrink-0 mt-0.5">{line.num}</span>
                          <p class="text-gray-800 leading-relaxed">
                            {#each line.greek.split(/(\s+)/) as token}
                              {#if token.trim()}
                                {@const annotation = passagePending.passage.wordAnnotations?.[token.trim()]}
                                {#if annotation}
                                  <span class="relative group cursor-help underline decoration-dotted decoration-indigo-400">
                                    {token}
                                    <span class="absolute bottom-full left-0 mb-1 px-2 py-1 bg-indigo-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                      {annotation.shortDef}
                                    </span>
                                  </span>
                                {:else}
                                  {token}
                                {/if}
                              {:else}
                                {token}
                              {/if}
                            {/each}
                          </p>
                        </div>
                      {/each}
                    </div>

                    <!-- Questions -->
                    <div class="space-y-3">
                      <h4 class="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Questions ({passagePending.questions.length})</h4>
                      {#each passagePending.questions as q, qi}
                        <div class="bg-white rounded-lg border border-indigo-100 p-3 space-y-2">
                          <textarea
                            bind:value={passagePending.questions[qi].text}
                            rows="2"
                            class="w-full border border-indigo-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
                          ></textarea>
                          <div class="grid grid-cols-2 gap-1.5">
                            {#each q.choices as choice, ci}
                              <div class="flex items-center gap-1.5">
                                <input type="radio" name="passage-correct-{qi}" value={choice.id}
                                  bind:group={passagePending.questions[qi].correct} class="shrink-0 accent-indigo-600" />
                                <span class="text-xs text-gray-500 shrink-0">{choice.id})</span>
                                <input type="text" bind:value={passagePending.questions[qi].choices[ci].text}
                                  class="flex-1 border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-indigo-400" />
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/each}
                    </div>

                    <button
                      on:click={approvePassageQuiz}
                      class="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >✓ Approve & Save All</button>
                  </div>
                {/if}

                <!-- Stored passage quizzes -->
                {#if passageStoredLoading}
                  <p class="text-xs text-gray-400">Loading…</p>
                {:else if passageStoredQuizzes.length > 0}
                  <div class="space-y-2">
                    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Saved Passage Quizzes ({passageStoredQuizzes.length})</h3>
                    {#each passageStoredQuizzes as pq}
                      <div class="bg-white rounded-xl border border-gray-200 p-4">
                        <div class="flex items-start justify-between gap-2 mb-3">
                          <p class="text-sm font-medium text-gray-800">{pq.title || 'Untitled passage'}</p>
                          <button on:click={() => deletePassageQuiz(pq.id)}
                            class="text-xs text-gray-400 hover:text-red-500 px-2 py-0.5 rounded hover:bg-red-50 transition-colors shrink-0">Delete</button>
                        </div>
                        <p class="text-xs text-gray-500">{(pq.lines ?? []).length} lines · {(pq.questions ?? []).length} questions</p>
                      </div>
                    {/each}
                  </div>
                {/if}

              </div><!-- end passage mode -->

            {/if}<!-- end quizMode -->

          </div><!-- end quiz tab -->

        {:else if introMode}
          <div class="space-y-4">
            <div class="bg-white rounded-xl border border-gray-200 p-5">
              <h2 class="font-semibold text-gray-800 mb-3">
                {INTRO_TABS.find(t => t.id === introTab)?.label ?? introTab}
              </h2>

              {#if introDoc?.[introTab]?.blocks != null}
                <!-- ── Block composer ── -->
                <div class="space-y-3 mb-4">
                  {#each editorBlocks as block, bi}
                    <div class="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div class="flex items-center gap-2 mb-2">
                        <span class="text-xs font-mono text-gray-400 uppercase">{block.type}</span>
                        <div class="ml-auto flex gap-1">
                          <button on:click={() => blockUp(bi)} class="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30" disabled={bi === 0}>↑</button>
                          <button on:click={() => blockDown(bi)} class="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30" disabled={bi === editorBlocks.length - 1}>↓</button>
                          <button on:click={() => removeBlock(bi)} class="px-1.5 py-0.5 text-xs text-red-400 hover:text-red-600">×</button>
                        </div>
                      </div>

                      {#if block.type === 'heading'}
                        <div class="flex items-center gap-1 mb-1.5">
                          {#each [['voiced','🔊'],['display','👁'],['both','🔊👁']] as [mode, icon]}
                            <button on:click={() => setHeadingMode(bi, mode)}
                              class="px-2 py-0.5 text-xs rounded {headingMode(block) === mode ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-gray-400 hover:text-gray-600'}">
                              {icon}
                            </button>
                          {/each}
                          <select bind:value={editorBlocks[bi].style}
                            class="ml-auto border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none">
                            {#each HEADING_STYLES as s}<option value={s}>{s}</option>{/each}
                          </select>
                        </div>
                        <input bind:value={editorBlocks[bi].text} placeholder="Heading text…"
                          class="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                        {#if headingMode(block) === 'both'}
                          <input bind:value={editorBlocks[bi].voiced} placeholder="Voiced text (different from heading)…"
                            class="w-full mt-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400 font-mono italic" />
                        {/if}

                      {:else if block.type === 'paragraph'}
                        <div class="flex items-center gap-1 mb-1.5">
                          {#each [['voiced','🔊'],['display','👁'],['both','🔊👁']] as [mode, icon]}
                            <button on:click={() => setParaMode(bi, mode)}
                              class="px-2 py-0.5 text-xs rounded {paraMode(block) === mode ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-gray-400 hover:text-gray-600'}">
                              {icon}
                            </button>
                          {/each}
                          <select bind:value={editorBlocks[bi].style}
                            class="ml-auto border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none">
                            {#each PARA_STYLES as s}<option value={s}>{s || '(none)'}</option>{/each}
                          </select>
                        </div>
                        {#if paraMode(block) !== 'display'}
                          <textarea bind:value={editorBlocks[bi].voiced} rows="3" placeholder="Voiced text…"
                            class="w-full border border-gray-300 rounded px-2 py-1 text-sm resize-y focus:outline-none focus:border-indigo-400 font-mono leading-relaxed {paraMode(block) === 'both' ? 'mb-1' : ''}"
                          ></textarea>
                        {/if}
                        {#if paraMode(block) !== 'voiced'}
                          <textarea bind:value={editorBlocks[bi].display} rows="3" placeholder="{paraMode(block) === 'display' ? 'Display only (not voiced)…' : 'Display text (what the student sees)…'}"
                            class="w-full border border-gray-300 rounded px-2 py-1 text-sm resize-y focus:outline-none focus:border-indigo-400 font-mono leading-relaxed italic"
                          ></textarea>
                        {/if}

                      {:else if block.type === 'table'}
                        <!-- Column headers -->
                        <div class="flex gap-1 mb-1 items-center">
                          <span class="text-xs text-gray-400 w-16 shrink-0">Headers:</span>
                          {#each (block.headers ?? []) as _h, ci}
                            <input bind:value={editorBlocks[bi].headers[ci]} placeholder="Col {ci+1}"
                              class="w-24 border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-indigo-400" />
                            <button on:click={() => removeCol(bi, ci)} class="text-xs text-red-400 hover:text-red-600 px-1">×</button>
                          {/each}
                          <button on:click={() => addCol(bi)} class="text-xs text-indigo-500 hover:text-indigo-700 px-2">+ Col</button>
                        </div>
                        <!-- Rows -->
                        {#each block.rows as row, ri}
                          <div class="flex gap-1 mb-2 items-start">
                            <span class="text-xs text-gray-400 w-16 shrink-0 pt-1">Row {ri+1}:</span>
                            <div class="flex-1 space-y-1">
                              <div class="flex gap-1 flex-wrap">
                                {#each row.cells as cell, ci}
                                  <div class="border border-gray-200 rounded p-1.5 bg-white min-w-[140px] flex-1">
                                    <div class="flex items-center gap-0.5 mb-1">
                                      <button on:click={() => toggleCellVoiced(bi, ri, ci)}
                                        class="px-1.5 py-0.5 text-xs rounded {cellMode(cell) !== 'display' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-300 hover:text-gray-500'}"
                                        title="Toggle voice">🔊</button>
                                      <button on:click={() => toggleCellDisplay(bi, ri, ci)}
                                        class="px-1.5 py-0.5 text-xs rounded {cellMode(cell) !== 'voiced' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-300 hover:text-gray-500'}"
                                        title="Toggle display">👁</button>
                                      <select value={cell.style ?? ''} on:change={e => updateCell(bi, ri, ci, 'style', e.target.value)}
                                        class="ml-auto border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none">
                                        {#each CELL_STYLES as s}<option value={s}>{s || '—'}</option>{/each}
                                      </select>
                                    </div>
                                    {#if cellMode(cell) === 'both'}
                                      <input value={cell.display ?? ''} on:input={e => updateCell(bi, ri, ci, 'display', e.target.value)}
                                        placeholder="Display…" class="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs mb-0.5 focus:outline-none focus:border-indigo-300" />
                                      <input value={cell.voiced ?? ''} on:input={e => updateCell(bi, ri, ci, 'voiced', e.target.value)}
                                        placeholder="Voiced…" class="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-indigo-300 font-mono" />
                                    {:else if cellMode(cell) === 'display'}
                                      <input value={cell.display ?? ''} on:input={e => updateCell(bi, ri, ci, 'display', e.target.value)}
                                        placeholder="Display only…" class="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-indigo-300 italic" />
                                    {:else}
                                      <input value={cell.voiced ?? ''} on:input={e => updateCell(bi, ri, ci, 'voiced', e.target.value)}
                                        placeholder="Voiced…" class="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-indigo-300 font-mono" />
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                            </div>
                            <button on:click={() => removeRow(bi, ri)} class="text-xs text-red-400 hover:text-red-600 pt-1">×</button>
                          </div>
                        {/each}
                        <button on:click={() => addRow(bi)} class="text-xs text-indigo-500 hover:text-indigo-700">+ Row</button>
                      {/if}
                    </div>
                  {/each}
                </div>

                <!-- Add block toolbar -->
                <div class="flex gap-2 mb-4">
                  <button on:click={() => editorBlocks = [...editorBlocks, newHeading()]}
                    class="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs rounded-lg">+ Heading</button>
                  <button on:click={() => editorBlocks = [...editorBlocks, newParagraph()]}
                    class="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs rounded-lg">+ Paragraph</button>
                  <button on:click={() => editorBlocks = [...editorBlocks, newTable()]}
                    class="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs rounded-lg">+ Table</button>
                </div>

                <!-- Save + audio -->
                <div class="flex items-center gap-3">
                  <button on:click={() => saveIntroTabBlocks(introTab)} disabled={editorBlocksSaving}
                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {editorBlocksSaving ? 'Saving…' : 'Save Blocks'}
                  </button>
                  {#if editorBlocksSaveStatus === 'saved'}
                    <span class="text-xs text-green-600 font-medium">✓ Saved</span>
                  {:else if editorBlocksSaveStatus === 'error'}
                    <span class="text-xs text-red-500 font-medium">✗ Save failed — check console</span>
                  {/if}
                  {#if introTabAudioStatus[introTab] === 'generating'}
                    <span class="flex items-center gap-2 text-sm text-gray-500">
                      <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                      Generating audio…
                    </span>
                  {:else}
                    <button on:click={() => generateIntroAudio(introTab)}
                      class="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors">
                      {introTabAudioStatus[introTab] === 'done' ? '↺ Regenerate Audio' : '▶ Generate Audio'}
                    </button>
                    {#if introTabAudioStatus[introTab] === 'done'}
                      <button on:click={() => generateIntroAudio(introTab, { force: true })}
                        class="px-3 py-2 border border-orange-300 hover:bg-orange-50 text-orange-600 text-sm font-medium rounded-lg transition-colors"
                        title="Re-record all sections even if text is unchanged">
                        ↺ Force re-record
                      </button>
                      <span class="text-xs text-green-600">Audio ready</span>
                    {:else if introTabAudioStatus[introTab] === 'error'}
                      <span class="text-xs text-red-500">Audio failed</span>
                    {/if}
                  {/if}
                </div>

              {:else}
                <!-- ── Textarea fallback + convert button ── -->
                <p class="text-xs text-gray-400 mb-3">Voice-ready text. Use [short pause] for pacing.</p>
                <textarea bind:value={introTabText[introTab]} rows="14"
                  placeholder="{INTRO_TABS.find(t => t.id === introTab)?.label} text…"
                  class="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-y focus:outline-none focus:border-indigo-400 font-mono leading-relaxed"
                ></textarea>
                <div class="mt-3 flex items-center gap-3 flex-wrap">
                  <button on:click={() => saveIntroTab(introTab)} disabled={introTabSaving[introTab]}
                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                    {introTabSaving[introTab] ? 'Saving…' : 'Save'}
                  </button>
                  <button on:click={() => { convertToBlocks(introTab); saveIntroTabBlocks(introTab); }}
                    class="px-4 py-2 border border-indigo-300 hover:bg-indigo-50 text-indigo-600 text-sm font-medium rounded-lg transition-colors">
                    Convert to blocks →
                  </button>
                  {#if introTabAudioStatus[introTab] === 'generating'}
                    <span class="flex items-center gap-2 text-sm text-gray-500">
                      <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                      Generating audio…
                    </span>
                  {:else}
                    <button on:click={() => generateIntroAudio(introTab)} disabled={!introTabText[introTab]?.trim()}
                      class="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                      {introTabAudioStatus[introTab] === 'done' ? '↺ Regenerate Audio' : '▶ Generate Audio'}
                    </button>
                    {#if introTabAudioStatus[introTab] === 'done'}
                      <span class="text-xs text-green-600">Audio ready</span>
                    {:else if introTabAudioStatus[introTab] === 'error'}
                      <span class="text-xs text-red-500">Audio failed</span>
                    {/if}
                  {/if}
                </div>
                {#if introDoc?.[introTab]?.audioUrl}
                  <audio controls src={introDoc[introTab].audioUrl} class="mt-3 w-full h-8" />
                {/if}
              {/if}
            </div>
          </div>

        {/if}<!-- end overview/grammar/story/story2/map -->
      </div>
    </div>
  {/if}
{/if}

<!-- Images tab removed — character refs are in Story left panel, image generation in Story right panel -->
{#if false}
  <div class="space-y-6">

    <!-- Character References -->
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <h2 class="font-semibold text-gray-800 mb-1">Character References</h2>
      <p class="text-xs text-gray-400 mb-4">
        Upload one canonical portrait per character slot. These images are sent with each generation
        request so the model can maintain visual consistency across chapters.
      </p>
      <div class="grid grid-cols-4 gap-4">
        {#each [1,2,3,4] as slot}
          {@const char = charImages[slot]}
          <div class="flex flex-col gap-2">
            <!-- Image slot -->
            <div class="aspect-square rounded-lg border-2 border-dashed border-gray-200 overflow-hidden relative bg-gray-50 flex items-center justify-center group">
              {#if char?.url}
                <img src={char.url} alt="Character {slot}" class="w-full h-full object-cover" />
                <button
                  on:click={() => removeCharImage(slot)}
                  class="absolute top-1 right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >✕</button>
              {:else if charImageUploading[slot]}
                <span class="text-xs text-gray-400">Uploading…</span>
              {:else}
                <label class="cursor-pointer flex flex-col items-center gap-1 p-4 w-full h-full justify-center">
                  <span class="text-3xl text-gray-300 leading-none">+</span>
                  <span class="text-xs text-gray-400 text-center">Upload image</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="sr-only"
                    on:change={e => { if (e.target.files[0]) uploadCharImage(slot, e.target.files[0]); e.target.value = ''; }}
                  />
                </label>
              {/if}
            </div>
            <!-- Replace button (only when image exists) -->
            {#if char?.url}
              <label class="cursor-pointer text-xs text-indigo-500 hover:text-indigo-700 text-center">
                Replace
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="sr-only"
                  on:change={e => { if (e.target.files[0]) uploadCharImage(slot, e.target.files[0]); e.target.value = ''; }}
                />
              </label>
            {/if}
            <!-- Character name -->
            <input
              value={char?.name ?? ''}
              on:blur={e => { if (e.target.value !== (char?.name ?? '')) updateCharName(slot, e.target.value); }}
              placeholder="Character {slot} name"
              class="text-xs text-center border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400 text-gray-700 placeholder-gray-300"
            />
          </div>
        {/each}
      </div>
      {#if compositeDataUrl}
        <div class="mt-4 pt-4 border-t border-gray-100">
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Reference Sheet</div>
          <img src={compositeDataUrl} alt="Character reference sheet" class="w-48 rounded border border-gray-200" />
        </div>
      {:else if Object.values(charImages).some(c => c?.url)}
        <p class="mt-3 text-xs text-gray-400 italic">Reference sheet will appear when all 4 portraits are uploaded.</p>
      {/if}
    </div>

    <!-- Chapter Image Generator -->
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <h2 class="font-semibold text-gray-800 mb-1">Chapter Image Generator</h2>
      <p class="text-xs text-gray-400 mb-4">
        Describe a scene from a chapter. Select a chapter to auto-fill a starting prompt,
        then refine as needed.
      </p>

      <div class="grid grid-cols-2 gap-6">

        <!-- Controls -->
        <div class="space-y-3">
          <!-- Chapter selector -->
          <div>
            <label class="block text-xs text-gray-500 mb-1">Chapter <span class="text-gray-400">(auto-fills prompt)</span></label>
            <select
              bind:value={imageGenChapterId}
              on:change={e => { if (e.target.value) selectImageChapter(e.target.value); }}
              class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value={null}>— select a chapter —</option>
              {#each allLessons as lesson}
                <option value={lesson.lessonId}>
                  Ch.{lesson.chapter}{lesson.title ? ` — ${lesson.title}` : ''}
                </option>
              {/each}
            </select>
          </div>

          <!-- Prompt -->
          <div>
            <label class="block text-xs text-gray-500 mb-1">Scene prompt</label>
            <textarea
              bind:value={imageGenPrompt}
              rows="7"
              placeholder="Describe the scene: characters present, setting, action, mood, art style…"
              class="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400"
            ></textarea>
          </div>

          <!-- Character reference count -->
          <p class="text-xs text-gray-400">
            {Object.values(charImages).filter(c => c?.url).length} of 4 character references loaded
            {#if !Object.values(charImages).some(c => c?.url)} — upload portraits above for visual consistency{/if}
          </p>

          <!-- Generate -->
          {#if imageGenStatus === 'generating'}
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
              Generating image…
            </div>
          {:else}
            <button
              on:click={generateChapterImage}
              disabled={!imageGenPrompt.trim()}
              class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >Generate Image</button>
          {/if}

          {#if imageGenError}
            <p class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-3">{imageGenError}</p>
          {/if}
        </div>

        <!-- Result -->
        <div class="flex flex-col gap-3">
          {#if generatedImageB64}
            <img
              src="data:image/png;base64,{generatedImageB64}"
              alt="Generated chapter illustration"
              class="w-full rounded-lg border border-gray-200"
            />
            <div class="flex gap-2">
              <a
                href="data:image/png;base64,{generatedImageB64}"
                download="chapter-image.png"
                class="flex-1 text-center text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 rounded py-1.5 px-3 transition-colors"
              >Download PNG</a>
              <button
                on:click={saveImageToLesson}
                disabled={!imageGenChapterId || imageSaveStatus !== 'idle'}
                class="flex-1 text-xs font-medium rounded py-1.5 px-3 transition-colors disabled:opacity-50
                  {imageSaveStatus === 'saved' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}"
              >{imageSaveStatus === 'saving' ? 'Saving…' : imageSaveStatus === 'saved' ? 'Saved ✓' : 'Save to Lesson'}</button>
            </div>
          {:else}
            <div class="flex-1 flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 min-h-64 text-gray-300 text-sm">
              Generated image will appear here
            </div>
          {/if}
        </div>

      </div>
    </div>

  </div>
{/if}

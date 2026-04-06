<script>
  import { onMount } from 'svelte';
  import { db, storage } from '$lib/firebase/client';
  import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
  import { doc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import { getApp } from 'firebase/app';
  import VocabPanel from '$lib/components/greek/VocabPanel.svelte';

  const functions = getFunctions(getApp());
  const STORY_BIBLE_ID = 'grade7-greek';
  const COURSE_ID = 'grade7-greek';

  // ── Tab state ─────────────────────────────────────────────────────────────────
  let activeTab = 'story-bible'; // 'story-bible' | 'workshop' | 'images'

  // ── Story Bible ───────────────────────────────────────────────────────────────
  let storyBible = null;
  let bibleLoading = true;
  let bibleError = null;

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

  // ── Standards ─────────────────────────────────────────────────────────────────
  let allStandards = [];

  async function loadAllStandards() {
    const snap = await getDocs(query(collection(db, 'standards'), where('courseId', '==', COURSE_ID)));
    allStandards = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

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
  let audioProgress = '';

  // Alignment editor
  let editedSentences = [];
  let dirtyIndices = new Set();
  let expandedSentence = null;
  let saveTimer = null;

  // Vocab scan
  let wordFormsCache = null;
  let vocabScanList = null;   // { dict_entry, short_def, vocab_tier }[] for VocabPanel
  let vocabUnrecognized = []; // surface forms not found in word_forms
  let scanLoading = false;

  // Per-sentence Greek translation suggestions
  let greekSuggestions = {};  // { [i]: { greek, loading } }

  $: nextChapterNum = Math.max(
    storyBible?.chapterCount ?? 0,
    ...allLessons.map(l => l.chapter ?? 0)
  ) + 1;

  async function selectLesson(lessonId) {
    selectedLessonId = lessonId;
    newChapterMode = false;
    workshopError = null;
    const snap = await getDoc(doc(db, 'lessons', lessonId));
    selectedLesson = snap.exists() ? { lessonId: snap.id, ...snap.data() } : null;
    editedSentences = selectedLesson?.sentences
      ? JSON.parse(JSON.stringify(selectedLesson.sentences))
      : [];
    dirtyIndices = new Set();
    expandedSentence = null;
    chatHistory = [];
    refineFeedback = '';
    greekSuggestions = {};
    vocabScanList = null;
  }

  function startNewChapter() {
    selectedLessonId = null;
    selectedLesson = null;
    newChapterMode = true;
    workshopError = null;
    directorsNote = '';
    chatHistory = [];
    refineFeedback = '';
    editedSentences = [];
    dirtyIndices = new Set();
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

  async function acceptAndGenerateAudio() {
    if (!selectedLessonId) return;
    workshopAction = 'accepting';
    workshopError = null;
    // Save any pending edits first
    if (dirtyIndices.size > 0) await saveEdits();

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

  async function scanVocab() {
    scanLoading = true;
    vocabScanList = null;
    vocabUnrecognized = [];
    try {
      if (!wordFormsCache) {
        const res = await fetch('/data/Greek/word_forms.json');
        wordFormsCache = await res.json();
      }
      const PUNCT_RE = /[.,;:·?!]/g;
      const seen = new Set();
      const list = [];
      const unrecog = new Set();
      for (const sent of editedSentences) {
        for (const token of (sent.greek ?? '').trim().split(/\s+/).filter(Boolean)) {
          const bare = token.replace(PUNCT_RE, '');
          if (!bare || seen.has(bare)) continue;
          seen.add(bare);
          const entry = wordFormsCache[bare] || wordFormsCache[token];
          if (entry?.dict_entry) {
            if (!list.find(w => w.dict_entry === entry.dict_entry)) {
              list.push({ dict_entry: entry.dict_entry, short_def: entry.short_def ?? '', vocab_tier: entry.vocab_tier ?? null });
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
      dict_entry: null, short_def: null, morph: null,
      vocab_tier: null, standard_refs: [], syntax_standard_refs: [],
      paradigm_key: null, engSentPos: null
    }));
  }

  function addSentence() {
    const next = { num: editedSentences.length, greek: '', english: '', words: [], audioGenerated: false };
    editedSentences = [...editedSentences, next];
    markDirty(editedSentences.length - 1);
  }

  async function saveEdits() {
    if (!selectedLessonId || dirtyIndices.size === 0) return;
    workshopAction = 'saving';
    const sentences = editedSentences.map((s, i) => ({
      ...s,
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
    } catch (e) {
      console.error('Save edits failed:', e);
    } finally {
      workshopAction = 'idle';
    }
  }


  $: acceptedLessons = allLessons.filter(l => normalizeStatus(l.status) === 'accepted');

  // ── Image generation ──────────────────────────────────────────────────────────
  let charImages = {}; // { 1: { name, url }, 2: ..., 3: ..., 4: ... }
  let charImageUploading = {};
  let imageGenChapterId = null;
  let imageGenPrompt = '';
  let generatedImageB64 = null;
  let imageGenStatus = 'idle';
  let imageGenError = null;

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
    const lesson = allLessons.find(l => l.lessonId === lessonId);
    if (!lesson) return;
    const parts = [
      lesson.title ? `Chapter ${lesson.chapter}: ${lesson.title}` : `Chapter ${lesson.chapter}`
    ];
    if (lesson.narrative_summary) parts.push(lesson.narrative_summary);
    else if (lesson.summary) parts.push(lesson.summary);
    imageGenPrompt = parts.join('\n\n') +
      '\n\nAncient Greek art style, warm earth tones, suitable for 7th grade students.';
  }

  async function generateChapterImage() {
    if (!imageGenPrompt.trim()) return;
    imageGenStatus = 'generating';
    imageGenError = null;
    generatedImageB64 = null;
    try {
      const characterImageUrls = Object.values(charImages)
        .filter(c => c?.url)
        .map(c => c.url);
      const res = await fetch('/dev/greek/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imageGenPrompt, characterImageUrls })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      generatedImageB64 = data.b64_json;
    } catch (e) {
      imageGenError = e.message;
    } finally {
      imageGenStatus = 'idle';
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  onMount(async () => {
    await Promise.all([
      loadStoryBible(),
      loadAllStandards(),
      loadNgeVocab(),
      loadAllLessons()
    ]);
    charImages = { ...(storyBible?.characterImages ?? {}) };
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const STATUS_COLORS = {
    draft:       'bg-yellow-100 text-yellow-700',
    aligned:     'bg-blue-100 text-blue-700',
    accepted:    'bg-green-100 text-green-700',
    audio_ready: 'bg-green-100 text-green-700'
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
  {#each [['story-bible','Story Bible'],['workshop','Workshop'],['images','Images']] as [tab, label]}
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
  {#if bibleLoading}
    <p class="text-gray-400 text-sm">Loading story bible...</p>
  {:else if bibleError}
    <p class="text-red-600 text-sm">Error: {bibleError}</p>
  {:else}

    <!-- Narrative State -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-5">
      <h2 class="font-semibold text-gray-800 mb-3">Narrative State</h2>
      {#if !storyBible?.narrative?.summary}
        <p class="text-sm text-gray-400 italic">No narrative yet — generate a chapter to start.</p>
      {:else}
        {@const ns = storyBible.narrative}
        <div class="grid grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <span class="block text-xs text-gray-400 uppercase tracking-wide mb-1">Time Period</span>
            <span class="text-gray-800">{ns.timePeriod ?? '—'}</span>
          </div>
          <div>
            <span class="block text-xs text-gray-400 uppercase tracking-wide mb-1">Location</span>
            <span class="text-gray-800">{ns.location ?? '—'}</span>
          </div>
          <div>
            <span class="block text-xs text-gray-400 uppercase tracking-wide mb-1">Chapters</span>
            <span class="text-gray-800">{storyBible.chapterCount ?? 0}</span>
          </div>
        </div>
        {#if ns.summary}
          <p class="text-sm text-gray-600 mb-3">{ns.summary}</p>
        {/if}
        {#if ns.activeCharacters?.length}
          <div class="flex flex-wrap gap-2">
            {#each ns.activeCharacters as char}
              <span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">{char}</span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- Character Roster -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-5">
      <h2 class="font-semibold text-gray-800 mb-3">Character Roster</h2>
      {#if !charList.length}
        <p class="text-sm text-gray-400 italic">No characters yet.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th class="text-left px-3 py-2">Greek</th>
                <th class="text-left px-3 py-2">English</th>
                <th class="text-left px-3 py-2">Role</th>
                <th class="text-left px-3 py-2">Description</th>
                <th class="text-left px-3 py-2">Chapters</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {#each charList as [greekName, char]}
                <tr class="hover:bg-gray-50">
                  <td class="px-3 py-2 font-medium text-gray-800">{greekName}</td>
                  <td class="px-3 py-2 text-gray-600">{char.english ?? '—'}</td>
                  <td class="px-3 py-2 text-gray-600">{char.role ?? '—'}</td>
                  <td class="px-3 py-2 text-gray-500 max-w-xs">{char.description ?? '—'}</td>
                  <td class="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {#if char.firstChapter != null}
                      {char.firstChapter}{char.lastChapter != null && char.lastChapter !== char.firstChapter ? `–${char.lastChapter}` : ''}
                    {:else}—{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Content Standards (myth / geo / hist) -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-5">
      <h2 class="font-semibold text-gray-800 mb-1">Content Standards</h2>
      <p class="text-xs text-gray-400 mb-4">Mythology, Geography, History — the standards the story must cover.</p>
      {#if !allStandards.length}
        <p class="text-sm text-gray-400 italic">Loading...</p>
      {:else}
        {@const contentDomains = ['myth', 'geo', 'hist']}
        {@const domainLabels = { myth: 'Mythology', geo: 'Geography', hist: 'History' }}
        <div class="grid grid-cols-3 gap-6">
          {#each contentDomains as domain}
            {@const stds = (standardGroups[domain] ?? [])}
            {@const coveredCount = stds.filter(s => s.covered).length}
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{domainLabels[domain]}</span>
                <span class="text-xs text-gray-400">{coveredCount}/{stds.length}</span>
              </div>
              <div class="space-y-1">
                {#each stds as std}
                  <div class="flex items-start gap-2 text-sm {std.covered ? 'opacity-40' : ''}">
                    <span class="mt-0.5 w-3.5 shrink-0 text-center text-xs {std.covered ? 'text-green-600' : 'text-gray-300'}">
                      {std.covered ? '✓' : '·'}
                    </span>
                    <span class="text-gray-700 leading-snug">{std.description ?? std.id}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Vocab Introduced -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-5">
      <h2 class="font-semibold text-gray-800 mb-3">Vocab Introduced</h2>
      {#if !vocabEntries.length}
        <p class="text-sm text-gray-400 italic">No vocab yet.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th class="text-left px-3 py-2">Greek</th>
                <th class="text-left px-3 py-2">Tier</th>
                <th class="text-left px-3 py-2">Chapter Introduced</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {#each vocabEntries as [dictEntry, info]}
                <tr class="hover:bg-gray-50">
                  <td class="px-3 py-2 font-medium text-gray-800">{dictEntry}</td>
                  <td class="px-3 py-2">
                    <span class="px-1.5 py-0.5 rounded text-xs
                      {info.tier === 'intro' ? 'bg-blue-100 text-blue-700'
                        : info.tier === 'beginning' ? 'bg-green-100 text-green-700'
                        : info.tier === 'intermediate' ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-purple-100 text-purple-700'}">
                      {info.tier ?? '—'}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-gray-500">{info.chapter ?? '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Grammar Introduced -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-5">
      <h2 class="font-semibold text-gray-800 mb-3">Grammar Introduced</h2>
      {#if !grammarEntries.length}
        <p class="text-sm text-gray-400 italic">No grammar constructs yet.</p>
      {:else}
        <div class="space-y-1">
          {#each grammarEntries as [key, info]}
            <div class="flex items-center gap-3 text-sm">
              <span class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs whitespace-nowrap">Ch. {info.chapter ?? '?'}</span>
              <span class="text-gray-800">{info.label ?? key}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- NGE Vocabulary List -->
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <div class="flex items-center justify-between mb-1">
        <h2 class="font-semibold text-gray-800">NGE Vocabulary</h2>
        <div class="flex gap-1">
          <button
            on:click={() => vocabFilter = 'all'}
            class="px-2.5 py-1 rounded text-xs font-medium transition-colors
              {vocabFilter === 'all' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-700'}"
          >All</button>
          <button
            on:click={() => vocabFilter = 'unintroduced'}
            class="px-2.5 py-1 rounded text-xs font-medium transition-colors
              {vocabFilter === 'unintroduced' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-700'}"
          >Not yet introduced</button>
        </div>
      </div>
      <p class="text-xs text-gray-400 mb-4">Use this to plan vocab for your director's note.</p>
      {#if !ngeVocab.length}
        <p class="text-sm text-gray-400 italic">Loading...</p>
      {:else}
        <div class="space-y-5">
          {#each vocabByTier as group}
            <div>
              <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{TIER_LABELS[group.tier]}</div>
              <div class="grid grid-cols-2 gap-x-6 gap-y-0.5">
                {#each group.words as word}
                  <div class="flex items-baseline gap-2 text-sm {word.chapter ? 'opacity-40' : ''}">
                    <span class="font-medium text-gray-800 shrink-0">{word.greek}</span>
                    <span class="text-gray-400 text-xs truncate">{word.definition}</span>
                    {#if word.chapter}
                      <span class="ml-auto shrink-0 text-xs text-green-600">Ch.{word.chapter}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  {/if}
{/if}

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- TAB 2: Workshop                                                           -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
{#if activeTab === 'workshop'}

  <!-- Lesson tile strip -->
  <div class="flex flex-wrap gap-2 mb-6">
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
  {#if !selectedLesson && !newChapterMode}
    <div class="flex items-center justify-center h-48 text-gray-300 text-sm">
      Select a chapter above or generate a new one.
    </div>

  {:else}
    <div class="grid grid-cols-3 gap-6">

      <!-- ── Left: controls ── -->
      <div class="col-span-1 space-y-4">

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

        <!-- Delete chapter -->
        {#if selectedLessonId}
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
                    <div class="rounded-lg {isDirty ? 'bg-amber-50 border border-amber-200 p-2 -mx-2' : ''}">
                      <div class="flex gap-3 group">
                        <span class="text-xs text-gray-300 font-mono mt-2 w-5 shrink-0 text-right">{i + 1}</span>
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
                    <div class="flex flex-wrap gap-1">
                      {#each vocabUnrecognized as word}
                        <span class="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">{word}</span>
                      {/each}
                    </div>
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
              <span class="text-xs text-gray-400">Click a sentence to edit alignment</span>
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
                        <p class="text-gray-800 text-sm leading-relaxed mb-1">{sent.greek}</p>
                        {#if normalizeStatus(selectedLesson?.status) !== 'accepted'}
                          <input
                            value={sent.english}
                            on:input={e => { editedSentences[i] = { ...editedSentences[i], english: e.target.value }; markDirty(i); }}
                            class="w-full text-sm text-gray-600 italic border-0 border-b border-dashed border-gray-300 bg-transparent focus:outline-none focus:border-indigo-400 py-0.5"
                            placeholder="English translation..."
                          />
                        {:else}
                          <p class="text-sm text-gray-500 italic">{sent.english}</p>
                        {/if}
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
                            {isExpanded ? 'Hide ▲' : 'Align ▼'}
                          </button>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <!-- Word alignment table -->
                  {#if isExpanded}
                    {@const isAccepted = normalizeStatus(selectedLesson?.status) === 'accepted'}
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
                              <!-- Pre Eng — read-only, derived -->
                              <td class="px-3 py-1.5 text-gray-400">{word.preEng ?? ''}</td>
                              <!-- English word — dimmed, populated by Recompute -->
                              <td class="px-3 py-1.5 text-gray-300 italic">{word.english ?? '—'}</td>
                              <!-- Pos — editable when aligned -->
                              <td class="px-3 py-1.5">
                                {#if isAccepted}
                                  <span class="text-gray-400">{word.engSentPos ?? '—'}</span>
                                {:else}
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
                                {/if}
                              </td>
                              <!-- Post Eng — read-only, derived -->
                              <td class="px-3 py-1.5 text-gray-400">{word.postEng ?? ''}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                      {#if !isAccepted}
                        <div class="px-3 py-2 border-t border-gray-100 flex justify-end">
                          <button
                            on:click={() => {
                              editedSentences[i] = recomputeAlignment(editedSentences[i]);
                              markDirty(i);
                            }}
                            class="text-xs px-3 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                            Recompute ↺
                          </button>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

      </div>
    </div>
  {/if}
{/if}

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!-- TAB 3: Images                                                             -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
{#if activeTab === 'images'}
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
            <a
              href="data:image/png;base64,{generatedImageB64}"
              download="chapter-image.png"
              class="text-center text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 rounded py-1.5 px-3 transition-colors"
            >Download PNG</a>
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

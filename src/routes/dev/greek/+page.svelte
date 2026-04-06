<script>
  import { onMount } from 'svelte';
  import { db } from '$lib/firebase/client';
  import { doc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import { getApp } from 'firebase/app';
  import GreekPassage from '$lib/components/greek/GreekPassage.svelte';
  import VocabPanel from '$lib/components/greek/VocabPanel.svelte';
  import GrammarPanel from '$lib/components/greek/GrammarPanel.svelte';

  const functions = getFunctions(getApp());
  const STORY_BIBLE_ID = 'grade7-greek';
  const COURSE_ID = 'grade7-greek';

  // ── Tab state ─────────────────────────────────────────────────────────────────
  let activeTab = 'story-bible'; // 'story-bible' | 'workshop' | 'preview'

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
    const chapterBeforeRefine = selectedLesson.chapter;
    const lessonIdBeforeRefine = selectedLessonId;
    refineFeedback = '';
    chatHistory = [...chatHistory, { role: 'user', text: feedback }];
    workshopAction = 'generating';
    workshopError = null;
    try {
      const fn = httpsCallable(functions, 'generateGreekLesson', { timeout: 540000 });
      const result = await fn({
        storyBibleId: STORY_BIBLE_ID,
        grammarLevel,
        sentenceCount,
        chapter: selectedLesson.chapter,
        directorsNote: directorsNote.trim() || null,
        lessonId: selectedLessonId,
        refinementFeedback: feedback
      });
      await selectLesson(result.data.lessonId);
      chatHistory = [...chatHistory, { role: 'assistant', text: 'Draft revised.' }];
    } catch (e) {
      console.error('refine error:', e);
      // Reload in case the revision landed despite the timeout.
      await loadAllLessons();
      const reloaded = allLessons.find(l => l.lessonId === lessonIdBeforeRefine);
      if (reloaded) {
        await selectLesson(lessonIdBeforeRefine);
        workshopError = 'Connection timed out, but the revision may have landed — reloaded the lesson.';
        chatHistory = [...chatHistory, { role: 'assistant', text: 'Connection timed out — reloaded. Check if the revision came through.' }];
      } else {
        workshopError = e.message;
        chatHistory = [...chatHistory, { role: 'assistant', text: `Error: ${e.message}` }];
      }
    } finally {
      workshopAction = 'idle';
    }
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

  function markDirty(index) {
    // Immediately clear audioGenerated so the audio loop always sees the correct state,
    // regardless of whether saveEdits has flushed yet.
    editedSentences[index] = { ...editedSentences[index], audioGenerated: false };
    dirtyIndices = new Set([...dirtyIndices, index]);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveEdits, 1500);
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

  // ── Preview tab ───────────────────────────────────────────────────────────────
  let previewLessonId = null;
  let previewLesson = null;
  let hoveredWord = null;
  let previewStandards = {};

  async function loadPreviewLesson(lessonId) {
    previewLessonId = lessonId;
    const snap = await getDoc(doc(db, 'lessons', lessonId));
    previewLesson = snap.exists() ? { lessonId: snap.id, ...snap.data() } : null;
  }

  $: acceptedLessons = allLessons.filter(l => normalizeStatus(l.status) === 'accepted');

  // ── Init ──────────────────────────────────────────────────────────────────────
  onMount(async () => {
    await Promise.all([
      loadStoryBible(),
      loadAllStandards(),
      loadNgeVocab(),
      loadAllLessons()
    ]);
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
  <p class="text-sm text-gray-500 mt-1">grade7-greek — story bible · chapter generation · preview</p>
</div>

<!-- Tab switcher -->
<div class="flex gap-1 mb-6 border-b border-gray-200">
  {#each [['story-bible','Story Bible'],['workshop','Workshop'],['preview','Preview']] as [tab, label]}
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

            <!-- Align -->
            <button on:click={alignChapter}
              disabled={workshopAction !== 'idle'}
              class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
              {workshopAction === 'aligning' ? 'Aligning...' : 'Align →'}
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
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <div class="mb-4 pb-4 border-b border-gray-100 flex items-center gap-3">
              <span class="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Chapter {selectedLesson.chapter}</span>
              {#if selectedLesson.title}
                <span class="text-gray-400 text-xs">·</span>
                <span class="text-sm font-medium text-gray-700">{selectedLesson.title}</span>
              {/if}
            </div>

            {#if selectedLesson.sentences?.length}
              <div class="space-y-5 mb-6">
                {#each selectedLesson.sentences as sentence, i}
                  <div class="flex gap-3 group">
                    <span class="text-xs text-gray-300 font-mono mt-0.5 w-5 shrink-0 text-right">{i + 1}</span>
                    <div class="flex-1">
                      <p class="text-gray-800 leading-relaxed mb-0.5">
                        {#each sentence.words ?? [] as word}
                          <span class="hover:bg-yellow-50 rounded px-0.5 cursor-default"
                            title={word.short_def ?? ''}>{word.text ?? ''}</span>{' '}
                        {/each}
                      </p>
                      <p class="text-sm text-gray-400 italic">{sentence.english ?? ''}</p>
                    </div>
                    <button
                      on:click={async () => {
                        const updated = selectedLesson.sentences.filter((_, j) => j !== i);
                        await updateDoc(doc(db, 'lessons', selectedLessonId), { sentences: updated, updatedAt: serverTimestamp() });
                        selectedLesson = { ...selectedLesson, sentences: updated };
                      }}
                      class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-red-400 hover:text-red-600 text-sm leading-none"
                      title="Remove sentence"
                    >✕</button>
                  </div>
                {/each}
              </div>
            {/if}

            {#if selectedLesson.vocab_list?.length}
              <div class="pt-4 border-t border-gray-100">
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Vocab in this chapter</div>
                <div class="flex flex-wrap gap-2">
                  {#each selectedLesson.vocab_list as word}
                    <span class="px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700">
                      <span class="font-medium">{word.dict_entry}</span>
                      {#if word.short_def} — {word.short_def}{/if}
                      {#if word.vocab_tier}<span class="ml-1 text-gray-400">({word.vocab_tier})</span>{/if}
                    </span>
                  {/each}
                </div>
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
                        {#if normalizeStatus(selectedLesson?.status) === 'draft'}
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
<!-- TAB 3: Preview                                                            -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
{#if activeTab === 'preview'}
  <!-- Lesson selector -->
  <div class="flex flex-wrap gap-2 mb-6">
    {#if !acceptedLessons.length}
      <p class="text-sm text-gray-400 italic">No accepted lessons yet.</p>
    {:else}
      {#each acceptedLessons as lesson}
        <button
          on:click={() => loadPreviewLesson(lesson.lessonId)}
          class="px-3 py-2 rounded-lg border text-sm transition-colors
            {previewLessonId === lesson.lessonId
              ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}"
        >
          Ch.{lesson.chapter}{lesson.title ? ` — ${lesson.title}` : ''}
        </button>
      {/each}
    {/if}
  </div>

  <!-- Three-panel student view -->
  {#if previewLesson}
    <div class="grid grid-cols-12 gap-0 border border-gray-200 rounded-xl overflow-hidden" style="height: calc(100vh - 220px)">
      <div class="col-span-3 border-r border-gray-200 overflow-y-auto bg-white">
        <VocabPanel vocabList={previewLesson.vocab_list ?? []} />
      </div>
      <div class="col-span-6 overflow-y-auto bg-white">
        <GreekPassage
          sentences={previewLesson.sentences ?? []}
          on:wordHover={e => hoveredWord = e.detail?.word ?? null}
        />
      </div>
      <div class="col-span-3 border-l border-gray-200 overflow-y-auto bg-white">
        <GrammarPanel hoveredWord={hoveredWord} standards={previewStandards} />
      </div>
    </div>
  {:else if acceptedLessons.length}
    <div class="flex items-center justify-center h-48 text-gray-300 text-sm">
      Select a lesson above to preview.
    </div>
  {/if}
{/if}

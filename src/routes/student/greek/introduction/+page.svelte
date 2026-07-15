<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { doc, getDoc } from 'firebase/firestore';
  import { db } from '$lib/firebase/client';
  import { marked } from 'marked';

  // Unwrap {…} for display, render markdown to HTML.
  function renderTabText(text) {
    if (!text) return '';
    const unwrapped = text.replace(/\{([^}]*)\}/g, '$1');
    return marked.parse(unwrapped);
  }

  // Build a renderable structure from a JSON blocks array.
  // Paragraphs: tokenized into words with local indices for word-level highlight.
  // Tables: cells carry hasVoiced flag for cell-level highlight.
  function buildJsonDisplay(blocks) {
    if (!blocks?.length) return [];
    return blocks.map((block, blockIdx) => {
      if (block.type === 'heading') {
        return { type: 'heading', blockIdx, text: block.text ?? '', style: block.style ?? 'h3', hasVoiced: !!block.voiced };
      }
      if (block.type === 'paragraph') {
        const displayOnly = block.voiced === undefined && block.display !== undefined;
        const hasBoth = block.voiced !== undefined && block.display !== undefined;
        const text = displayOnly ? (block.display ?? '') : (block.voiced ?? '');
        const words = [];
        let localIdx = 0;
        const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\S+)/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          const tok = m[0];
          if (tok.startsWith('**') && tok.endsWith('**'))
            words.push({ text: tok.slice(2, -2), bold: true, idx: localIdx++ });
          else if (tok.startsWith('*') && tok.endsWith('*'))
            words.push({ text: tok.slice(1, -1), italic: true, idx: localIdx++ });
          else
            words.push({ text: tok, idx: localIdx++ });
        }
        return { type: 'paragraph', blockIdx, words, style: block.style, displayOnly, displayOverride: hasBoth ? block.display : undefined };
      }
      if (block.type === 'table') {
        const headers = (block.headers ?? []).map(h =>
          typeof h === 'string' ? { text: h } : h
        );
        const rows = (block.rows ?? []).map((row, rowIdx) => ({
          rowIdx,
          cells: (row.cells ?? []).map((cell, cellIdx) => ({
            cellIdx,
            display: cell.display ?? cell.voiced ?? '',
            hasVoiced: !!cell.voiced,
            style: cell.style ?? '',
            words: cell.voiced
              ? cell.voiced.trim().split(/\s+/).filter(Boolean).map((w, i) => ({ text: w, idx: i }))
              : null
          }))
        }));
        return { type: 'table', blockIdx, headers, rows, style: block.style };
      }
      return null;
    }).filter(Boolean);
  }

  // Parse tab text into renderable blocks with word-level tokens for highlighting.
  // Blocks: { type:'html', html } | { type:'tokens', tokens }
  // Tokens: { type:'space', text } | { type:'word', text, bold?, italic?, idx }
  //         | { type:'html', html }  (inline HTML — not highlighted, words counted for index sync)
  function buildTabBlocks(raw) {
    if (!raw) return [];
    let wordIdx = 0;
    const blocks = [];
    const lines = raw.split('\n');
    let i = 0;
    let pending = [];

    // Add plain text tokens, splitting on whitespace.
    function addPlainWords(tokens, text, bold = false, italic = false) {
      const re = /(\s+|\S+)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const t = m[0];
        if (/^\s/.test(t)) tokens.push({ type: 'space', text: t });
        else tokens.push({ type: 'word', text: t, bold, italic, idx: wordIdx++ });
      }
    }

    // Tokenize one paragraph into word/space/html tokens.
    function tokenizePara(para) {
      const tokens = [];
      // Split on: **bold**, *italic*, or inline <tag>text</tag>
      const re = /(\*\*[^*]+\*\*|\*[^*]+\*|<[a-z][^>]*>[^<]*<\/[a-z]+>)/g;
      let last = 0;
      let m;
      while ((m = re.exec(para)) !== null) {
        if (m.index > last) addPlainWords(tokens, para.slice(last, m.index));
        const tok = m[0];
        if (tok.startsWith('**')) {
          addPlainWords(tokens, tok.slice(2, -2), true, false);
        } else if (tok.startsWith('*')) {
          addPlainWords(tokens, tok.slice(1, -1), false, true);
        } else {
          // Inline HTML (e.g. <span class="gk">ῥ</span>, <kbd>A</kbd>):
          // count its words for index sync but render as HTML (no highlight span).
          const tc = tok.replace(/<[^>]+>/g, '').trim();
          if (tc) wordIdx += tc.split(/\s+/).filter(Boolean).length;
          tokens.push({ type: 'html', html: tok });
        }
        last = m.index + m[0].length;
      }
      if (last < para.length) addPlainWords(tokens, para.slice(last));
      return tokens;
    }

    // Render voiced text as HTML with data-word-idx spans, handling bold/italic.
    function renderVoiced(text) {
      const re = /(\*\*[^*]+\*\*|\*[^*]+\*|<[a-z][^>]*>[^<]*<\/[a-z]+>)/g;
      let out = '';
      let last = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) out += wrapWords(text.slice(last, m.index));
        const tok = m[0];
        if (tok.startsWith('**')) {
          out += `<strong>${wrapWords(tok.slice(2, -2))}</strong>`;
        } else if (tok.startsWith('*')) {
          out += `<em>${wrapWords(tok.slice(1, -1))}</em>`;
        } else {
          const tc = tok.replace(/<[^>]+>/g, '').trim();
          if (tc) wordIdx += tc.split(/\s+/).filter(Boolean).length;
          out += tok;
        }
        last = m.index + m[0].length;
      }
      if (last < text.length) out += wrapWords(text.slice(last));
      return out;
    }

    function wrapWords(text) {
      return text.replace(/(\s+|\S+)/g, chunk =>
        /^\s/.test(chunk) ? chunk : `<span class="story-word" data-word-idx="${wordIdx++}">${chunk}</span>`
      );
    }

    // Render one table cell: {…} parts display-only, other text gets word spans.
    function renderCell(cell) {
      let out = '';
      let last = 0;
      const re = /\{([^}]*)\}/g;
      let m;
      while ((m = re.exec(cell)) !== null) {
        const before = cell.slice(last, m.index).trim();
        if (before) out += renderVoiced(before);
        out += m[1];
        last = m.index + m[0].length;
      }
      const after = cell.slice(last).trim();
      if (after) out += renderVoiced(after);
      return out || renderVoiced(cell);
    }

    function flushPending() {
      if (!pending.length) return;
      const para = pending.join(' ').trim();
      pending = [];
      if (!para) return;
      const tokens = tokenizePara(para);
      if (tokens.some(t => t.type === 'word')) blocks.push({ type: 'tokens', tokens });
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) { flushPending(); i++; continue; }

      // Markdown table rows: build table HTML with data-word-idx spans on voiced cells.
      if (trimmed.startsWith('|')) {
        flushPending();
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        const rows = tableLines.map(line => line.split('|').slice(1, -1).map(c => c.trim()));
        const isSep = row => row.every(c => /^[\-: {}]+$/.test(c));
        const sepIdx = rows.findIndex(isSep);
        let html = '<table class="sound-table">\n';
        if (sepIdx > 0) {
          html += '<thead><tr>' + rows[0].map(c => `<th>${c.replace(/\{([^}]*)\}/g, '$1')}</th>`).join('') + '</tr></thead>\n';
        }
        html += '<tbody>\n';
        for (let r = 0; r < rows.length; r++) {
          if (r === 0 && sepIdx > 0) continue;
          if (r === sepIdx) continue;
          html += '<tr>' + rows[r].map(c => `<td>${renderCell(c)}</td>`).join('') + '</tr>\n';
        }
        html += '</tbody></table>';
        blocks.push({ type: 'html', html });
        continue;
      }

      // {…} lines: display-only. Collect consecutive fully-wrapped lines as one HTML block.
      const stripped = trimmed.replace(/\{[^}]*\}/g, '').replace(/[|]/g, '').trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}') && !stripped) {
        flushPending();
        const curlyLines = [];
        while (i < lines.length) {
          const t = lines[i].trim();
          const s = t.replace(/\{[^}]*\}/g, '').replace(/[|]/g, '').trim();
          if (!t || (t.startsWith('{') && t.endsWith('}') && !s)) {
            if (t) curlyLines.push(t.replace(/\{([^}]*)\}/g, '$1'));
            i++;
          } else break;
        }
        blocks.push({ type: 'html', html: marked.parse(curlyLines.join('\n')) });
        continue;
      }
      // Mixed line: strip {…} and tokenise what remains as voiced words.
      if (/\{[^}]*\}/.test(trimmed) && stripped) {
        flushPending();
        pending.push(stripped);
        flushPending();
        i++;
        continue;
      }

      // Block-level HTML (breathing pairs, etc.) — count words for index sync
      if (trimmed.startsWith('<div') || trimmed.startsWith('<table')) {
        flushPending();
        const htmlLines = [line];
        i++;
        let depth = (line.match(/<div/gi) || []).length - (line.match(/<\/div>/gi) || []).length;
        while (i < lines.length && depth > 0) {
          const l = lines[i];
          htmlLines.push(l);
          depth += (l.match(/<div/gi) || []).length - (l.match(/<\/div>/gi) || []).length;
          i++;
        }
        const html = htmlLines.join('\n');
        const tc = html.replace(/<[^>]+>/g, ' ').trim();
        if (tc) wordIdx += tc.split(/\s+/).filter(Boolean).length;
        blocks.push({ type: 'html', html });
        continue;
      }

      pending.push(line);
      i++;
    }
    flushPending();
    return blocks;
  }

  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  const INTRO_LESSON_ID = 'grade7-greek-intro';

  const TABS = [
    { id: 'introduction', label: 'Introduction' },
    { id: 'pronunciation', label: 'Pronunciation' },
    { id: 'typing',        label: 'Typing' },
  ];

  const VALID = new Set(TABS.map(t => t.id));

  let activeTab = 'introduction';
  let introDoc = null;
  let loading = true;

  // ── Audio state ───────────────────────────────────────────────────────────────
  let tabAudio = null;
  let tabAudioPlaying = false;
  let tabAudioCurrentTime = 0;
  let tabAudioDuration = 0;
  let tabHighlightIdx = -1;  // used by markdown-format tabs
  let tabAudioRaf = null;

  // JSON-blocks highlight state (used when tab has .blocks)
  let hlBlockIdx = -1;
  let hlLocalWord = -1;
  let hlCellRef = null;
  let hlCellWord = -1;

  // Segment state (for tabs with chunked narrator audio)
  let tabSegIdx = 0;
  let tabSegPauseTimer = null;

  $: tabSegments = (() => {
    const segs = introDoc?.[activeTab]?.segments ?? [];
    if (segs.length) console.log(`[tabSegments] tab=${activeTab} count=${segs.length} titles=`, segs.map(s => s.section));
    return segs;
  })();

  $: tabSegOffsets = (() => {
    let t = 0;
    return tabSegments.map(s => { const off = t; t += s.alignment?.at(-1)?.end ?? 0; return off; });
  })();

  $: tabTotalDuration = tabSegments.length
    ? (tabSegOffsets.at(-1) ?? 0) + (tabSegments.at(-1)?.alignment?.at(-1)?.end ?? 0)
    : tabAudioDuration;

  $: tabSegWordOffsets = (() => {
    let w = 0;
    return tabSegments.map(s => {
      const off = w;
      const plain = (s.text ?? s.voicedText ?? '').replace(/\{[^}]*\}/g, '').replace(/<[^>]+>/g, '').replace(/[|]/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
      w += plain.split(/\s+/).filter(Boolean).length;
      return off;
    });
  })();

  function stopTabAudio() {
    if (tabAudioRaf) { cancelAnimationFrame(tabAudioRaf); tabAudioRaf = null; }
    if (tabSegPauseTimer) { clearTimeout(tabSegPauseTimer); tabSegPauseTimer = null; }
    if (tabAudio) { tabAudio._aborted = true; tabAudio.pause(); tabAudio.src = ''; tabAudio = null; }
    tabAudioPlaying = false;
    tabHighlightIdx = -1;
    hlBlockIdx = -1; hlLocalWord = -1; hlCellRef = null; hlCellWord = -1;
    tabAudioCurrentTime = 0;
    tabSegIdx = 0;
    document.querySelectorAll('[data-word-idx].word-highlight').forEach(el => el.classList.remove('word-highlight'));
  }

  function playTabSegment(segIdx, startOffset = 0) {
    if (!tabAudioPlaying) return;
    const seg = tabSegments[segIdx];
    if (!seg?.audioUrl) { tabAudioPlaying = false; return; }

    if (tabAudio) { tabAudio._aborted = true; tabAudio.pause(); tabAudio.src = ''; tabAudio = null; }
    tabSegIdx = segIdx;

    const audio = new Audio(seg.audioUrl);
    audio._aborted = false;
    tabAudio = audio;
    audio.addEventListener('error', (e) => {
      if (audio._aborted) return;
      console.error(`[playTabSegment] audio error seg ${segIdx}:`, audio.error?.code, audio.error?.message, e);
    });

    const al = seg.alignment ?? [];
    const segOffset = tabSegOffsets[segIdx] ?? 0;
    const wordOffset = tabSegWordOffsets[segIdx] ?? 0;
    const voicedItems = seg.voicedItems ?? null;

    function tick() {
      if (!tabAudio || tabAudio !== audio) return;
      const t = audio.currentTime;
      tabAudioCurrentTime = segOffset + t;
      let localIdx = -1;
      for (let i = 0; i < al.length; i++) {
        if (t >= al[i].start && t <= al[i].end) { localIdx = i; break; }
      }

      if (voicedItems) {
        // JSON-blocks path: map word index to block/cell
        if (localIdx < 0) {
          hlBlockIdx = -1; hlLocalWord = -1; hlCellRef = null; hlCellWord = -1;
        } else {
          const item = voicedItems.find(v => localIdx >= v.wordStart && localIdx <= v.wordEnd);
          if (item) {
            hlBlockIdx = item.blockIdx;
            if (item.type === 'paragraph') { hlLocalWord = localIdx - item.wordStart; hlCellRef = null; hlCellWord = -1; }
            else if (item.type === 'heading') { hlLocalWord = -1; hlCellRef = null; hlCellWord = -1; }
            else { hlLocalWord = -1; hlCellRef = { rowIdx: item.rowIdx, cellIdx: item.cellIdx }; hlCellWord = localIdx - item.wordStart; }
          }
        }
      } else {
        // Markdown path: global word-index via DOM
        const newIdx = localIdx >= 0 ? wordOffset + localIdx : -1;
        if (newIdx !== tabHighlightIdx) {
          document.querySelector(`[data-word-idx="${tabHighlightIdx}"]`)?.classList.remove('word-highlight');
          tabHighlightIdx = newIdx;
          document.querySelector(`[data-word-idx="${newIdx}"]`)?.classList.add('word-highlight');
        }
      }

      tabAudioRaf = requestAnimationFrame(tick);
    }

    audio.addEventListener('play', () => { tabAudioRaf = requestAnimationFrame(tick); }, { once: true });
    audio.addEventListener('ended', () => {
      cancelAnimationFrame(tabAudioRaf); tabAudioRaf = null;
      if (segIdx + 1 < tabSegments.length) {
        playTabSegment(segIdx + 1, 0);
      } else {
        tabAudioPlaying = false;
        tabHighlightIdx = -1;
        hlBlockIdx = -1; hlLocalWord = -1; hlCellRef = null; hlCellWord = -1;
        tabAudioCurrentTime = 0;
        tabSegIdx = 0;
      }
    }, { once: true });

    if (startOffset > 0) {
      audio.addEventListener('loadedmetadata', () => { audio.currentTime = startOffset; }, { once: true });
    }
    audio.play().catch((e) => console.error(`[playTabSegment] play() rejected seg ${segIdx}:`, e));
  }

  function playTabAudio() {
    stopTabAudio();
    tabAudioPlaying = true;
    tabHighlightIdx = -1;
    if (tabSegments.length) {
      playTabSegment(0, 0);
      return;
    }

    const url = introDoc?.[activeTab]?.audioUrl;
    if (!url) { tabAudioPlaying = false; return; }
    const al = introDoc?.[activeTab]?.alignment ?? [];
    const audio = new Audio(url);
    tabAudio = audio;

    function tick() {
      if (!tabAudio || tabAudio !== audio) return;
      const t = audio.currentTime;
      tabAudioCurrentTime = t;
      let idx = -1;
      for (let i = 0; i < al.length; i++) {
        if (t >= al[i].start && t <= al[i].end) { idx = i; break; }
      }
      if (idx !== tabHighlightIdx) {
        document.querySelector(`[data-word-idx="${tabHighlightIdx}"]`)?.classList.remove('word-highlight');
        tabHighlightIdx = idx;
        document.querySelector(`[data-word-idx="${idx}"]`)?.classList.add('word-highlight');
      }
      tabAudioRaf = requestAnimationFrame(tick);
    }

    audio.addEventListener('loadedmetadata', () => { tabAudioDuration = audio.duration; }, { once: true });
    audio.addEventListener('play', () => { tabAudioRaf = requestAnimationFrame(tick); }, { once: true });
    audio.addEventListener('ended', () => {
      cancelAnimationFrame(tabAudioRaf); tabAudioRaf = null;
      tabAudioPlaying = false;
      tabHighlightIdx = -1;
      tabAudioCurrentTime = 0;
    }, { once: true });
    audio.play().catch(() => {});
  }

  function toggleTabAudio() {
    if (tabAudioPlaying) stopTabAudio();
    else playTabAudio();
  }

  function seekTabAudio(e) {
    const T = Number(e.target.value);
    tabAudioCurrentTime = T;

    if (tabSegments.length) {
      let segIdx = 0;
      for (let i = tabSegOffsets.length - 1; i >= 0; i--) {
        if (T >= tabSegOffsets[i]) { segIdx = i; break; }
      }
      const localOffset = T - (tabSegOffsets[segIdx] ?? 0);
      stopTabAudio();
      tabAudioPlaying = true;
      playTabSegment(segIdx, localOffset);
      return;
    }

    if (tabAudio) tabAudio.currentTime = T;
    const al = introDoc?.[activeTab]?.alignment ?? [];
    let idx = -1;
    for (let i = 0; i < al.length; i++) {
      if (T >= al[i].start && T <= al[i].end) { idx = i; break; }
    }
    tabHighlightIdx = idx;
  }

  onMount(async () => {
    const saved = localStorage.getItem('greek_intro_tab');
    activeTab = VALID.has(saved) ? saved : 'introduction';
    try {
      const snap = await getDoc(doc(db, 'lessons', INTRO_LESSON_ID));
      introDoc = snap.exists() ? snap.data() : {};
    } catch (e) {
      console.warn('Failed to load intro doc:', e.message);
      introDoc = {};
    } finally {
      loading = false;
    }
  });

  onDestroy(() => stopTabAudio());

  function setTab(tab) {
    stopTabAudio();
    tabAudioDuration = 0;
    activeTab = tab;
    localStorage.setItem('greek_intro_tab', tab);
  }

  $: tabBlocks   = introDoc?.[activeTab]?.blocks ?? null;
  $: jsonBlocks  = tabBlocks ? buildJsonDisplay(tabBlocks) : null;
  $: tabHtml     = (!tabBlocks) ? renderTabText(introDoc?.[activeTab]?.text ?? '') : '';
  $: tabAudioUrl = introDoc?.[activeTab]?.audioUrl ?? null;
  $: tabHasAudio = !!(tabAudioUrl || tabSegments.length);
  $: tabWordBlocks = (!tabBlocks && introDoc && tabHasAudio) ? buildTabBlocks(introDoc?.[activeTab]?.text ?? '') : [];

  // Probe duration for single-audio tabs (segment tabs derive duration from alignment data)
  $: if (introDoc && tabAudioUrl && !tabSegments.length && tabAudioDuration === 0) {
    const probe = new Audio(tabAudioUrl);
    probe.addEventListener('loadedmetadata', () => { tabAudioDuration = probe.duration; }, { once: true });
  }
</script>

<svelte:head>
  <title>Introduction to Greek</title>
</svelte:head>

<div class="intro-page">
  <header class="page-header">
    <div class="page-header-inner">
      <button class="back-btn" on:click={() => goto('/student/greek')} aria-label="Back">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <button
        class="play-pause-btn"
        on:click={toggleTabAudio}
        aria-label={tabAudioPlaying ? 'Pause' : 'Play'}
        disabled={!tabHasAudio}
      >
        {#if tabAudioPlaying}
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
      <h1 class="page-title">Introduction</h1>
    </div>
    {#if tabTotalDuration > 0}
      <div class="progress-bar-row">
        <span class="progress-time">{formatTime(tabAudioCurrentTime)}</span>
        <input
          type="range"
          min="0"
          max={tabTotalDuration}
          step="0.1"
          value={tabAudioCurrentTime}
          on:input={seekTabAudio}
          class="progress-slider"
        />
        <span class="progress-time">{formatTime(tabTotalDuration)}</span>
      </div>
    {/if}
  </header>

  <nav class="tab-bar">
    <div class="tab-bar-inner">
      {#each TABS as tab}
        <button
          class="tab-btn"
          class:active={activeTab === tab.id}
          on:click={() => setTab(tab.id)}
        >{tab.label}</button>
      {/each}
    </div>
  </nav>

  {#if tabSegments.length > 1}
    <div class="section-nav-bar">
      <div class="section-nav">
        {#each tabSegments as seg, idx}
          <button
            class="section-chip"
            class:active={tabAudioPlaying && tabSegIdx === idx}
            on:click={() => { stopTabAudio(); tabAudioPlaying = true; playTabSegment(idx, 0); }}
            title={seg.section || `Section ${idx + 1}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="1 1 9 5 1 9"/></svg>
            {seg.section || `§${idx + 1}`}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <main class="tab-content">
    {#if loading}
      <div class="loading-state">Loading…</div>
    {:else if jsonBlocks}
      <!-- JSON blocks renderer -->
      <div class="prose-wrap">
        <article class="prose-lesson">
          {#each jsonBlocks as block}
            {#if block.type === 'heading'}
              {#if block.style === 'h2'}
                <h2 class:heading-highlight={block.hasVoiced && hlBlockIdx === block.blockIdx}>{block.text}</h2>
              {:else}
                <h3 class:heading-highlight={block.hasVoiced && hlBlockIdx === block.blockIdx}>{block.text}</h3>
              {/if}
            {:else if block.type === 'paragraph'}
              <p class="{block.style ?? ''}" class:para-highlight={block.displayOverride !== undefined && hlBlockIdx === block.blockIdx}>
                {#if block.displayOverride !== undefined}
                  {@html renderMath(block.displayOverride)}
                {:else}
                  {#each block.words as word, i}
                    {#if i > 0}{' '}{/if}<span
                      class="story-word"
                      class:word-highlight={!block.displayOnly && hlBlockIdx === block.blockIdx && hlLocalWord === word.idx}
                    >{#if word.bold}<strong>{word.text}</strong>{:else if word.italic}<em>{word.text}</em>{:else}{word.text}{/if}</span>
                  {/each}
                {/if}
              </p>
            {:else if block.type === 'table'}
              <table class="sound-table">
                {#if block.headers.length}
                  <thead><tr>
                    {#each block.headers as h}
                      <th class={h.style ?? ''}>{h.text}</th>
                    {/each}
                  </tr></thead>
                {/if}
                <tbody>
                  {#each block.rows as row}
                    <tr>
                      {#each row.cells as cell}
                        <td class="{cell.style ?? ''}"
                          class:cell-highlight={cell.hasVoiced && !cell.words && hlBlockIdx === block.blockIdx && hlCellRef?.rowIdx === row.rowIdx && hlCellRef?.cellIdx === cell.cellIdx}
                        >
                          {#if cell.words}
                            {#each cell.words as word, wi}
                              {#if wi > 0}{' '}{/if}<span
                                class="story-word"
                                class:word-highlight={hlBlockIdx === block.blockIdx && hlCellRef?.rowIdx === row.rowIdx && hlCellRef?.cellIdx === cell.cellIdx && hlCellWord === word.idx}
                              >{word.text}</span>
                            {/each}
                          {:else}
                            {cell.display}
                          {/if}
                        </td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          {/each}
        </article>
      </div>
    {:else if tabHtml}
      <!-- Markdown renderer (legacy tabs) -->
      <div class="prose-wrap">
        <article class="prose-lesson">
          {#if tabWordBlocks.length}
            {#each tabWordBlocks as block}
              {#if block.type === 'html'}
                {@html block.html}
              {:else}
                <p>{#each block.tokens as tok}{#if tok.type === 'space'}{tok.text}{:else if tok.type === 'html'}{@html tok.html}{:else}<span
                    class="story-word"
                    class:word-highlight={tok.idx === tabHighlightIdx}
                  >{#if tok.bold}<strong>{tok.text}</strong>{:else if tok.italic}<em>{tok.text}</em>{:else}{tok.text}{/if}</span>{/if}{/each}</p>
              {/if}
            {/each}
          {:else}
            {@html tabHtml}
          {/if}
        </article>
      </div>
    {:else}
      <div class="empty-state">Content coming soon.</div>
    {/if}
  </main>
</div>
<style>
  .intro-page {
    min-height: 100vh;
    background: #f1f5f9;
    display: flex;
    flex-direction: column;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .page-header {
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .page-header-inner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
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
  .play-pause-btn:disabled { opacity: 0.3; cursor: default; }

  .progress-bar-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 1rem;
    border-top: 1px solid #f1f5f9;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .section-nav-bar {
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .section-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 1rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .section-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px 3px 7px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #374151;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.1s, border-color 0.1s;
  }
  .section-chip:hover { background: #f0f4ff; border-color: #93c5fd; color: #1d4ed8; }
  .section-chip.active { background: #1d4ed8; border-color: #1d4ed8; color: white; }

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

  .page-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0;
    flex: 1;
  }

  .tab-bar {
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .tab-bar-inner {
    display: flex;
    gap: 0.25rem;
    padding: 0 0.5rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .tab-btn {
    padding: 0.75rem 1.25rem;
    font-size: 0.9rem;
    color: #6b7280;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn:hover { color: #374151; }
  .tab-btn.active { color: #4f46e5; border-bottom-color: #6366f1; font-weight: 600; }

  .tab-content { flex: 1; }

  .prose-wrap {
    max-width: 740px;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
    box-sizing: border-box;
    width: 100%;
  }

  .prose-lesson {
    font-size: 1.25rem;
    line-height: 1.75;
    color: #1e293b;
  }

  .prose-lesson :global(h2) {
    font-size: 1.875rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 1.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid #e2e8f0;
  }

  .prose-lesson :global(section) {
    margin-bottom: 2.25rem;
  }

  .prose-lesson :global(h3) {
    font-size: 1.375rem;
    font-weight: 700;
    color: #312e81;
    margin: 0 0 0.75rem;
  }

  .prose-lesson :global(p) {
    margin: 0 0 0.9rem;
    color: #334155;
  }

  .prose-lesson :global(strong) {
    color: #1e293b;
    font-weight: 700;
  }

  .prose-lesson :global(em) {
    font-style: italic;
    color: #475569;
  }

  .prose-lesson :global(.gk) {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 1.05em;
    color: #312e81;
  }
  .prose-lesson :global(.gk2) {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 2em;
    color: #312e81;
  }

  .prose-lesson :global(.breathing-pair) {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 0.75rem 0 1rem;
    padding: 1rem 1.25rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
  }

  .prose-lesson :global(.breathing-item) {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    font-size: 1.2rem;
    color: #334155;
  }

  .prose-lesson :global(.breathing-item .gk) {
    font-size: 2.5rem;
    line-height: 1;
    min-width: 2rem;
    text-align: center;
    color: #4338ca;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .prose-lesson :global(.sound-table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0 1rem;
    font-size: 1.125rem;
  }

  .prose-lesson :global(.sound-table th) {
    background: #f1f5f9;
    color: #475569;
    font-weight: 600;
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 2px solid #e2e8f0;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .prose-lesson :global(.sound-table td) {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    vertical-align: middle;
  }

  .prose-lesson :global(.sound-table tr:last-child td) { border-bottom: none; }
  .prose-lesson :global(.sound-table td:first-child),
  .prose-lesson :global(.sound-table td:nth-child(2)) { white-space: nowrap; }
  .prose-lesson :global(.sound-table tr:hover td) { background: #f8fafc; }

  .prose-lesson :global(.gk-cell) { white-space: nowrap; }

  .prose-lesson :global(.gk-cell .gk) {
    font-size: 2.5rem;
    margin-right: 0.3em;
  }

  .prose-lesson :global(.ee-cell) {
    font-weight: 700;
    color: #4338ca;
    font-size: 1.2rem;
    letter-spacing: 0.04em;
  }

  .prose-lesson :global(ul) {
    margin: 0 0 0.9rem 1.25rem;
    padding: 0;
    color: #334155;
  }

  .prose-lesson :global(ul li) {
    margin-bottom: 0.35rem;
  }

  .prose-lesson :global(kbd) {
    display: inline-block;
    padding: 0.1em 0.45em;
    font-size: 0.85em;
    font-family: monospace;
    font-weight: 600;
    color: #374151;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  .prose-lesson :global(.mode-explainer) {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 0.75rem 0 1rem;
    padding: 1rem 1.25rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
  }

  .prose-lesson :global(.mode-row-item) {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    font-size: 1.15rem;
    color: #334155;
  }

  .prose-lesson :global(.mode-badge) {
    flex-shrink: 0;
    font-size: 0.95rem;
    font-weight: 600;
    padding: 0.2em 0.7em;
    border-radius: 999px;
    border: 1px solid;
    white-space: nowrap;
  }

  .prose-lesson :global(.badge-keyboard) { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }
  .prose-lesson :global(.badge-greek)    { background: #f9fafb; border-color: #d1d5db; color: #6b7280; }
  .prose-lesson :global(.badge-translit) { background: #fdf4ff; border-color: #e9d5ff; color: #7e22ce; }

  .loading-state, .empty-state {
    text-align: center;
    padding: 4rem 1rem;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .story-word {
    border-radius: 2px;
    transition: background 0.08s;
  }

  :global(.story-word.word-highlight) {
    background: #fef08a;
    color: #1e293b;
  }

  /* JSON block cell highlight */
  .prose-lesson :global(td.cell-highlight) {
    background: #fef08a;
    transition: background 0.1s;
  }

  /* JSON block heading + paragraph highlight (voiced heading / both-mode paragraph) */
  .prose-lesson :global(h2.heading-highlight),
  .prose-lesson :global(h3.heading-highlight) {
    background: #fef08a;
    border-radius: 3px;
    transition: background 0.1s;
  }
  .prose-lesson :global(p.para-highlight) {
    background: #fef9c3;
    border-radius: 3px;
    transition: background 0.1s;
  }

  /* JSON block cell styles */
  .prose-lesson :global(td.greek-xl) {
    font-size: 2.5rem;
    font-family: "Noto Serif", "Times New Roman", serif;
    text-align: center;
    padding: 0.5rem 1rem;
    color: #1e293b;
    letter-spacing: 0.05em;
  }
  .prose-lesson :global(td.greek-md) {
    font-size: 1.5rem;
    font-family: "Noto Serif", "Times New Roman", serif;
    color: #374151;
  }
  .prose-lesson :global(td.label) {
    font-weight: 600;
    color: #374151;
    white-space: nowrap;
  }
  .prose-lesson :global(td.em) { font-style: italic; }
  .prose-lesson :global(td.dim) { color: #9ca3af; }
</style>

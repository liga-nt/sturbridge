<script>
  const { standards = [] } = $props();

  const SUBTYPE_LABELS = {
    period: 'Period', figure: 'Figure', battle: 'Battle',
    event: 'Event', author: 'Author', deity: 'Deity', myth: 'Myth',
  };

  const DOMAIN_COLORS = {
    history:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
    mythology: { bg: '#fdf4ff', border: '#e9d5ff', text: '#7e22ce' },
  };

  const SUBTYPE_PILL = {
    period:   { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' },
    figure:   { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' },
    battle:   { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
    event:    { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
    author:   { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
    deity:    { bg: '#fdf4ff', border: '#e9d5ff', text: '#7e22ce' },
    myth:     { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' },
  };

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── Filter state ──────────────────────────────────────────────────────────────
  let excludedSubtypes = $state(new Set());

  let presentSubtypes = $derived(
    [...new Set(standards.map(s => s.subtype).filter(Boolean))]
  );

  let filteredStandards = $derived(
    standards.filter(s => !excludedSubtypes.has(s.subtype))
  );

  // ── Deck state ────────────────────────────────────────────────────────────────
  let deck        = $state([]);
  let currentIdx  = $state(0);
  let flipped     = $state(false);
  let cardResults = $state({});
  let reversed    = $state(false);
  let lightboxSrc = $state(null);

  // Re-init deck whenever filteredStandards changes
  $effect(() => {
    const list = filteredStandards; // reactive dependency
    deck = shuffle([...list]);
    currentIdx = 0;
    flipped = false;
    cardResults = {};
  });

  let correctCount = $derived(Object.values(cardResults).filter(r => r === 'correct').length);
  let allDone      = $derived(deck.length > 0 && correctCount === deck.length);
  let currentCard  = $derived(deck[currentIdx] ?? null);

  let badgeStyle = $derived(() => {
    if (!currentCard) return '';
    const c = DOMAIN_COLORS[currentCard.domain] ?? DOMAIN_COLORS.history;
    return `background:${c.bg};border-color:${c.border};color:${c.text}`;
  });

  function markCard(result) {
    if (!currentCard) return;
    cardResults = { ...cardResults, [currentCard.id]: result };
    flipped = false;
    for (let i = 1; i <= deck.length; i++) {
      const idx = (currentIdx + i) % deck.length;
      if (cardResults[deck[idx]?.id] !== 'correct') { currentIdx = idx; return; }
    }
  }

  function reshuffle() {
    deck = shuffle([...filteredStandards]);
    currentIdx = 0;
    flipped = false;
    cardResults = {};
  }

  function toggleReversed() {
    reversed = !reversed;
    flipped = false;
    cardResults = {};
  }

  function openLightbox(e, src) {
    e.stopPropagation();
    lightboxSrc = src;
  }

  // Svelte action: shrinks font until text fits its own flex-allocated height
  function fitText(node) {
    let raf;
    function fit() {
      const maxH = node.clientHeight;
      if (!maxH) return;
      let lo = 10, hi = 22;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        node.style.fontSize = mid + 'px';
        if (node.scrollHeight <= maxH) lo = mid; else hi = mid;
      }
      node.style.fontSize = lo + 'px';
    }
    raf = requestAnimationFrame(fit);
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); });
    ro.observe(node);
    return {
      update() { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); },
      destroy() { ro.disconnect(); cancelAnimationFrame(raf); }
    };
  }
</script>

<div class="hm-wrap">
  {#if standards.length === 0}
    <p class="empty-note">No standards for this chapter.</p>
  {:else}

    <!-- Controls: reverse (left) + subtype pills (right) -->
    <div class="hm-controls">
      <button class="ctrl-btn" class:ctrl-on={reversed} onclick={toggleReversed}>
        ⇄ Reverse
      </button>
      {#if presentSubtypes.length > 1}
        <div class="subtype-pills">
          {#each presentSubtypes as sub}
            {@const c = SUBTYPE_PILL[sub] ?? SUBTYPE_PILL.myth}
            {@const excluded = excludedSubtypes.has(sub)}
            <button
              class="subtype-pill"
              style={excluded
                ? 'color:#9ca3af;background:#f3f4f6;border-color:#e5e7eb;opacity:0.55'
                : `color:${c.text};background:${c.bg};border-color:${c.border}`}
              onclick={() => {
                const s = new Set(excludedSubtypes);
                s.has(sub) ? s.delete(sub) : s.add(sub);
                excludedSubtypes = s;
              }}
            >{SUBTYPE_LABELS[sub] ?? sub}</button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Progress dots -->
    <div class="flash-progress">
      {#each deck as s (s.id)}
        {@const r = cardResults[s.id]}
        <span class="dot"
          class:dot-correct={r === 'correct'}
          class:dot-wrong={r === 'wrong'}
          class:dot-current={!allDone && deck[currentIdx]?.id === s.id}
        ></span>
      {/each}
      <span class="progress-label">{correctCount} / {deck.length}</span>
    </div>

    {#if deck.length === 0}
      <p class="empty-note">No cards match the selected filters.</p>
    {:else if allDone}
      <div class="flash-done">
        <div class="done-text">All done!</div>
        <button class="reshuffle-btn" onclick={reshuffle}>Shuffle again</button>
      </div>
    {:else if currentCard}
      {@const isDeity = currentCard.subtype === 'deity'}
      {@const imgSrc = isDeity ? `/images/divinities/${currentCard.name}.png` : null}

      <div class="card-scene"
        onclick={() => flipped = !flipped} role="button" tabindex="0"
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (flipped = !flipped)}>
        <div class="card-inner" class:flipped>

          <!-- ── Front face ── -->
          <div class="card-face card-front" class:face-text={reversed && !isDeity} class:face-deity={reversed && isDeity}>
            {#if !reversed}
              <!-- Normal: show name -->
              <span class="card-badge" style={badgeStyle()}>
                {SUBTYPE_LABELS[currentCard.subtype] ?? currentCard.domain}
              </span>
              <span class="card-name">{currentCard.name}</span>
              <span class="card-hint">tap to reveal</span>
            {:else if isDeity && imgSrc}
              <!-- Reversed deity: show image + text -->
              <div class="deity-back-img-wrap">
                <img src={imgSrc} alt={currentCard.name} class="deity-back-img"
                  onclick={(e) => openLightbox(e, imgSrc)} />
              </div>
              <div class="deity-back-text">
                <p class="card-detail" use:fitText>
                  {#if currentCard.description}
                    <strong>{currentCard.description}</strong>{' '}
                  {/if}
                  {currentCard.detail}
                </p>
              </div>
            {:else}
              <!-- Reversed non-deity: show text -->
              <p class="card-detail" use:fitText>
                {#if currentCard.description}
                  <strong>{currentCard.description}</strong>{' '}
                {/if}
                {currentCard.detail}
              </p>
            {/if}
          </div>

          <!-- ── Back face ── -->
          <div class="card-face card-back" class:face-text={!reversed && !isDeity} class:face-deity={!reversed && isDeity}>
            {#if reversed}
              <!-- Reversed: reveal name -->
              <span class="card-badge" style={badgeStyle()}>
                {SUBTYPE_LABELS[currentCard.subtype] ?? currentCard.domain}
              </span>
              <span class="card-name">{currentCard.name}</span>
            {:else if isDeity && imgSrc}
              <!-- Normal deity: image + text -->
              <div class="deity-back-img-wrap">
                <img src={imgSrc} alt={currentCard.name} class="deity-back-img"
                  onclick={(e) => openLightbox(e, imgSrc)} />
              </div>
              <div class="deity-back-text">
                <p class="card-detail" use:fitText>
                  {#if currentCard.description}
                    <strong>{currentCard.description}</strong>{' '}
                  {/if}
                  {currentCard.detail}
                </p>
              </div>
            {:else}
              <!-- Normal non-deity: text -->
              <p class="card-detail" use:fitText>
                {#if currentCard.description}
                  <strong>{currentCard.description}</strong>{' '}
                {/if}
                {currentCard.detail}
              </p>
            {/if}
          </div>

        </div>
      </div>

      <div class="flash-buttons">
        <button class="mark-btn mark-wrong" onclick={() => markCard('wrong')} title="Still learning">
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <button class="mark-btn mark-correct" onclick={() => markCard('correct')} title="Got it">
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>

      <button class="reshuffle-btn" onclick={reshuffle}>Reshuffle</button>
    {/if}
  {/if}
</div>

<!-- Lightbox -->
{#if lightboxSrc}
  <div class="lightbox-overlay" onclick={() => lightboxSrc = null} role="button" tabindex="0"
    onkeydown={(e) => e.key === 'Escape' && (lightboxSrc = null)}>
    <img src={lightboxSrc} alt="Full size" class="lightbox-img" />
  </div>
{/if}

<style>
  .hm-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 16px 0 64px;
  }

  .empty-note {
    font-size: 13px;
    color: #9ca3af;
    font-style: italic;
    padding: 40px 0;
  }

  /* Controls row */
  .hm-controls {
    display: flex;
    align-items: center;
    width: min(640px, 92vw);
    gap: 8px;
  }

  .ctrl-btn {
    padding: 4px 14px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #6b7280;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .ctrl-btn:hover { background: #f3f4f6; color: #374151; }
  .ctrl-btn.ctrl-on { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }

  .subtype-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-left: auto;
  }

  .subtype-pill {
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  /* Progress dots */
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

  /* Card — uniform size for all card types */
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
    -webkit-backface-visibility: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 36px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  }

  /* Name-side styling (front by default, back when reversed) */
  .card-front { background: white; border: 1px solid #e5e7eb; }
  .card-back  { background: #f8faff; border: 1px solid #c7d2fe; transform: rotateY(180deg); }

  /* Text-content face layout overrides */
  .face-text {
    justify-content: flex-start;
    padding-top: 28px;
    overflow: hidden;
    text-align: left;
  }

  /* Deity image+text face */
  .face-deity {
    flex-direction: row;
    padding: 0;
    gap: 0;
    align-items: stretch;
    justify-content: flex-start;
    overflow: hidden;
  }

  .deity-back-img-wrap {
    flex: 1;
    overflow: hidden;
    border-radius: 16px 0 0 16px;
    background: #f0f0f0;
  }

  .deity-back-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    cursor: zoom-in;
    transition: opacity 0.15s;
  }
  .deity-back-img:hover { opacity: 0.9; }

  .deity-back-text {
    flex: 1;
    padding: 20px 22px 20px 20px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
  }

  /* Card text */
  .card-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid;
    flex-shrink: 0;
  }

  .card-name {
    font-size: 36px;
    font-weight: 700;
    color: #111827;
    line-height: 1.2;
  }

  .card-hint {
    font-size: 12px;
    color: #d1d5db;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .card-detail {
    line-height: 1.55;
    color: #1f2937;
    text-align: left;
    margin: 0;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Buttons */
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

  /* Lightbox */
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
</style>

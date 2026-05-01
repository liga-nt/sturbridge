<script>
  import { onDestroy } from 'svelte';

  /**
   * VocabPanel — left panel showing vocabulary grouped by tier.
   * Props:
   *   vocabList: { dictEntry, shortDef, definition?, vocabTier, morph?, audioUrl? }[]
   */
  export let vocabList = [];
  export let headless = false; // suppress built-in title when parent provides one

  const TIER_ORDER = ['intro', 'beginning', 'intermediate', 'prose', null];
  const TIER_LABELS = {
    intro: 'Intro Vocabulary',
    beginning: 'Beginning',
    intermediate: 'Intermediate',
    prose: 'Prose',
    null: 'Glossed'
  };

  $: grouped = (() => {
    const map = new Map();
    for (const tier of TIER_ORDER) map.set(tier, []);
    for (const word of (vocabList ?? [])) {
      const t = word.vocabTier ?? null;
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(word);
    }
    // Remove empty groups
    const result = [];
    for (const tier of TIER_ORDER) {
      const words = map.get(tier);
      if (words && words.length > 0) {
        result.push({ tier, label: TIER_LABELS[tier] ?? tier, words });
      }
    }
    return result;
  })();

  let expandedWord = null;
  let currentAudio = null;

  function shortLabel(word) {
    if (word.definition) return word.definition.split(',')[0];
    return word.shortDef ?? '';
  }

  function handleWordClick(word) {
    toggleExpand(word);
    if (word.audioUrl) playAudio(word.audioUrl);
  }

  function toggleExpand(word) {
    expandedWord = expandedWord === word ? null : word;
  }

  function playAudio(url) {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    currentAudio = new Audio(url);
    currentAudio.play().catch(() => {});
    currentAudio.addEventListener('ended', () => { currentAudio = null; }, { once: true });
  }

  onDestroy(() => { if (currentAudio) { currentAudio.pause(); currentAudio = null; } });
</script>

<div class="vocab-panel">
  {#if !headless}
    <div class="panel-title">Vocabulary</div>
  {/if}

  {#if grouped.length === 0}
    <p class="empty-note">No vocabulary for this lesson.</p>
  {/if}

  {#if grouped.length > 0 && grouped.some(g => g.words.some(w => w.audioUrl))}
    <p class="click-hint">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
      click to hear
    </p>
  {/if}

  {#each grouped as group}
    <div class="vocab-group">
      {#if group.tier !== null}
        <div class="group-label tier-{group.tier}">{group.label}</div>
      {/if}
      <ul class="word-list">
        {#each group.words as word}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-list-item-interaction -->
          <li
            class="word-item tier-{group.tier ?? 'glossed'}"
            class:expanded={expandedWord === word}
            on:click={() => handleWordClick(word)}
          >
            <div class="word-row">
              <span class="dict-entry">{word.dictEntry}</span>
              <span class="short-def">{shortLabel(word)}</span>
            </div>
            {#if expandedWord === word && word.morph}
              <div class="word-morph">{word.morph}</div>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</div>

<style>
  .vocab-panel {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 18px;
    color: #333;
  }

  .panel-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
  }

  .click-hint {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #9ca3af;
    font-style: italic;
    margin: 0 0 10px;
  }

  .vocab-group {
    margin-bottom: 16px;
  }

  .group-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 6px;
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
  }

  .group-label.tier-intro {
    color: #1d4ed8;
    background: #dbeafe;
  }
  .group-label.tier-beginning {
    color: #065f46;
    background: #d1fae5;
  }
  .group-label.tier-intermediate {
    color: #92400e;
    background: #fef3c7;
  }
  .group-label.tier-prose {
    color: #4b5563;
    background: #f3f4f6;
  }
  .group-label.tier-glossed {
    color: #6b7280;
    background: #f9fafb;
  }

  .word-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .word-item {
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    border-bottom: 1px solid #f3f4f6;
  }

  .word-item:hover {
    background: #f9fafb;
  }

  .word-item.expanded {
    background: #f0f9ff;
  }

  .word-row {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .dict-entry {
    font-family: "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    font-size: 19px;
    font-weight: 600;
    line-height: 1.3;
  }

  .tier-intro .dict-entry {
    color: #1d4ed8;
  }
  .tier-beginning .dict-entry {
    color: #065f46;
  }
  .tier-intermediate .dict-entry {
    color: #92400e;
  }
  .tier-prose .dict-entry,
  .tier-glossed .dict-entry {
    color: #374151;
  }

  .short-def {
    font-size: 15px;
    color: #6b7280;
    line-height: 1.3;
  }

  .word-morph {
    font-size: 14px;
    color: #9ca3af;
    font-style: italic;
    margin-top: 3px;
    padding-top: 3px;
    border-top: 1px dashed #e5e7eb;
  }

  .empty-note {
    font-size: 16px;
    color: #9ca3af;
    font-style: italic;
  }
</style>

<script>
  /**
   * VocabPanel — left panel showing vocabulary grouped by tier.
   * Props:
   *   vocabList: { dict_entry, short_def, vocab_tier, morph? }[]
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
      const t = word.vocab_tier ?? null;
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

  function toggleExpand(word) {
    expandedWord = expandedWord === word ? null : word;
  }
</script>

<div class="vocab-panel">
  {#if !headless}
    <div class="panel-title">Vocabulary</div>
  {/if}

  {#if grouped.length === 0}
    <p class="empty-note">No vocabulary for this lesson.</p>
  {/if}

  {#each grouped as group}
    <div class="vocab-group">
      <div class="group-label tier-{group.tier ?? 'glossed'}">{group.label}</div>
      <ul class="word-list">
        {#each group.words as word}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-list-item-interaction -->
          <li
            class="word-item tier-{group.tier ?? 'glossed'}"
            class:expanded={expandedWord === word}
            on:click={() => toggleExpand(word)}
          >
            <div class="word-row">
              <span class="dict-entry">{word.dict_entry}</span>
              <span class="short-def">{word.short_def ?? ''}</span>
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
    font-size: 14px;
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
    font-size: 15px;
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
    font-size: 12px;
    color: #6b7280;
    line-height: 1.3;
  }

  .word-morph {
    font-size: 11px;
    color: #9ca3af;
    font-style: italic;
    margin-top: 3px;
    padding-top: 3px;
    border-top: 1px dashed #e5e7eb;
  }

  .empty-note {
    font-size: 13px;
    color: #9ca3af;
    font-style: italic;
  }
</style>

<script>
  /**
   * SyntaxCard — shows grammar standard info for the hovered word.
   * Props:
   *   standardIds: string[]   — list of standard IDs to display
   *   standards:   object     — map of { [standardId]: { shortName, description, order, ... } }
   */
  export let standardIds = [];
  export let standards = {};

  $: entries = (standardIds ?? [])
    .map(id => ({ id, ...(standards[id] ?? {}) }))
    .filter(e => e.shortName || e.description);
</script>

{#if entries.length > 0}
  <div class="syntax-wrap">
    {#each entries as entry}
      <div class="syntax-entry">
        <div class="syntax-name">{entry.shortName ?? entry.id}</div>
        {#if entry.description}
          <div class="syntax-desc">{entry.description}</div>
        {/if}
      </div>
    {/each}
  </div>
{:else if standardIds?.length > 0}
  <div class="syntax-empty">Standard info not available.</div>
{/if}

<style>
  .syntax-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .syntax-entry {
    background: #eff6ff;
    border-left: 3px solid #3b82f6;
    border-radius: 0 4px 4px 0;
    padding: 6px 10px;
  }

  .syntax-name {
    font-size: 12px;
    font-weight: 700;
    color: #1d4ed8;
    margin-bottom: 2px;
  }

  .syntax-desc {
    font-size: 12px;
    color: #374151;
    line-height: 1.4;
  }

  .syntax-empty {
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
  }
</style>

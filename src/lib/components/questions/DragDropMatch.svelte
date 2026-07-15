<script>
  import { renderMath } from '$lib/utils/math.js';

  export let question_text = '';
  export let instruction = '';
  export let tiles = [];
  export let rows = [];
  export let value = null;

  // placed[rowIdx][slotIdx] = tileText | null
  let placed = rows.map(r => r.slots.map(() => null));

  // Track what's being dragged: { source: 'bank'|'slot', tile, rowIdx?, slotIdx? }
  let dragging = null;

  $: usedTiles = placed.flat().filter(Boolean);

  // Tiles still in the bank — respects duplicates
  $: availableTiles = (() => {
    const useCount = {};
    for (const t of usedTiles) useCount[t] = (useCount[t] ?? 0) + 1;
    const emitted = {};
    const result = [];
    for (const t of tiles) {
      emitted[t] = (emitted[t] ?? 0) + 1;
      const total = tiles.filter(x => x === t).length;
      const used  = useCount[t] ?? 0;
      if (emitted[t] <= total - used) result.push(t);
    }
    return result;
  })();

  function updateValue() {
    const anyPlaced = placed.some(row => row.some(s => s !== null));
    if (!anyPlaced) { value = null; return; }
    const obj = {};
    placed.forEach((row, i) => { obj[String(i)] = row.map(s => s ?? ''); });
    value = JSON.stringify(obj);
  }

  // ── Drag sources ──────────────────────────────────────────────────────────

  function bankDragStart(e, tile) {
    dragging = { source: 'bank', tile };
    e.dataTransfer.setData('text', tile);
    e.dataTransfer.effectAllowed = 'move';
  }

  function slotDragStart(e, rowIdx, slotIdx) {
    const tile = placed[rowIdx][slotIdx];
    if (!tile) { e.preventDefault(); return; }
    dragging = { source: 'slot', tile, rowIdx, slotIdx };
    e.dataTransfer.setData('text', tile);
    e.dataTransfer.effectAllowed = 'move';
  }

  // ── Drop targets ──────────────────────────────────────────────────────────

  function slotDrop(e, rowIdx, slotIdx) {
    e.preventDefault();
    const tile = e.dataTransfer.getData('text');
    if (!tile) return;
    // Clear origin slot if dragging from another slot
    if (dragging?.source === 'slot') {
      placed[dragging.rowIdx][dragging.slotIdx] = null;
    }
    // If target already has a tile, it returns to the bank (just overwrite — bank recalcs)
    placed[rowIdx][slotIdx] = tile;
    placed = placed.map(r => [...r]);
    dragging = null;
    updateValue();
  }

  function bankDrop(e) {
    e.preventDefault();
    // Dropping back to bank: clear the source slot
    if (dragging?.source === 'slot') {
      placed[dragging.rowIdx][dragging.slotIdx] = null;
      placed = placed.map(r => [...r]);
      updateValue();
    }
    dragging = null;
  }
</script>

<div class="question-body">
  {#if question_text}
    <p class="q-text">{@html renderMath(question_text)}</p>
  {/if}
  {#if instruction}
    <p class="q-text">{@html renderMath(instruction)}</p>
  {/if}

  <!-- Tile bank -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="tile-bank" on:dragover|preventDefault on:drop={bankDrop}>
    {#each availableTiles as tile}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="tile"
        draggable="true"
        on:dragstart={(e) => bankDragStart(e, tile)}
      >{tile}</div>
    {/each}
  </div>

  <!-- Equation rows -->
  <div class="equation-rows">
    {#each rows as row, rowIdx}
      <div class="eq-row">
        <span class="division-eq">{@html renderMath(row.division)}</span>
        <span class="fact-label">has a related multiplication fact of</span>
        {#each row.slots as _slot, slotIdx}
          {@const placedTile = placed[rowIdx][slotIdx]}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="slot"
            class:slot--filled={placedTile !== null}
            on:dragover|preventDefault
            on:drop={(e) => slotDrop(e, rowIdx, slotIdx)}
          >
            {#if placedTile !== null}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <span
                class="slot-tile"
                draggable="true"
                on:dragstart={(e) => slotDragStart(e, rowIdx, slotIdx)}
              >{placedTile}</span>
            {/if}
          </div>
          {#if slotIdx === 0}
            <span class="op">×</span>
          {:else if slotIdx === 1}
            <span class="op">=</span>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .question-body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333333;
    background: #fff;
    padding: 16px;
    max-width: 640px;
  }

  .q-text { margin: 0 0 10px; }

  .tile-bank {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    margin: 12px 0 20px;
    min-height: 36px;
  }

  .tile {
    border: 1px solid #4a90d9;
    color: #4a90d9;
    padding: 4px 10px;
    font-size: 16px;
    line-height: 20px;
    min-width: 32px;
    text-align: center;
    background: #fff;
    cursor: grab;
    user-select: none;
    border-radius: 2px;
    margin-right: 4px;
    margin-bottom: 4px;
    font-family: inherit;
  }

  .equation-rows {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .eq-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 16px;
  }

  .division-eq { font-style: italic; white-space: nowrap; }
  .fact-label  { white-space: nowrap; }

  .slot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 28px;
    border: 1.5px solid #555;
    background: #f7f7f7;
    font-size: 16px;
  }

  .slot--filled {
    background: #e8f0fb;
    border-color: #4a90d9;
  }

  .slot-tile {
    color: #1a5fa8;
    font-weight: 500;
    cursor: grab;
    user-select: none;
  }

  .op { font-size: 16px; }
</style>

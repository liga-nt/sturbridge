<script>
  import { renderMath } from '$lib/utils/math.js';

  // Instruction text (two lines in TestNav)
  export let question_text = '';
  export let instruction = '';

  // Tiles available to drag
  export let tiles = [];

  // Rows: each row has a division equation and 3 answer slots
  // { division: "36 ÷ p = 4", slots: ["p", "4", "36"] }
  export let rows = [];

  // Exported value — JSON string of { rowIndex: [slot0, slot1, slot2] }
  // null until at least one tile is placed
  export let value = null;

  // ── Internal state ──────────────────────────────────────────────────────────

  // placed[rowIdx][slotIdx] = tileText | null
  let placed = rows.map(r => r.slots.map(() => null));

  // Which tile is currently selected from the bank (index into `tiles`, or -1)
  let selectedTile = -1;

  // Tiles that are already placed somewhere (to grey them out in the bank)
  $: usedTiles = placed.flat().filter(Boolean);

  function isTileAvailable(tile) {
    // Count how many times it appears in the bank vs how many are placed
    const inBank = tiles.filter(t => t === tile).length;
    const inUse = usedTiles.filter(t => t === tile).length;
    return inUse < inBank;
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  function handleTileClick(tileText, idx) {
    // idx is the index in `tiles` array — but tiles may repeat so we track by text uniqueness
    if (!isTileAvailable(tileText)) return; // already all copies placed
    if (selectedTile === idx) {
      // Deselect
      selectedTile = -1;
    } else {
      selectedTile = idx;
    }
  }

  function handleSlotClick(rowIdx, slotIdx) {
    const current = placed[rowIdx][slotIdx];

    if (current !== null) {
      // Remove tile from slot — return it to bank
      placed[rowIdx][slotIdx] = null;
      placed = [...placed];
      selectedTile = -1;
      updateValue();
      return;
    }

    if (selectedTile === -1) return; // nothing selected

    // Place the selected tile here
    const tileText = tiles[selectedTile];
    placed[rowIdx][slotIdx] = tileText;
    placed = [...placed];
    selectedTile = -1;
    updateValue();
  }

  function updateValue() {
    const anyPlaced = placed.some(row => row.some(s => s !== null));
    if (!anyPlaced) {
      value = null;
      return;
    }
    // Build { "0": ["p", "4", "36"], "1": [...], ... }
    const obj = {};
    placed.forEach((row, i) => {
      obj[String(i)] = row.map(s => s ?? '');
    });
    value = JSON.stringify(obj);
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
  <div class="tile-bank">
    {#each tiles as tile, idx}
      {@const available = isTileAvailable(tile)}
      {@const isSelected = selectedTile === idx}
      <button
        class="tile"
        class:tile--selected={isSelected}
        class:tile--used={!available}
        disabled={!available}
        on:click={() => handleTileClick(tile, idx)}
        type="button"
      >{tile}</button>
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
          <button
            class="slot"
            class:slot--filled={placedTile !== null}
            on:click={() => handleSlotClick(rowIdx, slotIdx)}
            type="button"
            title={placedTile ? `Click to remove "${placedTile}"` : selectedTile >= 0 ? `Click to place "${tiles[selectedTile]}"` : ''}
          >
            {#if placedTile !== null}
              <span class="slot-tile">{placedTile}</span>
            {/if}
          </button>
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

  .q-text {
    margin: 0 0 10px;
  }

  /* Tile bank: row of bordered tiles like TestNav */
  .tile-bank {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0;
    margin: 12px 0 20px;
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
    cursor: pointer;
    user-select: none;
    border-radius: 2px;
    margin-right: 4px;
    margin-bottom: 4px;
    font-family: inherit;
    transition: background 0.1s, color 0.1s;
  }

  .tile:hover:not(:disabled) {
    background: #e8f0fb;
  }

  .tile--selected {
    background: #4a90d9;
    color: #fff;
  }

  .tile--used {
    border-color: #ccc;
    color: #ccc;
    cursor: default;
    background: #f9f9f9;
  }

  /* Equation rows */
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

  .division-eq {
    font-style: italic;
    white-space: nowrap;
  }

  .fact-label {
    white-space: nowrap;
  }

  .slot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 28px;
    border: 1.5px solid #555;
    background: #f7f7f7;
    font-size: 16px;
    font-style: normal;
    cursor: pointer;
    font-family: inherit;
    padding: 0;
    transition: background 0.1s, border-color 0.1s;
  }

  .slot:hover {
    border-color: #4a90d9;
    background: #f0f6ff;
  }

  .slot--filled {
    background: #e8f0fb;
    border-color: #4a90d9;
  }

  .slot-tile {
    color: #1a5fa8;
    font-weight: 500;
  }

  .op {
    font-size: 16px;
  }
</style>

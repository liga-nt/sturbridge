<script>
  import { renderMath } from '$lib/utils/math.js';

  export let question_text = '';
  export let instruction2 = '';
  export let tiles = [];
  export let rows = [];
  export let correct_answer = {};  // eslint-disable-line no-unused-vars

  // ── Drag-and-drop state ──────────────────────────────────────────────
  let placed = {};       // { slotId: tileValue }
  let draggingTile = null;

  $: bankTiles = tiles.filter(t => !Object.values(placed).includes(t));

  function tileDragStart(e, tile) {
    draggingTile = tile;
    e.dataTransfer.setData('text/plain', tile);
    e.dataTransfer.effectAllowed = 'move';
  }

  function slotTileDragStart(e, tile, slotId) {
    draggingTile = tile;
    e.dataTransfer.setData('text/plain', tile);
    e.dataTransfer.effectAllowed = 'move';
    // Remove from slot immediately so it appears to lift out
    const p = { ...placed };
    delete p[slotId];
    placed = p;
  }

  function slotDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function slotDrop(e, slotId) {
    e.preventDefault();
    const tile = e.dataTransfer.getData('text/plain') || draggingTile;
    if (!tile) return;
    placed = { ...placed, [slotId]: tile };
    draggingTile = null;
  }

  function bankDragOver(e) { e.preventDefault(); }

  function bankDrop(e) {
    e.preventDefault();
    // Tile stays in bank (already removed from placed in slotTileDragStart)
    draggingTile = null;
  }

  function dragEnd() { draggingTile = null; }

  function removeFromSlot(slotId) {
    const p = { ...placed };
    delete p[slotId];
    placed = p;
  }
</script>

<div class="question-body">
  {#if question_text}
    <p class="q-text">{@html renderMath(question_text)}</p>
  {/if}
  {#if instruction2}
    <p class="q-text">{@html instruction2}</p>
  {/if}

  <!-- Tile bank -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="tile-bank"
    on:dragover={bankDragOver}
    on:drop={bankDrop}
  >
    {#each bankTiles as tile (tile)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="tile"
        draggable="true"
        on:dragstart={(e) => tileDragStart(e, tile)}
        on:dragend={dragEnd}
      >{tile}</div>
    {/each}
    <!-- Placeholder so bank area keeps height when all tiles are placed -->
    {#if bankTiles.length === 0}
      <div class="tile-bank-empty"></div>
    {/if}
  </div>

  <!-- Inequality rows -->
  <div class="inequalities">
    {#each rows as row}
      <div class="ineq-row">
        <span class="ineq-fixed">{row.left}</span>
        <span class="ineq-op">{row.op}</span>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="ineq-blank"
          class:has-tile={!!placed[row.id]}
          on:dragover={slotDragOver}
          on:drop={(e) => slotDrop(e, row.id)}
        >
          {#if placed[row.id]}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="placed-tile"
              draggable="true"
              on:dragstart={(e) => slotTileDragStart(e, placed[row.id], row.id)}
              on:dragend={dragEnd}
              on:click={() => removeFromSlot(row.id)}
            >{placed[row.id]}</div>
          {/if}
        </div>
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

  /* Tile bank */
  .tile-bank {
    display: flex;
    flex-direction: row;
    gap: 0;
    margin: 12px 0 20px;
    min-height: 34px;
  }

  .tile-bank-empty {
    width: 46px;
    height: 30px;
  }

  .tile {
    border: 1px solid #000;
    padding: 5px 10px;
    font-size: 16px;
    line-height: 20px;
    min-width: 46px;
    text-align: center;
    background: #fff;
    cursor: grab;
    user-select: none;
  }
  .tile:active { cursor: grabbing; }

  /* Inequality rows */
  .inequalities {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-left: auto;
    margin-right: auto;
    width: fit-content;
    align-items: flex-end;
  }

  .ineq-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }

  .ineq-fixed {
    font-size: 16px;
    min-width: 36px;
    text-align: right;
  }

  .ineq-op {
    font-size: 16px;
    width: 14px;
    text-align: center;
  }

  /* Drop slot */
  .ineq-blank {
    width: 56px;
    height: 32px;
    border: 1.78px solid #555555;
    background-color: #f7f7f7;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .ineq-blank.has-tile {
    border-color: #333;
    background-color: #fff;
  }

  /* Placed tile inside a slot */
  .placed-tile {
    font-size: 15px;
    cursor: grab;
    user-select: none;
    padding: 0 4px;
    text-align: center;
    width: 100%;
    text-align: center;
  }
  .placed-tile:active { cursor: grabbing; }
</style>

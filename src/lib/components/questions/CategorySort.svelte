<script>
  import { renderMath } from '$lib/utils/math.js';
  import SymmetryFigure from '$lib/components/questions/stimuli/SymmetryFigure.svelte';

  export let question_text;
  export let tiles = [];
  // tiles can be strings OR objects: { label, shape: { shape, padding } }
  export let categories = []; // [{label, correct_tiles:[string|object]}]
  export let value = null;

  function isShapeTile(tile) {
    return typeof tile === 'object' && tile !== null && tile.shape;
  }

  function tileKey(tile) {
    return typeof tile === 'string' ? tile : tile.label ?? JSON.stringify(tile);
  }

  // ── Interactive state ────────────────────────────────────────────────────────

  // placement: { [tileKey]: categoryLabel | null }  (null = in pool)
  let placement = {};

  function initPlacement() {
    placement = {};
    for (const tile of tiles) {
      placement[tileKey(tile)] = null;
    }
  }

  // Initialise whenever tiles change, or when parent clears the answer
  $: tiles, initPlacement();
  $: if (value === null) initPlacement();

  // Selected category for click-to-assign
  let selectedCategory = null;
  let draggingKey = null;

  function selectCategory(label) {
    selectedCategory = selectedCategory === label ? null : label;
  }

  function assignTile(tile) {
    const key = tileKey(tile);
    if (placement[key] !== null) {
      placement[key] = null;
    } else {
      if (selectedCategory !== null) {
        placement[key] = selectedCategory;
      }
    }
    placement = { ...placement };
    emitValue();
  }

  function removeTileFromCategory(tile) {
    const key = tileKey(tile);
    placement[key] = null;
    placement = { ...placement };
    emitValue();
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────

  function tileDragStart(e, tile) {
    draggingKey = tileKey(tile);
    e.dataTransfer.setData('text/plain', draggingKey);
    e.dataTransfer.effectAllowed = 'move';
  }

  function placedTileDragStart(e, tile) {
    const key = tileKey(tile);
    draggingKey = key;
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
    // Remove from current category so it lifts out
    placement = { ...placement, [key]: null };
    emitValue();
  }

  function dragEnd() {
    draggingKey = null;
  }

  function catDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function catDrop(e, catLabel) {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain') || draggingKey;
    if (!key) return;
    placement = { ...placement, [key]: catLabel };
    draggingKey = null;
    emitValue();
  }

  function poolDragOver(e) {
    e.preventDefault();
  }

  function poolDrop(e) {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain') || draggingKey;
    if (!key) return;
    placement = { ...placement, [key]: null };
    draggingKey = null;
    emitValue();
  }

  // Reactive derived lists — explicit so Svelte 5 tracks placement changes
  $: poolTiles = tiles.filter(t => placement[tileKey(t)] === null);
  $: placedByCategory = Object.fromEntries(
    categories.map(cat => [cat.label, tiles.filter(t => placement[tileKey(t)] === cat.label)])
  );

  function emitValue() {
    const obj = {};
    for (const cat of categories) {
      obj[cat.label] = tiles.filter(t => placement[tileKey(t)] === cat.label).map(tileKey).sort();
    }
    value = JSON.stringify(obj);
  }
</script>

<div class="question-body">
  <p class="q-text">{@html renderMath(question_text)}</p>

  {#if selectedCategory !== null}
    <p class="instruction">Click a tile to place it in <strong>{selectedCategory}</strong>, or click a different category.</p>
  {/if}

  <!-- Tile pool (unplaced tiles) — also a drop zone to return tiles -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="tile-bank" on:dragover|preventDefault on:drop={poolDrop}>
    {#each poolTiles as tile (tileKey(tile))}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="tile {isShapeTile(tile) ? 'tile-shape' : ''} {selectedCategory !== null ? 'tile-ready' : ''}"
        role="button"
        tabindex="0"
        draggable="true"
        on:click={() => assignTile(tile)}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && assignTile(tile)}
        on:dragstart={(e) => tileDragStart(e, tile)}
        on:dragend={dragEnd}
        title={selectedCategory !== null ? `Place in ${selectedCategory}` : 'Drag to a category or select a category first'}
      >
        {#if isShapeTile(tile)}
          <div style="pointer-events: none;"><SymmetryFigure params={tile.shape} /></div>
        {:else}
          {@html renderMath(tile)}
        {/if}
      </div>
    {/each}
    {#if poolTiles.length === 0}
      <span class="pool-empty">All tiles placed</span>
    {/if}
  </div>

  <!-- Category boxes -->
  <div class="category-row">
    {#each categories as cat}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="category-box {selectedCategory === cat.label ? 'cat-selected' : ''}"
        role="group"
        on:click={() => selectCategory(cat.label)}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectCategory(cat.label)}
        on:dragover|preventDefault={(e) => { e.dataTransfer.dropEffect = 'move'; }}
        on:drop={(e) => catDrop(e, cat.label)}
      >
        <div class="category-label" style="pointer-events: none;">{cat.label}</div>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="category-content"
          on:dragover|preventDefault={(e) => { e.dataTransfer.dropEffect = 'move'; }}
          on:drop|stopPropagation={(e) => catDrop(e, cat.label)}
        >
          {#each (placedByCategory[cat.label] ?? []) as tile (tileKey(tile))}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="tile tile-placed {isShapeTile(tile) ? 'tile-shape' : ''}"
              role="button"
              tabindex="0"
              draggable="true"
              style="pointer-events: auto;"
              on:click|stopPropagation={() => removeTileFromCategory(tile)}
              on:keydown|stopPropagation={(e) => (e.key === 'Enter' || e.key === ' ') && removeTileFromCategory(tile)}
              on:dragstart={(e) => placedTileDragStart(e, tile)}
              on:dragend={dragEnd}
              on:dragover|preventDefault|stopPropagation={(e) => { e.dataTransfer.dropEffect = 'move'; }}
              on:drop|stopPropagation={(e) => catDrop(e, cat.label)}
            >
              {#if isShapeTile(tile)}
                <div style="pointer-events: none;"><SymmetryFigure params={tile.shape} /></div>
              {:else}
                {@html renderMath(typeof tile === 'string' ? tile : tile.text ?? '')}
              {/if}
            </div>
          {/each}
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

  .instruction {
    font-size: 13px;
    color: #555;
    margin: 0 0 10px;
    font-style: italic;
  }

  /* Tile bank — horizontal row of clickable tiles */
  .tile-bank {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
    min-height: 52px;
    align-items: center;
  }

  .pool-empty {
    font-size: 13px;
    color: #888;
    font-style: italic;
  }

  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 36px;
    padding: 0 8px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #fff;
    font-size: 16px;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #333;
    cursor: pointer;
    user-select: none;
  }

  .tile:hover {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .tile-ready {
    border-color: #2563eb;
    background: #dbeafe;
  }

  .tile-shape {
    height: auto;
    padding: 6px;
  }

  /* Category boxes row */
  .category-row {
    display: flex;
    gap: 0;
  }

  .category-box {
    border: 2px solid #555;
    width: 140px;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    background: #fafafa;
    box-sizing: border-box;
    user-select: none;
  }

  /* Separator between adjacent boxes: collapse the shared border */
  .category-box + .category-box {
    border-left: none;
  }

  .category-box:hover {
    background: #f0f4ff;
  }

  .cat-selected {
    border-color: #2563eb;
    background: #eff6ff;
    box-shadow: inset 0 0 0 1px #2563eb;
  }

  .cat-selected + .category-box {
    border-left: none;
  }

  .category-label {
    font-weight: bold;
    font-size: 16px;
    text-align: center;
    padding: 6px 4px 4px;
    border-bottom: 1px solid #555;
    pointer-events: none;
  }

  .category-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 6px;
  }

  .tile-placed {
    width: 90%;
    justify-content: center;
  }
</style>

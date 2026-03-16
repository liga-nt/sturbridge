<script>
  import { renderMath } from '$lib/utils/math.js';
  import SymmetryFigure from '$lib/components/questions/stimuli/SymmetryFigure.svelte';

  export let question_text;
  export let tiles = [];
  // tiles can be strings OR objects: { text } | { shape: { type, ... }, label }
  export let categories = []; // [{label, correct_tiles:[string|object]}]

  function isShapeTile(tile) {
    return typeof tile === 'object' && tile !== null && tile.shape;
  }

  function tileKey(tile) {
    return typeof tile === 'string' ? tile : tile.label ?? JSON.stringify(tile);
  }
</script>

<div class="question-body">
  <p class="q-text">{@html renderMath(question_text)}</p>

  <!-- Tile bank -->
  <div class="tile-bank">
    {#each tiles as tile}
      <div class="tile {isShapeTile(tile) ? 'tile-shape' : ''}">
        {#if isShapeTile(tile)}
          <SymmetryFigure params={tile.shape} />
        {:else}
          {@html renderMath(tile)}
        {/if}
      </div>
    {/each}
  </div>

  <!-- Category boxes -->
  <div class="category-row">
    {#each categories as cat}
      <div class="category-box">
        <div class="category-label">{cat.label}</div>
        <div class="category-content">
          {#each cat.correct_tiles as tile}
            <div class="tile tile-placed {isShapeTile(tile) ? 'tile-shape' : ''}">
              {#if isShapeTile(tile)}
                <SymmetryFigure params={tile.shape} />
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

  /* Tile bank — horizontal row of draggable-style tiles */
  .tile-bank {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
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
    cursor: default;
    user-select: none;
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
    border: 1px solid #555;
    width: 140px;
    min-height: 160px;
    display: flex;
    flex-direction: column;
  }

  /* Separator between adjacent boxes: collapse the shared border */
  .category-box + .category-box {
    border-left: none;
  }

  .category-label {
    font-weight: bold;
    font-size: 16px;
    text-align: center;
    padding: 6px 4px 4px;
    border-bottom: 1px solid #555;
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

<script>
  import { renderMath } from '$lib/utils/math.js';

  // Instruction text (two lines in TestNav)
  export let question_text = '';
  export let instruction = '';

  // Tiles available to drag
  export let tiles = [];

  // Rows: each row has a division equation and 3 answer slots for the multiplication fact
  // { division: "36 ÷ p = 4", slots: ["p", "4", "36"] }
  export let rows = [];
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
    {#each tiles as tile}
      <div class="tile">{tile}</div>
    {/each}
  </div>

  <!-- Equation rows -->
  <div class="equation-rows">
    {#each rows as row}
      <div class="eq-row">
        <span class="division-eq">{@html renderMath(row.division)}</span>
        <span class="fact-label">has a related multiplication fact of</span>
        <span class="slot">{row.slots[0]}</span>
        <span class="op">×</span>
        <span class="slot">{row.slots[1]}</span>
        <span class="op">=</span>
        <span class="slot">{row.slots[2]}</span>
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
    cursor: default;
    user-select: none;
    border-radius: 2px;
    margin-right: 4px;
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
  }

  .op {
    font-size: 16px;
  }
</style>

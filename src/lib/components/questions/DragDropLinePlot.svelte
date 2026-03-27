<script>
  import { renderMath } from '$lib/utils/math.js';

  export let stimulus_intro = null;
  export let question_text = '';
  export let math_expression = null;
  export let stimulus_params = {};
  export let value = null;

  const {
    title = '',
    axis_label = '',
    min = 0,
    max = 3,
    denominator = 4,
    data_points = [],
    missing_label = null,
  } = stimulus_params;

  // Layout constants (px)
  const TICK_W = 34;   // column width per quarter step
  const BOX_W  = 26;   // box width
  const BOX_H  = 26;   // box height

  // Generate tick descriptors: 0, ¼, ½, … up to max
  const numSteps = (max - min) * denominator;
  const ticks = Array.from({ length: numSteps + 1 }, (_, i) => {
    const totalParts = min * denominator + i;
    const whole = Math.floor(totalParts / denominator);
    const rem   = totalParts % denominator;
    let label;
    if (rem === 0)      label = String(whole);
    else if (whole === 0) label = `[${rem}/${denominator}]`;
    else                  label = `${whole}[${rem}/${denominator}]`;
    return { step: i, floatVal: min + i / denominator, label, isWhole: rem === 0 };
  });

  const maxCount = data_points.length > 0 ? Math.max(...data_points.map(d => d.count)) : 1;
  const ROWS = maxCount + 1;  // one spare row above the tallest column

  // How many Xs are pre-placed in a given tick column
  function getPrePlaced(label) {
    const dp = data_points.find(d => d.label === label);
    if (!dp) return 0;
    return label === missing_label ? dp.count - 1 : dp.count;
  }

  // ── Drag state ───────────────────────────────────────────────────────────────
  let dragging    = false;
  let droppedCol  = null;   // column index where the X was dropped
  let hoveredCol  = null;

  function onTileDragStart(e) {
    dragging = true;
    e.dataTransfer.setData('text/plain', 'X');
    e.dataTransfer.effectAllowed = 'move';
  }

  function onTileDragEnd() { dragging = false; }

  function onColDragOver(e, colIdx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    hoveredCol = colIdx;
  }

  function onColDragLeave(e, colIdx) {
    // Only clear if we're actually leaving this column (not entering a child)
    if (hoveredCol === colIdx) hoveredCol = null;
  }

  function onColDrop(e, colIdx) {
    e.preventDefault();
    droppedCol  = colIdx;
    hoveredCol  = null;
    dragging    = false;
    value = ticks[colIdx].label;
  }

  function onPoolDragOver(e)  { e.preventDefault(); }

  function onPoolDrop(e) {
    e.preventDefault();
    droppedCol = null;
    hoveredCol = null;
    value      = null;
  }

  // ── SVG number line constants ────────────────────────────────────────────────
  const SVG_W  = ticks.length * TICK_W;   // exactly matches grid width
  const SVG_H  = 52;
  const LINE_Y = 12;

  function tickX(i) { return i * TICK_W + TICK_W / 2; }

  // Arrowhead tips extend 12 px past the outermost tick centres
  const arrowL = tickX(0) - 20;
  const arrowR = tickX(ticks.length - 1) + 20;
</script>

<div class="question-body">
  {#if stimulus_intro}
    <p class="q-text">{stimulus_intro}</p>
  {/if}

  {#if math_expression}
    <div class="math-list">
      <p>{@html renderMath(math_expression)}</p>
    </div>
  {/if}

  {#if question_text}
    {#each question_text.split('\n\n') as para}
      <p class="q-text">{@html renderMath(para)}</p>
    {/each}
  {/if}

  <!-- X tile pool (also a drop zone to return the X) -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="x-pool" on:dragover={onPoolDragOver} on:drop={onPoolDrop}>
    {#if droppedCol === null}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="x-tile"
        draggable="true"
        on:dragstart={onTileDragStart}
        on:dragend={onTileDragEnd}
      >X</div>
    {:else}
      <div class="x-tile-placeholder"></div>
    {/if}
  </div>

  <!-- Plot: title + grid + axis -->
  <div class="plot-outer">
    {#if title}
      <p class="plot-title">{title}</p>
    {/if}

    <div class="plot-inner">
      <!-- Grid of boxes: ROWS rows × ticks.length columns -->
      <div class="grid-row">
        {#each ticks as tick, colIdx}
          {@const prePlaced = getPrePlaced(tick.label)}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="grid-col"
            on:dragover={(e) => onColDragOver(e, colIdx)}
            on:dragleave={(e) => onColDragLeave(e, colIdx)}
            on:drop={(e) => onColDrop(e, colIdx)}
          >
            {#each Array(ROWS) as _, rowIdx}
              {@const rowFromBottom = ROWS - 1 - rowIdx}
              {@const isFilled   = rowFromBottom < prePlaced}
              {@const isDropped  = droppedCol === colIdx && rowFromBottom === prePlaced}
              {@const isHovered  = hoveredCol === colIdx && droppedCol === null && rowFromBottom === prePlaced}
              <div
                class="box"
                class:box-filled={isFilled}
                class:box-dropped={isDropped}
                class:box-hovered={isHovered}
              >{#if isFilled || isDropped}X{/if}</div>
            {/each}
          </div>
        {/each}
      </div>

      <!-- Number line SVG (same width as grid, overflow:visible for arrowheads) -->
      <svg
        width={SVG_W}
        height={SVG_H}
        viewBox="0 0 {SVG_W} {SVG_H}"
        style="overflow:visible;display:block;"
        aria-hidden="true"
      >
        <!-- Horizontal line -->
        <line x1={arrowL + 8} y1={LINE_Y} x2={arrowR - 8} y2={LINE_Y}
          stroke="#333" stroke-width="1.5" />
        <!-- Left arrowhead -->
        <polygon points="{arrowL},{LINE_Y} {arrowL+8},{LINE_Y-5} {arrowL+8},{LINE_Y+5}" fill="#333" />
        <!-- Right arrowhead -->
        <polygon points="{arrowR},{LINE_Y} {arrowR-8},{LINE_Y-5} {arrowR-8},{LINE_Y+5}" fill="#333" />

        {#each ticks as tick, i}
          {@const x = tickX(i)}
          {@const tH = tick.isWhole ? 8 : 5}
          <line x1={x} y1={LINE_Y - tH} x2={x} y2={LINE_Y + tH}
            stroke="#333" stroke-width={tick.isWhole ? 1.5 : 1} />
          {#if tick.isWhole}
            <text x={x} y={LINE_Y + 26}
              text-anchor="middle"
              font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
              font-size="14" fill="#333"
            >{tick.floatVal}</text>
          {/if}
        {/each}
      </svg>

      {#if axis_label}
        <p class="axis-label">{axis_label}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .question-body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333;
    background: #fff;
    padding: 16px;
    max-width: 640px;
  }

  .q-text { margin: 0 0 10px; }

  .math-list {
    border: 1px solid #555;
    display: inline-block;
    padding: 6px 18px;
    margin: 0 0 12px;
  }
  .math-list p { margin: 0; }

  /* X pool */
  .x-pool {
    margin-bottom: 10px;
    min-height: 34px;
    display: flex;
    align-items: center;
  }

  .x-tile {
    width: 28px;
    height: 28px;
    border: 1px solid #333;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 15px;
    cursor: grab;
    background: #fff;
    user-select: none;
    box-sizing: border-box;
  }
  .x-tile:active { cursor: grabbing; }

  .x-tile-placeholder {
    width: 28px;
    height: 28px;
  }

  /* Plot layout */
  .plot-outer {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .plot-title {
    font-weight: bold;
    font-size: 16px;
    text-align: center;
    margin: 0 0 6px;
  }

  .plot-inner {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
  }

  /* Grid */
  .grid-row {
    display: flex;
    flex-direction: row;
  }

  .grid-col {
    width: 34px;         /* TICK_W */
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* Individual boxes */
  .box {
    width: 26px;         /* BOX_W */
    height: 26px;        /* BOX_H */
    border: 1px solid #bbb;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 13px;
    color: #333;
    box-sizing: border-box;
    background: #fff;
    flex-shrink: 0;
  }

  .box-filled  { border-color: #555; }
  .box-dropped { border-color: #555; }
  .box-hovered { background: #d0e8ff; border-color: #3b81c9; border-style: dashed; }

  /* Axis label below SVG */
  .axis-label {
    font-size: 14px;
    text-align: center;
    margin: 6px 0 0;
    width: 100%;
  }
</style>

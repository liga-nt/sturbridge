<script>
  // params: {
  //   shaded: number of shaded cells (0–100), top-left row by row
  //   show_whole: boolean — if true, show a second fully-shaded grid labeled "represents 1 whole"
  //   cell_size: optional cell size in px (default 20)
  // }
  export let params = {};

  const cellSize = params.cell_size ?? 20;
  const shaded = Math.min(100, Math.max(0, params.shaded ?? 0));
  const showWhole = params.show_whole ?? true;

  const COLS = 10;
  const ROWS = 10;
  const gridSize = COLS * cellSize; // 200px by default

  // Color matching TestNav screenshots: medium gray fill for shaded cells
  const SHADED_FILL = '#b0b0b0';
  const UNSHADED_FILL = '#ffffff';
  const STROKE = '#666666';
  const STROKE_WIDTH = 0.5;
  const OUTER_STROKE_WIDTH = 1.5;

  function isShaded(row, col, count) {
    const idx = row * COLS + col;
    return idx < count;
  }
</script>

<div class="decimal-grid-wrapper">
  <!-- Left grid: the decimal being represented -->
  <svg
    width={gridSize + OUTER_STROKE_WIDTH}
    height={gridSize + OUTER_STROKE_WIDTH}
    viewBox={`0 0 ${gridSize + OUTER_STROKE_WIDTH} ${gridSize + OUTER_STROKE_WIDTH}`}
    aria-label={`10 by 10 grid with ${shaded} cells shaded`}
    role="img"
    style="display:block;"
  >
    {#each Array(ROWS) as _, row}
      {#each Array(COLS) as _, col}
        <rect
          x={col * cellSize + OUTER_STROKE_WIDTH / 2}
          y={row * cellSize + OUTER_STROKE_WIDTH / 2}
          width={cellSize}
          height={cellSize}
          fill={isShaded(row, col, shaded) ? SHADED_FILL : UNSHADED_FILL}
          stroke={STROKE}
          stroke-width={STROKE_WIDTH}
        />
      {/each}
    {/each}
    <!-- Outer border on top of everything -->
    <rect
      x={OUTER_STROKE_WIDTH / 2}
      y={OUTER_STROKE_WIDTH / 2}
      width={gridSize}
      height={gridSize}
      fill="none"
      stroke="#333333"
      stroke-width={OUTER_STROKE_WIDTH}
    />
  </svg>

  {#if showWhole}
    <!-- Right grid: "represents 1 whole" — fully shaded, inside a labeled box -->
    <div class="whole-box">
      <svg
        width={gridSize + OUTER_STROKE_WIDTH}
        height={gridSize + OUTER_STROKE_WIDTH}
        viewBox={`0 0 ${gridSize + OUTER_STROKE_WIDTH} ${gridSize + OUTER_STROKE_WIDTH}`}
        aria-label="10 by 10 grid fully shaded representing 1 whole"
        role="img"
        style="display:block;"
      >
        {#each Array(ROWS) as _, row}
          {#each Array(COLS) as _, col}
            <rect
              x={col * cellSize + OUTER_STROKE_WIDTH / 2}
              y={row * cellSize + OUTER_STROKE_WIDTH / 2}
              width={cellSize}
              height={cellSize}
              fill={SHADED_FILL}
              stroke={STROKE}
              stroke-width={STROKE_WIDTH}
            />
          {/each}
        {/each}
        <rect
          x={OUTER_STROKE_WIDTH / 2}
          y={OUTER_STROKE_WIDTH / 2}
          width={gridSize}
          height={gridSize}
          fill="none"
          stroke="#333333"
          stroke-width={OUTER_STROKE_WIDTH}
        />
      </svg>
      <span class="whole-label">represents 1 whole</span>
    </div>
  {/if}
</div>

<style>
  .decimal-grid-wrapper {
    display: flex;
    align-items: center;
    gap: 24px;
    justify-content: center;
    margin: 12px 0;
  }

  .whole-box {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid #999;
    padding: 8px 12px;
    background: #fff;
  }

  .whole-label {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    color: #333;
    white-space: nowrap;
  }
</style>

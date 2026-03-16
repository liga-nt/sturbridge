<script>
  // params: { steps: number, square_unit: string, triangle_unit: string }
  // Draws a growing pattern where each step has N squares and 2N triangles.
  // Each "unit cell" is a square with an upward triangle on top and a downward triangle below.
  export let params;

  const steps = params?.steps ?? 3;

  // Layout constants
  const cellSize = 36;      // square side length
  const triH = 18;          // triangle height
  const pad = 10;           // horizontal padding between steps
  const labelH = 20;        // space above for step label
  const margin = 12;        // left/right outer margin

  // Total height per step: tri + square + tri
  const unitH = triH + cellSize + triH;
  const svgH = labelH + unitH + 10; // +10 bottom padding

  // Compute step layouts
  function getSteps() {
    const result = [];
    let x = margin;
    for (let s = 1; s <= steps; s++) {
      result.push({ step: s, x, n: s });
      x += s * cellSize + pad;
    }
    return result;
  }

  const stepData = getSteps();
  const totalW = stepData.reduce((acc, sd) => Math.max(acc, sd.x + sd.n * cellSize + margin), 0);

  // Build path for one unit cell (square + top tri + bottom tri) at (cx, cy)
  // cx = left edge of square, cy = top of square
  function unitPaths(cx, cy) {
    const sq = `M${cx},${cy} h${cellSize} v${cellSize} h${-cellSize} Z`;
    // upward triangle: base = top edge of square
    const tx = cx + cellSize / 2;
    const triTop = `M${cx},${cy} L${cx + cellSize},${cy} L${tx},${cy - triH} Z`;
    // downward triangle: base = bottom edge of square
    const triBot = `M${cx},${cy + cellSize} L${cx + cellSize},${cy + cellSize} L${tx},${cy + cellSize + triH} Z`;
    return [sq, triTop, triBot];
  }
</script>

<div class="step-pattern">
  <svg width={totalW} height={svgH} viewBox="0 0 {totalW} {svgH}">
    {#each stepData as sd}
      <!-- Step label -->
      <text
        x={sd.x + (sd.n * cellSize) / 2}
        y={labelH - 4}
        text-anchor="middle"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="13"
        font-weight="bold"
        fill="#333"
      >Step {sd.step}</text>

      <!-- Unit cells -->
      {#each Array(sd.n) as _, i}
        {@const cx = sd.x + i * cellSize}
        {@const cy = labelH + triH}
        {#each unitPaths(cx, cy) as d}
          <path {d} fill="white" stroke="#333" stroke-width="1.5" />
        {/each}
      {/each}
    {/each}
  </svg>
</div>

<style>
  .step-pattern {
    display: flex;
    justify-content: center;
    margin: 8px 0 12px;
  }
  svg {
    overflow: visible;
  }
</style>

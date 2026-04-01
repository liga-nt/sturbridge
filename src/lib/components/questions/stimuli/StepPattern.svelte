<script>
  // params: {
  //   steps: number,
  //   variant: 'square_center' (default) | 'triangle_center'
  // }
  // 'square_center': each unit = 1 square + 2 triangles (up and down)
  // 'triangle_center': each unit = 1 triangle (center) + 2 squares (top and bottom)
  export let params;

  const steps = params?.steps ?? 3;
  const variant = params?.variant ?? 'square_center';

  // Shared layout constants
  const pad    = 10;    // horizontal gap between steps
  const labelH = 20;   // space above for step label
  const margin = 12;   // left/right outer margin

  // square_center constants
  const sc_cellSize = 36;
  const sc_triH     = 18;
  const sc_unitH    = sc_triH + sc_cellSize + sc_triH;

  // triangle_center constants
  const tc_squareSide = 30;   // top/bottom square side
  const tc_triH       = 22;   // center triangle height
  const tc_unitH      = tc_squareSide + tc_triH + tc_squareSide;

  const unitH    = variant === 'triangle_center' ? tc_unitH    : sc_unitH;
  const cellSize = variant === 'triangle_center' ? tc_squareSide : sc_cellSize;

  const svgH = labelH + unitH + 10;

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

  // square_center unit: [up-tri][square][down-tri]
  function unitPathsSquareCenter(cx, cy) {
    const sq = `M${cx},${cy} h${sc_cellSize} v${sc_cellSize} h${-sc_cellSize} Z`;
    const tx = cx + sc_cellSize / 2;
    const triTop = `M${cx},${cy} L${cx + sc_cellSize},${cy} L${tx},${cy - sc_triH} Z`;
    const triBot = `M${cx},${cy + sc_cellSize} L${cx + sc_cellSize},${cy + sc_cellSize} L${tx},${cy + sc_cellSize + sc_triH} Z`;
    return [sq, triTop, triBot];
  }

  // triangle_center unit: [top-square][down-triangle][bottom-square]
  function unitPathsTriCenter(cx, cy) {
    const s = tc_squareSide;
    const h = tc_triH;
    const topSq = `M${cx},${cy} h${s} v${s} h${-s} Z`;
    // downward-pointing triangle: base at bottom of top square, apex at bottom
    const tx = cx + s / 2;
    const tri = `M${cx},${cy + s} L${cx + s},${cy + s} L${tx},${cy + s + h} Z`;
    const botSq = `M${cx},${cy + s + h} h${s} v${s} h${-s} Z`;
    return [topSq, tri, botSq];
  }

  function unitPaths(cx, cy) {
    const cy0 = labelH + (variant === 'triangle_center' ? 0 : sc_triH);
    if (variant === 'triangle_center') return unitPathsTriCenter(cx, cy0);
    return unitPathsSquareCenter(cx, cy0);
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
        {#each unitPaths(cx, 0) as d}
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

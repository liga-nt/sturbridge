<script>
  export let params;  // { viewBox, triangles: [{id, label, points, right_angle?}] }

  function polyStr(pts) {
    return pts.map(p => p.join(',')).join(' ');
  }

  function centroid(pts) {
    return {
      x: pts.reduce((s, p) => s + p[0], 0) / pts.length,
      y: pts.reduce((s, p) => s + p[1], 0) / pts.length
    };
  }

  // Build an SVG path for a right-angle square marker at the given corner vertex.
  // Walks the two adjacent edges to find the perpendicular directions.
  function rightAnglePath(pts, corner) {
    const ci = pts.findIndex(p => p[0] === corner[0] && p[1] === corner[1]);
    if (ci === -1) return null;
    const prev = pts[(ci - 1 + pts.length) % pts.length];
    const next = pts[(ci + 1) % pts.length];
    const s = 7; // marker size in SVG units

    const dx1 = prev[0] - corner[0], dy1 = prev[1] - corner[1];
    const dx2 = next[0] - corner[0], dy2 = next[1] - corner[1];
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    const ux1 = dx1 / len1, uy1 = dy1 / len1;
    const ux2 = dx2 / len2, uy2 = dy2 / len2;

    const p1 = [corner[0] + ux1 * s, corner[1] + uy1 * s];
    const pm = [corner[0] + ux1 * s + ux2 * s, corner[1] + uy1 * s + uy2 * s];
    const p2 = [corner[0] + ux2 * s, corner[1] + uy2 * s];

    return `M${p1[0].toFixed(2)},${p1[1].toFixed(2)} L${pm[0].toFixed(2)},${pm[1].toFixed(2)} L${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }

  $: vbWidth = params.viewBox.split(' ')[2] || 413;
</script>

<svg
  viewBox={params.viewBox}
  width={vbWidth}
  style="max-width:100%; display:block;"
  xmlns="http://www.w3.org/2000/svg"
>
  {#each params.triangles as tri}
    {@const c = centroid(tri.points)}

    <polygon
      points={polyStr(tri.points)}
      fill="white"
      stroke="#000000"
      stroke-width="1"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    {#if tri.right_angle}
      {@const rpath = rightAnglePath(tri.points, tri.right_angle)}
      {#if rpath}
        <path d={rpath} fill="none" stroke="#000000" stroke-width="1" />
      {/if}
    {/if}

    <text
      x={c.x} y={c.y}
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
      font-size="13"
      fill="#222"
    >
      {tri.label}
    </text>
  {/each}
</svg>

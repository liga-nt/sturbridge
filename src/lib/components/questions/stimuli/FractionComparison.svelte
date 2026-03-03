<script>
  // Renders two fraction models side-by-side with a comparison operator.
  // Each model is parametric — the component owns all geometry.
  //
  // Props:
  //   left/right: { type: "circle"|"rect", numerator, denominator,
  //                 orientation?: "h"|"v",   // rect only (default "h")
  //                 rows?: number,            // extra rows ("h") or cols ("v"), default 1
  //                 size?: number }           // scale factor (default 1.0)
  //   operator: "<" | ">" | "="
  //
  // Grid shading rule:
  //   "h" + rows=n: each of the n rows shades its leftmost `numerator` columns
  //   "v" + rows=n: each of the n columns shades its topmost `numerator` rows

  export let left;
  export let operator;
  export let right;

  // ── Colours ─────────────────────────────────────────────────────────
  const FILL   = '#4a90d9';
  const STROKE = '#333';
  const BG     = '#fff';

  // ── Standard model dimensions (at size=1) ───────────────────────────
  const BASE_R    = 42;   // circle radius
  const BASE_RW   = 88;   // rect width  (horizontal orientation)
  const BASE_RH   = 60;   // rect height (horizontal orientation)
  // vertical rect swaps width ↔ height: 60 wide × 88 tall

  // ── Geometry helpers ─────────────────────────────────────────────────
  function scale(m) { return m.size ?? 1; }
  function isVert(m) { return m.orientation === 'v'; }

  function mW(m) {
    if (m.type === 'circle') return BASE_R * 2 * scale(m);
    const rows = m.rows ?? 1;
    // "h": rows stacked vertically → width stays BASE_RW, height grows
    // "v": rows placed side-by-side → width grows, height stays BASE_RW
    return (isVert(m) ? BASE_RH * rows : BASE_RW) * scale(m);
  }
  function mH(m) {
    if (m.type === 'circle') return BASE_R * 2 * scale(m);
    const rows = m.rows ?? 1;
    return (isVert(m) ? BASE_RW : BASE_RH * rows) * scale(m);
  }

  // ── SVG layout ───────────────────────────────────────────────────────
  const PAD  = 10;
  const OP_W = 26;

  $: lW = mW(left);
  $: rW = mW(right);
  $: lH = mH(left);
  $: rH = mH(right);
  $: svgW = PAD + lW + PAD + OP_W + PAD + rW + PAD;
  $: svgH = Math.max(lH, rH) + PAD * 2;

  $: lCX = PAD + lW / 2;
  $: lCY = svgH / 2;
  $: rCX = PAD + lW + PAD + OP_W + PAD + rW / 2;
  $: rCY = svgH / 2;
  $: opX = PAD + lW + PAD + OP_W / 2;
  $: opY = svgH / 2;

  // ── Circle sector paths ──────────────────────────────────────────────
  function polar(cx, cy, r, deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function sectorPath(cx, cy, r, a0, a1) {
    const s = polar(cx, cy, r, a0);
    const e = polar(cx, cy, r, a1);
    const large = (a1 - a0) > 180 ? 1 : 0;
    return `M${cx},${cy} L${s.x.toFixed(2)},${s.y.toFixed(2)} A${r},${r} 0 ${large},1 ${e.x.toFixed(2)},${e.y.toFixed(2)} Z`;
  }

  function buildSectors(m, cx, cy) {
    const r   = BASE_R * scale(m);
    const step = 360 / m.denominator;
    return Array.from({ length: m.denominator }, (_, i) => ({
      d:      sectorPath(cx, cy, r, -(i + 1) * step, -i * step),
      shaded: i < m.numerator,
      r,
    }));
  }

  // ── Rectangle grid ───────────────────────────────────────────────────
  // "h" orientation + rows=r: r rows × denominator cols; shade left `numerator` cols per row
  // "v" orientation + rows=r: denominator rows × r cols; shade top `numerator` rows per col
  function buildGrid(m, cx, cy) {
    const w  = mW(m);
    const h  = mH(m);
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    const n  = m.denominator;
    const r  = m.rows ?? 1;
    const cells = [];
    if (!isVert(m)) {
      // "h": n cols × r rows. Shade sequentially column-major (fill col 0 top→bottom, then col 1, …)
      const cw = w / n, ch = h / r;
      let count = 0;
      for (let col = 0; col < n; col++)
        for (let row = 0; row < r; row++)
          cells.push({ x: x0 + col * cw, y: y0 + row * ch, w: cw, h: ch, shaded: count++ < m.numerator });
    } else {
      // "v": r cols × n rows. Shade sequentially row-major (fill row 0 left→right, then row 1, …)
      const cw = w / r, ch = h / n;
      let count = 0;
      for (let row = 0; row < n; row++)
        for (let col = 0; col < r; col++)
          cells.push({ x: x0 + col * cw, y: y0 + row * ch, w: cw, h: ch, shaded: count++ < m.numerator });
    }
    return cells;
  }

  // ── Reactive draw data ───────────────────────────────────────────────
  $: lSectors = left.type  === 'circle' ? buildSectors(left,  lCX, lCY) : [];
  $: rSectors = right.type === 'circle' ? buildSectors(right, rCX, rCY) : [];
  $: lCells   = left.type  !== 'circle' ? buildGrid(left,     lCX, lCY) : [];
  $: rCells   = right.type !== 'circle' ? buildGrid(right,    rCX, rCY) : [];
  $: lR = BASE_R * scale(left);
  $: rR = BASE_R * scale(right);
</script>

<svg
  width={svgW}
  height={svgH}
  viewBox="0 0 {svgW} {svgH}"
  style="display:block;"
  aria-hidden="true"
>
  <!-- ── Left model ── -->
  {#if left.type === 'circle'}
    <circle cx={lCX} cy={lCY} r={lR} fill={BG} stroke={STROKE} stroke-width="1.5" />
    {#each lSectors as s}
      <path d={s.d} fill={s.shaded ? FILL : BG} stroke={STROKE} stroke-width="0.75" />
    {/each}
    <circle cx={lCX} cy={lCY} r={lR} fill="none" stroke={STROKE} stroke-width="1.5" />
  {:else}
    {#each lCells as s}
      <rect x={s.x} y={s.y} width={s.w} height={s.h}
        fill={s.shaded ? FILL : BG} stroke={STROKE} stroke-width="1" />
    {/each}
  {/if}

  <!-- ── Operator ── -->
  <text
    x={opX} y={opY}
    dominant-baseline="middle"
    text-anchor="middle"
    font-size="20"
    font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    fill={STROKE}
  >{operator}</text>

  <!-- ── Right model ── -->
  {#if right.type === 'circle'}
    <circle cx={rCX} cy={rCY} r={rR} fill={BG} stroke={STROKE} stroke-width="1.5" />
    {#each rSectors as s}
      <path d={s.d} fill={s.shaded ? FILL : BG} stroke={STROKE} stroke-width="0.75" />
    {/each}
    <circle cx={rCX} cy={rCY} r={rR} fill="none" stroke={STROKE} stroke-width="1.5" />
  {:else}
    {#each rCells as s}
      <rect x={s.x} y={s.y} width={s.w} height={s.h}
        fill={s.shaded ? FILL : BG} stroke={STROKE} stroke-width="1" />
    {/each}
  {/if}
</svg>

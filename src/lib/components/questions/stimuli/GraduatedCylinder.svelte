<script>
  // Parametric graduated cylinder (measuring container) stimulus.
  // stimulus_params: {
  //   min:      number,   -- bottom of scale (usually 0)
  //   max:      number,   -- top of scale
  //   interval: number,   -- spacing between labeled tick marks (e.g. 5)
  //   value:    number,   -- liquid level to show (shaded fill up to this value)
  //   unit:     string,   -- label unit string shown next to the top tick (e.g. "liters")
  //   label?:   string,   -- optional title above the cylinder
  // }
  export let params;

  const {
    min      = 0,
    max      = 20,
    interval = 5,
    value    = 8,
    unit     = 'liters',
    label    = null,
  } = params;

  // ── Layout constants ─────────────────────────────────────────────────────────
  // The container body is a plain rectangle (matching the TestNav fuel-can image).
  const BODY_LEFT   = 52;   // left edge of container body
  const BODY_RIGHT  = 148;  // right edge
  const BODY_W      = BODY_RIGHT - BODY_LEFT;  // 96px

  const BODY_TOP    = 18;   // y of the max-scale line
  const BODY_BOTTOM = 188;  // y of the min-scale line (container floor)
  const BODY_H      = BODY_BOTTOM - BODY_TOP;  // 170px

  // Small spout/nozzle rectangle at top-right (decorative, like the TestNav image)
  const NOZZLE_W    = 22;
  const NOZZLE_H    = 28;
  const NOZZLE_LEFT = BODY_RIGHT - NOZZLE_W;
  const NOZZLE_TOP  = BODY_TOP - NOZZLE_H;

  // ── Scale helpers ──────────────────────────────────────────────────────────────
  // Convert a value on [min, max] to a y-coordinate (max is at top = BODY_TOP).
  function valToY(v) {
    return BODY_BOTTOM - ((v - min) / (max - min)) * BODY_H;
  }

  // Build tick list: every `interval` from min to max.
  const ticks = [];
  for (let v = min; v <= max; v += interval) {
    ticks.push(v);
  }

  // Liquid fill rectangle: bottom of body up to value level.
  const fillBottom = BODY_BOTTOM;
  const fillTop    = valToY(value);
  const fillH      = fillBottom - fillTop;

  // Meniscus: a gentle upward curve at the liquid surface (simulates concave meniscus).
  // Using a simple quadratic bezier that dips slightly down in the center.
  const meniscusY  = fillTop;
  const meniscusDip = 4;  // px downward at center
  const meniscusPath =
    `M ${BODY_LEFT} ${meniscusY} ` +
    `Q ${(BODY_LEFT + BODY_RIGHT) / 2} ${meniscusY + meniscusDip} ` +
    `${BODY_RIGHT} ${meniscusY}`;

  // ── Canvas size ───────────────────────────────────────────────────────────────
  const SVG_W = 210;
  const SVG_H = BODY_BOTTOM + 14 + (label ? 20 : 0);
  const labelY = label ? BODY_TOP - NOZZLE_H - 10 : 0;
</script>

<svg
  viewBox="0 0 {SVG_W} {SVG_H}"
  width={SVG_W}
  style="display:block; margin:0 auto;
         font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;"
  aria-label="Graduated cylinder showing {value} {unit}"
>
  <!-- Optional label above -->
  {#if label}
    <text
      x={SVG_W / 2}
      y={labelY}
      text-anchor="middle"
      font-size="13"
      fill="#333"
    >{label}</text>
  {/if}

  <!-- ── Liquid fill (behind container outline) ── -->
  <rect
    x={BODY_LEFT + 1.5}
    y={fillTop}
    width={BODY_W - 3}
    height={fillH}
    fill="#c8c8c8"
  />

  <!-- ── Meniscus curve on top of fill ── -->
  <path
    d={meniscusPath}
    fill="none"
    stroke="#888"
    stroke-width="1"
  />

  <!-- ── Container outline ── -->
  <!-- Main body rectangle -->
  <rect
    x={BODY_LEFT}
    y={BODY_TOP}
    width={BODY_W}
    height={BODY_H}
    fill="none"
    stroke="#555"
    stroke-width="1.5"
  />

  <!-- Nozzle / spout top-right -->
  <rect
    x={NOZZLE_LEFT}
    y={NOZZLE_TOP}
    width={NOZZLE_W}
    height={NOZZLE_H}
    fill="none"
    stroke="#555"
    stroke-width="1.5"
  />

  <!-- ── Tick marks and labels ── -->
  {#each ticks as v}
    {@const ty = valToY(v)}
    {@const isMax = v === max}
    <!-- Horizontal tick line: short line on the left wall -->
    <line
      x1={BODY_LEFT - 10}
      y1={ty}
      x2={BODY_LEFT + 14}
      y2={ty}
      stroke="#555"
      stroke-width="1.2"
    />
    <!-- Numeric label to the left -->
    <text
      x={BODY_LEFT - 13}
      y={ty}
      text-anchor="end"
      dominant-baseline="middle"
      font-size="13"
      fill="#333"
    >{v}{isMax ? '\u00a0' + unit : ''}</text>
  {/each}

  <!-- ── Bottom cap line ── -->
  <line
    x1={BODY_LEFT}
    y1={BODY_BOTTOM}
    x2={BODY_RIGHT}
    y2={BODY_BOTTOM}
    stroke="#555"
    stroke-width="2"
  />
</svg>

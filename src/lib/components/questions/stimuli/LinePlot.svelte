<script>
  // Parametric line plot (dot/X-mark chart).
  // stimulus_params: {
  //   title: string,
  //   axis_label: string,
  //   data_points: [{ label: string, count: number }, ...]
  //   tick_spacing?: number   (px between ticks, default 50)
  // }
  // label syntax: "9" | "9[1/8]"  (bracket notation for fractions)

  export let params;

  const { title, axis_label, data_points, tick_spacing = 50 } = params;

  // ── Parse label strings ──────────────────────────────────────────────
  // Supports: "9", "9[1/8]", "[3/4]" (pure fraction, whole omitted)
  function parseLabel(s) {
    // Pure fraction: "[3/4]"
    const pure = s.match(/^\[(\d+)\/(\d+)\]$/);
    if (pure) return { whole: '', num: pure[1], den: pure[2] };
    // Mixed number or integer: "9[1/8]" or "9"
    const m = s.match(/^(-?\d+(?:\.\d+)?)\[(\d+)\/(\d+)\]$|^(-?\d+(?:\.\d+)?)$/);
    if (!m) return { whole: s };
    if (m[4] !== undefined) return { whole: m[4] };
    return { whole: m[1], num: m[2], den: m[3] };
  }

  // ── Layout constants ─────────────────────────────────────────────────
  const PAD_L    = 28;   // left padding (room for left arrow)
  const PAD_R    = 28;   // right padding
  const MARK_H   = 18;   // vertical gap between stacked X marks
  const TITLE_H  = 24;   // space reserved for title at top

  const n        = data_points.length;
  const maxCount = Math.max(...data_points.map(d => d.count));

  const AX_START = PAD_L;
  const AX_END   = PAD_L + (n - 1) * tick_spacing;
  const W        = AX_END + PAD_R;

  // Axis y sits below title + X mark area
  const MARK_AREA_H = maxCount * MARK_H + 6;
  const AX_Y        = TITLE_H + MARK_AREA_H;

  // Space below axis: tick marks + labels + axis title
  const LABEL_Y      = AX_Y + 22;   // baseline for whole-number part of tick label
  const AXIS_LABEL_Y = AX_Y + 58;
  const H            = AXIS_LABEL_Y + 8;

  // ── Arrowhead (from left-arrowhead-variant-svgrepo-com.svg) ──────────────
  // Original viewBox 571.815×571.815; tip at ~(76.208, 284), back at ~x=500
  const AX_EXT = 8;                             // axis line extension beyond first/last tick
  const AH_S   = 0.028;                         // scale factor
  const AH_OX  = 76.208;                        // path reference x (near tip)
  const AH_OY  = (296.042 + 272.07) / 2;        // path reference y (tip centre ≈ 284)
  const AH_W   = (500 - AH_OX) * AH_S;          // arrowhead width in px ≈ 11.9

  // Left arrowhead: tip points left, back connects to axis at AX_START - AX_EXT
  const L_TX = (AX_START - AX_EXT - AH_W) - AH_S * AH_OX;
  const L_TY = AX_Y - AH_S * AH_OY;

  // Right arrowhead: horizontally flipped, back connects to axis at AX_END + AX_EXT
  const R_TX = (AX_END + AX_EXT + AH_W) + AH_S * AH_OX;
  const R_TY = AX_Y - AH_S * AH_OY;

  // ── Pre-compute tick data ─────────────────────────────────────────────
  const ticks = data_points.map((d, i) => ({
    x:      AX_START + i * tick_spacing,
    parsed: parseLabel(d.label),
    count:  d.count,
  }));
</script>

<svg
  width={W}
  height={H}
  viewBox="0 0 {W} {H}"
  style="display:block; margin:0 auto; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;"
>
  <!-- Title -->
  <text
    x={W / 2} y={TITLE_H - 5}
    text-anchor="middle" font-size="17" font-weight="bold" fill="#333"
  >{title}</text>

  <!-- X marks stacked above each tick -->
  {#each ticks as tick}
    {#each Array(tick.count) as _, j}
      <text
        x={tick.x}
        y={AX_Y - 8 - j * MARK_H}
        text-anchor="middle"
        font-size="16" font-weight="bold" fill="#333"
      >X</text>
    {/each}
  {/each}

  <!-- Axis line (extended beyond first/last tick to meet arrowheads) -->
  <line x1={AX_START - AX_EXT} y1={AX_Y} x2={AX_END + AX_EXT} y2={AX_Y} stroke="#333" stroke-width="1.5" />

  <!-- Left arrowhead (pointing left) -->
  <path
    d="M76.208,296.042l415.78,272.132c8.286,6.646,12.062,3.941,8.431-6.04L329.355,302.084c-3.629-9.981-3.596-26.156,0.076-36.123l170.91-256.26c3.672-9.966-0.101-12.702-8.43-6.11L76.284,272.07C67.958,278.661,67.921,289.395,76.208,296.042z"
    fill="#333"
    transform="translate({L_TX},{L_TY}) scale({AH_S})"
  />

  <!-- Right arrowhead (pointing right — horizontally flipped) -->
  <path
    d="M76.208,296.042l415.78,272.132c8.286,6.646,12.062,3.941,8.431-6.04L329.355,302.084c-3.629-9.981-3.596-26.156,0.076-36.123l170.91-256.26c3.672-9.966-0.101-12.702-8.43-6.11L76.284,272.07C67.958,278.661,67.921,289.395,76.208,296.042z"
    fill="#333"
    transform="translate({R_TX},{R_TY}) scale({-AH_S},{AH_S})"
  />

  <!-- Tick marks and labels -->
  {#each ticks as tick}
    <!-- Tick mark -->
    <line
      x1={tick.x} y1={AX_Y - 5}
      x2={tick.x} y2={AX_Y + 5}
      stroke="#333" stroke-width="1.5"
    />

    <!-- Label: plain number or mixed-number with stacked fraction -->
    {#if tick.parsed.num}
      <!-- Whole part, right-aligned to tick -->
      <text x={tick.x - 3} y={LABEL_Y + 1}
        text-anchor="end" font-size="16" fill="#333">{tick.parsed.whole}</text>
      <!-- Numerator -->
      <text x={tick.x + 1} y={LABEL_Y - 7}
        text-anchor="start" font-size="13" fill="#333">{tick.parsed.num}</text>
      <!-- Fraction bar -->
      <line
        x1={tick.x} y1={LABEL_Y}
        x2={tick.x + 15} y2={LABEL_Y}
        stroke="#333" stroke-width="0.8"
      />
      <!-- Denominator -->
      <text x={tick.x + 1} y={LABEL_Y + 12}
        text-anchor="start" font-size="13" fill="#333">{tick.parsed.den}</text>
    {:else}
      <text x={tick.x} y={LABEL_Y + 1}
        text-anchor="middle" font-size="16" fill="#333">{tick.parsed.whole}</text>
    {/if}
  {/each}

  <!-- Axis label -->
  <text
    x={W / 2} y={AXIS_LABEL_Y}
    text-anchor="middle" font-size="15" fill="#333"
  >{axis_label}</text>
</svg>

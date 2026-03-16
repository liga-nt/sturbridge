<script>
  // Parametric dot plot (filled-circle chart).
  // stimulus_params: {
  //   title?: string,
  //   axis_label?: string,
  //   data_points: [{ label: string, count: number }, ...]
  //   tick_spacing?: number   (px between ticks, default 60)
  // }
  // label syntax: "1" | "[1/4]" | "1[1/2]"  (bracket notation for fractions)

  export let params;

  const { title = null, axis_label = null, data_points, tick_spacing = 60 } = params;

  // ── Parse label strings ──────────────────────────────────────────────
  // Handles: "1"  "[1/4]"  "1[1/2]"  "2[3/4]"
  function parseLabel(s) {
    // Mixed number: whole + fraction  e.g. "1[1/2]"
    const mixedM = s.match(/^(-?\d+(?:\.\d+)?)\[(\d+)\/(\d+)\]$/);
    if (mixedM) return { whole: mixedM[1], num: mixedM[2], den: mixedM[3] };
    // Pure fraction: "[1/4]"
    const fracM = s.match(/^\[(\d+)\/(\d+)\]$/);
    if (fracM) return { whole: null, num: fracM[1], den: fracM[2] };
    // Plain number
    return { whole: s, num: null, den: null };
  }

  // ── Layout constants ─────────────────────────────────────────────────
  const DOT_R    = 7;    // radius of each filled dot
  const DOT_GAP  = 3;    // vertical gap between stacked dots
  const DOT_STEP = DOT_R * 2 + DOT_GAP;  // px per row of dots

  const PAD_L    = 36;   // left padding (room for left arrow)
  const PAD_R    = 36;   // right padding
  const TITLE_H  = title ? 28 : 4;   // space reserved for title at top

  const n        = data_points.length;
  const maxCount = Math.max(...data_points.map(d => d.count));

  const AX_START = PAD_L;
  const AX_END   = PAD_L + (n - 1) * tick_spacing;
  const W        = AX_END + PAD_R;

  // Dot area height: tallest stack sits fully above axis line (8px gap between axis and bottom dot)
  const DOT_AREA_H = maxCount * DOT_STEP + DOT_R + 12;
  const AX_Y       = TITLE_H + DOT_AREA_H;

  // Space below axis: tick marks + labels + axis title
  // Labels may need extra height for fraction denominators
  const hasFractionLabels = data_points.some(d => parseLabel(d.label).num);
  const LABEL_Y      = AX_Y + 22;           // baseline for whole part / numerator
  const FRAC_EXTRA   = hasFractionLabels ? 16 : 0;
  const AXIS_LABEL_Y = LABEL_Y + FRAC_EXTRA + 26;
  const H            = axis_label ? AXIS_LABEL_Y + 10 : LABEL_Y + FRAC_EXTRA + 10;

  // ── Arrowhead constants (same path as LinePlot) ───────────────────────
  const AX_EXT = 10;
  const AH_S   = 0.028;
  const AH_OX  = 76.208;
  const AH_OY  = (296.042 + 272.07) / 2;
  const AH_W   = (500 - AH_OX) * AH_S;

  const L_TX = (AX_START - AX_EXT - AH_W) - AH_S * AH_OX;
  const L_TY = AX_Y - AH_S * AH_OY;

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
  {#if title}
    <text
      x={W / 2} y={TITLE_H - 6}
      text-anchor="middle" font-size="17" font-weight="bold" fill="#333"
    >{title}</text>
  {/if}

  <!-- Filled dots stacked above each tick (bottom dot sits just above axis) -->
  {#each ticks as tick}
    {#each Array(tick.count) as _, j}
      <circle
        cx={tick.x}
        cy={AX_Y - DOT_R - 8 - j * DOT_STEP}
        r={DOT_R}
        fill="#333"
      />
    {/each}
  {/each}

  <!-- Axis line -->
  <line x1={AX_START - AX_EXT} y1={AX_Y} x2={AX_END + AX_EXT} y2={AX_Y} stroke="#333" stroke-width="1.5" />

  <!-- Left arrowhead (pointing left) -->
  <path
    d="M76.208,296.042l415.78,272.132c8.286,6.646,12.062,3.941,8.431-6.04L329.355,302.084c-3.629-9.981-3.596-26.156,0.076-36.123l170.91-256.26c3.672-9.966-0.101-12.702-8.43-6.11L76.284,272.07C67.958,278.661,67.921,289.395,76.208,296.042z"
    fill="#333"
    transform="translate({L_TX},{L_TY}) scale({AH_S})"
  />

  <!-- Right arrowhead (pointing right) -->
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

    <!-- Label rendering:
         - Pure fraction [n/d]: centered stacked fraction
         - Mixed number w[n/d]: whole right-aligned, fraction to right
         - Plain whole number: centered
    -->
    {#if tick.parsed.num && tick.parsed.whole === null}
      <!-- Pure fraction: numerator centered, bar, denominator centered -->
      <text x={tick.x} y={LABEL_Y - 6}
        text-anchor="middle" font-size="13" fill="#333">{tick.parsed.num}</text>
      <line
        x1={tick.x - 8} y1={LABEL_Y}
        x2={tick.x + 8} y2={LABEL_Y}
        stroke="#333" stroke-width="0.9"
      />
      <text x={tick.x} y={LABEL_Y + 13}
        text-anchor="middle" font-size="13" fill="#333">{tick.parsed.den}</text>
    {:else if tick.parsed.num && tick.parsed.whole !== null}
      <!-- Mixed number: whole right-of-center, small fraction to the right -->
      <text x={tick.x - 3} y={LABEL_Y + 1}
        text-anchor="end" font-size="16" fill="#333">{tick.parsed.whole}</text>
      <text x={tick.x + 1} y={LABEL_Y - 7}
        text-anchor="start" font-size="13" fill="#333">{tick.parsed.num}</text>
      <line
        x1={tick.x} y1={LABEL_Y}
        x2={tick.x + 15} y2={LABEL_Y}
        stroke="#333" stroke-width="0.8"
      />
      <text x={tick.x + 1} y={LABEL_Y + 12}
        text-anchor="start" font-size="13" fill="#333">{tick.parsed.den}</text>
    {:else}
      <!-- Plain whole number -->
      <text x={tick.x} y={LABEL_Y + 1}
        text-anchor="middle" font-size="16" fill="#333">{tick.parsed.whole}</text>
    {/if}
  {/each}

  <!-- Axis label -->
  {#if axis_label}
    <text
      x={W / 2} y={AXIS_LABEL_Y}
      text-anchor="middle" font-size="15" fill="#333"
    >{axis_label}</text>
  {/if}
</svg>

<script>
  import { renderMath } from '$lib/utils/math.js';

  export let question_text;
  export let stimulus_params = {};

  const min            = stimulus_params.min            ?? 0;
  const max            = stimulus_params.max            ?? 1;
  const small_intervals = stimulus_params.small_intervals ?? 10;
  const range          = max - min;

  // ── SVG layout constants ─────────────────────────────────────────────
  const W    = 650;   // viewBox width

  // Main number line
  const ML   = 58;    // left label/tick x
  const MR   = 592;   // right label/tick x
  const MLEN = MR - ML;
  const MY   = 58;    // y of main line
  const TENTH_W = MLEN / small_intervals;

  // Arrow extension — line extends this far past the endpoint ticks
  const ARROW_EXT = 20;

  // Zoom panel
  const ZP_L   = 8;
  const ZP_R   = 642;
  const ZP_TOP = 126;
  const ZP_BOT = 216;
  const ZLL    = 44;   // zoom line left label/tick x (inside panel)
  const ZLR    = 606;  // zoom line right label/tick x
  const ZLY    = 168;  // zoom line y
  const ZLEN   = ZLR - ZLL;

  // Heights
  const H_MAIN = MY + 50;           // when no zoom
  const H_FULL = ZP_BOT + 10;       // when zoom visible

  // ── State ────────────────────────────────────────────────────────────
  let zoomedTenth  = null;   // 0..(small_intervals-1), or null
  let placedValue  = null;   // float or null

  // ── Helpers ──────────────────────────────────────────────────────────
  function fmt(v) {
    return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);
  }

  function svgCoords(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const h = zoomedTenth !== null ? H_FULL : H_MAIN;
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top)  * (h  / rect.height),
    };
  }

  // ── Click handler ────────────────────────────────────────────────────
  function handleClick(e) {
    const { x, y } = svgCoords(e);

    if (zoomedTenth !== null && y >= ZP_TOP) {
      // Click inside zoom panel → place point
      const cx = Math.max(ZLL, Math.min(ZLR, x));
      const t  = (cx - ZLL) / ZLEN;
      const ts = min + (zoomedTenth / small_intervals) * range;
      const te = min + ((zoomedTenth + 1) / small_intervals) * range;
      placedValue = Math.round((ts + t * (te - ts)) * 100) / 100;
    } else {
      // Click on main line area → change zoomed tenth
      const cx = Math.max(ML, Math.min(MR - 0.001, x));
      const t  = (cx - ML) / MLEN;
      zoomedTenth = Math.min(Math.floor(t * small_intervals), small_intervals - 1);
      placedValue = null;
    }
  }

  // ── Reactive geometry ────────────────────────────────────────────────
  $: hlX = zoomedTenth !== null ? ML + zoomedTenth * TENTH_W : 0;
  $: hlW = TENTH_W;

  // Trapezoid: bottom of highlight box → top of zoom panel
  $: trapPoints = zoomedTenth !== null
    ? `${hlX},${MY + 16} ${hlX + hlW},${MY + 16} ${ZP_R},${ZP_TOP} ${ZP_L},${ZP_TOP}`
    : '';

  // Placed point x on main line
  $: ptMainX = placedValue !== null
    ? ML + ((placedValue - min) / range) * MLEN
    : null;

  // Placed point x in zoom panel (null if outside current zoom region)
  $: ptZoomX = (() => {
    if (placedValue === null || zoomedTenth === null) return null;
    const ts = min + (zoomedTenth / small_intervals) * range;
    const te = min + ((zoomedTenth + 1) / small_intervals) * range;
    const t  = (placedValue - ts) / (te - ts);
    if (t < 0 || t > 1) return null;
    return ZLL + t * ZLEN;
  })();

  $: zLabelL = zoomedTenth !== null ? fmt(min + (zoomedTenth / small_intervals) * range) : '';
  $: zLabelR = zoomedTenth !== null ? fmt(min + ((zoomedTenth + 1) / small_intervals) * range) : '';

  $: svgH = zoomedTenth !== null ? H_FULL : H_MAIN;
</script>

<div class="question-body">
  <p class="q-text">{@html renderMath(question_text)}</p>
  <p class="q-text">Select a place on the number line to plot the point.</p>

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <svg
    width={W}
    height={svgH}
    viewBox="0 0 {W} {svgH}"
    style="width:100%;max-width:{W}px;height:auto;cursor:crosshair;display:block;user-select:none;"
    on:click={handleClick}
  >
    <defs>
      <!-- LEFT ARROW: Points left (outward from left end) -->
      <marker 
        id="arrow-left" 
        markerWidth="10" 
        markerHeight="10" 
        refX="1" 
        refY="5" 
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M9,5 L1,2 L1,8 L9,5" fill="#333" stroke="#333" stroke-width="0.5" />
      </marker>
      
      <!-- RIGHT ARROW: Points right (outward from right end) -->
      <marker 
        id="arrow-right" 
        markerWidth="10" 
        markerHeight="10" 
        refX="9" 
        refY="5" 
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M1,5 L9,2 L9,8 L1,5" fill="#333" stroke="#333" stroke-width="0.5" />
      </marker>
    </defs>

    <!-- ── Trapezoid fan ── -->
    {#if zoomedTenth !== null}
      <polygon points={trapPoints} fill="#c8c8c8" />
    {/if}

    <!-- ── Zoom panel ── -->
    {#if zoomedTenth !== null}
      <rect
        x={ZP_L} y={ZP_TOP}
        width={ZP_R - ZP_L} height={ZP_BOT - ZP_TOP}
        rx="3" ry="3"
        fill="#efefef"
        stroke="#c0c0c0"
        stroke-width="1"
      />

      <!-- Zoom line with arrows pointing OUTWARD -->
      <line 
        x1={ZLL - ARROW_EXT} 
        y1={ZLY} 
        x2={ZLR + ARROW_EXT} 
        y2={ZLY}
        stroke="#333" 
        stroke-width="1.5"
        marker-start="url(#arrow-left)" 
        marker-end="url(#arrow-right)" 
      />

      <!-- Zoom tick marks -->
      {#each Array(small_intervals + 1) as _, k}
        {@const tx = ZLL + (k / small_intervals) * ZLEN}
        {@const big = k === 0 || k === small_intervals}
        <line
          x1={tx} y1={ZLY - (big ? 14 : 7)}
          x2={tx} y2={ZLY + (big ? 14 : 7)}
          stroke="#333" stroke-width="1.5"
        />
      {/each}

      <!-- Zoom labels -->
      <text x={ZLL} y={ZP_BOT - 4}
        font-size="13" text-anchor="middle"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        fill="#333">{zLabelL}</text>
      <text x={ZLR} y={ZP_BOT - 4}
        font-size="13" text-anchor="middle"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        fill="#333">{zLabelR}</text>

      <!-- Placed point in zoom panel -->
      {#if ptZoomX !== null}
        <circle cx={ptZoomX} cy={ZLY} r="22" fill="#aaa" opacity="0.35" />
        <circle cx={ptZoomX} cy={ZLY} r="8"  fill="#0000ff" />
      {/if}
    {/if}

    <!-- ── Main number line ── -->

    <!-- Highlight box over zoomed region -->
    {#if zoomedTenth !== null}
      <rect
        x={hlX} y={MY - 16}
        width={hlW} height={32}
        rx="2"
        fill="#999"
        opacity="0.45"
      />
    {/if}

    <!-- Main horizontal line with arrows pointing OUTWARD -->
    <line 
      x1={ML - ARROW_EXT} 
      y1={MY} 
      x2={MR + ARROW_EXT} 
      y2={MY}
      stroke="#333" 
      stroke-width="1.5"
      marker-start="url(#arrow-left)" 
      marker-end="url(#arrow-right)" 
    />

    <!-- Main tick marks -->
    {#each Array(small_intervals + 1) as _, k}
      {@const tx = ML + (k / small_intervals) * MLEN}
      {@const big = k === 0 || k === small_intervals}
      <line
        x1={tx} y1={MY - (big ? 14 : 7)}
        x2={tx} y2={MY + (big ? 14 : 7)}
        stroke="#333" stroke-width="1.5"
      />
    {/each}

    <!-- Labels: min and max, above line -->
    <text x={ML} y={MY - 22}
      font-size="14" text-anchor="middle"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      fill="#333">{fmt(min)}</text>
    <text x={MR} y={MY - 22}
      font-size="14" text-anchor="middle"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      fill="#333">{fmt(max)}</text>

    <!-- Placed point on main line -->
    {#if ptMainX !== null}
      <circle cx={ptMainX} cy={MY} r="8" fill="#0000ff" />
    {/if}
  </svg>
</div>

<style>
  .question-body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    color: #333;
    background: #fff;
    padding: 16px;
    max-width: 660px;
  }

  .q-text {
    margin: 0 0 10px;
  }
</style>
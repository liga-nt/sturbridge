<script>
  // Parametric labeled rectangle with dimension-line annotations.
  // stimulus_params: {
  //   width: number,         -- numeric width for aspect ratio (e.g. 12)
  //   height: number,        -- numeric height for aspect ratio (e.g. 10)
  //   width_label: string,   -- label for the width side  (e.g. "12 feet")
  //   height_label: string,  -- label for the height side (e.g. "10 feet")
  // }
  export let params;

  const { width = 12, height = 10, width_label, height_label } = params;

  // ── Rectangle geometry ──────────────────────────────────────────────
  const RECT_LEFT   = 44;
  const RECT_TOP    = 12;
  const RECT_W      = 128;
  const RECT_H      = Math.round(RECT_W * height / width);

  const RECT_RIGHT  = RECT_LEFT + RECT_W;
  const RECT_BOTTOM = RECT_TOP  + RECT_H;

  // ── Right dimension line (measures height) ──────────────────────────
  // Dim line floats just outside the rectangle; short symmetric ticks
  // centered on each endpoint (not running back to the rectangle edge).
  const R_OFFSET = 9;                    // gap from rect right edge to dim line center
  const R_DIM_X  = RECT_RIGHT + R_OFFSET;
  const R_TH     = 6;                    // tick half-length (extends ±6 from dim line)
  const R_LBL_X  = R_DIM_X + R_TH + 4;  // label text x

  // ── Bottom dimension line (measures width) ──────────────────────────
  const B_OFFSET = 9;                    // gap from rect bottom edge to dim line center
  const B_DIM_Y  = RECT_BOTTOM + B_OFFSET;
  const B_TH     = 6;                    // tick half-length
  const B_LBL_Y  = B_DIM_Y + B_TH + 12; // label text y

  // ── Right-angle corner marks ────────────────────────────────────────
  const CS = 9; // corner square size (px)

  // ── Canvas ──────────────────────────────────────────────────────────
  const SVG_W = R_LBL_X + 58;   // room for right label
  const SVG_H = B_LBL_Y + 6;    // room for bottom label
</script>

<svg
  viewBox="0 0 {SVG_W} {SVG_H}"
  width={SVG_W}
  style="display:block; margin:0 auto;
         font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;"
>
  <!-- Rectangle outline -->
  <rect
    x={RECT_LEFT} y={RECT_TOP}
    width={RECT_W} height={RECT_H}
    fill="none" stroke="#333" stroke-width="1.5"
  />

  <!-- Right-angle corner marks (L-brackets inside each corner) -->
  <!-- Top-left -->
  <line x1={RECT_LEFT}    y1={RECT_TOP+CS} x2={RECT_LEFT+CS} y2={RECT_TOP+CS} stroke="#333" stroke-width="1.5"/>
  <line x1={RECT_LEFT+CS} y1={RECT_TOP}    x2={RECT_LEFT+CS} y2={RECT_TOP+CS} stroke="#333" stroke-width="1.5"/>
  <!-- Top-right -->
  <line x1={RECT_RIGHT-CS} y1={RECT_TOP}    x2={RECT_RIGHT-CS} y2={RECT_TOP+CS} stroke="#333" stroke-width="1.5"/>
  <line x1={RECT_RIGHT-CS} y1={RECT_TOP+CS} x2={RECT_RIGHT}    y2={RECT_TOP+CS} stroke="#333" stroke-width="1.5"/>
  <!-- Bottom-left -->
  <line x1={RECT_LEFT}    y1={RECT_BOTTOM-CS} x2={RECT_LEFT+CS} y2={RECT_BOTTOM-CS} stroke="#333" stroke-width="1.5"/>
  <line x1={RECT_LEFT+CS} y1={RECT_BOTTOM-CS} x2={RECT_LEFT+CS} y2={RECT_BOTTOM}    stroke="#333" stroke-width="1.5"/>
  <!-- Bottom-right -->
  <line x1={RECT_RIGHT-CS} y1={RECT_BOTTOM-CS} x2={RECT_RIGHT}    y2={RECT_BOTTOM-CS} stroke="#333" stroke-width="1.5"/>
  <line x1={RECT_RIGHT-CS} y1={RECT_BOTTOM-CS} x2={RECT_RIGHT-CS} y2={RECT_BOTTOM}    stroke="#333" stroke-width="1.5"/>

  <!-- Right dimension: height_label
       Vertical dim line with short symmetric horizontal ticks at each endpoint. -->
  <line x1={R_DIM_X}       y1={RECT_TOP}    x2={R_DIM_X}       y2={RECT_BOTTOM}
        stroke="#333" stroke-width="1.5"/>
  <line x1={R_DIM_X - R_TH} y1={RECT_TOP}    x2={R_DIM_X + R_TH} y2={RECT_TOP}
        stroke="#333" stroke-width="1.5"/>
  <line x1={R_DIM_X - R_TH} y1={RECT_BOTTOM} x2={R_DIM_X + R_TH} y2={RECT_BOTTOM}
        stroke="#333" stroke-width="1.5"/>
  <text
    x={R_LBL_X}
    y={(RECT_TOP + RECT_BOTTOM) / 2}
    dominant-baseline="middle"
    font-size="14" fill="#333"
  >{height_label}</text>

  <!-- Bottom dimension: width_label
       Horizontal dim line with short symmetric vertical ticks at each endpoint. -->
  <line x1={RECT_LEFT}  y1={B_DIM_Y}        x2={RECT_RIGHT} y2={B_DIM_Y}
        stroke="#333" stroke-width="1.5"/>
  <line x1={RECT_LEFT}  y1={B_DIM_Y - B_TH} x2={RECT_LEFT}  y2={B_DIM_Y + B_TH}
        stroke="#333" stroke-width="1.5"/>
  <line x1={RECT_RIGHT} y1={B_DIM_Y - B_TH} x2={RECT_RIGHT} y2={B_DIM_Y + B_TH}
        stroke="#333" stroke-width="1.5"/>
  <text
    x={(RECT_LEFT + RECT_RIGHT) / 2}
    y={B_LBL_Y}
    text-anchor="middle"
    font-size="14" fill="#333"
  >{width_label}</text>
</svg>

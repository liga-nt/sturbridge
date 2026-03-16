<script>
  // Renders one or more buckets side-by-side, each labeled with a fraction and a name.
  //
  // Props:
  //   params: {
  //     buckets: [
  //       { label: "Bucket A", numerator: 7, denominator: 8 },
  //       { label: "Bucket B", numerator: 5, denominator: 6 },
  //       ...
  //     ]
  //   }
  //
  // Each bucket is drawn as a trapezoid body with a handle arc.
  // The interior is split into filled (bottom) and unfilled (top) zones
  // based on numerator/denominator ratio.  The fraction text is centered inside.

  export let params;

  const buckets = params.buckets ?? [];

  // ── Bucket geometry (at scale 1, centered at 0,0) ────────────────────────────
  //
  // Body: trapezoid — wider at top, narrower at bottom.
  //   Top edge y = -TH/2, width = TW
  //   Bottom edge y = +TH/2, width = BW
  //   So left side goes from (-TW/2, -TH/2) to (-BW/2, +TH/2)
  //        right side from (+TW/2, -TH/2) to (+BW/2, +TH/2)
  //
  // Handle: arc across the top of the bucket body.
  // Rim: an ellipse at the top of the bucket to give depth.

  const TH  = 90;   // total height of bucket body
  const TW  = 78;   // top width of bucket body
  const BW  = 56;   // bottom width of bucket body
  const RIM_RY = 6; // vertical radius of rim ellipse (gives 3D appearance)

  // Clip path: inner bucket area (slightly inset from body walls)
  const INS = 3;    // inset from walls for fill clip

  // ── Layout ───────────────────────────────────────────────────────────────────
  const BUCKET_W = 100;   // cell width per bucket (including side padding)
  const BUCKET_H = 130;   // cell height (body + handle + label)
  const HANDLE_H = 22;    // how high above the rim the handle arc rises
  const LABEL_Y  = 14;    // label baseline below bottom of bucket body

  const PAD_X = 12;
  const PAD_TOP = 30;     // space at top for handle arc
  const PAD_BOT = LABEL_Y + 18;  // space at bottom for label text

  $: n = buckets.length;
  $: svgW = n * BUCKET_W + PAD_X * 2;
  $: svgH = TH + PAD_TOP + PAD_BOT + RIM_RY * 2;

  // Centre of each bucket body
  function bucketCX(i) { return PAD_X + BUCKET_W / 2 + i * BUCKET_W; }
  const bucketBodyTopY = PAD_TOP + RIM_RY; // y of the top rim centre
  const bucketBodyBotY = bucketBodyTopY + TH;

  // ── Colours ──────────────────────────────────────────────────────────────────
  const FILL_DARK  = '#b8b8b8'; // filled liquid zone
  const FILL_LIGHT = '#e8e8e8'; // unfilled air zone (lighter grey)
  const STROKE_COL = '#333';
  const TEXT_COL   = '#222';
  const HANDLE_COL = '#555';

  // ── Path builders ─────────────────────────────────────────────────────────────

  // Trapezoid outline (body, top-open for the rim)
  function bodyPath(cx) {
    const tx = cx;
    const ty = bucketBodyTopY;
    const bx = cx;
    const by = bucketBodyBotY;
    const tl = tx - TW / 2, tr = tx + TW / 2;
    const bl = bx - BW / 2, br = bx + BW / 2;
    return `M ${tl},${ty}  L ${bl},${by}  L ${br},${by}  L ${tr},${ty}`;
  }

  // Closed trapezoid for fill clipping (same as body but closed)
  function bodyClipPath(cx) {
    return bodyPath(cx) + ' Z';
  }

  // Fill rectangle: covers the bottom (numerator / denominator) fraction of body height.
  // We draw two rects inside the clip path — one for filled, one for unfilled.
  // Or more simply, just draw a filled rect for the liquid zone.
  function fillY(frac) {
    // frac = 0 means empty (top), frac = 1 means full (bottom)
    // The fill zone starts at (1-frac) of the way down the body
    return bucketBodyTopY + TH * (1 - frac);
  }

  // Handle: an arc from left rim to right rim, curving upward
  function handlePath(cx) {
    const ly = bucketBodyTopY;
    const lx = cx - TW / 2 + 6;
    const rx = cx + TW / 2 - 6;
    const ry = ly;
    const archy = ly - HANDLE_H;
    // Use a cubic bezier for the arc
    const c1x = lx;
    const c1y = archy;
    const c2x = rx;
    const c2y = archy;
    return `M ${lx},${ly} C ${c1x},${c1y} ${c2x},${c2y} ${rx},${ry}`;
  }

  // ── Build per-bucket data ─────────────────────────────────────────────────────
  function buildBucket(b, i) {
    const cx     = bucketCX(i);
    const frac   = b.numerator / b.denominator;
    const liquidY = fillY(frac);
    const liquidH = bucketBodyBotY - liquidY;
    const labelY  = bucketBodyBotY + LABEL_Y + 8;

    return { cx, frac, liquidY, liquidH, labelY, ...b };
  }

  $: bData = buckets.map((b, i) => buildBucket(b, i));
</script>

<svg
  width={svgW}
  height={svgH}
  viewBox="0 0 {svgW} {svgH}"
  style="display:block; margin:0 auto;"
  aria-hidden="true"
>
  <defs>
    {#each bData as b, i}
      <!-- Clip path for bucket interior -->
      <clipPath id="bucket-clip-{i}">
        <path d={bodyClipPath(b.cx)} />
      </clipPath>
    {/each}
  </defs>

  {#each bData as b, i}
    <!-- ── Unfilled zone (full body background, light grey) ── -->
    <path
      d={bodyPath(b.cx) + ' Z'}
      fill={FILL_LIGHT}
      stroke="none"
    />

    <!-- ── Filled / liquid zone ── -->
    <rect
      x={b.cx - TW / 2 - 2}
      y={b.liquidY}
      width={TW + 4}
      height={b.liquidH + 2}
      fill={FILL_DARK}
      clip-path="url(#bucket-clip-{i})"
    />

    <!-- ── Body outline ── -->
    <path
      d={bodyPath(b.cx)}
      fill="none"
      stroke={STROKE_COL}
      stroke-width="2"
      stroke-linejoin="round"
    />

    <!-- ── Rim ellipse at top ── -->
    <ellipse
      cx={b.cx}
      cy={bucketBodyTopY}
      rx={TW / 2}
      ry={RIM_RY}
      fill={FILL_LIGHT}
      stroke={STROKE_COL}
      stroke-width="1.5"
    />

    <!-- ── Bottom arc (floor of bucket) ── -->
    <ellipse
      cx={b.cx}
      cy={bucketBodyBotY}
      rx={BW / 2}
      ry={RIM_RY - 2}
      fill={FILL_DARK}
      stroke={STROKE_COL}
      stroke-width="1.5"
    />

    <!-- ── Handle arc ── -->
    <path
      d={handlePath(b.cx)}
      fill="none"
      stroke={HANDLE_COL}
      stroke-width="3"
      stroke-linecap="round"
    />

    <!-- ── Fraction text inside bucket ── -->
    <!-- Numerator -->
    <text
      x={b.cx}
      y={bucketBodyTopY + TH / 2 - 2}
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="16"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-weight="bold"
      fill={TEXT_COL}
    >{b.numerator}</text>

    <!-- Fraction bar -->
    <line
      x1={b.cx - 10}
      y1={bucketBodyTopY + TH / 2 + 6}
      x2={b.cx + 10}
      y2={bucketBodyTopY + TH / 2 + 6}
      stroke={TEXT_COL}
      stroke-width="1.5"
    />

    <!-- Denominator -->
    <text
      x={b.cx}
      y={bucketBodyTopY + TH / 2 + 16}
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="16"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-weight="bold"
      fill={TEXT_COL}
    >{b.denominator}</text>

    <!-- ── Bucket label below ── -->
    <text
      x={b.cx}
      y={b.labelY}
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="14"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      fill={TEXT_COL}
    >{b.label}</text>
  {/each}
</svg>

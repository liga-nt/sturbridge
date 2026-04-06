<script>
  // params: {
  //   rays: [{ label: string, angle: number }]  — angle in degrees CCW from east (0=right, 90=up, 180=left)
  //   center_label?: string  — label for the vertex (default "L")
  //   base_label?: string    — label for the baseline right endpoint (default "P")
  // }
  export let params = {};

  const rays = params.rays || [];
  const centerLabel = params.center_label ?? 'L';
  const baseLabel = params.base_label ?? 'P';

  const W = 340;
  const H = 190;
  const CX = 163;
  const CY = 162;
  const LINE_Y = CY + 10;   // flat bottom edge of protractor (center is offset above it)

  const R       = 145;      // outer arc radius
  const R_INNER = 103;      // inner arc radius
  const RAY_EXT = R + 15;   // how far rays extend beyond arc

  const R_TICK_O_MAJ = R - 9;
  const R_TICK_O_MIN = R - 5;
  const R_NUM_OUTER  = 128;
  const R_NUM_INNER  = 114;
  const R_TICK_I_MAJ = R_INNER + 8;
  const R_TICK_I_MIN = R_INNER + 4;

  const DEG = Math.PI / 180;

  function pt(angleDeg, r) {
    return [
      CX + r * Math.cos(angleDeg * DEG),
      CY - r * Math.sin(angleDeg * DEG),
    ];
  }

  // Ticks every 5° (major every 10°)
  const ticks = [];
  for (let i = 0; i <= 180; i += 5) {
    const major = i % 10 === 0;
    const [ox, oy]   = pt(i, R);
    const [ox2, oy2] = pt(i, major ? R_TICK_O_MAJ : R_TICK_O_MIN);
    const [ix, iy]   = pt(i, R_INNER);
    const [ix2, iy2] = pt(i, major ? R_TICK_I_MAJ : R_TICK_I_MIN);
    ticks.push({ i, major, ox, oy, ox2, oy2, ix, iy, ix2, iy2 });
  }

  // Labels every 10°
  const labels = [];
  for (let i = 0; i <= 180; i += 10) {
    const [no_x, no_y] = pt(i, R_NUM_OUTER);
    const [ni_x, ni_y] = pt(i, R_NUM_INNER);
    const outerVal = i;
    const innerVal = 180 - i;
    const rot = 90 - i;   // tangential rotation so text follows arc
    labels.push({ i, outerVal, innerVal, no_x, no_y, ni_x, ni_y, rot });
  }

  // Arrowheads on baseline (left points left, right points right)
  function leftArrowhead() {
    const tipX = CX - RAY_EXT;
    const tipY = CY;
    return `${tipX},${tipY} ${tipX + 10},${tipY - 4} ${tipX + 10},${tipY + 4}`;
  }

  function rightArrowhead() {
    const tipX = CX + RAY_EXT;
    const tipY = CY;
    return `${tipX},${tipY} ${tipX - 10},${tipY - 4} ${tipX - 10},${tipY + 4}`;
  }

  // Arrowhead at ray tip
  function arrowhead(angleDeg, tipR, size = 8) {
    const rad = angleDeg * DEG;
    const tx = CX + tipR * Math.cos(rad);
    const ty = CY - tipR * Math.sin(rad);
    const px = -Math.sin(rad) * size * 0.4;
    const py = -Math.cos(rad) * size * 0.4;
    const bx = CX + (tipR - size) * Math.cos(rad);
    const by = CY - (tipR - size) * Math.sin(rad);
    return `${tx},${ty} ${bx - px},${by + py} ${bx + px},${by - py}`;
  }

  // Ray label position: inside the angle at the midpoint between baseline ray and angled ray
  function rayLabelPos(angleDeg) {
    // Left-side angle (>90°): angle is between left baseline (180°) and the ray
    // Right-side angle (<90°): angle is between right baseline (0°) and the ray
    const midAngle = angleDeg > 90 ? (180 + angleDeg) / 2 : angleDeg / 2;
    const [x, y] = pt(midAngle, 52);
    return { x, y };
  }
</script>

<svg
  width={W}
  height={H}
  viewBox="0 0 {W} {H}"
  style="display:block; max-width:100%; overflow:visible;"
  font-family="'Helvetica Neue',Helvetica,Arial,sans-serif"
  aria-label="Protractor diagram"
>
  <!-- Outer arc with legs down to flat bottom edge -->
  <path
    d="M {CX + R} {LINE_Y} L {CX + R} {CY} A {R} {R} 0 0 0 {CX - R} {CY} L {CX - R} {LINE_Y}"
    fill="none" stroke="#333" stroke-width="1.2"
  />

  <!-- Inner arc with legs -->
  <path
    d="M {CX + R_INNER} {LINE_Y} L {CX + R_INNER} {CY} A {R_INNER} {R_INNER} 0 0 0 {CX - R_INNER} {CY} L {CX - R_INNER} {LINE_Y}"
    fill="none" stroke="#333" stroke-width="1"
  />

  <!-- Flat bottom of protractor: connects the two arc leg endpoints -->
  <line x1={CX - R} y1={LINE_Y} x2={CX + R} y2={LINE_Y} stroke="#333" stroke-width="1.2"/>

  <!-- Baseline ray: direction depends on which side the angle is on -->
  {#if rays[0]?.angle > 90}
    <!-- Left-side angle: ray extends left from center only, stops at origin -->
    <line x1={CX - RAY_EXT} y1={CY} x2={CX} y2={CY} stroke="#333" stroke-width="1.2"/>
    <polygon points={leftArrowhead()} fill="#333"/>
  {:else}
    <!-- Right-side angle: ray extends right from center only, stops at origin -->
    <line x1={CX} y1={CY} x2={CX + RAY_EXT} y2={CY} stroke="#333" stroke-width="1.2"/>
    <polygon points={rightArrowhead()} fill="#333"/>
  {/if}

  <!-- Outer tick marks -->
  {#each ticks as t}
    <line x1={t.ox} y1={t.oy} x2={t.ox2} y2={t.oy2} stroke="#333" stroke-width={t.major ? 1.2 : 0.8}/>
  {/each}

  <!-- Inner tick marks -->
  {#each ticks as t}
    <line x1={t.ix} y1={t.iy} x2={t.ix2} y2={t.iy2} stroke="#333" stroke-width={t.major ? 1.2 : 0.8}/>
  {/each}

  <!-- Outer scale labels -->
  {#each labels as lb}
    <text
      x={lb.no_x} y={lb.no_y}
      text-anchor="middle" dominant-baseline="middle"
      font-size="8" fill="#333"
      transform="rotate({lb.rot}, {lb.no_x}, {lb.no_y})"
    >{lb.outerVal}</text>
  {/each}

  <!-- Inner scale labels -->
  {#each labels as lb}
    <text
      x={lb.ni_x} y={lb.ni_y}
      text-anchor="middle" dominant-baseline="middle"
      font-size="8" fill="#333"
      transform="rotate({lb.rot}, {lb.ni_x}, {lb.ni_y})"
    >{lb.innerVal}</text>
  {/each}

  <!-- Named rays -->
  {#each rays as ray}
    {@const [rx, ry] = pt(ray.angle, RAY_EXT)}
    {@const arrowPts = arrowhead(ray.angle, RAY_EXT)}
    {@const lbl = rayLabelPos(ray.angle)}
    <line
      x1={CX} y1={CY} x2={rx} y2={ry}
      stroke="#333" stroke-width="2"
    />
    <polygon points={arrowPts} fill="#333"/>
    <text
      x={lbl.x} y={lbl.y}
      text-anchor="middle" dominant-baseline="middle"
      font-size="13" font-style="italic" fill="#333"
    >{ray.label}</text>
  {/each}

  <!-- Center circle -->
  <circle cx={CX} cy={CY} r="4" fill="white" stroke="#333" stroke-width="1.2"/>
  <circle cx={CX} cy={CY} r="1.5" fill="#333"/>

  <!-- Vertex label below center -->
  {#if centerLabel}
    <text
      x={CX} y={CY + 16}
      text-anchor="middle" dominant-baseline="hanging"
      font-size="13" font-style="italic" fill="#333"
    >{centerLabel}</text>
  {/if}

  <!-- Baseline right-end label (after arrowhead) -->
  {#if baseLabel}
    <text
      x={CX + RAY_EXT + 8} y={CY}
      text-anchor="start" dominant-baseline="middle"
      font-size="13" font-style="italic" fill="#333"
    >{baseLabel}</text>
  {/if}
</svg>

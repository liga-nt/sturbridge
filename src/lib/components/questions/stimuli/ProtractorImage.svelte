<script>
  // params: {
  //   rays: [{ label: string, angle: number }]  — angle in degrees CCW from east (0=right, 90=up, 180=left)
  //   center_label?: string  — label for the vertex (default "L")
  //   base_label?: string    — label for the baseline/right ray (default "P")
  // }
  // The protractor baseline sits horizontally. The fixed baseline ray always points right (0°).
  // Named rays are drawn from center with arrowheads and labels.
  // Degree scale: outer arc 0–180 left-to-right, inner arc 180–0 right-to-left.
  export let params = {};

  const rays = params.rays || [];
  const centerLabel = params.center_label || 'L';
  const baseLabel = params.base_label || 'P';

  // SVG coordinate system: origin top-left, y increases downward.
  // Protractor center at (cx, cy). Outer radius = R, inner radius = R * 0.72.
  const W = 414;
  const H = 246;
  const cx = 191.627;
  const cy = 211.093;
  const R = 178.085;       // outer arc radius (matches actual SVG)
  const Ri = R * 0.663;    // inner arc radius (~118px, matches actual inner arc at ~93px from center: 117.6/178 ≈ 0.66)

  // Convert math angle (CCW from east) to SVG angle (CW from east, y-down).
  // In SVG: x = cx + r*cos(svgAngle), y = cy - r*sin(mathAngle)
  function toSVG(angleDeg, r) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy - r * Math.sin(rad)
    };
  }

  // Outer tick marks every 10°, small ticks every 5° and minor every 1°
  function buildTicks() {
    const ticks = [];
    for (let a = 0; a <= 180; a++) {
      const isMajor = a % 10 === 0;
      const isMid   = a % 5 === 0 && !isMajor;
      const outer = toSVG(a, R - 2);
      const inner = toSVG(a, R - (isMajor ? 12 : isMid ? 8 : 4));
      ticks.push({ x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y, major: isMajor, mid: isMid });
    }
    return ticks;
  }

  // Degree labels at every 10°. Outer scale (0 at right, 180 at left).
  // Inner scale (0 at left, 180 at right) — shown inside the inner arc.
  function buildLabels() {
    const labels = [];
    for (let a = 0; a <= 180; a += 10) {
      // Outer scale label: value = a, placed just outside the outer arc tick
      const outerVal = a;
      // Inner scale label: value = 180 - a
      const innerVal = 180 - a;

      // Label position: slightly beyond the outer tick, rotated to be readable
      const outerPt = toSVG(a, R + 14);
      // For readability, rotate label so it faces outward
      const rotDeg = a <= 90 ? -(90 - a) : (a - 90);

      labels.push({ x: outerPt.x, y: outerPt.y, val: outerVal, rot: -rotDeg, outer: true });

      // Inner scale label
      if (innerVal !== outerVal) {
        const innerPt = toSVG(a, Ri - 16);
        labels.push({ x: innerPt.x, y: innerPt.y, val: innerVal, rot: -rotDeg, outer: false });
      }
    }
    return labels;
  }

  // Build arrowhead polygon for ray endpoint
  function arrowhead(angleDeg, r) {
    const tip = toSVG(angleDeg, r);
    // Arrow points along the ray direction
    const rad = (angleDeg * Math.PI) / 180;
    const perpRad = rad + Math.PI / 2;
    const len = 12;
    const width = 4.5;
    const base = {
      x: tip.x - len * Math.cos(rad),
      y: tip.y + len * Math.sin(rad)
    };
    const p1 = { x: base.x + width * Math.cos(perpRad), y: base.y - width * Math.sin(perpRad) };
    const p2 = { x: base.x - width * Math.cos(perpRad), y: base.y + width * Math.sin(perpRad) };
    return `${tip.x},${tip.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`;
  }

  // Ray label offset: place label beyond arrowhead tip, offset perpendicular slightly
  function rayLabelPos(angleDeg, r) {
    const offset = 20;
    const pt = toSVG(angleDeg, r + offset);
    return pt;
  }

  const ticks = buildTicks();
  const degLabels = buildLabels();

  // Outer arc path: semicircle from 0° to 180°
  const arcStart = toSVG(0, R);
  const arcEnd = toSVG(180, R);
  const innerArcStart = toSVG(0, Ri);
  const innerArcEnd = toSVG(180, Ri);

  // Ray length: extend to outer arc minus a bit
  const rayLen = R - 8;
  // Baseline extends past R to the right
  const baselineEnd = { x: cx + R + 25, y: cy };
  const baselineArrow = arrowhead(0, R + 18);
</script>

<svg
  viewBox="0 0 {W} {H}"
  width="414"
  height="246"
  xmlns="http://www.w3.org/2000/svg"
  style="display:block; max-width:100%; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"
  aria-label="Protractor diagram"
>
  <!-- White background -->
  <rect width="{W}" height="{H}" fill="#fff"/>

  <!-- Outer arc: 0° to 180° -->
  <path
    d="M {arcStart.x},{arcStart.y} A {R},{R} 0 0,1 {arcEnd.x},{arcEnd.y}"
    fill="none" stroke="#000" stroke-width="1.33" stroke-linejoin="round"
  />

  <!-- Inner arc (second scale) -->
  <path
    d="M {innerArcStart.x},{innerArcStart.y} A {Ri},{Ri} 0 0,1 {innerArcEnd.x},{innerArcEnd.y}"
    fill="none" stroke="#000" stroke-width="1.33" stroke-linejoin="round"
  />

  <!-- Baseline (closed bottom of protractor) -->
  <line
    x1="{arcEnd.x}" y1="{cy}" x2="{arcStart.x}" y2="{cy}"
    stroke="#000" stroke-width="1.33"
  />

  <!-- Tick marks -->
  {#each ticks as t}
    <line
      x1="{t.x1}" y1="{t.y1}" x2="{t.x2}" y2="{t.y2}"
      stroke="#000"
      stroke-width="{t.major ? 1.2 : t.mid ? 0.9 : 0.6}"
    />
  {/each}

  <!-- Degree labels: outer scale -->
  {#each degLabels as lbl}
    {#if lbl.outer}
      <text
        x="{lbl.x}" y="{lbl.y}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="7"
        fill="#000"
        transform="rotate({lbl.rot},{lbl.x},{lbl.y})"
      >{lbl.val}</text>
    {:else}
      <text
        x="{lbl.x}" y="{lbl.y}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="6.5"
        fill="#000"
        transform="rotate({lbl.rot},{lbl.x},{lbl.y})"
      >{lbl.val}</text>
    {/if}
  {/each}

  <!-- Baseline ray (P) extending right with arrowhead -->
  <line
    x1="{cx}" y1="{cy}" x2="{baselineEnd.x}" y2="{cy}"
    stroke="#000" stroke-width="2.67" stroke-miterlimit="10"
  />
  <polygon points="{baselineArrow}" fill="#000"/>

  <!-- Named rays -->
  {#each rays as ray}
    {@const rayEnd = toSVG(ray.angle, rayLen)}
    {@const arrowPts = arrowhead(ray.angle, rayLen)}
    {@const lblPos = rayLabelPos(ray.angle, rayLen)}
    <line
      x1="{cx}" y1="{cy}" x2="{rayEnd.x}" y2="{rayEnd.y}"
      stroke="#000" stroke-width="2.67" stroke-miterlimit="10"
    />
    <polygon points="{arrowPts}" fill="#000"/>
    <text
      x="{lblPos.x}" y="{lblPos.y}"
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="14"
      font-style="italic"
      fill="#000"
    >{ray.label}</text>
  {/each}

  <!-- Center dot -->
  <circle cx="{cx}" cy="{cy}" r="5.46" fill="#000"/>

  <!-- Vertex label (e.g. "L") below center -->
  <text
    x="{cx}" y="{cy + 20}"
    text-anchor="middle"
    dominant-baseline="hanging"
    font-size="14"
    font-style="italic"
    fill="#000"
  >{centerLabel}</text>

  <!-- Baseline right-end label (e.g. "P") -->
  <text
    x="{cx + R + 35}" y="{cy + 2}"
    text-anchor="start"
    dominant-baseline="middle"
    font-size="14"
    font-style="italic"
    fill="#000"
  >{baseLabel}</text>
</svg>

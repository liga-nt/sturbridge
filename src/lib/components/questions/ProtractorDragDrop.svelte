<script>
  // ProtractorDragDrop.svelte
  // stimulus_params: {
  //   angles:  [{ label: "A", degrees: 140 }, ...]   — correct measure; ray drawn at (180-degrees)° from right
  //   choices: [40, 60, 90, 120, 140]                — draggable tile values
  // }

  export let question_text;
  export let stimulus_params;

  const { angles, choices } = stimulus_params;

  // Drag state
  let slots = Object.fromEntries(angles.map(a => [a.label, null])); // label -> value|null
  let bank  = [...choices]; // available tiles (not yet placed)

  let dragging = null;        // { value, from: 'bank'|label }

  function onDragStart(e, value, from) {
    dragging = { value, from };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(value));
  }

  function onDropSlot(e, label) {
    e.preventDefault();
    if (!dragging) return;

    const { value, from } = dragging;

    // If slot already occupied, return occupant to bank
    if (slots[label] !== null) {
      bank = [...bank, slots[label]].sort((a, b) => a - b);
    }

    // Remove from source
    if (from === 'bank') {
      bank = bank.filter(v => v !== value);
    } else if (from !== label) {
      // came from another slot — vacate that slot
      slots[from] = null;
    }

    slots[label] = value;
    slots = { ...slots };
    dragging = null;
  }

  function onDropBank(e) {
    e.preventDefault();
    if (!dragging) return;
    const { value, from } = dragging;
    if (from !== 'bank') {
      slots[from] = null;
      slots = { ...slots };
      bank = [...bank, value].sort((a, b) => a - b);
    }
    dragging = null;
  }

  function onDragOver(e) { e.preventDefault(); }
  function onDragEnd()   { dragging = null; }

  // ── Protractor SVG geometry ──────────────────────────────────────────────

  const W  = 320;   // SVG canvas width
  const H  = 182;   // SVG canvas height
  const CX = 158;   // center x (arc center)
  const CY = 160;   // arc center y
  const LINE_Y = CY + 10;  // flat baseline drawn below arc endpoints so 0/180 numbers have room

  // Dual-band structure (outer arc → ticks → numbers → ticks → inner arc)
  const R       = 140;   // outer arc radius
  const R_INNER = 100;   // inner arc radius
  // Outer tick endpoints (pointing inward from outer arc)
  const R_TICK_O_MAJ = R - 9;    // major tick inner end
  const R_TICK_O_MIN = R - 5;    // minor tick inner end
  // Number positions in the band
  const R_NUM_OUTER = 127;       // outer scale (0→180, near outer arc)
  const R_NUM_INNER = 113;       // inner scale (180→0, near inner arc)
  // Inner tick endpoints (pointing outward from inner arc)
  const R_TICK_I_MAJ = R_INNER + 8;   // major tick outer end
  const R_TICK_I_MIN = R_INNER + 4;   // minor tick outer end

  const DEG = Math.PI / 180;

  // Convert standard math angle (0=right, CCW+) to SVG coords
  function pt(angleDeg, r) {
    return [
      CX + r * Math.cos(angleDeg * DEG),
      CY - r * Math.sin(angleDeg * DEG),
    ];
  }

  // Build tick data — both outer ticks (arc→inward) and inner ticks (arc→outward)
  const ticks = [];
  for (let i = 0; i <= 180; i += 5) {
    const major = i % 10 === 0;
    const [ox, oy]   = pt(i, R);
    const [ox2, oy2] = pt(i, major ? R_TICK_O_MAJ : R_TICK_O_MIN);
    const [ix, iy]   = pt(i, R_INNER);
    const [ix2, iy2] = pt(i, major ? R_TICK_I_MAJ : R_TICK_I_MIN);
    ticks.push({ i, major, ox, oy, ox2, oy2, ix, iy, ix2, iy2 });
  }

  // Build labels (every 10°) — radial rotation so text aligns with spokes
  const labels = [];
  for (let i = 0; i <= 180; i += 10) {
    const [no_x, no_y] = pt(i, R_NUM_OUTER);
    const [ni_x, ni_y] = pt(i, R_NUM_INNER);
    const outerVal = i;          // outer scale: 0 at right → 180 at left
    const innerVal = 180 - i;    // inner scale: 0 at left  → 180 at right
    // Tangential rotation: text follows arc, readable from outside (upright at 90°, vertical at 0°/180°)
    const rot = 90 - i;
    labels.push({ i, outerVal, innerVal, no_x, no_y, ni_x, ni_y, rot });
  }

  // Ray endpoint for a given correct angle (e.g. 140° → ray at 180-140=40° from right)
  function rayTip(degrees, r) {
    const visual = 180 - degrees;  // degrees from right baseline
    return pt(visual, r);
  }

  // Arrowhead polygon string pointing away from center at angle
  function arrowhead(angleDeg, tipR, size = 8) {
    const rad = angleDeg * DEG;
    const tx = CX + tipR * Math.cos(rad);
    const ty = CY - tipR * Math.sin(rad);
    // perpendicular direction
    const px = -Math.sin(rad) * size * 0.4;
    const py = -Math.cos(rad) * size * 0.4;  // note: SVG y-flip handled
    const bx = CX + (tipR - size) * Math.cos(rad);
    const by = CY - (tipR - size) * Math.sin(rad);
    return `${tx},${ty} ${bx - px},${by + py} ${bx + px},${by - py}`;
  }

  // Baseline left arrowhead (pointing left, on the flat baseline)
  function leftArrowhead() {
    const tipX = CX - R - 20;
    const tipY = LINE_Y;
    return `${tipX},${tipY} ${tipX + 10},${tipY - 4} ${tipX + 10},${tipY + 4}`;
  }
</script>

<!-- Outer wrapper: TestNav white card style -->
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; color:#333; background:white; padding:16px;">

  <!-- Question text -->
  <p style="margin:0 0 8px;">{question_text}</p>
  <p style="margin:0 0 16px;">Drag and drop an angle measure into each box.</p>

  <!-- Tile bank -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    style="display:flex; gap:4px; flex-wrap:wrap; min-height:38px; padding:6px 8px; margin-bottom:20px; background:#f0f0f0; border:1px solid #ccc; border-radius:2px; width:fit-content;"
    on:dragover={onDragOver}
    on:drop={onDropBank}
  >
    {#each bank as val (val)}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        draggable="true"
        on:dragstart={e => onDragStart(e, val, 'bank')}
        on:dragend={onDragEnd}
        style="border:2px solid #333; background:white; padding:2px 10px; font-size:16px; font-weight:normal; cursor:grab; user-select:none; min-width:44px; text-align:center;"
      >
        {val}°
      </div>
    {/each}
  </div>

  <!-- One row per angle: [drop box] [protractor SVG] -->
  {#each angles as angle}
    {@const visual = 180 - angle.degrees}
    {@const [rayX, rayY] = pt(visual, R - 2)}
    <div style="display:flex; align-items:center; gap:20px; margin-bottom:28px;">

      <!-- Drop zone -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        on:dragover={onDragOver}
        on:drop={e => onDropSlot(e, angle.label)}
        style="
          width:56px; height:32px;
          border:2px solid #333; background:white;
          display:flex; align-items:center; justify-content:center;
          font-size:16px; flex-shrink:0;
          {dragging ? 'background:#eef4ff; border-color:#4477cc;' : ''}
        "
      >
        {#if slots[angle.label] !== null}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            draggable="true"
            on:dragstart={e => onDragStart(e, slots[angle.label], angle.label)}
            on:dragend={onDragEnd}
            style="cursor:grab; user-select:none; font-size:16px;"
          >
            {slots[angle.label]}°
          </div>
        {/if}
      </div>

      <!-- Protractor SVG -->
      <svg
        width={W} height={H}
        viewBox="0 0 {W} {H}"
        style="display:block; overflow:visible;"
        font-family="'Helvetica Neue',Helvetica,Arial,sans-serif"
      >
        <defs>
          <marker id="arr-{angle.label}" markerWidth="8" markerHeight="6"
            refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <polygon points="0 0, 8 3, 0 6" fill="#333"/>
          </marker>
        </defs>

        <!-- Outer arc: legs down to baseline + semicircle -->
        <path
          d="M {CX + R} {LINE_Y} L {CX + R} {CY} A {R} {R} 0 0 0 {CX - R} {CY} L {CX - R} {LINE_Y}"
          fill="none" stroke="#333" stroke-width="1.2"
        />

        <!-- Inner arc: legs down to baseline + semicircle -->
        <path
          d="M {CX + R_INNER} {LINE_Y} L {CX + R_INNER} {CY} A {R_INNER} {R_INNER} 0 0 0 {CX - R_INNER} {CY} L {CX - R_INNER} {LINE_Y}"
          fill="none" stroke="#333" stroke-width="1"
        />

        <!-- Flat baseline (drawn below arc endpoints, giving room for 0/180 numbers) -->
        <line x1={CX - R - 22} y1={LINE_Y} x2={CX + R} y2={LINE_Y} stroke="#333" stroke-width="1.2"/>
        <!-- Left arrowhead -->
        <polygon points={leftArrowhead()} fill="#333"/>

        <!-- Outer tick marks (from outer arc inward toward numbers) -->
        {#each ticks as t}
          <line x1={t.ox} y1={t.oy} x2={t.ox2} y2={t.oy2} stroke="#333" stroke-width={t.major ? 1.2 : 0.8}/>
        {/each}

        <!-- Inner tick marks (from inner arc outward toward numbers) -->
        {#each ticks as t}
          <line x1={t.ix} y1={t.iy} x2={t.ix2} y2={t.iy2} stroke="#333" stroke-width={t.major ? 1.2 : 0.8}/>
        {/each}

        <!-- Outer scale labels (0 at right → 180 at left, near outer arc) -->
        {#each labels as lb}
          <text
            x={lb.no_x} y={lb.no_y}
            text-anchor="middle" dominant-baseline="middle"
            font-size="8" fill="#333"
            transform="rotate({lb.rot}, {lb.no_x}, {lb.no_y})"
          >{lb.outerVal}</text>
        {/each}

        <!-- Inner scale labels (180 at right → 0 at left, near inner arc) -->
        {#each labels as lb}
          <text
            x={lb.ni_x} y={lb.ni_y}
            text-anchor="middle" dominant-baseline="middle"
            font-size="8" fill="#333"
            transform="rotate({lb.rot}, {lb.ni_x}, {lb.ni_y})"
          >{lb.innerVal}</text>
        {/each}

        <!-- Measuring ray with arrowhead -->
        <line
          x1={CX} y1={CY}
          x2={rayX} y2={rayY}
          stroke="#333" stroke-width="1.5"
          marker-end="url(#arr-{angle.label})"
        />

        <!-- Angle label (e.g. "A") near baseline, left side -->
        <text x={CX - R + 8} y={LINE_Y - 6} font-size="13" font-style="italic" fill="#333">Angle {angle.label}</text>

        <!-- Center dot (on the flat baseline, not at arc center) -->
        <circle cx={CX} cy={LINE_Y} r="4" fill="white" stroke="#333" stroke-width="1.2"/>
        <circle cx={CX} cy={LINE_Y} r="1.5" fill="#333"/>
      </svg>

    </div>
  {/each}

</div>

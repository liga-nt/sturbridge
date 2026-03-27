<script>
  // Parametric SVG for symmetry questions.
  // shape types: "star" | "square" | "rect" | "circle" | "triangle" | "polygon"
  // line: optional dashed arrow line, coords relative to shape center.
  //
  // Star params:
  //   points (int), outer_r (float), inner_r (float) — regular N-pointed star
  //   inner_corners [[x,y],...] — optional explicit inner corners for irregular stars
  //   rotation (degrees, default 0)
  //
  // Square: size
  // Rect: width, height
  // Circle: r
  // Triangle: kind ("equilateral"|"right"|"isosceles"), size, base, height, legs, rotation
  // Polygon: vertices [[x,y],...]
  //
  // line: { from: [dx,dy], to: [dx,dy] } — offsets from center; null to omit
  // padding: canvas padding in px (default 16)

  export let params;

  const { shape, line = null, padding = 16 } = params;

  // ── Shape builders — all coords relative to (0, 0) ──

  function buildStar({ points, outer_r, inner_r, inner_corners, rotation = 0 }) {
    const rot = rotation * Math.PI / 180;
    const verts = [];

    if (inner_corners && inner_corners.length === points) {
      // Irregular: outer points computed trigonometrically, inner corners explicit
      for (let i = 0; i < points; i++) {
        const oa = (i * 2 * Math.PI / points) - Math.PI / 2 + rot;
        verts.push([outer_r * Math.cos(oa), outer_r * Math.sin(oa)]);
        const [ix, iy] = inner_corners[i];
        verts.push(rot ? [
          ix * Math.cos(rot) - iy * Math.sin(rot),
          ix * Math.sin(rot) + iy * Math.cos(rot)
        ] : [ix, iy]);
      }
    } else {
      // Regular star — inner_r defaults to 40% of outer_r
      const ir = inner_r ?? outer_r * 0.4;
      const n = points * 2;
      for (let i = 0; i < n; i++) {
        const angle = (i * Math.PI / points) - Math.PI / 2 + rot;
        const r = (i % 2 === 0) ? outer_r : ir;
        verts.push([r * Math.cos(angle), r * Math.sin(angle)]);
      }
    }
    return verts;
  }

  function buildTriangle({ kind, size = 100, base, height, legs, rotation = 0 }) {
    let v;
    if (kind === 'equilateral') {
      const s = base ?? size;
      const h = s * Math.sqrt(3) / 2;
      // Centroid at 1/3 height from base → top at -2/3h, base corners at +1/3h
      v = [[0, -h * 2 / 3], [s / 2, h / 3], [-s / 2, h / 3]];
    } else if (kind === 'right') {
      const [a, b] = legs ?? [size, size];
      // Right angle at origin, centroid at (a/3, -b/3) → shift to center
      v = [[-a / 3, b / 3], [2 * a / 3, b / 3], [-a / 3, -2 * b / 3]];
    } else if (kind === 'isosceles') {
      const b = base ?? size, h = height ?? size;
      v = [[0, -h * 2 / 3], [b / 2, h / 3], [-b / 2, h / 3]];
    } else {
      v = [[0, -size / 2], [size / 2, size / 2], [-size / 2, size / 2]];
    }
    if (rotation) {
      const r = rotation * Math.PI / 180;
      v = v.map(([x, y]) => [
        x * Math.cos(r) - y * Math.sin(r),
        x * Math.sin(r) + y * Math.cos(r)
      ]);
    }
    return v;
  }

  function computeGeo(sh) {
    const t = sh.type;
    if (t === 'star')       return { verts: buildStar(sh) };
    if (t === 'square')     { const s = sh.size / 2; return { verts: [[-s,-s],[s,-s],[s,s],[-s,s]] }; }
    if (t === 'rect')       { const w = sh.width/2, h = sh.height/2; return { verts: [[-w,-h],[w,-h],[w,h],[-w,h]] }; }
    if (t === 'circle')     return { circle: true, r: sh.r };
    if (t === 'semicircle') return { semicircle: true, r: sh.r }; // flat edge at y=0, arc upward to y=-r
    if (t === 'triangle')   return { verts: buildTriangle(sh) };
    if (t === 'polygon')    return { verts: sh.vertices };
    return { verts: [] };
  }

  function getBBox(geo) {
    if (geo.circle)     return { minX: -geo.r, maxX: geo.r, minY: -geo.r, maxY: geo.r };
    if (geo.semicircle) return { minX: -geo.r, maxX: geo.r, minY: -geo.r, maxY: 0 };
    const xs = geo.verts.map(v => v[0]);
    const ys = geo.verts.map(v => v[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  $: geo  = computeGeo(shape);
  $: bbox = getBBox(geo);

  let svgW, svgH, ox, oy;
  $: {
    const p = padding;
    svgW = Math.round(bbox.maxX - bbox.minX + 2 * p);
    svgW = Math.round(bbox.maxX - bbox.minX + 2 * p);
    svgH = Math.round(bbox.maxY - bbox.minY + 2 * p);
    ox   = Math.round(-bbox.minX + p);
    oy   = Math.round(-bbox.minY + p);
  }

  $: pointStr   = geo.verts ? geo.verts.map(([x, y]) => `${ox + x},${oy + y}`).join(' ') : '';
  $: lineCoords = line
    ? { x1: ox + line.from[0], y1: oy + line.from[1], x2: ox + line.to[0], y2: oy + line.to[1] }
    : null;

</script>

<svg
  viewBox="0 0 {svgW} {svgH}"
  width={svgW}
  height={svgH}
  xmlns="http://www.w3.org/2000/svg"
  style="display: block;"
>
  <defs>
    {#if line}
      <marker id="sf-arr-e" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="black" />
      </marker>
      <marker id="sf-arr-s" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
        <polygon points="0 0, 10 3.5, 0 7" fill="black" />
      </marker>
    {/if}
  </defs>

  {#if geo.circle}
    <circle cx={ox} cy={oy} r={geo.r} fill="white" stroke="black" stroke-width="1.5" />
  {:else if geo.semicircle}
    <!-- flat edge at bottom (y=oy), arc sweeping clockwise upward (sweep=1 = CW in SVG = visually up) -->
    <path
      d="M {ox - geo.r},{oy} A {geo.r},{geo.r},0,0,1,{ox + geo.r},{oy} Z"
      fill="white"
      stroke="black"
      stroke-width="1.5"
    />
  {:else if geo.verts?.length}
    <polygon
      points={pointStr}
      fill="white"
      stroke="black"
      stroke-width="1.5"
      stroke-linejoin="miter"
    />
  {/if}

  {#if lineCoords}
    <line
      x1={lineCoords.x1} y1={lineCoords.y1}
      x2={lineCoords.x2} y2={lineCoords.y2}
      stroke="black"
      stroke-width="1.5"
      stroke-dasharray="7,5"
      marker-start="url(#sf-arr-s)"
      marker-end="url(#sf-arr-e)"
    />
  {/if}
</svg>

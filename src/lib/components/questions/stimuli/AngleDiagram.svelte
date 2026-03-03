<script>
  // AngleDiagram.svelte — parametric ray diagram from a single vertex.
  // params: {
  //   center: string                         — label at the vertex (e.g. "G")
  //   rays: [{ label, angle }]               — angle: degrees CCW from east (standard math)
  //   arc_labels: [{ between:[l1,l2], text, radius? }]
  //                                          — text placed at midpoint arc between two named rays
  // }

  export let params;

  const { center, rays, arc_labels } = params;

  const W  = 272;
  const H  = 220;
  const CX = 140;   // vertex x
  const CY = 152;   // vertex y
  const RAY_LEN = 100;   // line length (tip of arrowhead)
  const LABEL_R = 118;   // distance from center to point label

  const DEG = Math.PI / 180;

  function tip(angleDeg, r = RAY_LEN) {
    return [
      CX + r * Math.cos(angleDeg * DEG),
      CY - r * Math.sin(angleDeg * DEG),
    ];
  }

  const rayMap = Object.fromEntries(rays.map(r => [r.label, r.angle]));

  const arcs = arc_labels.map(a => {
    const a1  = rayMap[a.between[0]];
    const a2  = rayMap[a.between[1]];
    const mid = (a1 + a2) / 2;
    const r   = a.radius ?? 48;
    const [x, y] = tip(mid, r);
    return { text: a.text, x, y };
  });
</script>

<svg
  width={W}
  height={H}
  viewBox="0 0 {W} {H}"
  overflow="visible"
  style="display:block; margin:0 auto; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"
>
  <defs>
    <!-- Small solid arrowhead; tip placed at line endpoint via refX -->
    <marker
      id="arr"
      markerWidth="10" markerHeight="8"
      refX="10" refY="4"
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <polygon points="0 0, 10 4, 0 8" fill="#333" />
    </marker>
  </defs>

  <!-- Rays from vertex to each labeled point -->
  {#each rays as ray}
    {@const [tx, ty] = tip(ray.angle)}
    <line
      x1={CX} y1={CY}
      x2={tx}  y2={ty}
      stroke="#333" stroke-width="1.5"
      marker-end="url(#arr)"
    />
  {/each}

  <!-- Point labels (italic, past the arrowhead tip) -->
  {#each rays as ray}
    {@const [lx, ly] = tip(ray.angle, LABEL_R)}
    <text
      x={lx} y={ly + 5}
      text-anchor="middle"
      font-size="14" font-style="italic" fill="#333"
    >{ray.label}</text>
  {/each}

  <!-- Arc labels between rays (upright, degree/symbol text) -->
  {#each arcs as a}
    <text
      x={a.x} y={a.y + 5}
      text-anchor="middle"
      font-size="13" fill="#333"
    >{a.text}</text>
  {/each}

  <!-- Vertex: filled dot + italic label below -->
  <circle cx={CX} cy={CY} r="3" fill="#333" />
  <text
    x={CX + 5} y={CY + 19}
    text-anchor="middle"
    font-size="14" font-style="italic" fill="#333"
  >{center}</text>
</svg>

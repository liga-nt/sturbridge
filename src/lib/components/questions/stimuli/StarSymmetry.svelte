<script>
  // Parametric SVG: irregular 4-pointed star + dashed line with arrowheads.
  // star_points: array of 8 [x,y] pairs — alternating outer points and inner
  //   concave corners, clockwise from top.
  // line_from / line_to: [x,y] for the dashed arrow line endpoints.
  // viewBox: SVG viewBox string (default matches source PNG dimensions).
  export let params;

  const {
    viewBox = '0 0 237 236',
    star_points,
    line_from,
    line_to
  } = params;

  $: pointStr = star_points.map(p => p.join(',')).join(' ');
  $: [vx, vy, vw, vh] = viewBox.split(' ').map(Number);
</script>

<svg
  viewBox={viewBox}
  width={vw}
  height={vh}
  xmlns="http://www.w3.org/2000/svg"
  style="display: block;"
>
  <defs>
    <!-- Arrowhead for the end of the dashed line -->
    <marker id="star-arrow-end" markerWidth="10" markerHeight="7"
      refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="black" />
    </marker>
    <!-- Arrowhead for the start of the dashed line (reversed) -->
    <marker id="star-arrow-start" markerWidth="10" markerHeight="7"
      refX="1" refY="3.5" orient="auto-start-reverse">
      <polygon points="0 0, 10 3.5, 0 7" fill="black" />
    </marker>
  </defs>

  <!-- 4-pointed star polygon -->
  <polygon
    points={pointStr}
    fill="white"
    stroke="black"
    stroke-width="1.5"
    stroke-linejoin="miter"
  />

  <!-- Dashed diagonal line with arrows at both ends -->
  <line
    x1={line_from[0]} y1={line_from[1]}
    x2={line_to[0]}   y2={line_to[1]}
    stroke="black"
    stroke-width="1.5"
    stroke-dasharray="7,5"
    marker-start="url(#star-arrow-start)"
    marker-end="url(#star-arrow-end)"
  />
</svg>

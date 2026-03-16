<script>
  // params: { hour: number, minute: number }
  export let params = {};

  $: hour   = params.hour   ?? 12;
  $: minute = params.minute ?? 0;

  // Minute hand angle: 0 min = -90deg (pointing up at 12), full circle = 360
  $: minuteAngle = minute * 6 - 90;

  // Hour hand angle: moves 30 deg per hour + 0.5 deg per minute
  $: hourAngle = (hour % 12) * 30 + minute * 0.5 - 90;

  function polar(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const cx = 100;
  const cy = 100;
  const r  = 85;

  // Tick marks
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    const inner = r - (major ? 16 : 8);
    const outer = r - 2;
    const a = i * 6 - 90;
    const p1 = polar(cx, cy, inner, a);
    const p2 = polar(cx, cy, outer, a);
    return { p1, p2, major };
  });

  // Hour numbers (1–12)
  const numbers = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const a = n * 30 - 90;
    const pos = polar(cx, cy, r - 28, a);
    return { n, x: pos.x, y: pos.y };
  });

  $: minuteTip = polar(cx, cy, 70, minuteAngle);
  $: hourTip   = polar(cx, cy, 48, hourAngle);
</script>

<svg viewBox="0 0 200 200" width="175" height="175" aria-label="Analog clock showing {hour}:{minute.toString().padStart(2,'0')}">
  <!-- Outer circle -->
  <circle cx={cx} cy={cy} r={r} fill="white" stroke="#333" stroke-width="3"/>

  <!-- Tick marks -->
  {#each ticks as tick}
    <line
      x1={tick.p1.x} y1={tick.p1.y}
      x2={tick.p2.x} y2={tick.p2.y}
      stroke="#333"
      stroke-width={tick.major ? 2.5 : 1}
    />
  {/each}

  <!-- Hour numbers -->
  {#each numbers as num}
    <text
      x={num.x} y={num.y}
      text-anchor="middle"
      dominant-baseline="central"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="14"
      fill="#333"
    >{num.n}</text>
  {/each}

  <!-- Hour hand -->
  <line
    x1={cx} y1={cy}
    x2={hourTip.x} y2={hourTip.y}
    stroke="#333"
    stroke-width="6"
    stroke-linecap="round"
  />

  <!-- Minute hand -->
  <line
    x1={cx} y1={cy}
    x2={minuteTip.x} y2={minuteTip.y}
    stroke="#333"
    stroke-width="4"
    stroke-linecap="round"
  />

  <!-- Center dot -->
  <circle cx={cx} cy={cy} r="5" fill="#333"/>
</svg>

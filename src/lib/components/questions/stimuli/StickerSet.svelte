<script>
  export let params;         // { viewBox, stickers: [{id, shape, points|x/y/w/h, label}] }
  export let select_count = 2;

  let selected = new Set();

  function toggle(id) {
    if (selected.has(id)) {
      selected.delete(id);
    } else if (selected.size < select_count) {
      selected.add(id);
    }
    selected = selected;
  }

  function centroid(sticker) {
    if (sticker.shape === 'rect') {
      return { x: sticker.x + sticker.w / 2, y: sticker.y + sticker.h / 2 };
    }
    const pts = sticker.points;
    return {
      x: pts.reduce((s, p) => s + p[0], 0) / pts.length,
      y: pts.reduce((s, p) => s + p[1], 0) / pts.length
    };
  }

  function polyStr(pts) {
    return pts.map(p => p.join(',')).join(' ');
  }

  // Parse viewBox to get natural width for sizing
  $: vbWidth = params.viewBox.split(' ')[2] || 470;
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<svg
  viewBox={params.viewBox}
  width={vbWidth}
  style="max-width:100%; display:block; cursor:pointer;"
  xmlns="http://www.w3.org/2000/svg"
>
  {#each params.stickers as sticker}
    {@const c = centroid(sticker)}
    {@const lines = sticker.label.split('\n')}
    {@const sel = selected.has(sticker.id)}
    {@const lineH = 16}
    {@const startY = lines.length === 1 ? c.y : c.y - ((lines.length - 1) * lineH) / 2}

    <g on:click={() => toggle(sticker.id)} style="cursor:pointer;">
      {#if sticker.shape === 'rect'}
        <rect
          x={sticker.x} y={sticker.y}
          width={sticker.w} height={sticker.h}
          fill="white"
          stroke={sel ? '#0044aa' : '#010101'}
          stroke-width={sel ? 3 : 1}
          stroke-linecap="round" stroke-linejoin="round"
        />
        {#if sel}
          <rect
            x={sticker.x} y={sticker.y}
            width={sticker.w} height={sticker.h}
            fill="#0088cc" fill-opacity="0.25" stroke="none"
          />
        {/if}
      {:else}
        <polygon
          points={polyStr(sticker.points)}
          fill="white"
          stroke={sel ? '#0044aa' : '#010101'}
          stroke-width={sel ? 3 : 1}
          stroke-linecap="round" stroke-linejoin="round"
        />
        {#if sel}
          <polygon
            points={polyStr(sticker.points)}
            fill="#0088cc" fill-opacity="0.25" stroke="none"
          />
        {/if}
      {/if}

      <!-- Label text, centered in shape -->
      <text
        text-anchor="middle"
        font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-size="13"
        fill="#222"
        pointer-events="none"
      >
        {#each lines as line, i}
          <tspan x={c.x} y={startY + i * lineH}>{line}</tspan>
        {/each}
      </text>
    </g>
  {/each}
</svg>

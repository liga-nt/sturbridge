<script>
  import { onMount, onDestroy } from 'svelte';
  import { geoMercator, geoPath } from 'd3-geo';
  import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';
  import { select } from 'd3-selection';
  import { MAP_ROUTES } from '$lib/data/greek/map-routes.js';

  // ── Canvas size ────────────────────────────────────────────────────────────
  export const MAP_W = 1000;
  export const MAP_H = 430;

  // ── Projection (pure math — SSR-safe, computed once) ──────────────────────
  const MED_BBOX = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[
    [-8, 25], [44, 25], [44, 48.5], [-8, 48.5], [-8, 25]
  ]] }, properties: {} };

  const projection = geoMercator().fitExtent([[20, 20], [MAP_W - 20, MAP_H - 20]], MED_BBOX);
  const pathGen    = geoPath(projection);

  function proj(lon, lat) {
    const [x, y] = projection([lon, lat]);
    return { x, y };
  }

  // ── Layer definitions ─────────────────────────────────────────────────────
  // fill/stroke/strokeWidth/fillOpacity are SVG attribute values
  const LAYER_DEFS = [
    // Physical
    { id: 'rivers',           label: 'Rivers',             cat: 'Physical',
      stroke: '#5da0c0', strokeWidth: 1,   fill: 'none' },

    // Infrastructure
    { id: 'roads',            label: 'Roads',              cat: 'Infrastructure',
      stroke: '#9b7e58', strokeWidth: 0.4, fill: 'none' },
    { id: 'aqueducts',        label: 'Aqueducts',          cat: 'Infrastructure',
      stroke: '#c07040', strokeWidth: 0.8, fill: 'none' },
    { id: 'canals',           label: 'Canals',             cat: 'Infrastructure',
      stroke: '#4a90b8', strokeWidth: 0.8, fill: 'none' },
    { id: 'walls',            label: 'Walls',              cat: 'Infrastructure',
      stroke: '#555',    strokeWidth: 1.2, fill: 'none' },
    { id: 'urban_areas',      label: 'Urban Areas',        cat: 'Infrastructure',
      stroke: '#a07850', strokeWidth: 0.5, fill: '#c4a882', fillOpacity: 0.5 },

    // Empires
    { id: 'alexanders_empire',label: "Alexander's Empire", cat: 'Empires',
      stroke: '#6a4ca0', strokeWidth: 0.8, fill: '#8b6cc0', fillOpacity: 0.15 },
    { id: 'persian_empire',   label: 'Persian Empire',     cat: 'Empires',
      stroke: '#b08020', strokeWidth: 0.8, fill: '#d4a030', fillOpacity: 0.15 },
    { id: 'roman_60bce',      label: 'Roman Empire 60 BCE',cat: 'Empires',
      stroke: '#a03030', strokeWidth: 0.8, fill: '#c04040', fillOpacity: 0.15 },
    { id: 'roman_117ce',      label: 'Roman Empire 117 CE',cat: 'Empires',
      stroke: '#a03030', strokeWidth: 0.8, fill: '#c04040', fillOpacity: 0.15 },
    { id: 'roman_200ce',      label: 'Roman Empire 200 CE',cat: 'Empires',
      stroke: '#a03030', strokeWidth: 0.8, fill: '#c04040', fillOpacity: 0.15 },
  ];

  const LAYER_CATS = [...new Set(LAYER_DEFS.map(l => l.cat))];
  const LAYER_MAP  = Object.fromEntries(LAYER_DEFS.map(l => [l.id, l]));

  // ── Place registry (Pleiades, CC BY 3.0) ─────────────────────────────────
  const PLACES = {
    athens:       { name: 'Athens',       lat: 37.9716, lon: 23.7238, type: 'city',    anchor: 'start',  dx:  8, dy:  3 },
    sparta:       { name: 'Sparta',       lat: 37.0818, lon: 22.4247, type: 'city',    anchor: 'end',    dx: -8, dy:  4 },
    thebes:       { name: 'Thebes',       lat: 38.3199, lon: 23.3177, type: 'city',    anchor: 'end',    dx: -8, dy: -4 },
    troy:         { name: 'Troy',         lat: 39.9574, lon: 26.2385, type: 'city',    anchor: 'start',  dx:  8, dy: -3 },
    delphi:       { name: 'Delphi',       lat: 38.4823, lon: 22.5012, type: 'city',    anchor: 'end',    dx: -8, dy: -4 },
    olympia:      { name: 'Olympia',      lat: 37.6387, lon: 21.6308, type: 'city',    anchor: 'end',    dx: -8, dy:  4 },
    corinth:      { name: 'Corinth',      lat: 37.9056, lon: 22.8786, type: 'city',    anchor: 'start',  dx:  8, dy: 10 },
    mycenae:      { name: 'Mycenae',      lat: 37.7275, lon: 22.7538, type: 'city',    anchor: 'end',    dx: -8, dy: -4 },
    alexandria:   { name: 'Alexandria',   lat: 31.2014, lon: 29.9098, type: 'city',    anchor: 'start',  dx:  8, dy:  4 },
    crete:        { name: 'Crete',        lat: 35.2148, lon: 25.0741, type: 'island',  anchor: 'middle', dx:  0, dy: 14 },
    sicily:       { name: 'Sicily',       lat: 37.5997, lon: 14.0546, type: 'island',  anchor: 'end',    dx: -8, dy: 12 },
    rhodes:       { name: 'Rhodes',       lat: 36.4431, lon: 28.2276, type: 'island',  anchor: 'start',  dx:  8, dy:  3 },
    euboea:       { name: 'Euboea',       lat: 38.53,   lon: 23.87,   type: 'island',  anchor: 'start',  dx:  8, dy: -4 },
    hellespont:   { name: 'Hellespont',   lat: 40.2188, lon: 26.4769, type: 'strait',  anchor: 'start',  dx:  8, dy: -3 },
    aegean_sea:   { name: 'Aegean Sea',   lat: 38.0,    lon: 24.5,    type: 'sea',     anchor: 'middle', dx:  0, dy:  0 },
    ionian_sea:   { name: 'Ionian Sea',   lat: 37.5,    lon: 19.5,    type: 'sea',     anchor: 'middle', dx:  0, dy:  0 },
    black_sea:    { name: 'Black Sea',    lat: 43.0,    lon: 33.0,    type: 'sea',     anchor: 'middle', dx:  0, dy:  0 },
    adriatic_sea: { name: 'Adriatic Sea', lat: 42.0,    lon: 15.5,    type: 'sea',     anchor: 'middle', dx:  0, dy:  0 },
    nile:         { name: 'Nile',         lat: 27.5,    lon: 31.0,    type: 'river',   anchor: 'start',  dx:  6, dy:  0 },
  };

  const DOT_PLACES   = Object.entries(PLACES).filter(([, p]) => p.type !== 'sea' && p.type !== 'river');
  const LABEL_PLACES = Object.entries(PLACES).filter(([, p]) => p.type === 'sea' || p.type === 'river');

  export const SELECTABLE = DOT_PLACES.map(([k, p]) => ({ key: k, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const ROUTE_LIST = Object.entries(MAP_ROUTES);

  // ── Props ──────────────────────────────────────────────────────────────────
  export let highlighted   = new Set();
  export let activeRouteId = ROUTE_LIST.length ? ROUTE_LIST[0][0] : null;
  export let showControls  = true;
  export let activeLayers  = new Set(); // persisted layer state

  // ── Base GeoJSON ──────────────────────────────────────────────────────────
  let oceanD = '';
  let waterD = '';

  async function loadGeo() {
    try {
      const [oRes, wRes] = await Promise.all([
        fetch('/data/Greek/ocean.geojson'),
        fetch('/data/Greek/inland.geojson'),
      ]);
      const [oGeo, wGeo] = await Promise.all([oRes.json(), wRes.json()]);
      oceanD = oGeo.features.map(f => pathGen(f)).filter(Boolean).join(' ');
      waterD = wGeo.features.map(f => pathGen(f)).filter(Boolean).join(' ');
    } catch (e) {
      console.error('MediterraneanMap: base GeoJSON load failed', e);
    }
  }

  // ── Layer data (lazy-loaded, cached) ──────────────────────────────────────
  let layerPaths = {}; // { [layerId]: svgPathString }
  let layerLoading = {}; // { [layerId]: boolean }

  async function toggleLayer(id) {
    const next = new Set(activeLayers);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!layerPaths[id] && !layerLoading[id]) {
        layerLoading = { ...layerLoading, [id]: true };
        try {
          const res  = await fetch(`/data/Greek/layers/${id}.geojson`);
          const geo  = await res.json();
          layerPaths = { ...layerPaths, [id]: geo.features.map(f => pathGen(f)).filter(Boolean).join(' ') };
        } catch (e) {
          console.error(`MediterraneanMap: failed to load layer ${id}`, e);
        }
        layerLoading = { ...layerLoading, [id]: false };
      }
    }
    activeLayers = next;
  }

  // ── Zoom / pan ────────────────────────────────────────────────────────────
  let svgEl;
  let transform = zoomIdentity;

  const zoomBehavior = d3zoom()
    .scaleExtent([0.5, 80])
    .on('zoom', ({ transform: t }) => { transform = t; });

  let zoomCleanup;

  onMount(() => {
    const sel = select(svgEl);
    sel.call(zoomBehavior);
    svgEl.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    zoomCleanup = () => sel.on('.zoom', null);
    loadGeo();
  });

  onDestroy(() => zoomCleanup?.());

  export function resetZoom() {
    select(svgEl).call(zoomBehavior.transform, zoomIdentity);
  }

  // ── Arc path between two place keys ───────────────────────────────────────
  function arcPath(k1, k2) {
    const p1 = proj(PLACES[k1].lon, PLACES[k1].lat);
    const p2 = proj(PLACES[k2].lon, PLACES[k2].lat);
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const cy = my - dist * 0.22;
    return `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} Q${mx.toFixed(1)},${cy.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  $: activeRoute = activeRouteId ? MAP_ROUTES[activeRouteId] : null;

  function togglePlace(key) {
    const next = new Set(highlighted);
    if (next.has(key)) next.delete(key); else next.add(key);
    highlighted = next;
  }

  // ── PNG export ────────────────────────────────────────────────────────────
  export async function getBlob() {
    if (!svgEl) throw new Error('SVG not mounted');
    const xml     = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl  = URL.createObjectURL(svgBlob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = MAP_W;
        canvas.height = MAP_H;
        canvas.getContext('2d').drawImage(img, 0, 0, MAP_W, MAP_H);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob(resolve, 'image/png');
      };
      img.onerror = (e) => { URL.revokeObjectURL(svgUrl); reject(e); };
      img.src = svgUrl;
    });
  }
</script>

<div class="flex gap-4">

  <!-- ── Controls ─────────────────────────────────────────────────────────── -->
  {#if showControls}
  <div class="w-48 shrink-0 space-y-4 text-xs overflow-y-auto" style="max-height:420px">

    <!-- Highlight places -->
    <div>
      <p class="font-semibold text-gray-500 mb-1.5 uppercase tracking-wide text-xs">Highlight</p>
      <div class="space-y-0.5">
        {#each SELECTABLE as { key, name }}
          {@const on = highlighted.has(key)}
          <label class="flex items-center gap-1.5 cursor-pointer group">
            <input type="checkbox" checked={on} on:change={() => togglePlace(key)}
              class="shrink-0 accent-amber-500" />
            <span class="{on ? 'text-amber-700 font-semibold' : 'text-gray-600'} group-hover:text-gray-800 transition-colors">
              {name}
            </span>
          </label>
        {/each}
      </div>
    </div>

    <!-- Layers -->
    {#each LAYER_CATS as cat}
      <div>
        <p class="font-semibold text-gray-500 mb-1.5 uppercase tracking-wide text-xs">{cat}</p>
        <div class="space-y-0.5">
          {#each LAYER_DEFS.filter(l => l.cat === cat) as layer}
            {@const on = activeLayers.has(layer.id)}
            {@const loading = layerLoading[layer.id]}
            <label class="flex items-center gap-1.5 cursor-pointer group">
              <input type="checkbox" checked={on} disabled={loading}
                on:change={() => toggleLayer(layer.id)}
                class="shrink-0 accent-indigo-500" />
              <span class="{on ? 'text-indigo-700 font-semibold' : 'text-gray-600'} group-hover:text-gray-800 transition-colors truncate">
                {layer.label}{loading ? ' …' : ''}
              </span>
            </label>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Route -->
    {#if ROUTE_LIST.length}
      <div>
        <p class="font-semibold text-gray-500 mb-1.5 uppercase tracking-wide text-xs">Route</p>
        <select bind:value={activeRouteId}
          class="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-700">
          <option value={null}>— none —</option>
          {#each ROUTE_LIST as [id, r]}
            <option value={id}>{r.name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <button on:click={resetZoom}
      class="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 transition-colors">
      Reset View
    </button>

    <p class="text-gray-300 leading-snug" style="font-size:9px">
      Map: AWMC geodata (ODbL)<br>
      Places: Pleiades (CC BY 3.0)
    </p>

  </div>
  {/if}

  <!-- ── Map ──────────────────────────────────────────────────────────────── -->
  <div class="flex-1 min-w-0" style="cursor:grab">
    <svg
      bind:this={svgEl}
      viewBox="0 0 {MAP_W} {MAP_H}"
      style="width:100%;height:auto;display:block;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12);user-select:none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="map-clip">
          <rect width={MAP_W} height={MAP_H} />
        </clipPath>
        {#each ROUTE_LIST as [id, r]}
          <marker id="arrow-{id}" markerWidth="6" markerHeight="6"
            refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 Z" fill={r.color} opacity="0.85" />
          </marker>
        {/each}
      </defs>

      <!-- Land background -->
      <rect width={MAP_W} height={MAP_H} fill="#ede4cc" />

      <!-- Zoomable/pannable content -->
      <g clip-path="url(#map-clip)" transform={transform.toString()}>

        <!-- Ocean -->
        {#if oceanD}
          <path d={oceanD} fill="#b8d4e8" stroke="none" />
        {/if}

        <!-- Inland water -->
        {#if waterD}
          <path d={waterD} fill="#8fc4dc" stroke="#6aaac8" stroke-width="0.6" />
        {/if}

        <!-- ── Optional layers (render below routes/places) ───────────── -->
        {#each LAYER_DEFS as layer}
          {#if activeLayers.has(layer.id) && layerPaths[layer.id]}
            <path
              d={layerPaths[layer.id]}
              fill={layer.fill ?? 'none'}
              fill-opacity={layer.fillOpacity ?? 1}
              stroke={layer.stroke ?? 'none'}
              stroke-width={(layer.strokeWidth ?? 1) / transform.k}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          {/if}
        {/each}

        <!-- ── Routes ──────────────────────────────────────────────────── -->
        {#if activeRoute}
          {#each activeRoute.segments as [k1, k2]}
            <path
              d={arcPath(k1, k2)}
              fill="none"
              stroke={activeRoute.color}
              stroke-width="2"
              stroke-linecap="round"
              opacity="0.85"
              marker-end="url(#arrow-{activeRouteId})"
            />
          {/each}
        {/if}

        <!-- ── Sea / River labels ─────────────────────────────────────── -->
        {#each LABEL_PLACES as [key, place]}
          {@const p = proj(place.lon, place.lat)}
          <text
            x={p.x} y={p.y}
            text-anchor="middle"
            font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
            font-size={11 / transform.k}
            font-style="italic"
            fill="#4a7fa0"
            opacity="0.85"
          >{place.name}</text>
        {/each}

        <!-- ── Place dots + labels ────────────────────────────────────── -->
        {#each DOT_PLACES as [key, place]}
          {@const p = proj(place.lon, place.lat)}
          {@const on = highlighted.has(key)}
          {@const r = on ? 5 / transform.k : 3 / transform.k}
          {@const off = { dx: place.dx / transform.k, dy: place.dy / transform.k }}

          {#if on}
            <circle cx={p.x} cy={p.y} r={9 / transform.k} fill="#fcd34d" opacity="0.35" />
          {/if}

          <circle
            cx={p.x} cy={p.y} r={r}
            fill={on ? '#d97706' : '#475569'}
            stroke={on ? '#92400e' : '#334155'}
            stroke-width={on ? 1 / transform.k : 0.5 / transform.k}
          />

          {#if on}
            <text
              x={p.x + off.dx} y={p.y + off.dy}
              text-anchor={place.anchor}
              font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
              font-size={12 / transform.k}
              font-weight="700"
              stroke="white"
              stroke-width={3 / transform.k}
              stroke-linejoin="round"
              paint-order="stroke"
              fill="#92400e"
            >{place.name}</text>
          {:else}
            <text
              x={p.x + off.dx} y={p.y + off.dy}
              text-anchor={place.anchor}
              font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
              font-size={8 / transform.k}
              fill="#1e293b"
              opacity="0.7"
            >{place.name}</text>
          {/if}
        {/each}

      </g>
    </svg>
  </div>

</div>

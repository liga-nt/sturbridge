"""
Process AWMC + Natural Earth GeoJSON into simplified layers for D3 rendering.

Outputs to static/data/Greek/layers/ — one file per toggleable layer.
Base map files (ocean, inland) stay in static/data/Greek/.

Usage: python3 scripts/process-map-geodata.py
"""

import json, math, urllib.request, os

# ── Config ────────────────────────────────────────────────────────────────────
MIN_LON, MAX_LON = -10.0, 46.0
MIN_LAT, MAX_LAT = 24.0, 50.0
MARGIN = 3.0

AWMC = "https://raw.githubusercontent.com/AWMC/geodata/master"
NE   = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
CACHE   = "/tmp/awmc_cache"
OUT_BASE   = os.path.join(os.path.dirname(__file__), '../static/data/Greek')
OUT_LAYERS = os.path.join(OUT_BASE, 'layers')
os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT_BASE,   exist_ok=True)
os.makedirs(OUT_LAYERS, exist_ok=True)

# ── Layers to process ─────────────────────────────────────────────────────────
# (url_path, cache_fname, out_fname, geom_type, epsilon, extra)
LAYERS = [
    # ── Physical ──────────────────────────────────────────────────────────────
    (f"{NE}/ne_50m_rivers_lake_centerlines.geojson",
     "ne_rivers.geojson", "rivers.geojson", "line", 0.02, {}),

    # ── Cultural infrastructure ───────────────────────────────────────────────
    (f"{AWMC}/Cultural-Data/roads/roads.geojson",
     "roads.geojson", "roads.geojson", "line", 0.01, {}),
    (f"{AWMC}/Cultural-Data/aqueducts/aqueducts.geojson",
     "aqueducts.geojson", "aqueducts.geojson", "line", 0.01, {}),
    (f"{AWMC}/Cultural-Data/canals/canals.geojson",
     "canals.geojson", "canals.geojson", "line", 0.01, {}),
    (f"{AWMC}/Cultural-Data/walls/walls.geojson",
     "walls.geojson", "walls.geojson", "line", 0.01, {}),
    (f"{AWMC}/Cultural-Data/urban_areas/urban_areas.geojson",
     "urban_areas.geojson", "urban_areas.geojson", "polygon", 0.005, {}),

    # ── Political shading ─────────────────────────────────────────────────────
    (f"{AWMC}/Cultural-Data/political_shading/alexanders_empire/alexanders_empire.geojson",
     "alexanders_empire.geojson", "alexanders_empire.geojson", "polygon", 0.04, {}),
    (f"{AWMC}/Cultural-Data/political_shading/persian_extent/extent_of_the_persian_empire.geojson",
     "persian_empire.geojson", "persian_empire.geojson", "polygon", 0.04, {}),
    (f"{AWMC}/Cultural-Data/political_shading/roman_empire_bce_60/roman_empire_bce_60.geojson",
     "roman_60bce.geojson", "roman_60bce.geojson", "polygon", 0.04, {}),
    (f"{AWMC}/Cultural-Data/political_shading/roman_empire_ce_117_extent/roman_empire_ce_117_extent.geojson",
     "roman_117ce.geojson", "roman_117ce.geojson", "polygon", 0.04, {}),
    (f"{AWMC}/Cultural-Data/political_shading/roman_empire_ce_200_extent/roman_empire_ce_200_extent.geojson",
     "roman_200ce.geojson", "roman_200ce.geojson", "polygon", 0.04, {}),
]

# Base map layers (stay in OUT_BASE, not OUT_LAYERS)
OCEAN_FILES = [
    (f"{AWMC}/Physical%20Data/open_water_osm_edits/OW_Aegean.geojson",             "OW_Aegean.geojson"),
    (f"{AWMC}/Physical%20Data/open_water_osm_edits/OW_East_Med.geojson",           "OW_East_Med.geojson"),
    (f"{AWMC}/Physical%20Data/open_water_osm_edits/OW_Adriatic_Tyrhhenian.geojson","OW_Adriatic.geojson"),
    (f"{AWMC}/Physical%20Data/open_water_osm_edits/OW_Black_Sea.geojson",          "OW_Black_Sea.geojson"),
    (f"{AWMC}/Physical%20Data/open_water_osm_edits/OW_Iberia.geojson",             "OW_Iberia.geojson"),
    (f"{AWMC}/Physical%20Data/open_water_osm_edits/OW_Atlantic.geojson",           "OW_Atlantic.geojson"),
    (f"{AWMC}/Physical%20Data/open_water_osm_edits/OW_Red_Sea.geojson",            "OW_Red_Sea.geojson"),
    (f"{AWMC}/Physical%20Data/open_water_osm_edits/OW_Arabian.geojson",            "OW_Arabian.geojson"),
]

# ── Helpers ───────────────────────────────────────────────────────────────────
def fetch(url, fname):
    path = os.path.join(CACHE, fname)
    if os.path.exists(path):
        print(f"  cached  {fname}")
    else:
        print(f"  fetch   {fname} ...", end=' ', flush=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        urllib.request.urlretrieve(url, path)
        print("done")
    with open(path) as f:
        return json.load(f)

def in_bbox(lons, lats):
    return (max(lons) >= MIN_LON - MARGIN and min(lons) <= MAX_LON + MARGIN and
            max(lats) >= MIN_LAT - MARGIN and min(lats) <= MAX_LAT + MARGIN)

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    dmax, idx = 0.0, 0
    end = len(pts) - 1
    ax, ay = pts[0]; bx, by = pts[end]
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy)
    for i in range(1, end):
        px, py = pts[i]
        if L == 0:
            d = math.hypot(px - ax, py - ay)
        else:
            t = max(0, min(1, ((px-ax)*dx + (py-ay)*dy) / (L*L)))
            d = math.hypot(px - (ax + t*dx), py - (ay + t*dy))
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx+1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[end]]

def simplify_ring(coords, eps):
    pts = [(c[0], c[1]) for c in coords]
    r = rdp(pts, eps)
    if r[0] != r[-1]: r.append(r[0])
    return [[p[0], p[1]] for p in r] if len(r) >= 4 else None

def simplify_line(coords, eps, min_pts=3):
    pts = [(c[0], c[1]) for c in coords]
    r = rdp(pts, eps)
    return [[p[0], p[1]] for p in r] if len(r) >= min_pts else None

def process_polygon(feat, eps):
    geom = feat.get('geometry') or feat
    if not geom: return None
    gtype, coords = geom['type'], geom['coordinates']
    if gtype == 'Polygon':
        rings = []
        for ring in coords:
            lons = [c[0] for c in ring]; lats = [c[1] for c in ring]
            if not in_bbox(lons, lats): continue
            s = simplify_ring(ring, eps)
            if s: rings.append(s)
        return {'type':'Feature','geometry':{'type':'Polygon','coordinates':rings},'properties':{}} if rings else None
    elif gtype == 'MultiPolygon':
        polys = []
        for poly in coords:
            rings = []
            for ring in poly:
                lons = [c[0] for c in ring]; lats = [c[1] for c in ring]
                if not in_bbox(lons, lats): continue
                s = simplify_ring(ring, eps)
                if s: rings.append(s)
            if rings: polys.append(rings)
        return {'type':'Feature','geometry':{'type':'MultiPolygon','coordinates':polys},'properties':{}} if polys else None
    return None

def process_line(feat, eps):
    geom = feat.get('geometry') or feat
    if not geom: return None
    gtype, coords = geom['type'], geom['coordinates']
    if gtype == 'LineString':
        lons = [c[0] for c in coords]; lats = [c[1] for c in coords]
        if not in_bbox(lons, lats): return None
        s = simplify_line(coords, eps)
        return {'type':'Feature','geometry':{'type':'LineString','coordinates':s},'properties':{}} if s else None
    elif gtype == 'MultiLineString':
        lines = []
        for line in coords:
            lons = [c[0] for c in line]; lats = [c[1] for c in line]
            if not in_bbox(lons, lats): continue
            s = simplify_line(line, eps)
            if s: lines.append(s)
        return {'type':'Feature','geometry':{'type':'MultiLineString','coordinates':lines},'properties':{}} if lines else None
    return None

def write(path, features):
    data = {'type':'FeatureCollection','features':features}
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',',':'))
    kb = os.path.getsize(path) / 1024
    print(f"  → {os.path.basename(path):30s} {len(features):4d} features  {kb:.0f} KB")

# ── Base map: ocean + inland ──────────────────────────────────────────────────
print("\n── Base map ──────────────────────────────────────────────────────────")
ocean_feats = []
for url, fname in OCEAN_FILES:
    data = fetch(url, fname)
    for feat in data.get('features', []):
        f = process_polygon(feat, 0.04)
        if f: ocean_feats.append(f)
print(f"  {len(ocean_feats)} ocean features")
write(os.path.join(OUT_BASE, 'ocean.geojson'), ocean_feats)

inland_raw = fetch(f"{AWMC}/Physical%20Data/inland_water/inland-water-OSM.geojson", "inland.geojson")
water_feats = []
for feat in inland_raw.get('features', []):
    f = process_polygon(feat, 0.03)
    if not f: continue
    g = f['geometry']
    total = sum(len(r) for r in g['coordinates']) if g['type']=='Polygon' else sum(len(r) for p in g['coordinates'] for r in p)
    if total >= 30: water_feats.append(f)
write(os.path.join(OUT_BASE, 'inland.geojson'), water_feats)

# ── Layers ────────────────────────────────────────────────────────────────────
print("\n── Layers ────────────────────────────────────────────────────────────")
for url, cache_fname, out_fname, geom_type, eps, _ in LAYERS:
    data = fetch(url, cache_fname)
    feats = []
    for feat in data.get('features', []):
        f = process_polygon(feat, eps) if geom_type == 'polygon' else process_line(feat, eps)
        if f: feats.append(f)
    write(os.path.join(OUT_LAYERS, out_fname), feats)

print("\nDone.")

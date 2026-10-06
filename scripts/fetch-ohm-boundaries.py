#!/usr/bin/env python3
"""Cache OpenHistoricalMap's sovereign boundaries, simplified, for the flag maps.

WHY THIS EXISTS. The flag pages carry internal region maps that colour a
country's ground by who held it. Until now each map was drawn by hand and
scoped to one episode — «Russia torn apart, 1918-1922», «Italy Splits in Two,
1943-1945» — because that was the only ground anyone had traced. This script
fetches real, dated boundaries so the maps can follow their own timelines.

THE SOURCE. OpenHistoricalMap, https://www.openhistoricalmap.org — CC0, so
public domain, commercial use included, no share-alike. The obvious
alternative, aourednik/historical-basemaps, is GPL-3.0 and copyleft; that is
the wrong licence to attach to this site, so it is not used.

WHAT IT CANNOT DO. Measured against the pages' own 1,132 era snapshots, using
a deliberately generous bounding-box test, OHM covers 96% of 1900s eras, 92%
of 1800s, 85% of 1700s, 68% of 1500s, about half of 1200-1400, and almost
nothing before 900 CE. Only 42 of 178 pages are covered end to end. Where
there is no polygon this script writes NOTHING rather than a guess: an era
with no data stays blank on the map and says so. Early eras are filled in
separately, by hand, and are labelled as hand-approximated wherever they
appear.

VOLUME. Full-resolution geometry is enormous — one country's overlapping
polities came back as 651MB. Relations are therefore fetched in batches,
simplified immediately at a tolerance suited to a 300x200px schematic, and the
raw response discarded. The cache is keyed by relation id and shared across
every country, because the Roman Empire is one polygon that dozens of pages
need.
"""

import json, os, re, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, '..', 'data', 'ohm')
API  = 'https://overpass-api.openhistoricalmap.org/api/interpreter'
UA   = ('RecordAtlas/1.0 (+https://recordatlas.org/; '
        'david.defranceski@gmail.com) historical boundary cache')

# A 300x200 schematic cannot show detail finer than roughly a tenth of a
# degree, and carrying it costs megabytes per polity.
TOLERANCE = 0.05
MIN_AREA  = 0.02          # drop islands too small to see at this size
BATCH     = 60
PAUSE     = 4             # seconds between calls; OHM is a volunteer service


def overpass(query, timeout=300):
    data = urllib.parse.urlencode({'data': query}).encode()
    req = urllib.request.Request(API, data=data, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def year(s):
    m = re.match(r'^(-?)(\d{1,4})', str(s or '').strip())
    if not m: return None
    return (-1 if m.group(1) else 1) * int(m.group(2))


def outer_ways(el):
    """The outer boundary of a relation, as separate open line segments.

    A border relation is not a polygon: Overpass hands back the member WAYS,
    each an open run of points, and a country's outline is dozens or hundreds
    of them in no particular order or direction. Treating each way as its own
    polygon is the obvious mistake and a quiet one — it yields shapes with
    plausible point counts that are geometric nonsense. It put Baden and
    Württemberg at identical 0.3-degree bounding boxes (the one border way
    they share, and nothing else) and gave the Roman Empire 221 «rings», none
    of them the Empire. The ways have to be stitched first; see polygons().
    """
    out = []
    for m in el.get('members', []):
        if m.get('type') != 'way' or m.get('role') not in ('outer', ''):
            continue
        g = m.get('geometry')
        if not g: continue
        pts = [(p['lon'], p['lat']) for p in g if p]
        if len(pts) >= 2: out.append(pts)
    return out


def main():
    global LineString, linemerge, polygonize
    os.makedirs(OUT, exist_ok=True)
    try:
        from shapely.geometry import Polygon, MultiPolygon, LineString
        from shapely.ops import unary_union, linemerge, polygonize
    except ImportError:
        sys.exit('shapely is required: pip3 install shapely')

    print('listing sovereign boundaries...')
    listing = overpass('[out:json][timeout:280];'
                       'relation["boundary"="administrative"]["admin_level"="2"];'
                       'out tags;')
    els = listing['elements']
    meta = {}
    for e in els:
        t = e['tags']
        s = year(t.get('start_date'))
        if s is None: continue
        meta[e['id']] = dict(
            id=e['id'], s=s, e=year(t.get('end_date')),
            name=t.get('name:en') or t.get('name') or '?',
            native=t.get('name'), wikidata=t.get('wikidata'))
    ids = sorted(meta)
    print('  %d dated sovereign relations' % len(ids))

    cache_path = os.path.join(OUT, 'boundaries.json')
    cache = {}
    if os.path.exists(cache_path):
        cache = json.load(open(cache_path)).get('shapes', {})
        print('  %d already cached' % len(cache))

    todo = [i for i in ids if str(i) not in cache]
    print('  %d to fetch, in batches of %d' % (len(todo), BATCH))

    for n in range(0, len(todo), BATCH):
        chunk = todo[n:n + BATCH]
        q = ('[out:json][timeout:280];(' +
             ''.join('relation(%d);' % i for i in chunk) +
             ');out geom;')
        try:
            res = overpass(q)
        except Exception as ex:
            print('  batch %d-%d FAILED: %s' % (n, n + len(chunk), ex))
            time.sleep(PAUSE * 4)
            continue

        for el in res.get('elements', []):
            segs = outer_ways(el)
            if not segs: continue
            try:
                # Stitch the loose ways into closed rings, then take the areas
                # they enclose. linemerge joins segments that share endpoints;
                # polygonize closes what it can and silently drops what it
                # cannot, which is the right behaviour for a boundary with a
                # gap in it — better a missing island than an invented coast.
                merged = linemerge([LineString(sg) for sg in segs])
                polys = [p for p in polygonize(merged)
                         if p.is_valid and not p.is_empty and p.area >= MIN_AREA]
            except Exception:
                polys = []
            if not polys: continue
            try:
                geom = unary_union(polys).simplify(TOLERANCE, preserve_topology=True)
            except Exception:
                continue
            if geom.is_empty: continue
            parts = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
            coords = [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords]
                      for p in parts if p.area >= MIN_AREA]
            if not coords: continue
            cache[str(el['id'])] = coords

        done = n + len(chunk)
        print('  %d/%d fetched, %d shapes cached' % (done, len(todo), len(cache)))
        json.dump({'note': ('Sovereign boundaries from OpenHistoricalMap (CC0), '
                            'simplified to %g degrees for 300x200 schematics. '
                            'Holes and islands under %g sq deg dropped.'
                            % (TOLERANCE, MIN_AREA)),
                   'source': 'https://www.openhistoricalmap.org',
                   'licence': 'CC0 1.0 Universal (public domain)',
                   'meta': meta, 'shapes': cache},
                  open(cache_path, 'w'))
        time.sleep(PAUSE)

    print('done: %d shapes in %s' % (len(cache), cache_path))


if __name__ == '__main__':
    main()

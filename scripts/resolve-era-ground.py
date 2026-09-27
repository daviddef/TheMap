#!/usr/bin/env python3
"""Answer, for every era on every flag page: who actually held this ground?

The flag pages each carry a timeline and an internal map. Until now the map
was drawn by hand and scoped to one episode, because one episode was all
anyone had traced. This resolves each era against the cached
OpenHistoricalMap boundaries (see fetch-ohm-boundaries.py) by GEOGRAPHY
rather than by name.

WHY NOT BY NAME. The obvious approach — match the era's title to a polity's
title — was tried and measured at 27%, and its near-misses were worse than
its misses: «First Republic of Armenia» matched «First Nigerian Republic»,
«New Kingdom» matched «New Kingdom of Granada», «People's Socialist
Republic» matched «Belarusian People's Republic». A name is a bad key for a
question that is really about ground.

SO: take the country's own point, ask which dated polygons contain it in the
era's year, and let the answer be whatever it is — including more than one
(a divided country) or none at all.

NONE AT ALL IS A RESULT. Where no polygon covers the ground, this writes no
polity. It does not fall back to the nearest century, the modern border, or
the country's own outline. An era with no data is reported as uncovered so
that it can be drawn by hand deliberately and labelled as hand-approximated,
rather than quietly inheriting a shape nobody vouched for.
"""

import json, os, re, sys, glob, collections

HERE  = os.path.dirname(os.path.abspath(__file__))
ROOT  = os.path.join(HERE, '..')
FLAGS = os.path.join(ROOT, 'site', 'public', 'flags')
CACHE = os.path.join(ROOT, 'data', 'ohm', 'boundaries.json')
OUT   = os.path.join(ROOT, 'data', 'ohm', 'era-ground.json')

ALIAS = {
    'uk': 'united kingdom', 'united-states': 'united states',
    'cote-divoire': "cote d'ivoire", 'dr-congo': 'democratic republic of the congo',
    'congo-brazzaville': 'republic of the congo', 'macedonia': 'north macedonia',
    'sao-tome-principe': 'sao tome and principe', 'ancient-egypt': 'egypt',
    'czechia': 'czechia', 'bosnia': 'bosnia and herzegovina',
    'united-arab-emirates': 'united arab emirates',
}


def norm(s):
    import unicodedata
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z]', '', s)


def isnap(h):
    m = re.search(r'var\s+ISNAP\s*=\s*\[', h)
    if not m: return None
    st = h.index('[', m.end() - 1); d = 0
    for k in range(st, len(h)):
        if h[k] == '[': d += 1
        elif h[k] == ']':
            d -= 1
            if d == 0: return h[st:k + 1]
    return None


def era_year(label):
    """The year an era's map should be drawn at. A label like «c. 1800 – 1895»
    is answered at its START, because that is the moment the map is claiming."""
    t = label.replace('–', '-').replace('—', '-')
    bce = 'BCE' in t or 'BC' in t
    m = re.search(r'(-?\d{1,4})', t)
    if not m: return None
    y = int(m.group(1))
    return -abs(y) if bce else y


def main():
    if not os.path.exists(CACHE):
        sys.exit('no boundary cache yet — run fetch-ohm-boundaries.py first')
    try:
        from shapely.geometry import Point, Polygon, MultiPolygon
    except ImportError:
        sys.exit('shapely is required')

    blob   = json.load(open(CACHE))
    meta   = blob['meta']
    shapes = blob['shapes']

    polys = {}
    for rid, rings in shapes.items():
        try:
            ps = [Polygon(r) for r in rings if len(r) >= 4]
            ps = [p if p.is_valid else p.buffer(0) for p in ps]
            ps = [p for p in ps if not p.is_empty]
            if ps: polys[rid] = MultiPolygon(ps) if len(ps) > 1 else ps[0]
        except Exception:
            continue

    cps = json.load(open(os.path.join(ROOT, 'site', 'public', 'country-points.json')))['countries']
    bypoint = {norm(c['n']): c for c in cps}

    out, stats = {}, collections.Counter()
    for f in sorted(glob.glob(os.path.join(FLAGS, '*-flags.html'))):
        h = open(f, encoding='utf-8').read()
        S = isnap(h)
        if not S: continue
        page = os.path.basename(f).replace('-flags.html', '')
        cp = bypoint.get(norm(ALIAS.get(page, page.replace('-', ' '))))
        if not cp:
            stats['page has no country point'] += 1
            continue
        pt = Point(cp['x'], cp['y'])

        eras = []
        for m in re.finditer(r'year\s*:\s*"([^"]*)"\s*,\s*name\s*:\s*"([^"]*)"', S):
            label, name = m.group(1), m.group(2)
            y = era_year(label)
            if y is None:
                eras.append(dict(label=label, name=name, year=None, held=[]))
                stats['era year unreadable'] += 1
                continue
            held = []
            for rid, g in polys.items():
                md = meta.get(rid)
                if not md: continue
                s, e = md['s'], md['e'] if md['e'] is not None else 2026
                if not (s <= y <= e): continue
                if g.contains(pt) or g.touches(pt):
                    held.append(dict(id=rid, name=md['name'], s=s, e=e))
            held.sort(key=lambda x: (x['e'] - x['s']))   # tightest slice first
            eras.append(dict(label=label, name=name, year=y, held=held))
            stats['era covered' if held else 'era UNCOVERED'] += 1
        out[page] = dict(cc=cp.get('cc'), lat=cp['y'], lon=cp['x'], eras=eras)

    json.dump({'note': ('Which OpenHistoricalMap polity held each country point in each '
                        'era year. An empty «held» means no polygon covers that ground '
                        'in that year — not that nobody held it. Those eras are drawn '
                        'by hand and labelled as hand-approximated.'),
               'source': 'https://www.openhistoricalmap.org (CC0)',
               'pages': out}, open(OUT, 'w'), indent=1)

    cov, unc = stats['era covered'], stats['era UNCOVERED']
    tot = cov + unc
    print('pages resolved : %d' % len(out))
    print('eras covered   : %d of %d  (%.0f%%)' % (cov, tot, 100 * cov / tot if tot else 0))
    print('eras uncovered : %d  -> these need hand-approximation' % unc)
    for k, v in stats.items():
        if k not in ('era covered', 'era UNCOVERED'): print('  %-26s %d' % (k, v))
    print('written: %s' % OUT)


if __name__ == '__main__':
    main()

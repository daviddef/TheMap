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


# «6th c.», «15th century», «1st cent.» — that ordinal is a century, not a year.
# Two traps here. «c.» means CIRCA far more often than it means century, so a
# bare one never counts — only one directly behind an ordinal. And a span like
# «c. 6th - 10th century CE» carries its century marker at the END, after the
# ordinal the era actually starts at, so the marker is detected separately from
# the number and the FIRST ordinal is the one taken.
CENTMARK = re.compile(r'\b(?:century|centuries|cent\.)\b'
                      r'|\d\s*(?:st|nd|rd|th)\s*c\.', re.I)
ORDINAL = re.compile(r'(\d{1,2})\s*(?:st|nd|rd|th)\b', re.I)
# «17 July 1973», «26 Apr 1964», «1 July 1962 - 1966» — the LEADING number is a
# day. Anchored at the start so it cannot swallow a year from mid-label.
FULLDATE = re.compile(r'^\s*(?:c\.\s*)?\d{1,2}\s+[A-Za-z]{3,9}\.?\s+(\d{3,4})')


def era_year(label):
    """The year an era's map should be drawn at.

    An era is answered at its START: «c. 1800 - 1895» is 1800, because that is
    the moment the map is claiming.

    This used to be one regex for the first number in the label, which is
    wrong twice over, and it was caught by surveying the OUTPUT rather than by
    reading the code. «17 July 1973» became the year 17. «1 July 1962 - 1966»
    became 1. «c. 6th c.» became 6, and «15th century - 1888» became 15 — out
    by fifteen centuries. Each of those eras was then looked up against
    polygons from antiquity, correctly found nothing, and the failure arrived
    disguised as a coverage gap in somebody else's data.

    Order matters: century before full-date before bare number, because
    «15th century» holds a number that is not a year at all and «17 July 1973»
    holds one that is not the year wanted.
    """
    t = label.replace('\u2013', '-').replace('\u2014', '-')
    bce = bool(re.search(r'\bBCE?\b', t))

    if CENTMARK.search(t):
        m = ORDINAL.search(t)
        if m:
            # The 6th century begins in 500; the 6th century BCE in -600.
            start = (int(m.group(1)) - 1) * 100
            return -(start + 100) if bce else start

    m = FULLDATE.match(t)
    if m:
        y = int(m.group(1))
        return -y if bce else y

    m = re.search(r'(\d{1,4})', t)
    if not m:
        return None
    y = int(m.group(1))
    return -y if bce else y


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

    # ---- split the uncovered eras into the two different problems ---------
    # An uncovered era is not one kind of thing. Some are real states whose
    # ground nobody has mapped openly — New France, the Spanish Philippines,
    # Old Kingdom Egypt — and those are worth hunting a source for. Others are
    # pre-state peoples, and drawing a frontier round them is not an
    # approximation of anything; it invents a KIND of thing that did not
    # exist. Those stay blank and let the prose carry them, as several pages
    # already do with «no flag documented».
    #
    # The first pass of this list mis-sorted nineteen of them, which a survey
    # of the output caught: Aboriginal Australia, the Māori tribal era, Taíno
    # and Kalinago society, Iron Age Denmark, Tiwanaku. The words below were
    # widened from those misses rather than guessed at up front.
    PRESTATE = re.compile(
        r"hunter|gatherer|pastoral|nomad|neolithic|bronze age|iron age|stone age|"
        r"palaeo|paleo|prehistor|indigenous|aborigin|first nations|first peoples|"
        r"pre-?colum|pre-?contact|pre-?conquest|pre-?islamic|pre-?dynastic|"
        r"pre-?unification|pre-?settlement|settlement|peoples|cultures?\b|tribes|"
        r"tribal|chiefdom|clans|earliest|first inhabitants|before\s|"
        # «Taíno» carries its accent on the I, not the O, so tain[oó] missed
        # Haiti and Jamaica while catching Cuba and the Bahamas.
        r"ta[ií]no|cacicazgo|kalinago|arawak|lucayan|m[aā]ori|tiwanaku|valdivia|"
        r"ortoiroid|swahili coast|bantu", re.I)

    findable, prestate = [], []
    for page, v in out.items():
        for e in v['eras']:
            if e['year'] is None or e['held']:
                continue
            row = {'page': page, 'year': e['year'], 'name': e['name'],
                   'label': e['label']}
            # Pre-state by its own words, or simply older than any state here.
            (prestate if (e['year'] < -1000 or PRESTATE.search(e['name']))
             else findable).append(row)

    json.dump({'note': ("Uncovered eras, split by what kind of gap they are. "
                        "«findable» are real states whose ground OHM does not "
                        "map, and are worth hunting an openly-licensed source "
                        "for. «prestate» have no borders to draw at all and "
                        "stay blank; inventing one would be a category error, "
                        "not an approximation."),
               'findable': findable, 'prestate': prestate},
              open(os.path.join(ROOT, 'data', 'ohm', 'era-gaps.json'), 'w'),
              indent=1)
    print('gaps split  : %d findable, %d pre-state' % (len(findable), len(prestate)))

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

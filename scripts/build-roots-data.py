#!/usr/bin/env python3
"""Build the data the Roots & Routes GEDCOM page loads: site/public/roots/data/.

    python3 scripts/build-roots-data.py [--only shards|admin|atlas|viewer|contact]

Reads, read-only: data/gazetteer.json.gz, data/admin-divisions.json, data/admin-names.json, data/countries.json,
data/regions.json, data/places.json, data/providers.json, site/public/{mortality,flag-map}.json, site/public/fl/,
site/public/{styles,atlas-tokens}.css. Writes only under site/public/roots/.

  data/g/<CC>.json   one gazetteer shard per country, loaded on demand: columns n (name), y/x (lat/lon), p (population), k (every
                     folded name key, '|'-joined, computed here so the browser never folds 1.7M strings)
  data/adm.json      first- and second-level divisions with their folded name keys (aliases included)
  data/atlas.json    land outlines, regimes, regions with eras and rings, flag timelines per country, mortality events, the
                     providers regions name, and the Atlas's own surveyed places with their collections
  data/countries.json  ISO table (name -> code) for reading a country off the end of a place string
  viewer.html        the Roots & Routes template (scripts/roots/tree-views.template.html, a vendored copy) with its data
                     placeholders pointed at the parent page and its network references removed

None of it is personal data; it is derived from the Atlas and rebuilt whenever the Atlas changes. GeoNames is CC BY 4.0.
"""
import argparse, gzip, json, os, re, sys, unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = lambda *p: os.path.join(ROOT, 'data', *p)
PUB = os.path.join(ROOT, 'site', 'public')
OUT = os.path.join(PUB, 'roots')

# These two functions are mirrored, character for character in effect, by norm() and sq() in site/public/roots/js/resolver.js.
def norm(s):
    s = unicodedata.normalize('NFD', s.lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('ł', 'l').replace('đ', 'd').replace('ø', 'o').replace('ß', 'ss').replace('æ', 'ae')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()
def sq(s): return norm(s).replace(' ', '')

SUFFIX = re.compile(r'\b(county|province|provincia|region|regione|district|shire|state|department|municipality|prefecture|governorate|oblast|kreis|landkreis|distrito|bashkia|opcina|grad|zupanija|county of|city of|town of|parish of)\b')

def w(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    return os.path.getsize(path)

def shards():
    g = json.load(gzip.open(D('gazetteer.json.gz')))
    by = {}
    for p in g['places']: by.setdefault(p['k'], []).append(p)
    tot = 0; meta = {}
    for cc, ps in sorted(by.items()):
        n, y, x, pop, ks = [], [], [], [], []
        for p in ps:
            keys = []
            for nm in [p['n']] + (p.get('a') or [])[:12]:     # same cap as the reference resolver
                k = norm(nm)
                if k and k not in keys: keys.append(k)
            if not keys: continue
            n.append(p['n']); y.append(round(p['y'], 3)); x.append(round(p['x'], 3)); pop.append(int(p.get('p') or 0)); ks.append('|'.join(keys))
        tot += w(os.path.join(OUT, 'data', 'g', cc + '.json'), {'n': n, 'y': y, 'x': x, 'p': pop, 'k': ks})
        meta[cc] = len(n)
    # the floor: every place of 1,000 people and up (names and six aliases), worldwide, so a string with no country can still be tested against other countries
    # (otherwise "America" would be read as the one village of that name in whichever shard happens to be loaded)
    fl_n, fl_y, fl_x, fl_p, fl_k, fl_c = [], [], [], [], [], []
    for cc, ps in sorted(by.items()):
        for p in ps:
            if (p.get('p') or 0) < 1000: continue
            keys = []
            for nm in [p['n']] + (p.get('a') or [])[:6]:
                k = norm(nm)
                if k and k not in keys: keys.append(k)
            if not keys: continue
            fl_n.append(p['n']); fl_y.append(round(p['y'], 3)); fl_x.append(round(p['x'], 3)); fl_p.append(int(p['p'])); fl_k.append('|'.join(keys)); fl_c.append(cc)
    fsz = w(os.path.join(OUT, 'data', 'floor.json'), {'n': fl_n, 'y': fl_y, 'x': fl_x, 'p': fl_p, 'k': fl_k, 'c': fl_c})
    print('floor: %d places, %.1f MB raw' % (len(fl_n), fsz / 1e6))
    w(os.path.join(OUT, 'data', 'g', '_index.json'), {'full': g['full'], 'counts': meta, 'built': g['built'], 'licence': g['licence'], 'source': g['source']})
    print('shards: %d countries, %d places, %.1f MB raw' % (len(meta), sum(meta.values()), tot / 1e6))

def admin():
    ad = json.load(open(D('admin-divisions.json')))['divisions']; an = json.load(open(D('admin-names.json')))['aliases']
    rows = []
    for d in ad:
        ks = []
        for nm in [d['name']] + list(an.get(d['key'], [])):
            k = norm(SUFFIX.sub(' ', norm(nm)))
            for key in (k, sq(k)):
                if key and key not in ks: ks.append(key)
        rows.append([d['cc'], 1 if d['level'] == 'adm1' else 2, d['name'], d.get('adm1') or '', round(d['lat'], 3), round(d['lon'], 3), '|'.join(ks)])
    sz = w(os.path.join(OUT, 'data', 'adm.json'), {'d': rows})
    print('admin: %d divisions, %.2f MB raw' % (len(rows), sz / 1e6))

# ---------------------------------------------------------------- the Atlas slice (ported from build_atlas_data.py, but for every region and place at once)
RISO = {'habsburg': 'AT', 'galicia': 'AT', 'napo': 'FR', 'italy': 'IT', 'venice': 'IT', 'twosicilies': 'IT', 'yugo': 'RS',
        'croatia': 'HR', 'uruguay': 'UY', 'spain': 'ES', 'portugal': 'PT', 'brazil': 'BR', 'argentina': 'AR', 'britain': 'GB',
        'england': 'GB', 'uk': 'GB', 'ireland': 'IE', 'dutch': 'NL', 'southafrica': 'ZA', 'australia': 'AU', 'slovenia': 'SI',
        'poland': 'PL', 'russia': 'RU', 'german': 'DE', 'prussia': 'DE', 'france': 'FR', 'germany': 'DE', 'netherlands': 'NL',
        'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI', 'belgium': 'BE', 'canada': 'CA', 'czechoslovakia': 'CZ',
        'hungary': 'HU', 'romania': 'RO', 'serbia': 'RS', 'bosnia': 'BA', 'scotland': 'GB', 'ukraine': 'UA', 'soviet': 'RU'}
TERRITORY = {'PR': 'US', 'GU': 'US', 'VI': 'US', 'AS': 'US', 'MP': 'US', 'GP': 'FR', 'MQ': 'FR', 'GF': 'FR', 'RE': 'FR', 'PF': 'FR', 'NC': 'FR',
             'HK': 'CN', 'MO': 'PT', 'GI': 'GB', 'JE': 'GB', 'GG': 'GB', 'IM': 'GB', 'BM': 'GB', 'KY': 'GB', 'FK': 'GB'}

def dp_simplify(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop(); ax, ay = pts[a]; bx, by = pts[b]; dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy; md = 0; mi = -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = ((px - ax) ** 2 + (py - ay) ** 2) if L == 0 else (lambda t: (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2)(max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L)))
            if d > md: md, mi = d, i
        if md > tol * tol and mi > 0: keep[mi] = True; st.append((a, mi)); st.append((mi, b))
    return [p for p, k in zip(pts, keep) if k]

def atlas():
    J = lambda f: json.load(open(f))
    C = J(D('countries.json'))['countries']
    box = [-13, 30, 50, 62]
    def path(tol, dec, bx=None):
        out = []
        for cc, c in C.items():
            for ring in c['rings']:
                lons = [p[0] for p in ring]; lats = [p[1] for p in ring]
                if max(lats) < -60: continue
                if bx and (max(lons) < bx[0] or min(lons) > bx[2] or max(lats) < bx[1] or min(lats) > bx[3]): continue
                r = dp_simplify(ring, tol)
                if len(r) < 4: continue
                f = lambda v: ('%.*f' % (dec, v)).rstrip('0').rstrip('.')
                out.append('M' + ' '.join(f(x) + ' ' + f(-y) for x, y in r) + 'Z')
        return ''.join(out)
    land = {'world': path(0.2, 1), 'eu': path(0.04, 2, box)}
    R = J(D('regions.json')); css = open(os.path.join(PUB, 'styles.css')).read() + open(os.path.join(PUB, 'atlas-tokens.css')).read()
    cols = {}
    for m in re.finditer(r'--r-([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})', css): cols.setdefault(m.group(1), []).append(m.group(2))
    riso = dict(RISO)
    for k, v in R['regimes'].items():
        if k not in riso and v.get('archives'): riso[k] = v['archives'][0]
    regimes = {}
    for k, v in R['regimes'].items():
        c = cols.get(k, ['#7A8790', '#A9B4BB'])
        regimes[k] = {'label': v.get('label', k), 'c': [c[0], c[-1] if len(c) > 1 else c[0]]}
    regions = {}
    for g in R['regions']:
        eras = []
        for e in g['eras']:
            note = re.sub(r'\s+', ' ', e.get('note', '')).split('. ')[0][:170]
            eras.append([e['from'], e['to'], e['regime'], e.get('polity', ''), note, e.get('filedUnder', [])])
        regions[g['id']] = {'label': g['label'], 'ring': g['ring'], 'eras': eras}
    FM = J(os.path.join(PUB, 'flag-map.json'))['f']
    M = J(os.path.join(PUB, 'mortality.json'))['events']
    events = [{'id': ev['id'], 'n': ev['n'], 'ty': ev['ty'], 'f': ev['f'], 't': ev['t'], 'g': bool(ev.get('g')), 'poly': ev.get('poly') or [],
               'says': ev['says'][:190], 'toll': (ev.get('toll') or {}).get('text', '')[:170]} for ev in M]
    prov = {x['id']: x for x in J(D('providers.json'))['providers']}
    P = J(D('places.json'))['places']; places = []; usedprov = {e[5][i] for r in regions.values() for e in r['eras'] for i in range(len(e[5]))}
    for p in P:
        cl = [[c.get('title', '')[:80], c['url'], c.get('from'), c.get('to'), c.get('provider', '')] for c in p.get('collections', []) if c.get('url')][:12]
        for c in cl: usedprov.add(c[4])
        places.append([p['id'], p['name'], p.get('country') or '', round(p['lat'], 4), round(p['lon'], 4), [n['n'].split(',')[0] for n in p.get('names', [])][:8], cl])
    out = {'land': land, 'regimes': regimes, 'regions': regions, 'flagMap': FM, 'riso': riso, 'territory': TERRITORY, 'events': events,
           'prov': {k: prov[k]['name'] for k in usedprov if k in prov}, 'provurl': {k: prov[k]['url'] for k in usedprov if k in prov and prov[k].get('url')},
           'places': places, 'flagDir': '/fl/',
           'countries': {c['cc']: [c['n'], c['y'], c['x']] for c in J(os.path.join(PUB, 'country-points.json'))['countries']}}
    sz = w(os.path.join(OUT, 'data', 'atlas.json'), out)
    print('atlas: %d regions, %d events, %d surveyed places, %.2f MB raw' % (len(regions), len(events), len(places), sz / 1e6))

def viewer():
    t = open(os.path.join(ROOT, 'scripts', 'roots', 'tree-views.template.html'), encoding='utf-8').read()
    for ph in ('/*ATLAS_DATA*/null', '/*TREE_DATA*/null'): assert ph in t, 'template is missing ' + ph
    t = t.replace('/*ATLAS_DATA*/null', 'window.parent.RR.atlas').replace('/*TREE_DATA*/null', 'window.parent.RR.tree')
    t = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>\n?', '', t)    # no third-party fetch, ever
    # the Painted Lines extension (Night sky, Ink ledger, Household, Generations, Where they lived): the skill's own module, vendored beside the template
    ext = {'NAMES': [], 'TABS': '', 'VIEWS': '', 'STYLE': '', 'SCRIPT': ''}
    x = open(os.path.join(ROOT, 'scripts', 'roots', 'painted-lines.ext.html'), encoding='utf-8').read()
    m = re.search(r'<!--EXT:NAMES ([^>]*?)-->', x)
    if m: ext['NAMES'] += [n.strip() for n in m.group(1).split(',') if n.strip()]
    for sec in ('TABS', 'VIEWS', 'STYLE', 'SCRIPT'):
        m = re.search(r'<!--EXT:%s-->(.*?)<!--/EXT:%s-->' % (sec, sec), x, re.S)
        if m: ext[sec] += m.group(1)
    t = t.replace('/*EXT:NAMES*/', ','.join("'%s'" % n for n in ext['NAMES'])).replace('<!--EXT:TABS-->', ext['TABS']).replace('<!--EXT:VIEWS-->', ext['VIEWS']) \
         .replace('/*EXT:STYLE*/', ext['STYLE']).replace('/*EXT:SCRIPT*/', ext['SCRIPT'])
    assert 'EXT:' not in t, 'an extension marker was left in the viewer'
    t = re.sub(r'<title>.*?</title>', '<title>Roots &amp; Routes</title>', t, count=1)
    csp = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
           "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; "
           "connect-src 'none'; font-src 'self'; form-action 'none'; base-uri 'none'\">\n<style>[hidden]{display:none!important}body{margin:0}img{max-width:100%}</style>\n")
    t = t.replace('<meta charset="utf-8">\n', '', 1)
    open(os.path.join(OUT, 'viewer.html'), 'w', encoding='utf-8').write(csp + t + '\n</body>\n</html>\n')
    print('viewer.html: %.0f KB' % (os.path.getsize(os.path.join(OUT, 'viewer.html')) / 1024))

def surnames():
    """The spellings the Atlas surname catalogue treats as one name (status same / attested), one list per family, for the page's surname check."""
    cat = json.load(open(D('surname-families.json'), encoding='utf-8'))
    fams = [[m['form'] for m in f['members'] if m.get('status') in ('same', 'attested')] for f in cat['families']]
    fams = [f for f in fams if len(f) > 1]
    print('surname-families.json', w(os.path.join(OUT, 'data', 'surname-families.json'), fams), 'bytes,', len(fams), 'families')

def contact():
    """Where a visitor can send places they choose to offer: the site's own contact (the same one the Add a source page uses). Public data, no personal data."""
    site = json.load(open(os.path.join(ROOT, 'site', 'src', 'data', 'site.json'), encoding='utf-8'))
    c = (site.get('contact') or {}).get('email')
    out = os.path.join(OUT, 'data', 'contact.json')
    json.dump({'email': c, 'repo': site.get('repo')}, open(out, 'w', encoding='utf-8'))
    print('contact.json:', 'email set' if c else 'no email')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--only', choices=['shards', 'admin', 'atlas', 'viewer', 'contact', 'surnames'])
    a = ap.parse_args()
    for name, fn in (('shards', shards), ('admin', admin), ('atlas', atlas), ('viewer', viewer), ('contact', contact), ('surnames', surnames)):
        if a.only in (None, name): fn()

if __name__ == '__main__': main()

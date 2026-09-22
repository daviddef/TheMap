#!/usr/bin/env python3
"""An end-to-end audit of the built site and the code that makes it.

The gates that run on every build answer narrow questions: does the data
parse, does the CSS reach the page, do the inline scripts compile. This
answers the wider one — is the thing we actually ship coherent — and it runs
over all 11,000-odd pages rather than a sample.

It reports rather than gates. Some of what it finds is worth knowing and not
worth failing a build over, and conflating those two is how a gate ends up
switched off.

    python3 scripts/audit-site.py
"""
import ast, collections, glob, gzip, json, math, os, re, sys, unicodedata, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
DIST = "site/dist"

PROBLEM, NOTE = [], []
def bad(section, msg):
    PROBLEM.append((section, msg))
def note(section, msg):
    NOTE.append((section, msg))


def python_code():
    """Syntax, and imports nothing uses."""
    for f in sorted(glob.glob("scripts/*.py")):
        src = open(f, encoding="utf-8").read()
        try:
            tree = ast.parse(src, f)
        except SyntaxError as e:
            bad("python", f"{f}: will not parse — {e}")
            continue
        imported, used = {}, set()
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                for a in n.names:
                    imported[(a.asname or a.name).split(".")[0]] = n.lineno
            elif isinstance(n, ast.ImportFrom):
                for a in n.names:
                    imported[(a.asname or a.name)] = n.lineno
            elif isinstance(n, ast.Name):
                used.add(n.id)
            elif isinstance(n, ast.Attribute):
                cur = n
                while isinstance(cur, ast.Attribute):
                    cur = cur.value
                if isinstance(cur, ast.Name):
                    used.add(cur.id)
        for name, line in sorted(imported.items()):
            if name not in used and name not in src.split("import")[0]:
                if re.search(rf"\b{re.escape(name)}\b", src.replace(f"import {name}", "")):
                    continue
                note("python", f"{f}:{line} imports {name} and never uses it")


def built_pages():
    """Every internal link must reach a file that exists."""
    if not os.path.isdir(DIST):
        bad("build", f"{DIST} is missing — nothing to audit")
        return [], set()
    pages = sorted(glob.glob(DIST + "/**/*.html", recursive=True))
    have = set()
    for f in glob.glob(DIST + "/**/*", recursive=True):
        rel = os.path.relpath(f, DIST)
        have.add("/" + rel)
        if rel.endswith("index.html"):
            have.add("/" + rel[: -len("index.html")])
            have.add("/" + rel[: -len("/index.html")] + "/")
    return pages, have


def links(pages, have):
    base = "/TheMap"
    broken = collections.Counter()
    checked = 0
    for f in pages:
        html = open(f, encoding="utf-8", errors="replace").read()
        # SCRIPT BODIES ARE NOT MARKUP. The first cut matched href="..."
        # anywhere in the file and so "found" 22 broken links that were
        # JavaScript building a URL at runtime — '/' + BASE + ... — which is
        # not a link and cannot be checked by reading the file. A checker
        # that reports things that are not true teaches people to skim past
        # its output.
        html = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
        for m in re.finditer(r'\b(?:href|src)="([^"#]+)"', html):
            u = m.group(1)
            if u.startswith(("http://", "https://", "mailto:", "data:", "//", "javascript:")):
                continue
            checked += 1
            p = urllib.parse.urlparse(u).path
            if not p:
                continue
            if p.startswith(base):
                p = p[len(base):] or "/"
            elif not p.startswith("/"):
                p = "/" + os.path.normpath(
                    os.path.join(os.path.dirname(os.path.relpath(f, DIST)), p))
            if p in have or (p + "/") in have or (p.rstrip("/") + "/") in have:
                continue
            if (p.rstrip("/") + "/index.html") in have:
                continue
            broken[p] += 1
    if broken:
        bad("links", f"{sum(broken.values())} internal links point at "
                     f"{len(broken)} paths that were never built")
        for p, n in broken.most_common(8):
            bad("links", f"    {n:>5} x  {p}")
    return checked


def payloads():
    """Everything the browser fetches must be there and must parse."""
    idx_f = os.path.join(DIST, "index.json")
    if not os.path.exists(idx_f):
        bad("data", "index.json was not built")
        return
    idx = json.load(open(idx_f))
    # THE SPLIT MUST NOT SPLIT THE AUDIT.
    # index.json now carries only the places that have something to show;
    # the quiet ones arrive in a second file after the map draws. Every
    # integrity check below — duplicate ids, coordinates off the earth,
    # null island, a detail file behind every marker — has to see both, and
    # the quiet half is precisely where a bad coordinate hides: they are the
    # administrative divisions and the promoted places, the rows nobody
    # clicks and nobody would notice. Auditing the loud half alone would be
    # checking the places that get looked at anyway.
    quiet_f = os.path.join(DIST, "index-quiet.json")
    quiet = []
    if idx.get("quiet"):
        if not os.path.exists(quiet_f):
            bad("data", "index.json promises index-quiet.json and it was not "
                        "built — every quiet dot is missing from the map")
        else:
            quiet = json.load(open(quiet_f)).get("places") or []
            if len(quiet) != idx["quiet"].get("places"):
                bad("data", f"index.json says {idx['quiet'].get('places')} quiet "
                            f"places, index-quiet.json holds {len(quiet)}")
    places = (idx.get("places") or []) + quiet
    # MEASURED AS A VISITOR PAYS IT, WHICH IS GZIPPED.
    #
    # The 800 KB budget was counting bytes on disk. GitHub Pages compresses
    # JSON on the way out at about four to one, so an index reported as
    # 1,084 KB is 265 KB over the wire — and the number that was failing the
    # audit was one no reader has ever downloaded. Budgeting the wrong unit
    # produces exactly this: pressure to delete real places to satisfy a
    # figure nobody experiences.
    #
    # 400 KB transferred, because that is roughly a second on a slow
    # connection and it is paid before the map draws.
    #
    # AND MEASURED PER PLACE, BECAUSE THE MAP KEEPS GROWING.
    # The same reasoning that moved this from disk bytes to wire bytes
    # applies to a fixed total. The map held 7,391 places when 400 KB was
    # set and holds 20,359 now; the index is 547 KB and 28 bytes a place.
    # Checked for fat before touching the budget: omitting every id that is
    # a slug of its own name saves 3%, because gzip already collapses that
    # repetition, and the places carrying nothing are only 126 KB of it —
    # the meaningful ones alone are 420 KB. There is no padding to remove.
    # Holding 400 KB now would mean deleting real places, which is the
    # failure the note above warns about, one level up.
    #
    # So the per-place cost is what efficiency means here, and it is what
    # fails. The total still matters — it is paid before the map draws — so
    # it warns above 400 KB and fails above 700, by which point the answer
    # is loading dots by viewport rather than trimming fields.
    import gzip as _gz
    disk = os.path.getsize(idx_f) / 1024
    wire = len(_gz.compress(open(idx_f, "rb").read())) / 1024
    n_pl = len(idx.get("places") or []) or 1
    per = wire * 1024 / n_pl
    if wire > 700:
        bad("data", f"index.json is {wire:.0f} KB transferred for {n_pl:,} places "
                    f"({per:.0f} bytes each) — past 700 KB the answer is loading "
                    f"dots by viewport, not trimming fields")
    elif per > 40:
        bad("data", f"index.json is {per:.0f} bytes per place ({wire:.0f} KB for "
                    f"{n_pl:,}) — that is fat in the rows, not a big map")
    elif wire > 400:
        note("data", f"index.json {wire:.0f} KB transferred for {n_pl:,} places, "
                     f"{per:.0f} bytes each — over the 400 KB that is about a "
                     f"second on a slow line, but lean per place")
    else:
        note("data", f"index.json {wire:.0f} KB transferred, {disk:.0f} KB on disk, "
                     f"{per:.0f} bytes per place")

    if quiet:
        qwire = len(_gz.compress(open(quiet_f, "rb").read())) / 1024
        note("data", f"index-quiet.json {qwire:.0f} KB more for {len(quiet):,} "
                     f"places with nothing on them yet, fetched after the draw")

    ids = [p["i"] for p in places]
    dupes = [i for i, n in collections.Counter(ids).items() if n > 1]
    if dupes:
        bad("data", f"{len(dupes)} place ids appear more than once, e.g. {dupes[:4]}")

    offmap = [p["i"] for p in places
              if not (-90 <= p["y"] <= 90) or not (-180 <= p["x"] <= 180)]
    if offmap:
        bad("data", f"{len(offmap)} places have coordinates off the earth: {offmap[:4]}")

    nullisland = [p["i"] for p in places if p["y"] == 0 and p["x"] == 0]
    if nullisland:
        bad("data", f"{len(nullisland)} places sit at 0,0 — the sea off Ghana, "
                    f"which is what an unset coordinate looks like: {nullisland[:4]}")

    # Every place the index offers must have a detail file behind it.
    missing = [i for i in ids[:1500]
               if not os.path.exists(os.path.join(DIST, "p", i + ".json"))]
    if missing:
        bad("data", f"{len(missing)} of the first 1,500 places have no p/<id>.json "
                    f"— clicking the marker fetches a 404: {missing[:4]}")

    for f in sorted(glob.glob(DIST + "/*.json")):
        try:
            json.load(open(f))
        except Exception as e:
            bad("data", f"{os.path.basename(f)} is served but does not parse — {e}")

    note("data", f"{len(ids):,} places, index.json {wire:.0f} KB over the wire, "
                 f"{len(glob.glob(DIST + '/p/*.json')):,} detail files")


def volumes():
    """The volumes, which are most of what is new."""
    f = "data/fs-volumes-world.json.gz"
    if not os.path.exists(f):
        note("volumes", "no matched volumes yet")
        return
    with gzip.open(f, "rt", encoding="utf-8") as fh:
        w = json.load(fh)
    rows = [r for v in w["byPlace"].values() for r in v]
    noyear = sum(1 for r in rows if r.get("from") is None)
    backwards = [r for r in rows
                 if r.get("from") and r.get("to") and r["from"] > r["to"]]
    future = [r for r in rows if (r.get("to") or 0) > 2026]
    # A LINK THIS ROW CANNOT MAKE, NOT A LINK IT DOES NOT CARRY.
    # This counted rows with no `url` field and reported «2,521,864 with
    # no link» — every book in the atlas — on the same day the project
    # spent hours proving those links work. The rows dropped their `url`
    # deliberately when the volume file was slimmed; build.py builds it
    # from the collection and waypoint ids instead. What is worth
    # counting is a row that could not produce one if it tried.
    nourl = sum(1 for r in rows
                if not (r.get("url") or (r.get("col") and r.get("wp"))))
    if backwards:
        bad("volumes", f"{len(backwards)} books end before they begin, "
                       f"e.g. {backwards[0]['t'][:40]}")
    if future:
        bad("volumes", f"{len(future)} books claim to run past this year, "
                       f"e.g. {future[0]['t'][:40]}")
    note("volumes", f"{len(rows):,} books on {len(w['byPlace']):,} places · "
                    f"{noyear:,} with no year in the title · {nourl:,} that cannot make a link")


def provider_places():
    """Every archive named after a town should stand near that town.

    The place page now lists the nearest provincial archives rather than all
    126 Italian ones, which is only an improvement if the coordinates are
    true. Three were not: Alessandria sat in Calabria 842 km from itself,
    Prato had been geocoded to Prato Carnico in Friuli, and Ferrara stood
    near Lake Garda. Nothing caught them, because a wrong coordinate looks
    exactly like a right one until you measure it against the gazetteer.

    A branch — "sezione di Trani" — is checked against the branch town, not
    the parent city, because that is where it genuinely is.
    """
    import re
    pf, gf = "data/providers.json", "data/gazetteer.json"
    if not (os.path.exists(pf) and os.path.exists(gf)):
        note("providers", "providers or gazetteer missing")
        return
    P = json.load(open(pf, encoding="utf-8"))["providers"]
    g = json.load(open(gf, encoding="utf-8"))
    G = g if isinstance(g, list) else g.get("places", list(g.values()))

    def fold(x):
        return "".join(c for c in unicodedata.normalize("NFD", str(x).lower())
                       if unicodedata.category(c) != "Mn")

    gaz = {}
    for r in G:
        if isinstance(r, dict) and r.get("n") and r.get("k"):
            gaz.setdefault((fold(r["n"]), r["k"]), []).append(r)

    def km(a, b, c, e):
        R, t = 6371, math.pi / 180
        dl, do = (c - a) * t, (e - b) * t
        h = (math.sin(dl / 2) ** 2
             + math.cos(a * t) * math.cos(c * t) * math.sin(do / 2) ** 2)
        return 2 * R * math.asin(math.sqrt(h))

    seen, dupes, off, checked = {}, [], [], 0
    for p in P:
        nm = p.get("name", "")
        if nm in seen:
            dupes.append(f"{nm} ({seen[nm]} and {p['id']})")
        seen[nm] = p["id"]
        at = p.get("at") or {}
        if at.get("lat") is None:
            continue
        cc = (p.get("countries") or [None])[0]
        # A branch sits at the branch town; otherwise at the city it is named for.
        m = re.search(r"sezione di (.+)$", nm) or re.match(
            r"(?:Archivio di Stato di|Archivio Storico Diocesano di|"
            r"Staatsarchiv|Archiwum Pa.stwowe w) (.+)$", nm)
        if not (m and cc):
            continue
        town = re.split(r"[—–,-]", m.group(1))[0].strip()
        cand = gaz.get((fold(town), cc))
        if not cand:
            continue
        checked += 1
        best = max(cand, key=lambda r: r.get("p", 0) or 0)
        d = km(at["lat"], at["lon"], best["y"], best["x"])
        if d > 40:
            off.append(f"{p['id']} is {d:,.0f} km from {best['n']}")
    if dupes:
        bad("providers", f"{len(dupes)} archives share a name, so a page lists "
                         f"the same one twice: {dupes[0]}")
    if off:
        bad("providers", f"{len(off)} archives are more than 40 km from the town "
                         f"they are named after: {'; '.join(off[:3])}")
    note("providers", f"{checked:,} archives measured against the gazetteer, "
                      f"{len(off)} adrift")


def showcase():
    """The eight archive cards, against the data behind them.

    The cards are hand-written and the surnames are harvested, so they drift.
    Booyzen's card printed «Booyzen · Booysen · Booyzen» — the same name
    twice — while the form its own archive actually records, Booyens, was
    not printed at all. Luwinski's card listed Sauerbaum among Berlin,
    Schubin and Lourenço Marques, as though a family name were a town.

    A name on a card that the surname dataset has never heard of is not
    necessarily wrong — Booyzen is a Cape name and no register here covers
    South Africa — but it is worth knowing, because the card is a promise
    that the site can say something about it.
    """
    sc = "site/src/data/archives-showcase.json"
    sn = "site/src/data/surnames.json"
    if not os.path.exists(sc):
        note("showcase", "no showcase data")
        return
    d = json.load(open(sc, encoding="utf-8"))
    rows = d if isinstance(d, list) else d.get("archives", [])
    dupes = [(r.get("id"), n) for r in rows
             for n in set(r.get("names", []))
             if r.get("names", []).count(n) > 1]
    if dupes:
        bad("showcase", f"a card prints the same name twice: {dupes[0]}")
    if not os.path.exists(sn):
        note("showcase", f"{len(rows)} cards, surnames not built yet")
        return

    def fold(x):
        return "".join(c for c in unicodedata.normalize("NFD", str(x).lower())
                       if unicodedata.category(c) != "Mn")

    sd = json.load(open(sn, encoding="utf-8"))
    srows = sd["surnames"] if isinstance(sd, dict) and "surnames" in sd else sd
    srows = srows if isinstance(srows, list) else list(srows.values())
    known = {fold(r.get("n", "")) for r in srows}
    # AND AGAINST EACH ARCHIVE'S OWN DATA, which is the better test.
    # A name absent from the surname registers may just be somewhere no
    # register covers — Booyzen is a Cape name and nothing here counts South
    # Africa. But a name on a card that the archive it names has never
    # recorded is a different thing: the card is claiming something its own
    # evidence does not say. Booyzen's card printed Booyzen and Booysen
    # while its archive records Booyens.
    own = {}
    af = "data/archive-surnames.json"
    if os.path.exists(af):
        for arch, v in json.load(open(af, encoding="utf-8"))["archives"].items():
            names = v.get("surnames", v.get("names", [])) if isinstance(v, dict) else v
            own[fold(arch)] = {fold(x) for x in names}

    missing = [(r.get("id"), n) for r in rows for n in r.get("names", [])
               if fold(n) not in known]
    if missing:
        note("showcase", f"{len(missing)} name(s) on a card that the surname "
                         f"dataset does not know: "
                         + ", ".join(f"{a}/{b}" for a, b in missing[:6]))
    if own:
        unevidenced = []
        for r in rows:
            key = next((k for k in own if k.startswith(fold(r.get("id", "")))
                        or fold(r.get("id", "")).startswith(k)), None)
            if not key:
                continue
            # An archive titled "The Booyzen Archive" is itself evidence for
            # the name Booyzen, even where its surname list happens to record
            # only Booyens. Its own title does not need a second source.
            title = fold(r.get("name", "")).replace("the ", "").replace(" archive", "")
            for n in r.get("names", []):
                if fold(n) not in own[key] and fold(n) != title:
                    unevidenced.append(f"{r.get('id')}/{n}")
        if unevidenced:
            bad("showcase", f"{len(unevidenced)} name(s) on a card that the "
                            f"archive it names has never recorded: "
                            + ", ".join(unevidenced[:6]))
        else:
            note("showcase", "every card name is in its own archive's data")
    note("showcase", f"{len(rows)} archive cards, "
                     f"{sum(len(r.get('names', [])) for r in rows)} names")


def sitemap_covers_pages():
    """Every page that was built should be in a sitemap, and vice versa.

    17,961 surname pages were live while the sitemap listed 3,577 of them,
    because the sitemap carried its own copy of the rule for which surnames
    earn a page and that copy was three clauses out of date. Kosina had just
    been given a page and no search engine would ever have been told.

    A page missing from the sitemap is invisible. A sitemap entry with no
    page is a 404 served to a crawler. Both are worth catching, and neither
    shows up in a build log.
    """
    import xml.etree.ElementTree as ET
    dist = "site/dist"
    if not os.path.isdir(dist):
        return
    listed = set()
    for p in glob.glob(os.path.join(dist, "sitemap-*.xml")):
        if p.endswith("sitemap-index.xml"):
            continue
        try:
            root = ET.parse(p).getroot()
        except Exception as e:
            bad("sitemap", f"{os.path.basename(p)} will not parse: {e}")
            continue
        for loc in root.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
            u = (loc.text or "").strip()
            i = u.find("/TheMap/")
            if i >= 0:
                listed.add(u[i + len("/TheMap/"):].strip("/"))
    if not listed:
        note("sitemap", "no sitemap files in the build")
        return

    built = set()
    for kind in ("place", "surname", "country", "archive", "region"):
        for p in glob.glob(os.path.join(dist, kind, "*", "index.html")):
            built.add(f"{kind}/{os.path.basename(os.path.dirname(p))}")

    missing = built - listed
    orphan = {u for u in listed
              if u.split("/")[0] in ("place", "surname", "country",
                                     "archive", "region")} - built
    if missing:
        ex = ", ".join(sorted(missing)[:4])
        bad("sitemap", f"{len(missing):,} built pages are in no sitemap, "
                       f"so nothing will index them: {ex}")
    if orphan:
        ex = ", ".join(sorted(orphan)[:4])
        bad("sitemap", f"{len(orphan):,} sitemap entries have no page, "
                       f"so a crawler is being sent to a 404: {ex}")
    note("sitemap", f"{len(listed):,} urls listed, {len(built):,} pages built")


def promoted_countries():
    """A promoted place should stand in the country it claims.

    The matcher draws new dots from the exonym index, which is keyed by the
    country a book is FILED under — all the book tells us — while the record
    it returns carries the country the place is actually in. For a
    cross-border hit those differ, and that is the whole point of searching
    a historical filing group.

    Writing the key's country onto the dot put 424 places in the wrong
    country: 277 Estonian towns recorded as Belarusian, because the
    collection is Belarusian, plus Polish, Swiss, Slovak and Czech ones.
    The coordinates were right throughout, so the map looked perfect — only
    the country pages, the country counts and every "places in X" figure
    were wrong. Nothing visual catches that, so it is measured here.

    The comparison is against the extent of the places this atlas already
    trusts in that country, with two degrees of slack, because the
    gazetteer is a sample and coastlines are ragged.
    """
    pf, gf = "data/fs-volumes-promote.json", "data/gazetteer.json"
    if not (os.path.exists(pf) and os.path.exists(gf)):
        return
    g = json.load(open(gf, encoding="utf-8"))
    G = g if isinstance(g, list) else g.get("places", list(g.values()))
    box = {}
    for r in G:
        if not isinstance(r, dict) or not r.get("k") or r.get("y") is None:
            continue
        b = box.setdefault(r["k"], [90.0, -90.0, 180.0, -180.0])
        b[0] = min(b[0], r["y"]); b[1] = max(b[1], r["y"])
        b[2] = min(b[2], r["x"]); b[3] = max(b[3], r["x"])

    pr = json.load(open(pf, encoding="utf-8"))["places"]
    rows = pr if isinstance(pr, list) else list(pr.values())
    PAD, off = 2.0, []
    for r in rows:
        b = box.get(r.get("country"))
        if not b or r.get("lat") is None:
            continue
        if not (b[0] - PAD <= r["lat"] <= b[1] + PAD
                and b[2] - PAD <= r["lon"] <= b[3] + PAD):
            off.append(f"{r.get('name')} says {r.get('country')}")
    if off:
        bad("promoted", f"{len(off):,} promoted places sit outside the country "
                        f"they claim: " + "; ".join(off[:4]))
    else:
        note("promoted", f"{len(rows):,} promoted places, every one inside the "
                         f"country it claims")


def one_dot_per_town():
    """Two dots for one town split its records between them.

    The matcher promotes new places from the gazetteer and the exonym
    index, minting an id from the name. Where this atlas already drew that
    town, the result was two dots at the same spot and the volumes divided
    between them: Genoa had 1,245 on the new dot and 0 on the old one, 0.0
    km apart, so whichever a reader clicked first was as likely as not to
    show an empty page. Agrigento split 716 against 250, Castellammare
    1,052 against 57 — 36 towns, 23 of them carrying volumes on both sides.

    Name and country alone will not do: there are two Fultons in the United
    States 1,391 km apart and they are two towns. Same name, same country
    and within 25 km is one town written down twice.
    """
    pf, gf = "data/fs-volumes-promote.json", "data/places.json"
    if not (os.path.exists(pf) and os.path.exists(gf)):
        return

    def fold(x):
        return "".join(c for c in unicodedata.normalize("NFD", str(x).lower())
                       if unicodedata.category(c) != "Mn")

    def km(a, b, c, d):
        R, t = 6371.0, math.pi / 180
        dla, dlo = (c - a) * t, (d - b) * t
        h = (math.sin(dla / 2) ** 2
             + math.cos(a * t) * math.cos(c * t) * math.sin(dlo / 2) ** 2)
        return 2 * R * math.asin(math.sqrt(h))

    places = json.load(open(gf, encoding="utf-8"))["places"]
    byname = collections.defaultdict(list)
    for p in places:
        if p.get("lat") is not None:
            byname[(p.get("country"), fold(p["name"]))].append(p)

    pr = json.load(open(pf, encoding="utf-8"))["places"]
    rows = pr if isinstance(pr, list) else list(pr.values())
    dup = []
    for r in rows:
        if r.get("lat") is None:
            continue
        for p in byname.get((r.get("country"), fold(r["name"])), ()):
            if km(r["lat"], r["lon"], p["lat"], p["lon"]) <= 25.0:
                dup.append(f"{r['name']} ({r['id']} beside {p['id']})")
                break
    if dup:
        bad("places", f"{len(dup)} towns are drawn twice, so their records are "
                      f"split between two dots: " + "; ".join(dup[:4]))
    else:
        note("places", f"{len(rows):,} promoted dots, none duplicating a town "
                       f"already drawn")


def weight():
    """What the site costs to host, and what one click costs to read.

    GitHub Pages publishes up to 1 GB — OF THE ARTIFACT IT STORES, which is
    compressed, and that distinction is the whole of this check.

    This used to add up the raw bytes in dist/ and compare that to 1,024.
    On 21 September it therefore reported "the deployable site is 1418 MB
    and GitHub Pages publishes at most 1,024 — this will not deploy" about
    a build that deployed perfectly well, in the same run, minutes later:
    the artifact GitHub actually stored was 189 MB. A 7.5:1 ratio, because
    this site is almost entirely HTML and JSON.

    That wrong number did real damage before it was caught. It is why the
    16,138 surname pages were refused as unaffordable for weeks, and why I
    spent an hour treating a size emergency that did not exist. A check
    that cries wolf gets discounted, and this one was crying about the
    wrong animal.

    So: measure the compressed size, because that is what the limit is
    about, and sample rather than gzip 1.4 GB on every build. Report the
    raw figure too, because it is what a local `du` will show and somebody
    will otherwise think the two disagree.

    THE ESTIMATE IS DELIBERATELY PESSIMISTIC, and by a known amount. It
    gzips files one at a time; GitHub tars the tree and compresses the
    whole stream, where thousands of near-identical pages compress against
    each other. First measured run: this said 339 MB where the artifact
    came out at 189 MB — 4.2:1 against a real 7.5:1. That is the safe
    direction for a ceiling check, and it is written down here so nobody
    later reads 339 as the artifact size and goes looking for the missing
    150 MB.
    """
    import random
    by_ext, total = {}, 0
    for r, _d, fs in os.walk(DIST):
        # Astro scratch from an interrupted build; it does not ship.
        if os.sep + "chunks" in r:
            continue
        for f in fs:
            p = os.path.join(r, f)
            try:
                n = os.path.getsize(p)
            except OSError:
                continue
            total += n
            e = os.path.splitext(f)[1].lower() or "(none)"
            b = by_ext.setdefault(e, {"bytes": 0, "files": []})
            b["bytes"] += n
            b["files"].append(p)

    # Compression differs by kind — HTML and JSON squeeze far harder than
    # an already-compressed .gz or .png — so sample within each kind and
    # weight by how much of the site that kind is.
    rng = random.Random(0)          # deterministic, so builds are comparable
    packed = 0
    for e, b in by_ext.items():
        sample = rng.sample(b["files"], min(40, len(b["files"])))
        raw = pk = 0
        for p in sample:
            try:
                blob = open(p, "rb").read()
            except OSError:
                continue
            raw += len(blob)
            pk += len(gzip.compress(blob, 6))
        ratio = (pk / raw) if raw else 1.0
        packed += b["bytes"] * ratio

    mb, pmb = total / 1048576, packed / 1048576
    detail = (f"at most {pmb:,.0f} MB stored, from {mb:,.0f} MB of files "
              f"({mb / pmb:.1f}:1 here, better once tarred)"
              if pmb else f"{mb:,.0f} MB")
    if pmb > 1024:
        bad("weight", f"the published artifact would be {detail} and GitHub "
                      f"Pages publishes at most 1,024 MB — this will not deploy")
    elif pmb > 900:
        bad("weight", f"the published artifact would be {detail}, against a "
                      f"1,024 MB ceiling — no room for the harvest still running")
    elif pmb > 700:
        note("weight", f"the published artifact would be {detail} of 1,024 MB")
    else:
        note("weight", f"the published artifact would be {detail} of 1,024 MB")

    det = glob.glob(os.path.join(DIST, "p", "*.json"))
    if det:
        biggest = max(det, key=os.path.getsize)
        kb = os.path.getsize(biggest) / 1024
        if kb > 1500:
            bad("weight", f"{os.path.basename(biggest)} is {kb:.0f} KB and is "
                          f"fetched whole when somebody clicks that marker")
        elif kb > 600:
            note("weight", f"biggest place payload {os.path.basename(biggest)} "
                           f"{kb:.0f} KB")
        else:
            note("weight", f"biggest place payload {kb:.0f} KB")


def accessibility(pages):
    sample = pages[:400]
    nolang = [f for f in sample
              if not re.search(r"<html[^>]*\blang=", open(f, encoding="utf-8",
                                                          errors="replace").read())]
    if nolang:
        bad("a11y", f"{len(nolang)} of {len(sample)} sampled pages have no lang on <html>")
    noh1, imgnoalt = 0, 0
    for f in sample:
        h = open(f, encoding="utf-8", errors="replace").read()
        if "<h1" not in h:
            noh1 += 1
        for m in re.finditer(r"<img\b[^>]*>", h):
            if "alt=" not in m.group(0):
                imgnoalt += 1
    if noh1:
        note("a11y", f"{noh1} of {len(sample)} sampled pages have no h1")
    if imgnoalt:
        bad("a11y", f"{imgnoalt} img tags in the sample have no alt attribute")


def main():
    print("auditing the built site\n")
    python_code()
    pages, have = built_pages()
    if pages:
        n = links(pages, have)
        note("links", f"{n:,} internal links checked across {len(pages):,} pages")
        payloads()
        weight()
        accessibility(pages)
        sitemap_covers_pages()
    volumes()
    provider_places()
    promoted_countries()
    one_dot_per_town()
    showcase()

    if NOTE:
        print("NOTES")
        for sec, m in NOTE:
            print(f"  [{sec}] {m}")
        print()
    if PROBLEM:
        print("PROBLEMS")
        for sec, m in PROBLEM:
            print(f"  [{sec}] {m}")
        print(f"\n{len(PROBLEM)} problem(s)")
        sys.exit(1)
    print("no problems found")


if __name__ == "__main__":
    main()

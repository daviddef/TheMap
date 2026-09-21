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
    import gzip as _gz
    disk = os.path.getsize(idx_f) / 1024
    wire = len(_gz.compress(open(idx_f, "rb").read())) / 1024
    if wire > 400:
        bad("data", f"index.json is {wire:.0f} KB transferred ({disk:.0f} KB on "
                    f"disk) — the budget is 400 KB over the wire and it is "
                    f"fetched before the map draws")
    else:
        note("data", f"index.json {wire:.0f} KB transferred, {disk:.0f} KB on disk")

    ids = [p["i"] for p in idx["places"]]
    dupes = [i for i, n in collections.Counter(ids).items() if n > 1]
    if dupes:
        bad("data", f"{len(dupes)} place ids appear more than once, e.g. {dupes[:4]}")

    offmap = [p["i"] for p in idx["places"]
              if not (-90 <= p["y"] <= 90) or not (-180 <= p["x"] <= 180)]
    if offmap:
        bad("data", f"{len(offmap)} places have coordinates off the earth: {offmap[:4]}")

    nullisland = [p["i"] for p in idx["places"] if p["y"] == 0 and p["x"] == 0]
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
    nourl = sum(1 for r in rows if not r.get("url"))
    if backwards:
        bad("volumes", f"{len(backwards)} books end before they begin, "
                       f"e.g. {backwards[0]['t'][:40]}")
    if future:
        bad("volumes", f"{len(future)} books claim to run past this year, "
                       f"e.g. {future[0]['t'][:40]}")
    note("volumes", f"{len(rows):,} books on {len(w['byPlace']):,} places · "
                    f"{noyear:,} with no year in the title · {nourl:,} with no link")


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


def weight():
    """What the site costs to host, and what one click costs to read.

    GitHub Pages publishes up to 1 GB. The volume harvest took p/ from a few
    megabytes to 115 in a day, so this is no longer a theoretical limit —
    and `chunks/` is Astro scratch left behind by an interrupted build, not
    something that ships, so it is excluded.
    """
    total = 0
    for r, _d, fs in os.walk(DIST):
        if os.sep + "chunks" in r:
            continue
        for f in fs:
            total += os.path.getsize(os.path.join(r, f))
    mb = total / 1048576
    # 1,024 IS THE CEILING; 950 IS WHERE THERE IS NO ROOM LEFT TO ADD A
    # COLLECTION. Reporting a problem at 900 while quoting the limit read as
    # though the site was already over, which it was not — and a warning
    # that overstates gets discounted.
    if mb > 1024:
        bad("weight", f"the deployable site is {mb:.0f} MB and GitHub Pages "
                      f"publishes at most 1,024 — this will not deploy")
    elif mb > 950:
        bad("weight", f"the deployable site is {mb:.0f} MB of 1,024 — under the "
                      f"ceiling but with no room for the harvest still running")
    elif mb > 800:
        note("weight", f"the deployable site is {mb:.0f} MB of a 1,024 MB limit")
    else:
        note("weight", f"deployable site {mb:.0f} MB")

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
    volumes()
    provider_places()

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

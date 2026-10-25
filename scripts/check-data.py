#!/usr/bin/env python3
"""The build gate. A directory that lies is worse than no directory.

Everything here is a rule that, broken, would put a wrong answer in front of
somebody who then drives to an archive. It runs before every deploy and fails
the build rather than warning into a log nobody reads.
"""
import json, os, re, sys, datetime, io
import glob as _g
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import country_of, km_to

import os as _os
import gazetteer as _gazetteer
_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
_os.chdir(_ROOT)

ERR = []
WARN = []


def err(m):
    ERR.append(m)


def warn(m):
    WARN.append(m)


# Coordinates inside the country they claim. A geocoder that silently puts a
# Croatian parish in Chad is the single likeliest way this map ships a lie, and
# it is cheap to catch — against real outlines, not a rectangle.


# ---------------------------------------------------------------------------
# ATTRIBUTION IS A LICENCE CONDITION AND WAS MET BY MEMORY, WHICH FAILED TWICE.
#
# /data/ shipped saying "there are three licences". There were seven. The
# gazetteer, the administrative divisions and the settlements are GeoNames,
# CC BY 4.0, attribution required — and GeoNames is the reason every old place
# name on this site resolves to a point on the ground at all. It was credited
# nowhere. An earlier draft of the same page told readers OpenStreetMap data
# was CC0. Both were caught by a person looking, which is not a system.
#
# Two files also stated their licence in an English sentence inside `source`,
# where no machine could read it, so the page printed "none declared" over
# CC BY data and was not wrong to — it was reading the only field there was.
#
# So, three rules, and they fail the build rather than warn:
#
#   1. A data file that names a `source` must declare a `licence`. Prose is
#      for humans; the field is what any tool can act on.
#   2. Every distinct licence in data/ must appear on /data/, which is the
#      page that tells a reuser what they are taking on.
#   3. Every licence requiring attribution must appear in the site footer,
#      because that is the page a reuser of the SITE sees, and CC BY asks for
#      credit wherever the work is used, not only where it is catalogued.
#
# Rule 3 knows only what it can check: that the name appears. It cannot judge
# whether the credit is adequate, and does not pretend to.
ATTRIBUTION_NAMES = {
    "geonames": "GeoNames",
    "statbel": "Statbel",
    "istat": "Istat",
    "national records of scotland": "the National Records of Scotland",
    "openstreetmap": "OpenStreetMap",
    "townlands.ie": "Townlands.ie",
    # CC BY-SA is the first share-alike licence on a surname file. Named here
    # so the footer credit is enforced rather than remembered: the obligation
    # is the same whether the data is a map layer or a line in a panel.
    "wiktionary": "Wiktionary",
}
# Ours by construction: research and derivations this project made itself.
# era-flags.json is scripts/extract-era-flags.py's output — hand-drawn art
# for this project, not yet read by any page or published under public/, so
# there is no /data/ row for it to be named on.
OUR_OWN = {"regions.json", "providers.json", "collections.json", "directory.json",
           "countries.json", "country-overrides.json", "worklist.json",
           "era-flags.json"}


def access_colours_agree():
    """The access palette is written twice; the two copies must say the same.

    free/account/index/mixed/paid/catalogue/onsite/unsurveyed colour every dot
    on the map and a reader learns them, so they are vocabulary. They live in
    styles.css as --acc-*, and RecordMap.astro keeps a hex literal beside each
    lookup as the fallback for the component being used outside Base.astro.

    Two copies of a fact drift. atlas-tokens.css carries the scar: --brass was
    #a9762f in one file and #8D6227 in the other, and the disagreement was
    found by measuring, not by reading. A fallback that silently stops matching
    the stylesheet would show one palette in the map and another everywhere
    else, and nothing would say so.
    """
    try:
        css = io.open("site/public/styles.css", encoding="utf-8").read()
        js = io.open("site/src/components/RecordMap.astro", encoding="utf-8").read()
    except OSError:
        return
    tokens = dict(re.findall(r"--acc-([a-z]+)\s*:\s*(#[0-9A-Fa-f]{6})", css))
    fallbacks = dict(re.findall(r'_acc\("([a-z]+)",\s*"(#[0-9A-Fa-f]{6})"\)', js))
    if not tokens or not fallbacks:
        err("the access palette should be --acc-* in styles.css and _acc() "
            "fallbacks in RecordMap.astro, and one of the two was not found")
        return
    for name in sorted(set(tokens) | set(fallbacks)):
        a, b = tokens.get(name), fallbacks.get(name)
        if a is None:
            err(f"RecordMap.astro falls back to {b} for access class "
                f"'{name}' and styles.css declares no --acc-{name}")
        elif b is None:
            err(f"styles.css declares --acc-{name}: {a} and RecordMap.astro "
                f"has no fallback for it")
        elif a.upper() != b.upper():
            err(f"access class '{name}' is {a} in styles.css and {b} in "
                f"RecordMap.astro's fallback. One palette, two values — fix "
                f"the fallback, which is the copy.")


def licence_gate():
    data_page = ""
    for c in ("site/src/pages/data.astro",):
        if os.path.exists(c):
            data_page = io.open(c, encoding="utf-8").read()
    footer = ""
    if os.path.exists("site/src/layouts/Base.astro"):
        footer = io.open("site/src/layouts/Base.astro", encoding="utf-8").read()

    seen = {}
    # GZIPPED DATA IS STILL DATA. cemeteries-osm.json went from 1.5 MB to 9.4 MB
    # when the unnamed burial grounds came in, and 2.0 MB gzipped — but a
    # `data/*.json` glob does not see a `.json.gz`, so compressing it would have
    # quietly carried it out of this gate. That is exactly the failure this gate
    # exists to prevent: /data/ once named three licences when there were seven.
    # A file does not stop needing a licence because it was compressed.
    for f in sorted(list(_g.glob("data/*.json")) + list(_g.glob("data/*.json.gz"))):
        base = os.path.basename(f)
        if base.startswith(".") or base.startswith("_") or base in OUR_OWN:
            continue
        try:
            if f.endswith(".gz"):
                import gzip as _gz
                with _gz.open(f, "rt", encoding="utf-8") as fh:
                    d = json.load(fh)
            else:
                with io.open(f, encoding="utf-8") as fh:
                    d = json.load(fh)
        except Exception:
            continue                      # shape is other checks' business
        if not isinstance(d, dict):
            continue
        src = d.get("source")
        lic = d.get("licence") or d.get("license")
        if src and not lic:
            err(f"{base} names a source and declares no licence. Put the "
                f"licence in a `licence` field — a licence stated only inside "
                f"the source sentence cannot be read by the page that has to "
                f"tell people what they are taking.")
        if lic:
            seen.setdefault(lic, []).append(base)

    for lic, files in sorted(seen.items()):
        # The bare licence name, without the parenthetical attribution.
        short = re.split(r"\s*[—(]", lic)[0].strip()
        if data_page and short and short not in data_page:
            err(f"licence '{short}' is on {files[0]} and is not named anywhere "
                f"on /data/. That page tells a reuser what they are taking on; "
                f"a licence it does not mention is one nobody is told about.")
        low = lic.lower()
        for key, name in ATTRIBUTION_NAMES.items():
            if key in low and footer and name not in footer:
                err(f"{files[0]} is licensed '{lic}', which asks for "
                    f"attribution, and '{name}' does not appear in the site "
                    f"footer. Credit in a caption is most of the courtesy and "
                    f"none of the condition.")


# ---------------------------------------------------------------------------
# THE FLAG DATA AND THE FLAG PAGES MUST NOT DRIFT APART.
#
# data/flag-eras.json is extracted from site/src/flags-pages/*.html by
# scripts/extract-flag-eras.py. Two copies of one truth is the shape of bug
# this project has paid for repeatedly — the archive list that shipped twice,
# the surname-page rule in three languages, the count that disagreed with the
# file it counted. Keeping them in step by intention does not work; a gate
# does.
#
# It compares the number of era cards in the pages against the number of rows
# in the data. A page edited without re-running the extractor fails the build
# rather than quietly serving a search that has never heard of the change.
def flag_era_drift():
    import glob as _glob
    data_p = "data/flag-eras.json"
    if not os.path.exists(data_p):
        return                      # the extraction is optional until it exists
    try:
        data = json.load(open(data_p, encoding="utf-8"))
    except Exception as e:
        err(f"data/flag-eras.json will not parse: {e}")
        return
    in_pages = 0
    for f in _glob.glob("site/src/flags-pages/*.html"):
        if os.path.basename(f) == "index.html":
            continue
        h = open(f, encoding="utf-8", errors="replace").read()
        in_pages += h.count('<div class="entry"')
    in_data = len(data.get("eras") or [])
    if in_pages != in_data:
        err(f"the flag pages hold {in_pages:,} era cards and data/flag-eras.json "
            f"holds {in_data:,}. A page was edited without re-running "
            f"scripts/extract-flag-eras.py --write, so the map's search and the "
            f"pages now disagree about history.")
    else:
        print(f"flag eras: {in_data:,} in the pages and in the data, agreed")


def flag_evidence():
    """data/flag-evidence.json: every claim of evidence has to be checkable.

    THE AUDIT FOUND 0 OF 1,472 FLAG ERAS WITH A SOURCE, and the Netherlands page,
    read against its sources, held a decree credited with fixing a shade it does
    not name, a Sea Beggars flag Wikipedia calls uncertain and a ban that no source
    could be found for. An evidence file is only worth having if it cannot
    quietly become the same thing: a label with nothing behind it.

    So an era marked `attested` must rest on a primary or reference source, or on
    two compiled sources from different publishers; every era must say what its
    sources establish; every era that is not attested must say what is not
    established; every source must carry a title, publisher, https address, kind
    and the date it was read; an unused source is an error; and an era the page
    does not have is an error. The coverage line is printed so the gap is a number
    on every build rather than a feeling.
    """
    ev_p = "data/flag-evidence.json"
    if not os.path.exists(ev_p):
        return
    try:
        ev = json.load(open(ev_p, encoding="utf-8"))
        eras = json.load(open("data/flag-eras.json", encoding="utf-8")).get("eras") or []
    except Exception as e:
        err(f"cannot read the flag evidence or the eras it describes: {e}")
        return
    classes, kinds, sources = ev.get("classes") or {}, ev.get("kinds") or {}, ev.get("sources") or {}
    on_page = {}
    for r in eras:
        on_page.setdefault(r.get("slug"), set()).add(r.get("id"))
    import re as _re
    used, tally, bad = set(), {}, 0
    for sid, s in sources.items():
        for k in ("title", "publisher", "url", "kind", "checked"):
            if not s.get(k):
                err(f"flag evidence source {sid!r} has no {k}"); bad += 1
        if s.get("url") and not str(s["url"]).startswith("https://"):
            err(f"flag evidence source {sid!r}: the address must be https"); bad += 1
        if s.get("kind") and s["kind"] not in kinds:
            err(f"flag evidence source {sid!r}: unknown kind {s['kind']!r}"); bad += 1
        if s.get("checked") and not _re.fullmatch(r"\d{4}-\d\d-\d\d", str(s["checked"])):
            err(f"flag evidence source {sid!r}: `checked` must be a date"); bad += 1
    for slug, page in (ev.get("pages") or {}).items():
        for eid, e in page.items():
            where = f"flag evidence {slug} {eid}"
            if eid not in on_page.get(slug, set()):
                err(f"{where}: the page has no such era"); bad += 1
                continue
            cls = e.get("class")
            if cls not in classes:
                err(f"{where}: unknown class {cls!r}"); bad += 1
                continue
            tally[cls] = tally.get(cls, 0) + 1
            ids = e.get("sources") or []
            for sid in ids:
                used.add(sid)
                if sid not in sources:
                    err(f"{where}: names source {sid!r}, which is not declared"); bad += 1
            have = [sources[i] for i in ids if i in sources]
            if cls != "unreviewed" or ids:
                if not e.get("says"):
                    err(f"{where}: says nothing about what its sources establish"); bad += 1
            if cls == "unreviewed" and not e.get("open"):
                err(f"{where}: unreviewed, and does not say why"); bad += 1
            if cls == "unconfirmed" and not e.get("open"):
                err(f"{where}: unconfirmed, and does not say what the sources fail to establish"); bad += 1
            if cls in ("attested", "symbolic", "reconstructed") and not have:
                err(f"{where}: {cls} with no source behind it"); bad += 1
            if cls == "attested" and have:
                strong = any(s.get("kind") in ("primary", "reference") for s in have)
                pubs = {s.get("publisher") for s in have if s.get("kind") == "compiled"}
                if not strong and len(pubs) < 2:
                    err(f"{where}: attested on compiled sources from {len(pubs)} publisher(s); "
                        f"it needs a primary or reference source, or two publishers"); bad += 1
    for sid in sources:
        if sid not in used:
            err(f"flag evidence source {sid!r} is declared and never used"); bad += 1
    n = sum(tally.values())
    if not bad:
        parts = ", ".join(f"{v} {k}" for k, v in sorted(tally.items()))
        print(f"flag evidence: {n} of {len(eras):,} eras carry a label ({parts}); "
              f"{len(sources)} sources, all read and dated. Only {tally.get('attested', 0)} are confirmed by a source.")


def flag_art_drift():
    """data/era-flags.json must be what the flag pages would extract to today.

    THE GATE ABOVE COUNTS ERA CARDS AND NOTHING ELSE, so it passed on the day the
    Dutch Republic was split into Prinsenvlag and Statenvlag: the cards were
    re-counted and re-extracted into flag-eras.json, and the ART, which lives in
    a second file, was not. The orange era kept the old red flag and the new
    era had no image at all, and the build was green throughout.

    It had also become impossible to regenerate without noticing:
    extract-era-flags.py still looked in site/public/flags, where the pages
    stopped living when they were folded into Astro, found nothing and exited. A
    file nothing can rebuild drifts by default.

    So the expected art is rebuilt here from the pages with the extractor's own
    parsing, not a copy of it, and compared to what is committed. Either the
    image or the id being different is a failure.
    """
    import glob as _glob
    from importlib.machinery import SourceFileLoader
    art_p = "data/era-flags.json"
    if not os.path.exists(art_p):
        return
    try:
        have = json.load(open(art_p, encoding="utf-8")).get("art") or {}
        ext = SourceFileLoader(
            "_extract_era_flags",
            os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "extract-era-flags.py")).load_module()
    except Exception as e:
        err(f"cannot check the flag art against the pages: {e}")
        return
    stale, missing, extra = [], [], []
    expect = {}
    for f in sorted(_glob.glob("site/src/flags-pages/*-flags.html")):
        slug = os.path.splitext(os.path.basename(f))[0]
        html = open(f, encoding="utf-8", errors="replace").read()
        for eid, body in ext.ENTRY.findall(html):
            hit = ext.FLAGBOX.search(body)
            if hit:
                expect.setdefault(slug, {})[eid] = ext.clean(hit.group(1))
    for slug, eras in expect.items():
        for eid, svg in eras.items():
            if eid not in (have.get(slug) or {}):
                missing.append(f"{slug}/{eid}")
            elif have[slug][eid] != svg:
                stale.append(f"{slug}/{eid}")
    for slug, eras in have.items():
        for eid in eras:
            if eid not in (expect.get(slug) or {}):
                extra.append(f"{slug}/{eid}")
    bad = stale + missing + extra
    if bad:
        err(f"data/era-flags.json is not what the flag pages extract to: "
            f"{len(stale)} image(s) changed, {len(missing)} missing, "
            f"{len(extra)} no longer on a page ({', '.join(bad[:4])}"
            f"{'…' if len(bad) > 4 else ''}). Run "
            f"python3 scripts/extract-era-flags.py — the map's flag layer and "
            f"the «who governed» swatches read this file, not the pages.")
    else:
        print(f"flag art: {sum(len(v) for v in expect.values()):,} images, "
              f"the file and the pages agree")


def harvest_artefact_is_this_run():
    """The fetched artefact and the committed data must be one matcher run.

    data/fs-volumes-world.json.gz is gitignored — 740 MB of waypoints are not
    in a checkout, so no runner can rebuild it — and the deploy downloads it
    from the harvest-data release. Its two siblings out of the same run,
    fs-volumes-promote.json and fs-volumes-unplaced.json, ARE committed.

    So re-running the matcher locally and pushing ships new committed data
    against whatever artefact the release still holds, and until now nothing
    said so. On 7 October that produced a green deploy carrying
    «52,964 places · 2,780,922 record volumes»: every newly placed village on
    the map and none of its books, because the artefact was nine days older
    than the promote file beside it — and LOWER than the 2,893,805 it
    replaced. Every gate passed, because every gate checked one side.

    A run stamp costs nothing and makes it visible. Files written before the
    stamp existed carry none; that is not an error, only an older pair.
    """
    import gzip as _gz
    try:
        prom = json.load(open("data/fs-volumes-promote.json", encoding="utf-8"))
    except Exception:
        return
    try:
        with _gz.open("data/fs-volumes-world.json.gz", "rt", encoding="utf-8") as fh:
            head = fh.read(4096)
    except FileNotFoundError:
        return                      # build.py reports this one properly
    except Exception:
        return
    m = re.search(r'"run"\s*:\s*"([^"]+)"', head)
    world_run, prom_run = (m.group(1) if m else None), prom.get("run")
    if not world_run or not prom_run:
        return                      # one of them predates the stamp
    if world_run != prom_run:
        err("data/fs-volumes-world.json.gz is from a different matcher run "
            f"({world_run}) than the committed data beside it ({prom_run}). "
            "The artefact is a release asset the deploy downloads, so a local "
            "re-run does not reach it and the site would ship new places with "
            "stale volumes. Fix with:\n"
            "    gh release upload harvest-data data/fs-volumes-world.json.gz --clobber")


def place_evidence(places, OVR, PIN):
    """A place's country and coordinates must agree with evidence from outside the row.

    THE EXISTING COUNTRY GATE ASKS THE OUTLINE, and the outline is the same thing that
    chose the country in the first place, within 25 km. So a Croatian village on the
    Sava that the rounded border puts in Bosnia passed it twice: once when it was
    filed, once when it was checked. Thirty-four places sat like that for weeks —
    Jasenovac, Metković and Davor among them, listed as Bosnia and Herzegovina — while
    every one of their registers was in a collection titled «Croatia, Church Books».

    So two independent witnesses are asked. First, the COLLECTIONS: the countries of the
    FamilySearch collections that hold the place's books. Second, the GAZETTEER: a
    same-name GeoNames row within 25 km, and the country it is in. A place passes if
    either one agrees with its declared country. It fails if neither does, unless a
    person has said why: `filedUnder`, a note beginning «Audited», or an entry in
    data/country-overrides.json.

    The second test is also run on the NAME: a settlement whose own name has same-country
    gazetteer rows, none of them within 25 km, is a coordinate nobody has confirmed — the
    Stari Grad of Hvar that was drawn in the north of the country, 330 km from itself.
    Pinned places (data/place-overrides.json) and audited ones are exempt. A place with
    no same-name row in its country is untestable, not wrong, and is counted as such.
    """
    import collections, math, re as _re, unicodedata
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
        import gazetteer as _gz
        rows = _gz.places()
        cols = {str(c["cc"]): c for c in json.load(open("data/collections.json"))["collections"]}
    except Exception as e:
        err(f"cannot read the gazetteer or the collections to check places against: {e}")
        return
    if not rows:
        print("place evidence: no gazetteer on this checkout, skipped")
        return

    def fold(s):
        s = unicodedata.normalize("NFKD", s or "")
        s = "".join(c for c in s if not unicodedata.combining(c))
        return _re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

    def hav(a, b, c, d):
        p = math.pi / 180
        x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
        return 12742 * math.asin(math.sqrt(x))

    idx = collections.defaultdict(list)
    for r in rows:
        for f in {r.get("n", "")} | set(r.get("a") or []):
            k = fold(f)
            if len(k) > 2:
                idx[k].append(r)

    def cc_of(url):
        m = _re.search(r"[?&]cc=(\d+)", url or "") or _re.search(r"/collection/(\d+)", url or "")
        return m.group(1) if m else None

    tested = ok_c = ok_g = said = bad = 0
    name_tested = name_untestable = name_bad = 0
    for p in places:
        if not p.get("collections"):
            continue
        pid = p["id"]
        said_so = (bool(p.get("filedUnder")) or pid in OVR
                   or (p.get("note") or "").lstrip().startswith("Audited"))
        names = {fold(p["name"]), fold(p["name"].split(",")[0]), fold(_re.sub(r"\(.*?\)", "", p["name"]))}
        for n in p.get("names") or []:
            names |= {fold(n.get("n", "")), fold((n.get("n") or "").split(",")[0])}
        names = {n for n in names if len(n) > 2}
        mine = [(hav(p["lat"], p["lon"], r["y"], r["x"]), r) for n in names for r in idx.get(n, [])
                if r.get("k") == p["country"]]
        near = [d for d, _ in mine if d <= 25]

        union = set()
        for c in (cols.get(cc_of(v.get("url"))) for v in p["collections"]):
            union |= set((c or {}).get("countries") or [])
        if union:
            tested += 1
            if p["country"] in union:
                ok_c += 1
            elif near:
                ok_g += 1
            elif said_so:
                said += 1
            else:
                bad += 1
                err(f"place {pid}: filed as {p['country']}, but its books are in collections filed under "
                    f"{', '.join(sorted(union))} and no same-name gazetteer row within 25 km is in "
                    f"{p['country']}. Fix the country, or say why in a note beginning «Audited» or in "
                    f"data/country-overrides.json")

        if not p.get("level"):
            if near:
                name_tested += 1
            elif not mine:
                name_untestable += 1
            elif pid in PIN or said_so:
                name_tested += 1
            else:
                name_bad += 1
                err(f"place {pid}: «{p['name']}» has {len(mine)} same-name gazetteer row(s) in {p['country']} "
                    f"and the nearest is {min(d for d, _ in mine):.0f} km from its point. Pin it in "
                    f"data/place-overrides.json, or say what was checked in a note beginning «Audited»")
    if not (bad or name_bad):
        print(f"place evidence: {tested:,} places with books tested for country "
              f"({ok_c:,} by collection, {ok_g:,} by gazetteer, {said} said so by a person); "
              f"{name_tested:,} settlements confirmed by name, {name_untestable} untestable")


def place_ids_valid(places):
    """data/place-ids.json: an id attached to a place has to be the right shape and the right place.

    The ids exist so a claim here can be checked against records that are not ours, which
    only works if they are not guesses. So each one must name a place we hold, look like a
    Wikidata item and a GeoNames number, and have been matched within the 5 km it claims.
    Two of our places on one item are allowed and counted: two filings of one ground.
    """
    p = "data/place-ids.json"
    if not os.path.exists(p):
        return
    try:
        doc = json.load(open(p, encoding="utf-8"))
    except Exception as e:
        err(f"data/place-ids.json will not parse: {e}")
        return
    have = {x["id"] for x in places}
    ids = doc.get("ids") or {}
    q = {}
    for pid, v in ids.items():
        if pid not in have:
            err(f"place-ids.json names {pid}, which is not a place"); continue
        if not re.fullmatch(r"Q\d+", str(v.get("wikidata", ""))):
            err(f"place-ids.json {pid}: {v.get('wikidata')!r} is not a Wikidata item")
        if not re.fullmatch(r"\d+", str(v.get("geonames", ""))):
            err(f"place-ids.json {pid}: {v.get('geonames')!r} is not a GeoNames id")
        if not isinstance(v.get("km"), (int, float)) or v["km"] > doc.get("maxKm", 5):
            err(f"place-ids.json {pid}: matched {v.get('km')} km away, beyond the {doc.get('maxKm', 5)} km it claims")
        q.setdefault(v.get("wikidata"), []).append(pid)
    twice = sum(1 for v in q.values() if len(v) > 1)
    print(f"place ids: {len(ids)} places carry a Wikidata item and a GeoNames id ({twice} items shared by two filings)")


def flag_seams():
    """data/flag-seams.json: every seam between eras has been listed, and none is new.

    See scripts/flag_seams.py for what a seam is and why one year does not count.
    """
    p = "data/flag-seams.json"
    if not os.path.exists(p):
        return
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
        import flag_seams as fs
        doc = json.load(open(p, encoding="utf-8"))
        eras = json.load(open("data/flag-eras.json", encoding="utf-8"))["eras"]
        art = json.load(open("data/era-flags.json", encoding="utf-8")).get("art") or {}
    except Exception as e:
        err(f"cannot check the flag seams: {e}")
        return
    have = doc.get("seams") or {}
    now = {fs.key(s): s for s in fs.seams(eras)}
    for k, s in now.items():
        if k not in have:
            err(f"flag seam {k}: a {s[1]} of {s[4]} years between two eras that nobody has "
                f"looked at. Run scripts/extract-flag-seams.py and give it a verdict.")
    for k, v in have.items():
        if k not in now:
            err(f"flag seam {k} is listed and no longer exists. Run scripts/extract-flag-seams.py.")
        elif v.get("verdict") not in fs.VERDICTS:
            err(f"flag seam {k}: unknown verdict {v.get('verdict')!r}")
        elif v["verdict"] in ("concurrent", "unrecorded", "dating") and not v.get("why"):
            err(f"flag seam {k}: a verdict of {v['verdict']} must say why")
    noid, noimg = fs.structure(eras, art)
    for what, now_l, have_l in (("an id", noid, doc.get("noId") or []), ("an image", noimg, doc.get("noImage") or [])):
        new = [x for x in now_l if list(x) not in have_l]
        for x in new:
            err(f"flag era {x[0]} {x[1]} has no {what}, and was not there when this was last counted")
    n = {}
    for v in have.values():
        n[v.get("verdict")] = n.get(v.get("verdict"), 0) + 1
    if not any(k not in have for k in now):
        print(f"flag seams: {len(have)} listed ({', '.join(f'{v} {k}' for k, v in sorted(n.items()))}); "
              f"{len(noid)} eras without an id, {len(noimg)} without an image, none new")


def context_contract():
    """site/public/context.json is what the generator would write today, and what /data/ says it is.

    The file is a CONTRACT other sites snapshot, so three things must hold: its ids are
    unique (a note can cite one era permanently), it is current (a stale copy would publish
    yesterday's gaps as today's), and the version /data/ documents is the version the file
    carries. A consumer reads the page and the file; if they disagree, one of them is lying.
    """
    p = "site/public/context.json"
    if not os.path.exists(p):
        return
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "build_context", os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-context.py"))
        bc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bc)
        have = json.load(open(p, encoding="utf-8"))
        now = bc.build()
    except Exception as e:
        err(f"cannot check context.json: {e}")
        return
    have.pop("generated", None)
    now.pop("generated", None)
    if have != now:
        err("site/public/context.json is not what scripts/build-context.py writes today. "
            "Run python3 scripts/build-context.py.")
    ids = [e["id"] for r in now["regions"] for e in r["eras"]] + \
          [e["id"] for c in now["countries"] for e in c["eras"]]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        err(f"context.json era ids are not unique: {sorted(dup)[:5]}")
    ver = now["contract"]["version"]
    try:
        page = open("site/src/pages/data.astro", encoding="utf-8").read()
    except OSError:
        page = ""
    if f"Version <b>{ver}</b>" not in page:
        err(f"context.json is version {ver} and /data/ does not say so. Update the contract "
            f"section of site/src/pages/data.astro when the version moves.")
    for r in now["regions"]:
        for e in r["eras"]:
            if e["basis"] not in ("not-recorded", "unknown", "seeded:defranceschi-sovereignty"):
                err(f"context.json {e['id']}: unknown basis {e['basis']!r}")
            want = {True: ("bounds", "regime", "part"), False: ("none",), None: (None,)}[e["contested"]]
            if e.get("contestedScope") not in want:
                err(f"context.json {e['id']}: contested is {e['contested']} and its scope is {e.get('contestedScope')!r}")
            for k in ("fromMargin", "toMargin"):
                m = e.get(k)
                if m is not None and (not isinstance(m, int) or m < 0):
                    err(f"context.json {e['id']}: {k} must be a whole number of years or null")
    if not dup:
        c = now["counts"]
        print(f"context.json: v{ver}, {c['regions']} regions / {c['regionEras']} eras, "
              f"{c['countries']} countries / {c['countryEras']} eras, ids unique, current")


def history_json():
    """site/public/history.json is what scripts/build-history.py writes today, and its inputs are sound.

    The history page draws this file and nothing else, so a stale copy would show last week's
    arrows. The checks that matter: every chapter is a real span with real layers (a chapter
    that plays nothing looks broken), every actor pattern compiles and names a point on Earth
    or a country the map draws, and the movements still resolve as well as they did.
    """
    p = "site/public/history.json"
    if not os.path.exists(p):
        return
    try:
        import importlib.util, re as _re
        spec = importlib.util.spec_from_file_location(
            "build_history", os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-history.py"))
        bh = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bh)
        have = json.load(open(p, encoding="utf-8"))
        now = bh.build()
        actors = json.load(open("data/history-actors.json", encoding="utf-8"))["actors"]
        anchors = json.load(open("site/public/era-moves.json", encoding="utf-8"))["at"]
    except Exception as e:
        err(f"cannot check history.json: {e}")
        return
    have.pop("generated", None)
    now.pop("generated", None)
    if have != now:
        err("site/public/history.json is not what scripts/build-history.py writes today. "
            "Run python3 scripts/build-history.py.")
    seen = set()
    for c in now["chapters"]:
        if c["id"] in seen:
            err(f"history chapter {c['id']}: duplicate id")
        seen.add(c["id"])
        if not (bh.MIN_YEAR <= c["from"] < c["to"] <= 2026):
            err(f"history chapter {c['id']}: years {c['from']}-{c['to']} are not a span inside {bh.MIN_YEAR}-2026")
        if not c.get("layers") or any(l not in ("conquest", "occupation", "migration") for l in c["layers"]):
            err(f"history chapter {c['id']}: layers must be conquest, occupation or migration")
        v = c.get("view") or []
        if len(v) != 3 or not (-90 <= v[0] <= 90 and -180 <= v[1] <= 180 and 1 <= v[2] <= 8):
            err(f"history chapter {c['id']}: view must be [lat, lon, zoom]")
        n = sum(1 for m in now["moves"] if c["from"] <= m["f"] <= c["to"] and m["v"] in c["layers"])
        if n < 3:
            err(f"history chapter {c['id']}: only {n} movements begin in it; it would play an empty map")
    for a in actors:
        try:
            _re.compile(a["re"])
        except _re.error as e:
            err(f"history actor {a['re']!r}: {e}")
            continue
        if "seat" in a and not (-90 <= a["lat"] <= 90 and -180 <= a["lon"] <= 180):
            err(f"history actor {a['seat']!r}: coordinates are not on Earth")
        if "cc" in a and a["cc"] not in anchors:
            err(f"history actor {a['re']!r}: {a['cc']} has no anchor on the map")
    c = now["counts"]
    if c["moves"] < 800 or c["stub"] > 0.5 * c["moves"]:
        err(f"history.json resolves too little: {c}")
    if True:
        print(f"history.json: {c['moves']} movements ({c['country']} country-to-country, {c['seat']} to a seat, "
              f"{c['origin']} from a people's country, {c['stub']} stubs), {len(now['chapters'])} chapters, current")


def history_ground():
    """site/public/history-ground.json was cut from the OHM boundaries now in data/ohm.

    Rebuilding it takes half a minute, so the gate compares the SHA-1 of the source it records
    with the source on disk rather than rebuilding: a changed boundary file with a stale cut
    would draw last month's borders on the history map.
    """
    p = "data/history-ground.json"
    if not os.path.exists(p):
        err("data/history-ground.json is missing: it is the committed cut the build copies to the site. "
            "Run python3 scripts/build-history-ground.py where data/ohm exists, and commit it.")
        return
    have = json.load(open(p, encoding="utf-8"))
    if not os.path.exists("data/ohm/boundaries.json"):
        sha = have.get("sourceSha1")          # no cache here (CI): nothing to compare against
    else:
        import hashlib
        sha = hashlib.sha1(open("data/ohm/boundaries.json", "rb").read()).hexdigest()
    if have.get("sourceSha1") != sha:
        err("site/public/history-ground.json was cut from a different data/ohm/boundaries.json. "
            "Run python3 scripts/build-history-ground.py.")
    elif have["counts"]["shapes"] < 2500:
        err(f"history-ground.json holds only {have['counts']['shapes']} shapes")
    else:
        print(f"history-ground.json: {have['counts']['shapes']} shapes from the current OHM cache")


def voyages_gate():
    """data/voyages.json: every voyage meets scripts/voyages_check.py, and ids are unique."""
    p = "data/voyages.json"
    if not os.path.exists(p):
        return
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import voyages_check as vc
        vs = json.load(open(p, encoding="utf-8"))["voyages"]
        slugs = {f[:-5] for f in os.listdir("site/src/flags-pages") if f.endswith(".html")}
    except Exception as e:
        err(f"cannot check voyages: {e}")
        return
    ids = [v.get("id") for v in vs]
    for i in {x for x in ids if ids.count(x) > 1}:
        err(f"voyage id {i} is not unique")
    n = 0
    for v in vs:
        for m in vc.problems(v, slugs):
            err(f"voyage {m}"); n += 1
    if not n:
        att = sum(1 for v in vs if v["evidence"] == "attested")
        print(f"voyages: {len(vs)} expeditions, {att} attested, every route dated and every voyage sourced")


def leaders_gate():
    """site/public/leaders.json is what scripts/build-leaders.py writes from data/leaders.json, and each holder is checkable."""
    p = "site/public/leaders.json"
    if not os.path.exists(p) or not os.path.exists("data/leaders.json"):
        return
    try:
        import importlib.util, re as _re
        spec = importlib.util.spec_from_file_location(
            "build_leaders", os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-leaders.py"))
        bl = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bl)
        have = json.load(open(p, encoding="utf-8"))
        now = bl.build()
    except Exception as e:
        err(f"cannot check leaders.json: {e}")
        return
    have.pop("generated", None); now.pop("generated", None)
    if have != now:
        err("site/public/leaders.json is not what scripts/build-leaders.py writes today. Run python3 scripts/build-leaders.py.")
    bad = 0
    for cc, rows in now["countries"].items():
        for r in rows:
            if not _re.fullmatch(r"Q\d+", r[1] or ""):
                err(f"leaders {cc} {r[0]}: Wikidata id {r[1]!r} is not Q<digits>"); bad += 1
            if r[3] is not None and r[3] < r[2]:
                err(f"leaders {cc} {r[0]}: ends before it starts"); bad += 1
    if not bad:
        c = now["counts"]
        print(f"leaders: {c['holders']} heads of state across {c['countries']} countries, every holder carries a Wikidata id")


def region_detail_gate():
    """data/region-detail.json: every ruler and language row names an https source, reigns are ordered, rows say what they establish."""
    p = "data/region-detail.json"
    if not os.path.exists(p):
        return
    try:
        doc = json.load(open(p, encoding="utf-8"))["regions"]
        rids = {r["id"] for r in json.load(open("data/regions.json", encoding="utf-8"))["regions"]}
    except Exception as e:
        err(f"cannot read region-detail.json: {e}")
        return
    n = 0
    for rid, d in doc.items():
        if rid not in rids:
            err(f"region-detail: {rid} is not a region"); continue
        for x in d["rulers"]:
            n += 1
            if not str(x.get("source", "")).startswith("https://"):
                err(f"region-detail {rid} {x['name']}: no https source")
            a, b = str(x["from"])[:4], str(x["to"] or "9999")[:4]
            if not a.lstrip("-").isdigit() or a > b:
                err(f"region-detail {rid} {x['name']}: reign {x['from']} to {x['to']} is not ordered")
            if x.get("q") and not x["q"].startswith("Q"):
                err(f"region-detail {rid} {x['name']}: bad Wikidata id")
        for l in d["language"]:
            if not str(l.get("source", "")).startswith("https://") or not l.get("says") or not l.get("notCovered"):
                err(f"region-detail {rid} language {l.get('kind')}: needs a source, what it says and what it does not cover")
    if n:
        print(f"region-detail: {n} reigns and their language rows, every row sourced")


def flag_art_audit():
    """data/flag-art.json: every audited drawing exists, has a valid class, and names a reference when it claims to match one."""
    p = "data/flag-art.json"
    if not os.path.exists(p):
        return
    try:
        doc = json.load(open(p, encoding="utf-8"))
        art = json.load(open("data/era-flags.json", encoding="utf-8"))["art"]
    except Exception as e:
        err(f"cannot read flag-art.json: {e}")
        return
    n, tally = 0, {}
    for slug, pg in doc["pages"].items():
        for eid, r in pg.items():
            n += 1
            tally[r["art"]] = tally.get(r["art"], 0) + 1
            if eid not in art.get(slug, {}):
                err(f"flag art {slug} {eid}: there is no such drawing")
            if r["art"] not in doc["classes"]:
                err(f"flag art {slug} {eid}: unknown class {r['art']!r}")
            if r["art"] in ("faithful", "simplified", "wrong", "redrawn") and not str(r.get("reference") or "").startswith("https://"):
                err(f"flag art {slug} {eid}: {r['art']} without an https reference")
            if not r.get("note"):
                err(f"flag art {slug} {eid}: no note")
            if r["art"] == "commons":
                # the drawing IS another person's file: only public-domain ones may be embedded, and the
                # author stays named. Anything under CC BY / BY-SA would need an attribution notice on every page.
                if r.get("license") not in ("Public domain", "CC0"):
                    err(f"flag art {slug} {eid}: commons drawing with licence {r.get('license')!r}; only Public domain or CC0 may be embedded")
                if not r.get("artist"):
                    err(f"flag art {slug} {eid}: commons drawing without an author")
                if "commons.wikimedia.org/wiki/File:" not in str(r.get("reference") or ""):
                    err(f"flag art {slug} {eid}: commons drawing without its Commons file page")
                svg = art.get(slug, {}).get(eid, "")
                if svg.count("<svg") != 1 or re.search(r"<(script|style|image|text|foreignObject)\b|href=\"(?!#)", svg):
                    err(f"flag art {slug} {eid}: commons drawing is not a clean single SVG")
    # THE BUILD WRITES EACH DRAWING OUT AS ITS OWN .svg FILE, with only the default namespace declared.
    # A drawing that uses xlink:href parses fine inline in the page and is not well-formed on its own, which
    # failed a 64-minute build on 8 files. Prove it here, in seconds, the way the build will meet it.
    import xml.etree.ElementTree as _ET
    for slug, pg in art.items():
        for eid, svg in pg.items():
            try:
                _ET.fromstring(svg if "xmlns=" in svg else svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1))
            except Exception as e:
                err(f"flag art {slug} {eid}: not well-formed as a standalone .svg ({e}); use href, not xlink:href")
    total = sum(len(v) for v in art.values())
    parts = ", ".join(f"{v} {k}" for k, v in sorted(tally.items()))
    print(f"flag art: {n} of {total} drawings compared with a reference ({parts})")


def main():
    flag_era_drift()
    flag_art_drift()
    flag_evidence()
    flag_art_audit()
    flag_seams()
    context_contract()
    history_json()
    history_ground()
    voyages_gate()
    leaders_gate()
    region_detail_gate()
    harvest_artefact_is_this_run()
    places = json.load(open("data/places.json"))["places"]
    regions = json.load(open("data/regions.json"))
    provs = json.load(open("data/providers.json"))
    OVR = json.load(open("data/country-overrides.json"))["overrides"]
    for k, v in OVR.items():
        if not v.get("why"):
            err(f"country-override {k}: no reason given")
    # -2 · THE BUILD AND THE CLIENT MUST SHARD BY THE SAME RULE.
    # They did not, and it cost 10,962 surnames. The build took the first three
    # CHARACTERS and then dropped the non-alphanumerics — «d'arcy» became «da»,
    # too short for a shard, so nothing was written. The client scans the whole
    # string for its first three alphanumerics, gets «dar», and fetches a file
    # that was never made. Every name with a separator near the front was
    # affected: O'Brien, D'Angelo, Ah-Sing, Le Roy, de Witt.
    #
    # Both now compute the same thing, and this proves it on the real data
    # rather than trusting that they still agree.
    # IT NOW RUNS THE CLIENT INSTEAD OF IMITATING IT. This used to re-type the
    # client's loop in Python and compare build.py against the copy — which
    # proves the two Pythons agree and nothing about the JavaScript that is
    # actually shipped. The copy had in fact already drifted: it used
    # `isalnum()`, true of Cyrillic, while the client's regex was /[a-z0-9]/,
    # and neither this check nor anything else noticed.
    #
    # public/js/shard-key.js is the one client rule now, so node runs it and
    # the answers are compared on names chosen for the ways this has broken
    # before: separators near the front, the folding table, and Cyrillic.
    import subprocess, tempfile
    NAMES = ["d'arcy", "o'brien", "ah-sing", "le roy", "de witt", "st john",
             "d'angelo", "van der berg", "mcdonald", "sant'angelo",
             "\u0442\u0432\u0435\u0440\u044c", "\u043d\u043e\u0432\u043e\u0441\u0438\u0431\u0438\u0440\u0441\u043a",
             "chapman", "mer", "san giovanni"]
    try:
        sys.path.insert(0, "scripts")
        from build import run_key as _bk
    except ImportError:
        err("cannot import run_key from build.py to check it against the client")
        _bk = None
    if _bk:
        js = ("global.window={};require(%s);"
              "console.log(JSON.stringify(%s.map(function(n){"
              "return window.raShardKey(n,{});})));"
              % (json.dumps(os.path.abspath("site/public/js/shard-key.js")),
                 json.dumps(NAMES)))
        try:
            got = json.loads(subprocess.run(["node", "-e", js], check=True,
                                            capture_output=True, text=True).stdout)
        except Exception as _e:                      # noqa: BLE001
            err(f"cannot run site/public/js/shard-key.js to check it against "
                f"build.py: {_e}")
            got = None
        if got is not None:
            _dis = [(n, _bk(n, 3), g) for n, g in zip(NAMES, got) if _bk(n, 3) != g]
            if _dis:
                err("build.py and the client disagree on the shard key for "
                    + "; ".join(f"{n!r} build={b!r} client={c!r}"
                                for n, b, c in _dis)
                    + " — names sharded one way and looked up another are "
                      "unfindable by their own spelling")

    # -1.5 · NO FIELD IN THE INDEX THAT NOTHING READS.
    # index.json is fetched by every visitor before the map draws, so a field
    # nobody uses is not a small cost but a pure one. This has happened three
    # times: `r` and `k` sat in 7,391 rows costing 22 KB to answer nobody, and
    # `vol` was added and never rendered on the same afternoon the lesson was
    # written down. The client is read and every key must appear in it.
    try:
        _idx = json.load(open(os.path.join("site", "public", "index.json")))
        _client = open(os.path.join("site", "src", "components",
                                    "RecordMap.astro"), encoding="utf-8").read()
        # Both halves of the split index: a field that only the quiet rows
        # carry is still a field every one of them ships.
        _rows = list(_idx.get("places", []))
        try:
            _rows += json.load(open(os.path.join(
                "site", "public", "index-quiet.json"))).get("places", [])
        except OSError:
            pass
        _keys = set()
        for _r in _rows:
            _keys |= set(_r)
        for _k in sorted(_keys):
            # A BARE `[f` IS A VARIABLE, NOT A FIELD READ. The old pattern
            # accepted anything after a dot OR a bracket, so `[f.y, f.x]`
            # and `PROV[f]` — where f is a local — satisfied it, and the
            # index shipped a field `f` on 10,046 rows that nothing reads.
            # A gate that passes wrongly is worse than no gate: it is the
            # reason nobody looked.
            #
            # A real read is a property access: `.f`, or a quoted subscript
            # `["f"]`. Anything else is a coincidence of naming, which is
            # near certain for the single-letter keys this index uses.
            if not re.search(r"\.\s*" + re.escape(_k) + r"\b"
                             r"|\[\s*[\"']" + re.escape(_k) + r"[\"']\s*\]",
                             _client):
                err(f"index.json ships a field '{_k}' that RecordMap.astro never "
                    f"reads — every visitor downloads it to answer nobody")
    except OSError:
        pass

    # -1.4 · THE PAGE RULE IS IN TWO LANGUAGES AND MUST AGREE.
    # site/src/lib/surname-pages.js decides which surnames get a page,
    # and scripts/build.py mirrors it in Python to flag `pg` in the
    # search shards so the map can link without 404ing. Two copies of a
    # derived set is precisely how the sitemap came to list 3,577 pages
    # while 17,961 were live, and how the shard keys once disagreed
    # between build and client. So they are both run over the real
    # corpus and compared by name, not by count — a count can match
    # while the sets differ.
    try:
        import subprocess as _sp
        _js = _sp.run(
            ["node", "--input-type=module", "--max-old-space-size=8192", "-e",
             "import {earnsPage} from './site/src/lib/surname-pages.js';"
             "import fs from 'node:fs';"
             "const d=JSON.parse(fs.readFileSync('data/surnames.json','utf8'));"
             "const s=d.surnames.filter(earnsPage).map(r=>r.n);"
             "process.stdout.write(JSON.stringify(s));"],
            capture_output=True, text=True, timeout=600)
        if _js.returncode != 0:
            warn("surname page rule: could not run the JavaScript copy "
                 f"({_js.stderr.strip()[:90]})")
        else:
            _jsset = set(json.loads(_js.stdout))
            _d = json.load(open("data/surnames.json"))

            def _earns(r):
                ccs = r.get("countries") or []
                if not ccs:
                    return False
                v = r.get("variants") or []
                if any(x.get("how") == "curated" for x in v):
                    return True
                if any(c.get("how") == "archive" for c in ccs):
                    return True
                n = sum(1 for c in ccs if c.get("n") is not None)
                return n >= 3 and any(x.get("how") == "spelling" for x in v)

            _pyset = {r["n"] for r in _d["surnames"] if _earns(r)}
            _only_js = _jsset - _pyset
            _only_py = _pyset - _jsset
            if _only_js or _only_py:
                err(f"the surname page rule disagrees between "
                    f"surname-pages.js and build.py: {len(_only_js)} names "
                    f"only JavaScript grants a page (e.g. "
                    f"{sorted(_only_js)[:3]}), {len(_only_py)} only Python "
                    f"(e.g. {sorted(_only_py)[:3]}) — the map would link to "
                    f"pages that do not exist, or miss pages that do")
            else:
                print(f"surname pages: {len(_pyset):,} names earn one, and "
                      f"surname-pages.js and build.py agree on every one")
    except (OSError, ValueError, json.JSONDecodeError) as _e:
        warn(f"surname page rule not cross-checked: {_e}")

    # -1 · THE INLINE SCRIPTS MUST PARSE.
    # RecordMap.astro carries 1,600 lines of JavaScript inside `<script
    # is:inline>`, which Astro copies into the page verbatim and never looks
    # at. A stray brace in there builds perfectly, deploys perfectly, and
    # produces a page with no map on it — the one failure mode that passes
    # every check this project has and is invisible until somebody loads it.
    import subprocess as _sp, tempfile as _tf
    if _sp.run(["node", "--version"], capture_output=True).returncode == 0:
        for _c in _g.glob("site/src/**/*.astro", recursive=True):
            _src = open(_c, encoding="utf-8").read()
            # SELF-CLOSING TAGS HAVE NO BODY. Written without the `[^/]`,
            # this pattern walked straight past `<script is:inline ... />` and
            # ran on to the NEXT script's closing tag, so it handed node the
            # intervening markup as if it were JavaScript and reported a
            # syntax error in a script that was perfectly fine. A gate that
            # cries wolf gets switched off, so it has to be right.
            # AND `[^>]*` IS NOT HOW YOU FIND THE END OF A TAG EITHER.
            # An Astro attribute can hold an expression, and an expression can
            # hold an arrow function: `define:vars={{ x: a.map((c) => c.n) }}`
            # contains a «>» that is not the end of the tag. This pattern
            # stopped there and handed node the tail of an attribute, which
            # reports a syntax error in a script that parses perfectly — the
            # same class of false alarm as the self-closing bug above, from
            # the same character class, caught the same way: by a script that
            # was fine being called broken.
            #
            # So the tag end is found by scanning, tracking brace depth, and a
            # «>» inside {...} does not count.
            def _inline_scripts(src):
                out = []
                for _s in re.finditer(r"<script\b", src):
                    j, depth = _s.end(), 0
                    while j < len(src):
                        ch = src[j]
                        if ch == "{":
                            depth += 1
                        elif ch == "}":
                            depth -= 1
                        elif ch == ">" and depth == 0:
                            break
                        j += 1
                    tag = src[_s.start():j]
                    if "is:inline" not in tag or tag.rstrip().endswith("/"):
                        continue
                    end = src.find("</script>", j)
                    if end > 0:
                        out.append(src[j + 1:end])
                return out

            for _i, _body in enumerate(_inline_scripts(_src)):
                with _tf.NamedTemporaryFile("w", suffix=".js", delete=False,
                                            encoding="utf-8") as _fh:
                    _fh.write(_body)
                    _tmp = _fh.name
                _r = _sp.run(["node", "--check", _tmp], capture_output=True, text=True)
                os.unlink(_tmp)
                if _r.returncode != 0:
                    err(f"{_c}: inline script #{_i + 1} does not parse — "
                        f"{_r.stderr.strip().splitlines()[-1] if _r.stderr else '?'}")

    # -1b · EVERY SVG SHIPPED MUST BE VALID XML.
    # favicon.svg carried «--accent #1F5C6B» inside an XML comment. A double
    # hyphen is illegal there, so the file was not well-formed XML and a strict
    # parser threw the whole thing away — which is why the tab showed a grey
    # placeholder and David said there was no icon. It served HTTP 200 with the
    # right content type the entire time, so every check that asked the network
    # said it was fine. Only a parser can tell you an image is broken.
    import xml.dom.minidom as _xd
    for _svg in _g.glob("site/public/**/*.svg", recursive=True):
        try:
            _xd.parse(_svg)
        except Exception as _e:
            err(f"{_svg}: not well-formed XML — {_e}. A browser will refuse to "
                f"render it however cleanly it downloads.")

    # -1c · IF THE STYLESHEET HIDES THE NAV, THE LAYOUT MUST OFFER THE FALLBACK.
    # styles.css came across whole from the family archive and brought a
    # complete navigation design with it: dropdown groups, a menu button and a
    # drawer, with `nav.topnav{display:none!important}` below 1180px. This
    # layout rendered eleven bare links and no button — so on any window under
    # 1180px there was NO navigation at all, and above it the sheet's higher
    # specificity closed the links up to a 1px gap. Inheriting a stylesheet
    # means inheriting the markup it was written for.
    _css = open("site/public/styles.css", encoding="utf-8").read() \
        if os.path.exists("site/public/styles.css") else ""
    if re.search(r"nav\.topnav\s*{[^}]*display:\s*none", _css):
        _base = open("site/src/layouts/Base.astro", encoding="utf-8").read()
        for _need, _why in (('class="burger"', "the button that replaces the hidden bar"),
                            ('id="drawer"', "the panel that button opens")):
            if _need not in _base:
                err(f"styles.css hides nav.topnav under a media query but "
                    f"Base.astro has no {_need} — {_why}. Every narrow window "
                    f"would get no navigation at all.")
        if "details class=\"menu\"" not in _base and ".topnav details.menu" in _css:
            err("styles.css styles .topnav details.menu and nothing else inside "
                "the bar, but Base.astro renders bare links — they will take "
                "the sheet's 1px gap and run together as one word.")

    # 0 · EVERY IMPORT IN A PAGE MUST RESOLVE.
    # The surname page imported ../../../data/frequencies/fr.json, which is one
    # «..» short — [name].astro sits a directory deeper than the pages that use
    # that pattern, so it pointed at site/data rather than the repository root.
    # The data stage built perfectly, this gate said «data is sound», and then
    # Astro failed on the import, so the deploy died AFTER every check passed
    # and the site kept serving the previous build. David saw Lerena still
    # missing Argentina and asked whether it had pushed. It had; it had not
    # landed, and nothing between the two said so.
    for _pg in _g.glob("site/src/**/*.astro", recursive=True) + \
               _g.glob("site/src/**/*.js", recursive=True):
        # BOTH KINDS OF IMPORT. The first cut matched only `from "..."` and
        # missed `await import("...")`, which is how the surname and place
        # pages load their data — so this gate, built to stop exactly this
        # failure, watched it happen a second time and said «data is sound».
        _re_imp = r'(?:from|import)\s*\(?\s*["\'](\.[^"\']+\.(?:json|js))["\']'
        for _m in re.finditer(_re_imp, open(_pg).read()):
            _t = os.path.normpath(os.path.join(os.path.dirname(_pg), _m.group(1)))
            # public/ artefacts are written by build.py earlier in this run.
            if not os.path.exists(_t):
                err(f"{_pg}: imports {_m.group(1)} which resolves to {_t} — "
                    f"that file is not there, and Astro will fail on it AFTER "
                    f"this gate has passed")

    # 2 · NOTHING MAY GET SMALLER WITHOUT SOMEBODY SAYING SO.
    # Presence was never the failure mode. Every bug this project has shipped
    # to the public site was a silent shrinkage: a file that was still there,
    # still valid, still built, and holding a fraction of what it held the day
    # before. data/_floors.json records the size each measure has reached, and
    # a build that goes backwards stops here.
    def floors():
        try:
            F = json.load(open("data/_floors.json"))["floors"]
        except OSError:
            err("data/_floors.json is missing — nothing is guarding against "
                "the dataset quietly halving")
            return
        got = {}

        def count(name, n):
            got[name] = n
            f = F.get(name)
            if f is not None and n < f:
                err(f"{name}: {n:,} is below the floor of {f:,} — something has "
                    f"SHRUNK. Fix it, or raise the floor deliberately in "
                    f"data/_floors.json and say why.")

        pl = json.load(open("data/places.json"))["places"]
        count("places", len(pl))
        count("placesWalked", sum(1 for p in pl if p.get("via") != "geonames-admin"
                                  and p.get("via") != "townlands-ie"
                                  and (p.get("collections") or [])))
        count("countriesWithGround", len({p.get("country") for p in pl if p.get("country")}))
        count("collections", len(json.load(open("data/collections.json"))["collections"]))
        count("providers", len(json.load(open("data/providers.json"))["providers"]))
        rg = json.load(open("data/regions.json"))["regions"]
        count("regions", len(rg))
        count("regionEras", sum(len(r["eras"]) for r in rg))
        try:
            sn = json.load(open("data/surnames.json"))
            count("surnames", sn["counts"]["surnames"])
            count("surnamesWithCountries", sn["counts"]["withCountries"])
            count("surnamesWithVariants", sn["counts"]["withVariants"])
            count("alsoAPlace", sn["counts"].get("alsoAPlace", 0))
        except OSError:
            pass
        asn = json.load(open("data/archive-surnames.json"))["archives"]
        count("archives", len(asn))
        count("archiveSurnames", len({n for a in asn.values() for n in a["surnames"]}))
        # A LOOKUP IS NOT A REGISTER, AND THIS COUNTER SAYS SO.
        # Counting every file in frequencies/ as a register would have made
        # Croatia the ninth country with a published surname table, which is
        # the one thing Croatia does not have: its file is the answers to
        # 466 questions put to a form, not a list anybody published.
        _fq = [f for f in _g.glob("data/frequencies/*.json")
               if not os.path.basename(f).startswith("_")]
        _enum = [f for f in _fq
                 if json.load(open(f)).get("enumerable") is not False]
        count("registers", len(_enum))
        if len(_fq) > len(_enum):
            count("lookups", len(_fq) - len(_enum))
        count("gazetteer", len(_gazetteer.places()))
        try:
            ie = json.load(open("data/ireland-osm.json"))
            count("irishCivilParishes", len(ie["civilParishes"]))
            count("irishTownlands", len(ie["townlands"]))
        except OSError:
            pass
        count("adminDivisions", len(json.load(open("data/admin-divisions.json"))["divisions"]))
        try:
            count("scottishParishes", len(json.load(
                open("data/scotland-parishes.json"))["parishes"]))
        except OSError:
            pass
        try:
            _fv = json.load(open("data/fs-volumes.json"))
            count("fsVolumes", sum(len(v) for v in _fv["byPlace"].values()))
            count("fsVolumePlaces", len(_fv["byPlace"]))
        except OSError:
            pass
        try:
            _wa = json.load(open("data/world-archives.json"))
            count("worldArchives", len(_wa["archives"]))
            count("worldArchiveCountries", len({r["cc"] for r in _wa["archives"]}))
        except OSError:
            pass
        try:
            count("estonianParishes", len(json.load(
                open("data/estonia-parishes.json"))["parishes"]))
        except OSError:
            pass
        try:
            count("italianComuni", len(json.load(
                open("data/italy-comuni.json"))["comuni"]))
        except OSError:
            pass
        # The negatives are a deliverable too. A search that ran and found
        # nothing is worth more written down than repeated, and a file of them
        # that quietly empties is a file nobody is keeping.
        try:
            _dec = json.load(open("data/_declined.json"))
            _k = "declined" if "declined" in _dec else list(_dec)[-1]
            count("declinedDocumented", len(_dec[_k]))
        except OSError:
            pass
        for name, f in (("churches", "churches-wikidata"), ("cemeteries", "cemeteries-wikidata"),
                        ("libraries", "libraries-wikidata")):
            try:
                count(name, len(json.load(open(f"data/{f}.json"))["features"]))
            except OSError:
                pass
        try:
            count("settlements", len(json.load(
                open("data/region-settlements.json"))["settlements"]))
        except OSError:
            pass
        # A floor nobody measures is a floor nobody is standing on.
        for k in F:
            if k not in got:
                err(f"_floors.json has a floor for '{k}' and nothing counts it")

    floors()

    # 1 · NO BUILD-TIME SCRIPT MAY READ OUTSIDE THIS REPOSITORY.
    # build-surnames.py read the sibling archives through an absolute path. It
    # worked on the laptop and returned nothing in CI, and nothing is a valid
    # answer to a glob, so the build stayed green while the deployed dataset
    # lost every archive attestation for days. The rule is now enforced rather
    # than remembered: the three scripts `npm run build` invokes are read and
    # refused if they contain an absolute path. Hand-run snapshot importers may
    # have them — they are not in this list.
    import re as _re
    for _s in ("build-surnames.py", "build.py", "check-data.py"):
        try:
            _src = open(os.path.join("scripts", _s)).read()
        except OSError:
            continue
        for _m in _re.finditer(r'["\'](/Users/|/home/|[A-Z]:\\\\)[^"\']*["\']', _src):
            err(f"{_s}: absolute path {_m.group(0)[:60]} in a BUILD-TIME script — "
                f"it will not exist in CI and will fail silently")

    # THE ARCHIVES MUST ACTUALLY BE IN THERE. build-surnames.py read the sibling
    # repositories through an absolute path that exists on one laptop, so every
    # CI build shipped a dataset with none of their attestations and said
    # nothing about it. Lerena lost Argentina and Uruguay, Defranceski lost
    # Croatia, and the build was green every time. A silent zero is the one
    # failure a build gate exists to catch.
    try:
        snap = json.load(open("data/archive-surnames.json"))
        for label, a in snap["archives"].items():
            if not a.get("surnames"):
                err(f"archive-surnames: {label} contributes no surnames")
            if not a.get("countries"):
                err(f"archive-surnames: {label} attests no country")
        if len(snap["archives"]) < 8:
            err(f"archive-surnames: only {len(snap['archives'])} archives, expected 8 — "
                f"re-run scripts/harvest-archive-surnames.py")
    except FileNotFoundError:
        err("data/archive-surnames.json is missing — every family archive's "
            "attestations would be silently absent from the dataset")

    try:
        PIN = json.load(open("data/place-overrides.json"))["overrides"]
    except FileNotFoundError:
        PIN = {}
    for k, v in PIN.items():
        if not v.get("why"):
            err(f"place-override {k}: no reason given")
        if v.get("lat") is None or v.get("lon") is None:
            err(f"place-override {k}: no coordinates")

    legend = set(provs["access"])
    pids = set()
    for p in provs["providers"]:
        if p["id"] in pids:
            err(f"provider {p['id']}: duplicate id")
        pids.add(p["id"])
        if p["access"] not in legend:
            err(f"provider {p['id']}: access '{p['access']}' is not in the legend")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", p.get("checked", "")):
            err(f"provider {p['id']}: no usable `checked` date")
        else:
            age = (datetime.date.today()
                   - datetime.date.fromisoformat(p["checked"])).days
            if age > 365:
                warn(f"provider {p['id']}: not re-checked in {age} days")
        if not p.get("url", "").startswith("https://"):
            err(f"provider {p['id']}: url is not https")

    rids = set()
    for r in regions["regions"]:
        if r["id"] in rids:
            err(f"region {r['id']}: duplicate id")
        rids.add(r["id"])
        if len(r.get("ring", [])) < 3:
            err(f"region {r['id']}: a ring needs at least three points")
        last = None
        for e in r["eras"]:
            if e["regime"] not in regions["regimes"]:
                err(f"region {r['id']} {e['from']}: unknown regime '{e['regime']}'")
            if e["from"] > e["to"]:
                err(f"region {r['id']} {e['from']}: era ends before it begins")
            if last is not None and e["from"] < last:
                err(f"region {r['id']} {e['from']}: eras are out of order or overlap")
            last = e["to"]
            for f in e["filedUnder"]:
                if f not in pids:
                    err(f"region {r['id']} {e['from']}: filedUnder '{f}' is not a provider")

    seen = set()
    for p in places:
        pid = p.get("id")
        if not pid or pid in seen:
            err(f"place {pid!r}: missing or duplicate id")
        seen.add(pid)
        if not p.get("name"):
            err(f"place {pid}: no name")
        if p.get("lat") is None or p.get("lon") is None:
            err(f"place {pid}: no coordinates")
            continue
        if not p.get("country"):
            err(f"place {pid}: no country")
        elif pid not in OVR and pid not in PIN and not p.get("filedUnder"):
            # A place carrying `filedUnder` has already had this argument
            # settled and recorded: it says where the ground is AND which
            # country a source files it under. Flagging it again would be the
            # gate objecting to the answer it asked for.
            actual = country_of(p["lat"], p["lon"])
            if actual and actual != p["country"]:
                # The same 25 km tolerance the importer uses, because a gate
                # holding a stricter standard than the thing it gates just
                # fails honest data. El Paso is half a kilometre from Mexico
                # and a 110 m-rounded outline cannot see the river.
                edge = km_to(p["lat"], p["lon"], p["country"])
                if edge is None or edge >= 25:
                    err(f"place {pid}: filed as {p['country']} but {p['lat']},{p['lon']} "
                        f"is in {actual} — fix the coordinates, or add a reasoned "
                        f"entry to data/country-overrides.json")
        if p.get("region") and p["region"] not in rids:
            err(f"place {pid}: unknown region '{p['region']}'")

        for c in p.get("collections", []):
            if c.get("provider") not in pids:
                err(f"place {pid}: collection provider '{c.get('provider')}' is unknown")
            if c.get("access") not in legend:
                err(f"place {pid}: collection access '{c.get('access')}' is not in the legend")
            if c.get("from") and c.get("to") and c["from"] > c["to"]:
                err(f"place {pid}: volume '{c.get('title')}' ends before it begins")
            if c.get("url") and not c["url"].startswith("https://"):
                err(f"place {pid}: collection url is not https")
            # An access class that promises images must have something to open.
            if c.get("access") in ("free", "account", "paid") and not c.get("url"):
                err(f"place {pid}: '{c.get('title')}' claims {c['access']} but carries no link")

    # Runs here, BEFORE the reporting loops. It was first placed after them,
    # so its twelve findings were counted into the exit code and never
    # printed — a gate that stops a build without saying why is worse than no
    # gate, because the next person assumes the build is broken.
    licence_gate()
    access_colours_agree()
    place_evidence(places, OVR, PIN)
    place_ids_valid(places)

    for w in WARN[:12]:
        print("warn:", w)
    if len(WARN) > 12:
        print(f"warn: … and {len(WARN)-12} more")
    for e in ERR[:40]:
        print("FAIL:", e)
    if len(ERR) > 40:
        print(f"FAIL: … and {len(ERR)-40} more")

    print(f"\n{len(places)} places, "
          f"{sum(len(p.get('collections',[])) for p in places)} collections, "
          f"{len(provs['providers'])} providers, {len(regions['regions'])} regions")
    if ERR:
        print(f"{len(ERR)} error(s) — build stopped")
        sys.exit(1)
    print("data is sound" + (f" ({len(WARN)} warning(s))" if WARN else ""))


if __name__ == "__main__":
    main()

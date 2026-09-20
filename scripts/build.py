#!/usr/bin/env python3
"""Write what the site serves, out of what the repository holds.

    data/places.json      ->  site/public/index.json     one thin row per place
                              site/public/p/<id>.json    everything about one place
    data/regions.json     ->  site/public/regions.json
    data/providers.json   ->  site/public/providers.json

THE SPLIT IS THE POINT. The family archive this grew out of serves 1,369 places
in a single 2.5 MB file, which is fine for one family's ground and impossible
for the world. Here the map fetches an index that carries only what a marker
needs to be DRAWN and FOUND, and the panel fetches one small file when somebody
actually clicks. Worldwide, the index grows linearly and the panel never does.
"""
import collections, json, os, re, shutil, sys, unicodedata
import record_kinds  # one classifier, shared with the other scripts
KIND_BIT = record_kinds.BIT

import os as _os
_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
_os.chdir(_ROOT)
from geo import in_ring_latlon

OUT = "site/public"

# Most-open-wins. A place with one free volume and fifty on paper is a place
# where you CAN see something tonight, and the panel tells the rest of the
# truth. The opposite rule would paint the map the colour of its worst news.
# `unsurveyed` is last and is not an access class at all — it is the absence of
# one. It exists because a place with no volumes and a place whose volumes are
# all on paper were the same colourless dot, and those are completely different
# facts: one says «go to the building», the other says «nobody has looked».
RANK = ["free", "account", "index", "mixed", "paid", "catalogue", "onsite", "unsurveyed"]

# NFKD strips the accents off č ć š ž but not off đ, which is its own letter
# rather than a d with a mark. Croatian place names are full of it.
XLAT = str.maketrans({"đ": "d", "Đ": "D", "ł": "l", "Ł": "L", "ø": "o", "Ø": "O",
                      "ß": "ss", "æ": "ae", "œ": "oe", "ı": "i"})


def fold(s):
    s = (s or "").translate(XLAT)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def shard_key(form):
    """The first three alphanumerics ANYWHERE in the string.

    THE BUILD AND THE CLIENT DISAGREED AND THE CLIENT WAS RIGHT. This used to
    be `"".join(c for c in form[:3] if c.isalnum())` — take three characters,
    then throw away the ones that are not letters. For «d'arcy» that is «d'a»
    and then «da», which is two characters, which is too short to be a shard,
    so nothing was written. The client meanwhile scans the whole string for its
    first three alphanumerics, gets «dar», and fetches a file the build never
    made.

    10,962 surnames were unfindable by their own spelling because of it —
    every name with a separator near the front: O'Brien, D'Angelo, Ah-Sing,
    Le Roy, de Witt. Some were rescued by a variant that happened to shard
    correctly, which is why it looked like it worked.
    """
    k = ""
    for ch in form:
        if ch.isalnum():
            k += ch
            if len(k) == 3:
                break
    return k if len(k) == 3 else ""


def main():
    places = json.load(open("data/places.json"))["places"]

    # PLACES THE VOLUMES BROUGHT WITH THEM. The matcher finds books for
    # settlements this atlas has never drawn — Douglas and Onchan on the Isle
    # of Man, Porto-Novo in Benin — and resolves them against the gazetteer,
    # which knows their coordinates. Those were written to
    # data/fs-volumes-promote.json and then read by nothing at all, so
    # seventeen places with real books existed only in a file. A dot the
    # reader cannot see is not a finding.
    #
    # They are marked `from: "gazetteer"` so nothing later mistakes them for
    # places somebody checked: they are here because a book pointed at them.
    _known = {p["id"] for p in places}
    try:
        _promoted = json.load(open("data/fs-volumes-promote.json"))["places"]
    except FileNotFoundError:
        _promoted = []
    _added = 0
    for _pl in _promoted:
        if _pl["id"] in _known or _pl.get("lat") is None:
            continue
        places.append({"id": _pl["id"], "name": _pl["name"],
                       "lat": _pl["lat"], "lon": _pl["lon"],
                       "country": _pl["country"], "names": [],
                       "collections": [], "via": "gazetteer"})
        _known.add(_pl["id"])
        _added += 1
    if _added:
        print(f"promoted        {_added} places drawn because a book pointed "
              f"at them, coordinates from the gazetteer")

    # ---- which region a place stands in, decided HERE and not remembered -----
    # This used to be written into data/places.json by whichever importer drew
    # the place, which meant a region could only ever catch the ground that was
    # imported after it. Eleven regions were authored this afternoon — Ireland,
    # Scotland, Alsace-Lorraine, Silesia, the Baltic governorates, Congress
    # Poland, Carniola, Bosnia, Vojvodina, Quebec, Acadia — and every one of
    # them came up empty, because all 4,106 places already existed. The stored
    # field was not wrong; it was stale, which on a map that adds regions is
    # the same thing.
    #
    # The rings are the only source of truth about what is inside them, so the
    # question is asked of the rings, on every build. 4,106 places against 33
    # rings is a few hundred thousand point-in-polygon tests and costs under a
    # second.
    _regions = json.load(open("data/regions.json"))["regions"]
    _moved = 0
    for _p in places:
        _was = _p.get("region")
        _now = None
        for _r in _regions:
            if in_ring_latlon(_p["lat"], _p["lon"], _r["ring"]):
                _now = _r["id"]
                break
        if _now:
            _p["region"] = _now
        elif _was:
            _p.pop("region")
        if _now != _was:
            _moved += 1
    print(f"{sum(1 for p in places if p.get('region'))} of {len(places)} places "
          f"stand inside a record region ({_moved} changed hands this build)")

    # ---- FamilySearch collections, attached by how specifically they reach ---
    # A collection is a COVERAGE CLAIM over an area, not a volume standing in a
    # town: «Italy, Napoli, Civil Registration, 1809-1936» reaches Arienzo, and
    # so does «Italy, Births and Baptisms», and those are not the same news. So
    # every attachment carries a rank, and the page says which kind it is.
    try:
        FS = json.load(open("data/collections.json"))["collections"]
    except FileNotFoundError:
        FS = []
    # WHAT KIND OF RECORD EACH ONE IS. David asked for a church-records
    # filter — "many people really want to look at church records, do we know
    # which are which" — and nothing here knew. The only structured thing a
    # collection carries is its title, so the kind is read out of that, once,
    # here, by the shared classifier every other consumer uses too. About one
    # in six matches nothing and stays unclassified rather than being guessed.
    # NOT `kinds` — THAT NAME IS TAKEN. A volume already carries kinds as
    # single letters for the EVENTS it records: b, d, m, i for births,
    # deaths, marriages and index. This is a different axis entirely — what
    # sort of register the collection is — so it gets its own name rather
    # than quietly shadowing a field 8,557 rows already use.
    for c in FS:
        c["rkinds"] = record_kinds.kinds_of(c["title"])
    fs_by_cc = {}
    for c in FS:
        for cc in c["countries"]:
            fs_by_cc.setdefault(cc, []).append(c)

    def km(a, b, c, d):
        from math import radians, sin, cos, asin, sqrt
        a, b, c, d = map(radians, (a, b, c, d))
        return 12742 * asin(sqrt(sin((c - a) / 2) ** 2
                                 + cos(a) * cos(c) * sin((d - b) / 2) ** 2))

    # ---- the parishes round a place ---------------------------------------
    # A church is a parish and a parish is where a register is kept, so the
    # nearest ones are a real answer rather than decoration: the register of a
    # hamlet with no church of its own is kept at the church it walked to.
    # Only the mapped regions have churches harvested, so only places inside
    # one get this — which the page has to say, or a blank reads as «none».
    try:
        CHURCH = json.load(open("data/churches-wikidata.json"))["features"]
    except FileNotFoundError:
        CHURCH = []
    ch_by_region = {}
    for c in CHURCH:
        ch_by_region.setdefault(c["r"], []).append(c)

    def parishes(place, within=15.0, most=6):
        """The nearest parishes, with the distance shown rather than hidden.

        A six-kilometre cut-off returned nothing for Gračišće, and the reason
        was not that there is no church there — there is, and it is the parish
        the registers were kept in. It is not on Wikidata. Central Istria has
        105 churches on Wikidata and England has 34,612, and a fixed radius
        reads that difference as «no parishes here».

        So: the nearest few, out to fifteen kilometres, each carrying how far
        it is. Eight kilometres to Pazin is a useful fact about Gračišće —
        that is where its registers went — and a reader can weigh it. Silence
        cannot be weighed."""
        near = []
        for c in ch_by_region.get(place.get("region") or "", []):
            if abs(c["y"] - place["lat"]) > 0.2 or abs(c["x"] - place["lon"]) > 0.28:
                continue                      # cheap box before the real sum
            d = km(place["lat"], place["lon"], c["y"], c["x"])
            if d <= within:
                near.append({"n": c["n"], "q": c["q"], "km": round(d, 1)})
        near.sort(key=lambda z: z["km"])
        return near[:most]

    def reach(place):
        """How nearly a collection reaches a place.

          0  it is catalogued under this place by name
          1  it is catalogued under this place's COUNTY or province
          2  under its state or region
          3  somewhere else in the same country, narrower than the country
          4  under the country, and no narrower

        RANK 3 USED TO BE FOLDED INTO RANK 2 and that was a real error, caught
        by Aargau. «Switzerland, Bern, Civil Registration» is narrower than
        Switzerland, so it scored a 2 against Aargau — the same score a
        collection actually covering Aargau's own canton would get — and Aargau
        was then coloured for it. Bern is a different canton with a different
        registry. Being narrower than a country is not the same as being about
        this place, and conflating the two let the map borrow a colour from a
        collection that says nothing about the ground under the dot.

        THE MIDDLE TWO USED TO BE DISTANCE, and distance is the wrong tool for
        an administrative question. «Within 75 km» is wrong in both directions:
        two towns forty kilometres apart can sit in different provinces with
        different archives, and a long thin province can run three hundred
        kilometres end to end while being exactly the filing unit that matters.
        Places now carry their real adm1 and adm2 from GeoNames, and a
        collection's own place chain — «Naples, Naples, Campania, Italy» —
        carries the same names, so the rungs are matched rather than guessed.

        Distance survives as the tie-break inside a rank, which is what it is
        actually good for."""
        out = []
        fn = fold(place["name"])
        adm = place.get("admin") or {}
        f1 = fold(adm.get("adm1") or "") or None
        f2 = fold(adm.get("adm2") or "") or None
        for c in fs_by_cc.get(place.get("country"), []):
            rank, where, dist = 4, None, None
            for p in c["places"]:
                d = (km(place["lat"], place["lon"], p["lat"], p["lon"])
                     if p.get("lat") is not None else None)
                if p.get("short") and fold(p["short"]) == fn:
                    rank, where, dist = 0, p["name"], d
                    break
                chain = [fold(x.strip()) for x in (p.get("name") or "").split(",")]
                short = fold(p.get("short") or "")
                if f2 and rank > 1 and (f2 in chain or f2 == short):
                    rank, where, dist = 1, p["name"], d
                elif f1 and rank > 2 and (f1 in chain or f1 == short):
                    rank, where, dist = 2, p["name"], d
                elif p.get("type") and p["type"] != "COUNTRY" and rank > 3:
                    # Narrower than a country but not on this place's own
                    # chain: still worth listing, still not this place.
                    rank, where, dist = 3, p["name"], d
                if dist is None:
                    dist = d
            out.append((rank, dist if dist is not None else 1e9,
                        -(c.get("records") or 0), c, where, dist))
        out.sort(key=lambda x: (x[0], x[1], x[2]))
        return out
    regions = json.load(open("data/regions.json"))
    providers = json.load(open("data/providers.json"))
    paccess = {p["id"]: p["access"] for p in providers["providers"]}

    os.makedirs(OUT, exist_ok=True)
    pdir = os.path.join(OUT, "p")
    shutil.rmtree(pdir, ignore_errors=True)
    os.makedirs(pdir)

    # Loaded before the index is written so a row can say whether its country
    # has one; the file itself is written further down.
    try:
        wa_cc = {r["cc"] for r in json.load(open("data/world-archives.json"))["archives"]}
    except FileNotFoundError:
        wa_cc = set()

    # ---- the volumes themselves, per place --------------------------------
    # The level below «a collection covers this place»: which book, for which
    # years, and the link that opens its images.
    #
    # NO LONGER CROATIA ONLY. The note that used to sit here said FamilySearch
    # will not serve a script, so the Croatian walk done in a browser was all
    # there could ever be. That was true of the catalogue and false of the
    # records API — see scripts/harvest-fs-waypoints.py — and the rest of the
    # world now arrives from there.
    #
    # TWO SOURCES, AND CROATIA'S WINS WHERE THEY OVERLAP. The browser walk
    # carries the microfilm number, which the API does not, and it has been
    # checked by a person. So the richer rows are laid down first and the API
    # only fills what they leave empty, deduped on the waypoint id, which is
    # the book itself.
    #
    # (This comment first claimed the API had no confession either. It does:
    # in Croatia the tree's own first level IS Religion — Civil, Evangelical,
    # Greek Catholic, Jewish, Military, Orthodox, Roman Catholic — so the
    # matcher reads it off the path labels and every country gets it.)
    try:
        fsv = json.load(open("data/fs-volumes.json"))
        vol_by_place = {k: list(v) for k, v in fsv["byPlace"].items()}
    except FileNotFoundError:
        fsv, vol_by_place = None, {}
    # GZIP FIRST, PLAIN SECOND. The matched volumes outgrow what GitHub will
    # take as plain JSON — 13.4 MB at 5% of the harvest, heading for 275 —
    # and this shape compresses about sixteen to one. Both forms are read so
    # an older checkout still builds.
    world = None
    for _wf in ("data/fs-volumes-world.json.gz", "data/fs-volumes-world.json"):
        if os.path.exists(_wf):
            if _wf.endswith(".gz"):
                import gzip as _gz
                with _gz.open(_wf, "rt", encoding="utf-8") as _fh:
                    world = json.load(_fh)
            else:
                world = json.load(open(_wf))
            break
    if world:
        _added = 0
        # DEDUPE ON THE BOOK, NOT ON ITS IDENTIFIER. The two walks number
        # waypoints differently — the browser walk has "9R2S-T3N", the API
        # has "32P4-MNG:1051984701,1051984702" — so comparing those never
        # matched and every Croatian book shipped twice, once per walk. The
        # titles are byte-identical ("Births (Rođeni) 1834-1846"), so the
        # title and its years are what actually identify the book.
        def _bookkey(r):
            _t = re.sub(r"\s+", " ", (r.get("t") or "")).strip().lower()
            return (_t, r.get("from"), r.get("to"))
        for _pid, _rows in world["byPlace"].items():
            _existing = vol_by_place.get(_pid, [])
            _have = {r.get("waypoint") for r in _existing if r.get("waypoint")}
            _have_book = {_bookkey(r) for r in _existing}
            for _r in _rows:
                if _r.get("wp") and _r["wp"] in _have:
                    continue
                if _bookkey(_r) in _have_book:
                    continue
                vol_by_place.setdefault(_pid, []).append({
                    "t": _r["t"], "from": _r.get("from"), "to": _r.get("to"),
                    "url": _r.get("url"), "waypoint": _r.get("wp"),
                    # The panel has always rendered `conf` for Croatia's
                    # books. It turns out the API gives it too — the tree's
                    # own first level in Croatia is Religion — so the rest of
                    # the world can have it on the same line.
                    "conf": _r.get("conf"),
                    # NOT `kinds`. That field holds the Croatian walk's
                    # EVENT vocabulary — Births, Marriages, Deaths — parsed
                    # from titles written in one language. These titles are
                    # in every language FamilySearch catalogues in
                    # ("Bautismos", "Alistamiento militar", "Rodeni"), so
                    # they carry the record-kind reading instead and the
                    # panel groups by whichever a book has.
                    "rk": record_kinds.kinds_of(_r["t"], _r.get("colTitle")),
                    # Where in FamilySearch's own tree this book was found.
                    # A reader who cannot see why a book is on this dot has
                    # no way to tell a good match from a wrong one.
                    "in": _r.get("in"),
                })
                _added += 1
        print(f"volumes         {_added} from the waypoint API, "
              f"on top of {sum(len(v) for v in (fsv or {}).get('byPlace', {}).values())} walked in Croatia")

    wa_by_cc = {}
    try:
        for _r in json.load(open("data/world-archives.json"))["archives"]:
            wa_by_cc.setdefault(_r["cc"], []).append(
                {k: v for k, v in _r.items()
                 if k in ("name", "url", "kind", "status", "lat", "lon")})
        for _k in wa_by_cc:
            wa_by_cc[_k].sort(key=lambda r: (r["kind"] != "national-archive", r["name"]))
    except FileNotFoundError:
        pass

    index, nbytes, details = [], 0, []
    for p in places:
        cs = p.get("collections", [])
        acc = min((c["access"] for c in cs if c.get("access") in RANK),
                  key=RANK.index, default="unsurveyed")

        # Every name this place answers to, folded, so that typing "Gallignana"
        # or "gracisce" or "Gračišće" all land on the same dot.
        variants = [p["name"]] + [n["n"] for n in p.get("names", [])]
        q = " ".join(sorted({fold(v) for v in variants}))

        # The span the place can answer for. This has to ride in the INDEX,
        # not only in the detail file: the year control filters markers before
        # anything has been clicked, and a filter that had to fetch 1,239 files
        # to decide what to draw would not be a filter.
        yrs = [(c.get("from"), c.get("to")) for c in cs if c.get("from")]
        span = [min(a for a, _ in yrs), max((b or a) for a, b in yrs)] if yrs else None

        hits = reach(p) if p.get("country") else []
        near_ch = parishes(p) if p.get("region") else []

        # A DIVISION IS NOT UNSURVEYED BECAUSE NOBODY WALKED IT. 1,978 of the
        # places on this shelf are administrative divisions, and none of them
        # carries a walked volume, because nobody has walked the world district
        # by district and nobody is going to. Left alone they all came out the
        # grey of «nobody has walked this one yet», which would have been the
        # map's largest single untruth: 1,920 of them are named, by name or by
        # the division above them, in a collection that exists and can be
        # opened today.
        #
        # So when a place has walked nothing, the colour falls back to the best
        # access among the collections that REACH it — but only from rank 2 up.
        # Rank 3 is «somewhere else in this country» and rank 4 is «the country
        # has a collection», and neither says anything about the ground under
        # this dot; those stay grey, and grey is the honest answer for them.
        by_reach = None
        if not cs:
            near = [c for rank, _, _, c, _, _ in hits if rank <= 2]  # on this place's own chain
            if near:
                acc = min((c.get("access") or "account" for c in near),
                          key=lambda a: RANK.index(a) if a in RANK else 99)
                by_reach = len(near)

        # EVERY BYTE HERE IS FETCHED BY EVERY VISITOR, so the index carries
        # only what the map cannot work out for itself.
        #
        #   `r` and `k` — region and country — were in every row and read by
        #   nothing. 22 KB of dead weight on first paint.
        #
        #   `q` held every folded name form INCLUDING the place's own, which
        #   the client can fold from `n` in a microsecond. It now carries only
        #   the forms that are not derivable — the former names, which are the
        #   whole reason it exists.
        extra = sorted(f for f in q.split(" ") if f and f != fold(p["name"]))
        row = {"i": p["id"], "n": p["name"], "y": p["lat"], "x": p["lon"],
               "c": len(cs)}
        # THE KINDS PRESENT HERE, AS A BITMASK. One small integer per place,
        # rather than a list of words on 7,391 rows — the index has an 800 KB
        # budget and a filter has to work on first paint, before any per-place
        # detail has been fetched. KIND_BIT is written into the index header
        # so the client reads the mapping rather than hard-coding it, which is
        # the mistake the shard keys made.
        kb = 0
        for _c in cs:
            for _k in (_c.get("rkinds") or record_kinds.kinds_of(_c.get("title", ""))):
                kb |= KIND_BIT[_k]
        if kb:
            row["k"] = kb
        # DOES THIS PLACE'S COUNTRY HAVE A NAMED NATIONAL SOURCE? A hollow grey
        # dot reading «nobody has walked this one yet» is true of almost every
        # place in Africa and it is not the whole truth: 32 African countries
        # have a national archive listed one click away in the panel, and the
        # marker had no way to know. David looked at a continent of grey and
        # reasonably concluded there was nothing there.
        if wa_cc and p.get("country") in wa_cc:
            row["w"] = 1
        if by_reach:
            # The colour is borrowed, and the map has to say so or it is
            # claiming a walk that never happened.
            row["b"] = by_reach
        if extra:
            row["q"] = " ".join(extra)
        if acc:
            # THE ACCESS CLASS AS AN INDEX, NOT A WORD. «unsurveyed» is ten
            # bytes and it was written out 7,391 times — 116 KB of the 822 KB
            # index was eight repeated strings. RANK already rides in the same
            # file and the client already has it, so the word is recoverable
            # for nothing.
            row["a"] = RANK.index(acc)
        if span:
            row["s"] = span
        if hits:
            row["f"] = len(hits)
        index.append(row)

        detail = dict(p)
        # Volume-level detail rides in the per-place file, never the index:
        # 4,903 volumes would be a megabyte on every first paint to answer a
        # question nobody has asked until they click.
        # The volumes ride in the DETAIL file only. A count in the index was
        # the obvious next thought and nothing read it — which is exactly how
        # `r` and `k` came to sit in 7,391 rows costing 22 KB of first paint to
        # answer nobody. A field the map does not use is not a small cost, it
        # is a pure one.
        _v = vol_by_place.get(p["id"])
        if _v:
            detail["volumes"] = _v
        if span:
            detail["span"] = span
        if near_ch:
            detail["parishes"] = near_ch
        if hits:
            detail["fs"] = [{"cc": c["cc"], "t": c["title"], "from": c.get("from"),
                             "to": c.get("to"), "n": c.get("records") or 0,
                             "img": c.get("images") or 0, "url": c["url"],
                             "rank": rank, "where": where, "k": c.get("rkinds") or [],
                             # WHOSE SHELF IT IS FILED ON, when that is not
                             # this place's country. An 1863 baptism from an
                             # Istrian village is in a Croatian archive and a
                             # 1915 one is filed under «Italy, Pola and
                             # Trieste» — and somebody searching Croatia will
                             # never think to look. Saying it on the row is
                             # the entire thesis of this map.
                             "filed": ([x for x in (c.get("filedUnder") or [])
                                        if x != p.get("country")] or None),
                             "km": round(dist) if dist is not None else None}
                            for rank, _, _, c, where, dist in hits[:60]]
            detail["nfs"] = len(hits)
        details.append(detail)
        blob = json.dumps(detail, ensure_ascii=False, separators=(",", ":"))
        nbytes += len(blob.encode())
        open(os.path.join(pdir, p["id"] + ".json"), "w").write(blob)

    # Country names, for the find box. A visitor who types "Ireland" is asking a
    # real question, and answering it with an empty map is a lie by omission:
    # there are no PLACES in the Irish shelf yet, but there are providers that
    # cover Ireland and archives standing in Dublin. Only the countries this
    # map actually mentions are emitted.
    # EVERY country, not only the ones the shelf reaches. The gazetteer answers
    # for the whole world, and a hit that reads "Kaliningrad — RU" has stopped
    # short of the answer. 245 names is five kilobytes.
    names = json.load(open("data/countries.json"))["countries"]
    cmap = {iso: v["name"] for iso, v in sorted(names.items())}

    idx = {"countries": cmap,
           "note": "One row per place. i=id n=name y=lat x=lon a=access c=collections "
                   "k=bitmask of record kinds present, read against `kinds`. "
                   "a is an index into `rank`, not a word. w=1 when the "
                   "country has a named national archive or library. "
                   "q=folded name variants s=[first year, last year] b=colour borrowed "
                   "from this many collections that reach the place rather than "
                   "from volumes walked in it. "
                   "Detail is fetched per place from p/<id>.json when a marker is clicked.",
           "access": providers["access"],
           "rank": RANK,
           "kinds": KIND_BIT,
           "kindLabels": record_kinds.LABEL,
           "places": index}
    json.dump(idx, open(os.path.join(OUT, "index.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    json.dump(regions, open(os.path.join(OUT, "regions.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    json.dump(providers, open(os.path.join(OUT, "providers.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    # Wikidata's archives, served separately and drawn differently, because
    # 4,929 unchecked rows beside 178 checked ones would make the checked ones
    # mean nothing.
    try:
        wda = json.load(open("data/archives-wikidata.json"))
    except FileNotFoundError:
        wda = {"archives": []}
    json.dump(wda, open(os.path.join(OUT, "archives-wikidata.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    # OpenStreetMap's, in their own file because ODbL is share-alike and
    # everything else here is CC0.
    try:
        osm = json.load(open("data/archives-osm.json"))
    except FileNotFoundError:
        osm = {"archives": []}
    json.dump(osm, open(os.path.join(OUT, "archives-osm.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    # Region-scoped Wikidata features — cemeteries, churches, libraries. Each
    # is its own file and its own toggle, because they answer different
    # questions and a reader should be able to ask one at a time.
    feats = {}
    for name in ("cemeteries", "churches", "libraries"):
        for suffix in ("wikidata", "osm"):
            try:
                v = json.load(open(f"data/{name}-{suffix}.json"))
            except FileNotFoundError:
                continue
            json.dump(v, open(os.path.join(OUT, f"{name}-{suffix}.json"), "w"),
                      ensure_ascii=False, separators=(",", ":"))
            feats[f"{name}-{suffix}"] = v

    # One file the PAGE TEMPLATES read at build time, holding every place in
    # full. It lands in src/, not public/, because it must never be served: the
    # browser fetches p/<id>.json one place at a time and has no use for two
    # and a half megabytes of the other 1,238.
    #
    # This exists because the map was invisible. Every place lived only inside
    # a JSON file that JavaScript fetched, so a crawler — and a reader with no
    # JavaScript, and anyone who wanted to LINK to a place — saw six pages
    # where there are more than a thousand things to say.
    src = os.path.join("site", "src", "data")
    os.makedirs(src, exist_ok=True)
    json.dump({"places": details}, open(os.path.join(src, "places-full.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    json.dump({"collections": FS}, open(os.path.join(src, "collections-full.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))

    # THE CONTRIBUTED DIRECTORY. David's own CSV of named collections at named
    # repositories — 1,399 rows, of which 969 survived having their links
    # tried. It is kept apart from everything else in this file and labelled
    # as contributed wherever it appears, because its descriptions are his
    # rather than an archive's and nobody has opened the volumes behind them.
    # Optional: the atlas builds perfectly well without it.
    try:
        directory = json.load(open("data/directory.json"))
    except FileNotFoundError:
        directory = {"rows": [], "checked": None, "counts": {}}
    json.dump(directory, open(os.path.join(src, "directory.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    print(f"directory       {len(directory['rows'])} contributed rows "
          f"in {len({c for r in directory['rows'] for c in r['countries']})} countries")

    # ---- the gazetteer, sharded on three letters -------------------------
    # 48,906 places and 212,101 former names will not ride in the index that
    # draws the map, and must not: this is a search corpus, touched only when
    # somebody types something the shelf cannot answer.
    #
    # TWO LETTERS WAS THE OBVIOUS SHARD AND IT WAS WRONG — 44 MB in 824 files,
    # the biggest of them 1.4 MB, which is not a search-as-you-type, it is a
    # download. Three letters, and a place stored ONCE per shard rather than
    # once per name form, is the same corpus in a fraction of the bytes.
    #
    # A place lands in every shard one of its names begins in: Bratislava is in
    # `bra`, `pre`, `poz` and `pos`, which is precisely the point — somebody
    # holding a document that says Pressburg types P-R-E.
    gz = os.path.join(OUT, "g")
    shutil.rmtree(gz, ignore_errors=True)
    os.makedirs(gz)
    try:
        gaz = json.load(open("data/gazetteer.json"))["places"]
    except FileNotFoundError:
        gaz = []
    shards = {}
    for r in gaz:
        # TWO LISTS, BECAUSE THEY ARE TWO DIFFERENT JOBS, and conflating them
        # caused this bug twice running. `a` is what a reader SEES: a curated
        # dozen, de-duplicated so that six spellings of Breslavia do not crowd
        # out Boroszlo. `q` is what the search MATCHES: every form GeoNames
        # knows, all seventy-five of Wrocław's, folded.
        #
        # Curating the match list is what lost Breslau and Pressburg — the
        # cluster representative is the shortest form, which is usually right
        # for display and catastrophic for matching, because "Breslu" is not
        # the word on anybody's certificate and "Breslau" is.
        rec = [r["n"], r["y"], r["x"], r["k"], r["a"], r["q"]]
        keys = set()
        for form in r["q"].split(" "):
            key = shard_key(form)
            if key:
                keys.add(key)
        for key in keys:
            shards.setdefault(key, []).append(rec)
    gbytes = 0
    for key, rows in shards.items():
        blob = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        gbytes += len(blob.encode())
        open(os.path.join(gz, key + ".json"), "w").write(blob)

    # ---- settlements inside a region: findable, never drawn ---------------
    rs = os.path.join(OUT, "rs")
    shutil.rmtree(rs, ignore_errors=True)
    os.makedirs(rs)
    try:
        sett = json.load(open("data/region-settlements.json"))["settlements"]
    except FileNotFoundError:
        sett = []
    rshards, rsbytes = {}, 0
    for r in sett:
        rec = {"n": r["n"], "y": r["y"], "x": r["x"], "k": r["k"], "r": r["r"]}
        for form in set(r["q"].split(" ")):
            k = shard_key(form)
            if k:
                rshards.setdefault(k, []).append(rec)
    for k, rows in rshards.items():
        seen, uniq = set(), []
        for r in rows:
            key = (r["n"], r["y"])
            if key not in seen:
                seen.add(key)
                uniq.append(r)
        blob = json.dumps(uniq, ensure_ascii=False, separators=(",", ":"))
        rsbytes += len(blob.encode())
        open(os.path.join(rs, k + ".json"), "w").write(blob)

    # ---- ONE MARKER PER COUNTRY, so nowhere answers with nothing ----------
    # «At least a marker on a country even if no volume is available» — and the
    # reason it matters is Libya. Libya has a FamilySearch research guide, a
    # GenWeb project and a DNA group, and this map showed empty ground, because
    # a marker here has always meant «a place with volumes» and Libya has none.
    #
    # A country is a place too. It carries the coarsest possible answer — whose
    # national archive, which research guide, what this atlas holds for it —
    # and the coarsest answer is enormously better than a blank.
    #
    # FAMILYSEARCH'S COUNTRY GUIDE IS A TEMPLATE, NOT A HARVEST.
    # familysearch.org/en/wiki/<Country>_Genealogy exists for every country;
    # verified in a browser because the URL soft-404s to a JavaScript shell and
    # its API is behind a bot gate. Libya returns 2,846 characters of guide,
    # «Nonesuchland» returns 568 and «there is currently no text in this page».
    # The template is only used where this map holds a name FamilySearch would
    # recognise — an abbreviation like «Dem. Rep. Congo» gets no link rather
    # than a dead one.
    FS_WIKI = {
        "Dem. Rep. Congo": "Democratic Republic of the Congo",
        "Central African Rep.": "Central African Republic",
        "Eq. Guinea": "Equatorial Guinea", "S. Sudan": "South Sudan",
        "W. Sahara": "Western Sahara", "Bosnia and Herz.": "Bosnia and Herzegovina",
        "Czechia": "Czech Republic", "Dominican Rep.": "Dominican Republic",
        "Solomon Is.": "Solomon Islands", "Falkland Is.": "Falkland Islands",
        "Fr. Polynesia": "French Polynesia", "N. Cyprus": "Cyprus",
        "Macedonia": "North Macedonia", "Côte d'Ivoire": "Ivory Coast",
        "Cabo Verde": "Cape Verde", "eSwatini": "Eswatini",
        "Timor-Leste": "East Timor", "Myanmar": "Myanmar",
        "St. Vin. and Gren.": "Saint Vincent and the Grenadines",
        "Antigua and Barb.": "Antigua and Barbuda",
        "Trinidad and Tobago": "Trinidad and Tobago",
        "São Tomé and Principe": "Sao Tome and Principe",
        "Turks and Caicos Is.": "Turks and Caicos Islands",
        "Br. Indian Ocean Ter.": None, "Fr. S. Antarctic Lands": None,
        "Antarctica": None, "Heard I. and McDonald Is.": None,
        "S. Geo. and the Is.": None, "Indian Ocean Ter.": None,
        "Ashmore and Cartier Is.": None, "Siachen Glacier": None,
        "Bajo Nuevo Bank": None, "Serranilla Bank": None,
        "Scarborough Reef": None, "Spratly Is.": None,
        "Coral Sea Is.": None, "Clipperton I.": None,
        "Cyprus U.N. Buffer Zone": None, "Dhekelia": None, "Baikonur": None,
        "Akrotiri": None, "Brazilian I.": None, "USNB Guantanamo Bay": None,
    }
    cpts, placed, colled = [], collections.Counter(), collections.Counter()
    for _p in places:
        if _p.get("country"):
            placed[_p["country"]] += 1
            colled[_p["country"]] += len(_p.get("collections") or [])
    cols_by_cc = collections.Counter()
    for _c in json.load(open("data/collections.json"))["collections"]:
        for _k in _c.get("countries", []):
            cols_by_cc[_k] += 1
    prov_by_cc = collections.Counter()
    for _pv in providers["providers"]:
        for _k in _pv.get("countries", []):
            if _k != "*":
                prov_by_cc[_k] += 1
    for iso, v in json.load(open("data/countries.json"))["countries"].items():
        rings = v.get("rings") or []
        if not rings:
            continue
        big = max(rings, key=len)
        lat = sum(q[1] for q in big) / len(big)
        lon = sum(q[0] for q in big) / len(big)
        name = v["name"]
        wiki = FS_WIKI.get(name, name)
        rec = {"cc": iso, "n": name, "y": round(lat, 4), "x": round(lon, 4),
               "p": placed.get(iso, 0), "v": colled.get(iso, 0),
               "c": cols_by_cc.get(iso, 0), "s": prov_by_cc.get(iso, 0),
               "w": len(wa_by_cc.get(iso, []))}
        if wiki and "." not in wiki:
            rec["fs"] = wiki.replace(" ", "_")
        cpts.append(rec)
    json.dump({"note": ("One point per country, so that clicking anywhere answers "
                        "with something. p=places drawn v=volumes walked "
                        "c=collections covering it s=curated sources w=national "
                        "archives fs=FamilySearch research-guide slug."),
               "countries": sorted(cpts, key=lambda r: r["n"])},
              open(os.path.join(OUT, "country-points.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))

    # ---- a national source for every country there is one for -------------
    # 38 countries had a named national source and 199 had nothing but the
    # worldwide services, which cover everywhere and therefore say nothing
    # about anywhere. These are Wikidata's national archives and national
    # libraries: 393 institutions across 164 countries, each with a website
    # that answered when it was asked.
    #
    # THEY ARE KEPT SEPARATE FROM THE 195 CURATED PROVIDERS ON PURPOSE. Those
    # have been looked at; these have had their door rattled once. Mixing them
    # would quietly downgrade the ones somebody checked.
    try:
        wa = json.load(open("data/world-archives.json"))
        by_cc = wa_by_cc
        for r in wa["archives"]:
            by_cc.setdefault(r["cc"], []).append(
                {k: v for k, v in r.items()
                 if k in ("name", "url", "kind", "status", "lat", "lon")})
        json.dump({"note": wa["note"], "source": wa["source"],
                   "licence": wa["licence"], "harvested": wa["harvested"],
                   "byCountry": by_cc},
                  open(os.path.join(OUT, "world-archives.json"), "w"),
                  ensure_ascii=False, separators=(",", ":"))
        n_wa, n_wacc = len(wa["archives"]), len(by_cc)
    except FileNotFoundError:
        n_wa = n_wacc = 0

    # ---- Estonia's kihelkonnad: findable, and never drawn -----------------
    # 113 parishes and 11 historic counties, from the National Archives' own
    # search vocabulary. They carry NO COORDINATES because the archive
    # publishes none and inventing them would be worse than a flat list, so
    # they are pure name-resolution: type «Apukalna» and be told it is a
    # parish of Valmiera, which is a county of Livonia and is in LATVIA today.
    # That last part is the whole value — the governorate boundary did not
    # follow the modern one, and a researcher who assumes it did looks in the
    # wrong national archive.
    ee = os.path.join(OUT, "ee")
    shutil.rmtree(ee, ignore_errors=True)
    os.makedirs(ee)
    try:
        est = json.load(open("data/estonia-parishes.json"))
    except FileNotFoundError:
        est = {"parishes": [], "counties": []}
    eshards, ebytes = {}, 0
    for n in est["parishes"]:
        rec = {"n": n, "k": "parish"}
        k = shard_key(fold(n))
        if k:
            eshards.setdefault(k, []).append(rec)
    for n in est["counties"]:
        rec = {"n": n, "k": "county"}
        k = shard_key(fold(n))
        if k:
            eshards.setdefault(k, []).append(rec)
    for k, rowlist in eshards.items():
        blob = json.dumps(rowlist, ensure_ascii=False, separators=(",", ":"))
        ebytes += len(blob.encode())
        open(os.path.join(ee, k + ".json"), "w").write(blob)

    # ---- Italy's comuni: findable, and never drawn ------------------------
    # 7,894 of them. NOT DRAWN, for two reasons that point the same way. The
    # index is at 741 KB of an 800 KB budget and these would burst it; and the
    # province is already on the map, which is the rung Antenati files by, so
    # a dot per comune would be seven thousand markers restating what the
    # province dot already says.
    #
    # What they are worth is the NAME. Istat records the official other
    # language a comune answers to — Bolzano is Bozen, Sterzing is Vipiteno,
    # and a strip around Trieste and Gorizia is Slovene — which is this atlas's
    # founding problem happening inside a country nobody thinks of as having
    # changed. And the historic province code, because an archive is filed
    # under the province of its day rather than the province of now.
    cd = os.path.join(OUT, "it")
    shutil.rmtree(cd, ignore_errors=True)
    os.makedirs(cd)
    try:
        ital = json.load(open("data/italy-comuni.json"))["comuni"]
    except FileNotFoundError:
        ital = []
    ishards, ibytes = {}, 0
    for c in ital:
        rec = {"n": c["n"], "p": c.get("prov", ""), "r": c.get("reg", "")}
        if c.get("a"):
            rec["a"] = c["a"]
        forms = {fold(c["n"])} | {fold(x) for x in c.get("a", [])}
        for form in forms:
            k = shard_key(form)
            if k:
                ishards.setdefault(k, []).append(rec)
    for k, rowlist in ishards.items():
        blob = json.dumps(rowlist, ensure_ascii=False, separators=(",", ":"))
        ibytes += len(blob.encode())
        open(os.path.join(cd, k + ".json"), "w").write(blob)

    # ---- Ireland's townlands: findable, and never drawn -------------------
    # 60,883 of them, which is why they are not drawn — they would outnumber
    # every other dot on this map by ten to one and turn Ireland into a solid
    # block. But a townland is the unit an Irish family record actually names,
    # so being unable to answer one would be a hole exactly where this atlas
    # claims to be useful.
    #
    # The county and the civil parish ride with every row and they are the
    # point, not decoration: «Glebe» is the name of 213 different townlands and
    # «Newtown» of 157. A townland is not an address until you know which one.
    td = os.path.join(OUT, "t")
    shutil.rmtree(td, ignore_errors=True)
    os.makedirs(td)
    try:
        irl = json.load(open("data/ireland-osm.json"))
    except FileNotFoundError:
        irl = {"townlands": []}
    tshards, tbytes = {}, 0
    for t in irl["townlands"]:
        rec = {"n": t["n"], "y": t["y"], "x": t["x"]}
        for k in ("co", "cp", "bar"):
            if t.get(k):
                rec[k] = t[k]
        forms = {fold(t["n"])} | {fold(x) for x in t.get("a", [])}
        for form in forms:
            k = shard_key(form)
            if k:
                tshards.setdefault(k, []).append(rec)
    for k, rowlist in tshards.items():
        blob = json.dumps(rowlist, ensure_ascii=False, separators=(",", ":"))
        tbytes += len(blob.encode())
        open(os.path.join(td, k + ".json"), "w").write(blob)

    # ---- one outline per country, fetched when a name needs it -------------
    # A SURNAME SEARCH HAD NOTHING TO DRAW. «Lerena» would find the name,
    # report it attested in Argentina, Spain, Uruguay and the United States,
    # and leave the map showing wherever it happened to be — which, because of
    # a second bug, was a village in Nigeria. The one thing a map can do that a
    # list cannot is SHOW you the four countries at once, and it could not,
    # because it had no country geometry on the client at all.
    #
    # data/countries.json is 1.6 MB of Natural Earth rings and must not ride in
    # the index. Split one file per country: a search touches two to six of
    # them and fetches exactly those.
    cdir = os.path.join(OUT, "c")
    shutil.rmtree(cdir, ignore_errors=True)
    os.makedirs(cdir)
    cbytes, cn = 0, 0
    for iso, v in json.load(open("data/countries.json"))["countries"].items():
        rings = v.get("rings") or []
        if not rings:
            continue
        # Coarse enough to read at world zoom and small enough to fetch: every
        # third point, and a ring that survives to fewer than four is a rock.
        thin = []
        for ring in rings:
            r = [[round(p[0], 2), round(p[1], 2)] for p in ring[::3]]
            if len(r) >= 4:
                thin.append(r)
        if not thin:
            continue
        lons = [p[0] for r in thin for p in r]
        lats = [p[1] for r in thin for p in r]
        blob = json.dumps({"n": v["name"], "rings": thin,
                           "box": [round(min(lats), 3), round(min(lons), 3),
                                   round(max(lats), 3), round(max(lons), 3)]},
                          ensure_ascii=False, separators=(",", ":"))
        cbytes += len(blob.encode())
        cn += 1
        open(os.path.join(cdir, iso.lower() + ".json"), "w").write(blob)

    # ---- districts nobody drew: findable, never drawn ---------------------
    # 17,320 second-level divisions no collection names. Undrawn for the reason
    # in promote-admin-divisions.py — one collection filed under a state would
    # otherwise stamp an identical dot on every district inside it — but a
    # reader holding «Kreis Bomst» or «partido de Chascomús» still gets told
    # what it is, which country now holds it, and which first-level division it
    # sits in, and that last one is the rung a collection is actually filed at.
    ad = os.path.join(OUT, "a")
    shutil.rmtree(ad, ignore_errors=True)
    os.makedirs(ad)
    try:
        undrawn = json.load(open("data/admin-undrawn.json"))["divisions"]
    except FileNotFoundError:
        undrawn = []
    ashards, abytes = {}, 0
    for d in undrawn:
        rec = {"n": d["name"], "y": d["lat"], "x": d["lon"], "k": d["cc"]}
        if d.get("adm1"):
            rec["p"] = d["adm1"]
        forms = {fold(d["name"])}
        if d.get("adm1"):
            forms.add(fold(d["adm1"]))
        for form in forms:
            for word in form.split():
                k = shard_key(word)
                if k:
                    ashards.setdefault(k, []).append(rec)
    for k, rows in ashards.items():
        seen, uniq = set(), []
        for r in rows:
            key = (r["n"], r["k"])
            if key not in seen:
                seen.add(key)
                uniq.append(r)
        blob = json.dumps(uniq, ensure_ascii=False, separators=(",", ":"))
        abytes += len(blob.encode())
        open(os.path.join(ad, k + ".json"), "w").write(blob)

    # ---- surnames, sharded like the gazetteer -----------------------------
    # Same trick and the same reason: a search corpus is fetched three letters
    # at a time and never rides in the index that draws the map.
    sn = os.path.join(OUT, "s")
    shutil.rmtree(sn, ignore_errors=True)
    os.makedirs(sn)
    try:
        surn = json.load(open("data/surnames.json"))
    except FileNotFoundError:
        # A shape the pages can still render. The old fallback had no `counts`,
        # so a missing file did not fail here — it failed four steps later in
        # surnames.astro with «cannot read properties of undefined», on CI
        # only, because locally the file was always sitting there.
        surn = {"surnames": [], "counts": {"surnames": 0, "withVariants": 0,
                                           "withCountries": 0, "curatedLinks": 0,
                                           "withRegisterCount": 0},
                "sources": [], "attestedBy": {}, "licence": "CC0-1.0"}
    sshards, sbytes = {}, 0
    for r in surn["surnames"]:
        keys = {r["q"]}
        keys.update(fold(v["n"]) for v in r["variants"])
        for form in keys:
            k = shard_key(form)
            if k:
                sshards.setdefault(k, []).append(r)
    for k, rows in sshards.items():
        seen, uniq = set(), []
        for r in rows:
            if r["q"] in seen:
                continue
            seen.add(r["q"])
            # `skel` and `q` are build-time working and the client folds names
            # itself, so shipping them is 440,000 copies of something already
            # known. The full record stays in surnames.json for anyone who
            # wants it; this is a search corpus, not the dataset.
            uniq.append({kk: vv for kk, vv in r.items() if kk not in ("skel", "q")})
        blob = json.dumps(uniq, ensure_ascii=False, separators=(",", ":"))
        sbytes += len(blob.encode())
        open(os.path.join(sn, k + ".json"), "w").write(blob)

    # The dataset as a thing you can take away, not only as something the map
    # uses: one JSON and one CSV at a stable address, CC0, so another project
    # can consume it without reading any of this code.
    json.dump(surn, open(os.path.join(OUT, "surnames.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    import csv
    with open(os.path.join(OUT, "surnames.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["surname", "variant", "variant_source", "country", "country_source",
                    "attested_by", "phonetic_skeleton"])
        for r in surn["surnames"]:
            ccs = r["countries"] or [{"cc": "", "how": "", "by": []}]
            vars_ = r["variants"] or [{"n": "", "how": ""}]
            for v in vars_:
                for c in ccs:
                    w.writerow([r["n"], v["n"], v["how"], c["cc"], c["how"],
                                "; ".join(c.get("by", [])), r["skel"]])

    sz = lambda f: os.path.getsize(os.path.join(OUT, f))
    print(f"index.json      {sz('index.json')/1024:8.1f} KB  {len(index)} places")
    print(f"p/*.json        {nbytes/1024:8.1f} KB  {len(index)} files, "
          f"{nbytes/max(len(index),1):.0f} B each on average")
    print(f"regions.json    {sz('regions.json')/1024:8.1f} KB")
    print(f"providers.json  {sz('providers.json')/1024:8.1f} KB")
    print(f"places-full     {os.path.getsize(os.path.join(src,'places-full.json'))/1024:8.1f} KB"
          f"  build-time only, never served")
    if FS:
        print(f"collections     {len(FS)} FamilySearch collections attached")
    if wda["archives"]:
        print(f"wikidata-arch   {len(wda['archives'])} archives, unchecked, drawn apart")
    if osm["archives"]:
        print(f"osm-archives    {len(osm['archives'])} archives, ODbL, kept separate")
    for name, v in feats.items():
        print(f"{name:15} {len(v['features'])} in the record regions")
    if surn["surnames"]:
        print(f"surnames.json   {sz('surnames.json')/1024:8.1f} KB  "
              f"surnames.csv {sz('surnames.csv')/1024:.0f} KB — the shareable dataset")
    if vol_by_place:
        print(f"fs-volumes        {sum(len(v) for v in vol_by_place.values())} volumes "
              f"across {len(vol_by_place)} places — the book, the years, the link")
    if n_wa:
        print(f"world-archives    {sz('world-archives.json')/1024:8.1f} KB  {n_wa} "
              f"national archives and libraries across {n_wacc} countries — "
              f"unverified, from Wikidata")
    if eshards:
        print(f"ee/*.json       {ebytes/1024:8.1f} KB  {len(eshards)} shards, "
              f"{len(est['parishes'])} Estonian parishes and "
              f"{len(est['counties'])} historic counties — names only")
    if ishards:
        print(f"it/*.json       {ibytes/1024:8.1f} KB  {len(ishards)} shards, "
              f"{len(ital)} Italian comuni, "
              f"{sum(1 for c in ital if c.get('a'))} with an official other name")
    if tshards:
        print(f"t/*.json        {tbytes/1024:8.1f} KB  {len(tshards)} shards, "
              f"{len(irl['townlands'])} Irish townlands — findable, not drawn")
    if cn:
        print(f"c/*.json        {cbytes/1024:8.1f} KB  {cn} country outlines, "
              f"fetched only when a surname names one")
    if ashards:
        print(f"a/*.json        {abytes/1024:8.1f} KB  {len(ashards)} shards, "
              f"{len(undrawn)} districts no collection names — findable, not drawn")
    if rshards:
        print(f"rs/*.json       {rsbytes/1024:8.1f} KB  {len(rshards)} shards, "
              f"{len(sett)} settlements in regions — findable, not drawn")
    if sshards:
        print(f"s/*.json        {sbytes/1024:8.1f} KB  {len(sshards)} shards, "
              f"{len(surn['surnames'])} surnames")
    if shards:
        sizes = sorted((len(json.dumps(v, ensure_ascii=False).encode()), k)
                       for k, v in shards.items())
        big = sizes[-1]
        p95 = sizes[int(len(sizes) * 0.95)][0]
        print(f"g/*.json        {gbytes/1024/1024:8.1f} MB  {len(shards)} shards; "
              f"biggest '{big[1]}' {big[0]/1024:.0f} KB, 95th pct {p95/1024:.0f} KB, "
              f"median {sizes[len(sizes)//2][0]/1024:.1f} KB")


if __name__ == "__main__":
    main()

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
import json, os, re, shutil, sys, unicodedata

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


def main():
    places = json.load(open("data/places.json"))["places"]

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
        if span:
            detail["span"] = span
        if near_ch:
            detail["parishes"] = near_ch
        if hits:
            detail["fs"] = [{"cc": c["cc"], "t": c["title"], "from": c.get("from"),
                             "to": c.get("to"), "n": c.get("records") or 0,
                             "img": c.get("images") or 0, "url": c["url"],
                             "rank": rank, "where": where,
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
                   "a is an index into `rank`, not a word. "
                   "q=folded name variants s=[first year, last year] b=colour borrowed "
                   "from this many collections that reach the place rather than "
                   "from volumes walked in it. "
                   "Detail is fetched per place from p/<id>.json when a marker is clicked.",
           "access": providers["access"],
           "rank": RANK,
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
            key = "".join(c for c in form[:3] if c.isalnum())
            if len(key) == 3:
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
            k = "".join(c for c in form[:3] if c.isalnum())
            if len(k) == 3:
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
        k = "".join(c for c in fold(n)[:3] if c.isalnum())
        if len(k) == 3:
            eshards.setdefault(k, []).append(rec)
    for n in est["counties"]:
        rec = {"n": n, "k": "county"}
        k = "".join(c for c in fold(n)[:3] if c.isalnum())
        if len(k) == 3:
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
            k = "".join(ch for ch in form[:3] if ch.isalnum())
            if len(k) == 3:
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
            k = "".join(c for c in form[:3] if c.isalnum())
            if len(k) == 3:
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
                k = "".join(c for c in word[:3] if c.isalnum())
                if len(k) == 3:
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
            k = "".join(c for c in form[:3] if c.isalnum())
            if len(k) == 3:
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

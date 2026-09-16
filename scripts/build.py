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
import json, os, re, shutil, unicodedata

import os as _os
_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
_os.chdir(_ROOT)

OUT = "site/public"

# Most-open-wins. A place with one free volume and fifty on paper is a place
# where you CAN see something tonight, and the panel tells the rest of the
# truth. The opposite rule would paint the map the colour of its worst news.
RANK = ["free", "account", "index", "mixed", "paid", "catalogue", "onsite"]

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
    regions = json.load(open("data/regions.json"))
    providers = json.load(open("data/providers.json"))
    paccess = {p["id"]: p["access"] for p in providers["providers"]}

    os.makedirs(OUT, exist_ok=True)
    pdir = os.path.join(OUT, "p")
    shutil.rmtree(pdir, ignore_errors=True)
    os.makedirs(pdir)

    index, nbytes = [], 0
    for p in places:
        cs = p.get("collections", [])
        acc = min((c["access"] for c in cs if c.get("access") in RANK),
                  key=RANK.index, default=None)

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

        row = {"i": p["id"], "n": p["name"], "y": p["lat"], "x": p["lon"],
               "c": len(cs), "q": q}
        if acc:
            row["a"] = acc
        if span:
            row["s"] = span
        if p.get("region"):
            row["r"] = p["region"]
        if p.get("country"):
            row["k"] = p["country"]
        index.append(row)

        detail = dict(p)
        if span:
            detail["span"] = span
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
                   "q=folded name variants s=[first year, last year] r=region k=country. "
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
    json.dump({"places": places}, open(os.path.join(src, "places-full.json"), "w"),
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

    sz = lambda f: os.path.getsize(os.path.join(OUT, f))
    print(f"index.json      {sz('index.json')/1024:8.1f} KB  {len(index)} places")
    print(f"p/*.json        {nbytes/1024:8.1f} KB  {len(index)} files, "
          f"{nbytes/max(len(index),1):.0f} B each on average")
    print(f"regions.json    {sz('regions.json')/1024:8.1f} KB")
    print(f"providers.json  {sz('providers.json')/1024:8.1f} KB")
    print(f"places-full     {os.path.getsize(os.path.join(src,'places-full.json'))/1024:8.1f} KB"
          f"  build-time only, never served")
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

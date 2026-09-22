#!/usr/bin/env python3
"""Belgian surnames, per municipality, from Statbel.

THE FOURTH TIME THE SAME MISTAKE WAS CAUGHT, AND THE BEST DATA SO FAR.

data/frequencies/_refused.json said of Belgium: «first names only». It
had been rechecked that same morning, and the recheck was written up
confidently: the population open-data CATEGORY had been read directly,
in all three languages, and contained no surname dataset. True, and
useless, because Statbel does not put its surname data in that category.
It puts it on the family-names theme page, where there are ten files.

Croatia, Denmark, Sweden and now Belgium: four entries that searched a
machine-readable index exhaustively and concluded about an institution.
Every one was found by a reader opening the organisation's website.

AND THIS ONE IS BY MUNICIPALITY, which nothing else here is.

Every other register in data/frequencies/ answers «how many people in
this COUNTRY carry this name». Belgium answers it for each of 565
communes — 510,811 rows of CD_REFNIS | commune | surname | frequency.
That is surname-to-place-to-count, which is the shape this whole atlas
is built on and the thing it could not previously do for names: not «the
Peeters are Belgian» but «there are 101 Peeters in Aartselaar».

So this writes two files. data/frequencies/be.json is the national
aggregate, in the shape every other register uses, because that is what
build-surnames.py reads. data/belgium-by-municipality.json keeps the
grain, for the map to use when there is somewhere to put it.

Statbel's open data are CC BY 4.0.
"""
import collections, io, json, os, re, time, urllib.parse
import urllib.request, zipfile

ZIP = ("https://statbel.fgov.be/sites/default/files/files/opendata/"
       "Familienamen/TA_POP_LST_2026.zip")
PAGE = ("https://statbel.fgov.be/en/themes/population/"
        "family-names-and-first-names/family-names")
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources)")
CACHE = "data/.belgium-names-2026.zip"
OUT = "data/frequencies/be.json"
OUT_MUNI = "data/belgium-by-municipality.json"


QLEVER = "https://qlever.dev/api/wikidata"


def commune_points():
    """NIS code -> (lat, lon), so the per-commune rows can be drawn.

    Statbel gives the code and the name and no coordinates, which makes
    the richest surname data in this atlas the only kind it cannot put on
    a map. Wikidata carries the NIS code as P1567 on Belgian places, so
    the join is exact rather than by name — and names are exactly what
    would have gone wrong here, with every commune spelled two ways and
    Sint-Gillis, Saint-Gilles and a dozen Sint-Martens- to choose between.

    The codes must be the five-digit municipal ones. Wikidata holds 2,981
    Belgian NIS codes and most are deelgemeenten with a letter suffix —
    45059G, 12021B — which are real places and not what Statbel counted.
    All 565 of Statbel's communes match on that rule.
    """
    q = """PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
SELECT ?nis ?coord WHERE {
  ?m wdt:P1567 ?nis . ?m wdt:P17 wd:Q31 . ?m wdt:P625 ?coord .
}"""
    url = QLEVER + "?" + urllib.parse.urlencode({"query": q})
    req = urllib.request.Request(url, headers={
        "Accept": "application/sparql-results+json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            rows = json.loads(r.read())["results"]["bindings"]
    except Exception as e:
        print(f"  no coordinates this run ({e}) — the file keeps its codes")
        return {}
    out = {}
    for x in rows:
        nis = x["nis"]["value"].strip()
        if not re.fullmatch(r"\d{5}", nis):
            continue
        w = x["coord"]["value"]
        if not w[:6].upper().startswith("POINT("):
            continue
        lon, lat = w[6:w.rindex(")")].split()
        out.setdefault(nis, (round(float(lat), 5), round(float(lon), 5)))
    return out


def fetch():
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 500000:
        return CACHE
    req = urllib.request.Request(ZIP, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=240) as r:
        blob = r.read()
    if blob[:2] != b"PK":
        raise SystemExit(f"that URL did not return a zip ({blob[:60]!r})")
    open(CACHE, "wb").write(blob)
    return CACHE


def main():
    z = zipfile.ZipFile(fetch())
    member = z.namelist()[0]

    national = collections.Counter()
    by_muni = collections.defaultdict(list)
    names = {}
    rows = skipped = 0

    with z.open(member) as f:
        for i, raw in enumerate(io.TextIOWrapper(f, encoding="utf-8",
                                                 errors="replace")):
            if i == 0:
                continue                      # CD_REFNIS|nl|fr|name|freq
            p = raw.rstrip("\n").split("|")
            if len(p) < 5:
                skipped += 1
                continue
            nis, nl, fr, name, freq = p[0], p[1], p[2], p[3].strip(), p[4]
            try:
                c = int(freq)
            except ValueError:
                skipped += 1
                continue
            if not name:
                skipped += 1
                continue
            rows += 1
            national[name] += c
            names[nis] = {"nl": nl, "fr": fr}
            by_muni[nis].append([name, c])

    if not rows:
        raise SystemExit(f"{member} parsed to nothing — the layout has changed")

    surnames = sorted(national.items(), key=lambda r: (-r[1], r[0]))
    out = {
        "country": "BE",
        "source": ("Family names by municipality, 1 January 2026 "
                   "(Statbel, TA_POP_LST_2026)"),
        "url": PAGE,
        "licence": "CC BY 4.0 (Statbel)",
        "note": ("The national total, summed from Statbel's per-municipality "
                 "table. Belgium publishes the grain this atlas actually "
                 "wants — surname, commune, count — and the per-commune rows "
                 "are kept in data/belgium-by-municipality.json rather than "
                 "flattened away here. A name is counted once per commune it "
                 "appears in, so summing is correct; Statbel suppresses the "
                 "smallest counts, which is why this total is short of the "
                 "population."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(surnames),
                   "people": sum(national.values()),
                   "municipalities": len(by_muni),
                   "rows": rows, "unparsed": skipped},
        "surnames": [{"n": n, "c": c} for n, c in surnames],
    }
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))

    xy = commune_points()
    placed = sum(1 for nis in by_muni if nis in xy)

    muni = {
        "note": ("Belgian surnames per municipality, CC BY 4.0 (Statbel, "
                 "1 January 2026). `m` is the NIS code, with the Dutch and "
                 "French names of the commune; `s` is [surname, people]. "
                 "Nothing else in this atlas has this grain — every other "
                 "register answers only «how many in the country» — so this "
                 "is kept whole rather than summed away. Statbel suppresses "
                 "the smallest counts per commune."),
        "source": out["source"], "licence": out["licence"],
        "harvested": out["harvested"],
        "counts": dict(out["counts"], placed=placed),
        "municipalities": [
            dict({"m": nis, "nl": names[nis]["nl"], "fr": names[nis]["fr"],
                  "s": sorted(v, key=lambda r: (-r[1], r[0]))},
                 **({"y": xy[nis][0], "x": xy[nis][1]} if nis in xy else {}))
            for nis, v in sorted(by_muni.items())],
    }
    json.dump(muni, open(OUT_MUNI, "w"), ensure_ascii=False,
              separators=(",", ":"))

    print(f"{OUT}: {len(surnames):,} surnames, "
          f"{sum(national.values()):,} people")
    print(f"{OUT_MUNI}: {len(by_muni):,} municipalities "
          f"({placed:,} with coordinates), {rows:,} rows"
          + (f", {skipped:,} unparsed" if skipped else ""))
    for n, c in surnames[:8]:
        print(f"  {c:>7,}  {n}")


if __name__ == "__main__":
    main()

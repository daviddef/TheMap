#!/usr/bin/env python3
"""Attach a Wikidata item and a GeoNames id to the places we walked.

WHY. The audit's complaint was that none of our place claims can be checked from
outside this project. A place that says «Tovarnik, Croatia» and carries Q1019494 and
GeoNames 3187432 can be checked by anybody against records that are not ours, and a
wrong coordinate or a wrong country shows up as a disagreement instead of staying
silent. It is also the shortest route to the same place in other people's data.

HOW. One Wikidata query per country, for every human settlement that carries a GeoNames
id and a coordinate, then a match on THREE things together: the folded name equals one
of ours, the point is within 5 km of ours, and the country is the same. Anything that
matches on name and misses on distance is left alone, not forced: «Gaj» matches a dozen.
Two of our places on one item is allowed and reported; it is two filings of one ground.

PILOT. Run for the countries named on the command line. Nothing is written unless a
match passes all three tests, and nothing is inferred from a name alone.

    python3 scripts/harvest-place-ids.py HR SI
"""
import json, math, os, re, sys, time, unicodedata, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "data/place-ids.json"
CACHE = os.environ.get("PLACE_IDS_CACHE") or os.path.join("data", "_cache-place-ids")
UA = ("RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap; "
      "open-source genealogy index, non-commercial)")
MAX_KM = 5.0


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def sparql(q, tries=3):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.loads(r.read().decode())["results"]["bindings"]
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(15 * (i + 1))


def settlements(cc):
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, f"{cc}.json")
    if os.path.exists(f):
        return json.load(open(f, encoding="utf-8"))
    q = f"""SELECT ?item ?label ?coord ?gn (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {{
  ?country wdt:P297 "{cc}" .
  ?item wdt:P17 ?country ; wdt:P31/wdt:P279* wd:Q486972 ; wdt:P625 ?coord ; wdt:P1566 ?gn .
  ?item rdfs:label ?label . FILTER(LANG(?label) IN ("en","hr","sl","de","it","hu","cs","pl","sk","sr","bs"))
  OPTIONAL {{ ?item skos:altLabel ?alt . FILTER(LANG(?alt) IN ("en","hr","sl","de","it","hu","sr","bs")) }}
}} GROUP BY ?item ?label ?coord ?gn"""
    rows = sparql(q)
    out = []
    for r in rows:
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r["coord"]["value"])
        if not m:
            continue
        out.append({"q": r["item"]["value"].rsplit("/", 1)[1], "n": r["label"]["value"],
                    "x": float(m.group(1)), "y": float(m.group(2)), "gn": r["gn"]["value"],
                    "a": [a for a in (r.get("alts", {}).get("value") or "").split("|") if a]})
    json.dump(out, open(f, "w", encoding="utf-8"), ensure_ascii=False)
    time.sleep(5)
    return out


def main():
    ccs = [a.upper() for a in sys.argv[1:]]
    if not ccs:
        sys.exit(__doc__)
    places = json.load(open("data/places.json", encoding="utf-8"))["places"]
    try:
        have = json.load(open(OUT, encoding="utf-8"))
    except Exception:
        have = {"ids": {}}
    ids = have.get("ids", {})
    for cc in ccs:
        rows = settlements(cc)
        by = {}
        for r in rows:
            for n in {r["n"], *r["a"]}:
                k = fold(n)
                if len(k) > 2:
                    by.setdefault(k, []).append(r)
        got = skipped = 0
        for p in places:
            if p["country"] != cc or p.get("level") or not p.get("collections"):
                continue
            names = {fold(p["name"]), fold(re.sub(r"\(.*?\)", "", p["name"]))}
            names |= {fold((n.get("n") or "").split(",")[0]) for n in p.get("names") or []}
            cand = {}
            for n in names:
                for r in by.get(n, []):
                    d = km(p["lat"], p["lon"], r["y"], r["x"])
                    if d <= MAX_KM and (r["q"] not in cand or d < cand[r["q"]][0]):
                        cand[r["q"]] = (d, r)
            if len(cand) == 1:
                d, r = next(iter(cand.values()))
                ids[p["id"]] = {"wikidata": r["q"], "geonames": r["gn"], "km": round(d, 2)}
                got += 1
            elif len(cand) > 1:
                skipped += 1
        print(f"{cc}: {len(rows):,} Wikidata settlements, {got} of our places matched, {skipped} ambiguous and left alone")
    doc = {
        "note": "A Wikidata item and a GeoNames id for places we walked, so a claim here can be checked against records that are not ours. A place is listed only when the folded name AND the country match and the point is within 5 km. Names alone are never enough.",
        "source": "Wikidata (CC0) via query.wikidata.org; the GeoNames id is Wikidata's own P1566 statement",
        "licence": "CC0 (Wikidata)",
        "generatedBy": "scripts/harvest-place-ids.py",
        "maxKm": MAX_KM,
        "ids": dict(sorted(ids.items())),
    }
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(OUT, "a").write("\n")
    print(f"{OUT}: {len(ids)} places")


if __name__ == "__main__":
    main()

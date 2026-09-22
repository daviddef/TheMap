#!/usr/bin/env python3
"""Every archive on Wikidata that has a coordinate, with its website.

WHY THIS REPLACES WHAT WAS THERE.

data/archives-wikidata.json held 4,929 archives and not one website. Every
row carried an empty `sites` list, because the file was produced by the
generic bounding-box harvester — harvest-wikidata-geo.py, written for
cemeteries and churches — which selects a label and a coordinate and
nothing else. So the map has been drawing five thousand archives that a
reader can see and cannot open. For an atlas whose entire premise is
«here is the paper and here is who holds it», a dot with no way through
to the institution is the least useful thing it can draw.

It also found too few. The old harvest asked for one class inside the
record regions; this asks for the class AND everything that is a subclass
of it, worldwide. Germany goes from 541 to 1,069, and the total from
4,929 to 11,026 — of which 5,439 carry a website.

WHAT THIS IS NOT. These are unverified Wikidata rows, and the map draws
them apart from the curated providers for that reason: nobody here has
opened them, nobody has checked what they hold or what it costs to look,
and a fair number will be municipal record offices with no genealogical
material at all. The value is that they exist, they are where they say
they are, and now they can be clicked.

Dissolved institutions are excluded on P576, the same filter the French
harvest needed for départements abolished in 1968 and the US counties
before it.
"""
import json, os, sys, time, urllib.parse, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

QLEVER = "https://qlever.dev/api/wikidata"
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources)")
OUT = "data/archives-wikidata.json"

PREFIX = """PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""

# One country at a time. The whole world in one query is 11,000 rows with
# labels and websites, which QLever will serve and which arrives as a
# single 3 MB response that fails entirely if anything hiccups. Per
# country it resumes, and a country that errors does not cost the rest.
COUNTRIES = PREFIX + """
SELECT ?cc (COUNT(DISTINCT ?a) AS ?n) WHERE {
  ?a wdt:P31/wdt:P279* wd:Q166118 .
  ?a wdt:P625 ?xy .
  ?a wdt:P17 ?c . ?c wdt:P297 ?cc .
  FILTER NOT EXISTS { ?a wdt:P576 ?d }
} GROUP BY ?cc
"""

ONE = PREFIX + """
SELECT ?a ?label ?xy ?site WHERE {
  ?a wdt:P31/wdt:P279* wd:Q166118 .
  ?a wdt:P625 ?xy .
  ?a wdt:P17 ?c . ?c wdt:P297 "%s" .
  FILTER NOT EXISTS { ?a wdt:P576 ?d }
  OPTIONAL { ?a wdt:P856 ?site }
  OPTIONAL { ?a rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?a rdfs:label ?any }
  BIND(COALESCE(?en, ?any) AS ?label)
}
"""


def ask(query, tries=4):
    url = QLEVER + "?" + urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(url, headers={
        "Accept": "application/sparql-results+json", "User-Agent": UA})
    for n in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.loads(r.read())["results"]["bindings"]
        except Exception as e:
            if n == tries - 1:
                raise
            wait = 20 * (n + 1)
            print(f"    {e} — waiting {wait}s", file=sys.stderr)
            time.sleep(wait)


def point(wkt):
    """POINT(lon lat), case-insensitively — the capitals cost a run once."""
    if not wkt or not wkt[:6].upper().startswith("POINT("):
        return None
    try:
        lon, lat = wkt[6:wkt.rindex(")")].split()
        return round(float(lat), 5), round(float(lon), 5)
    except (ValueError, IndexError):
        return None


def main():
    counts = {r["cc"]["value"]: int(r["n"]["value"]) for r in ask(COUNTRIES)}
    print(f"{sum(counts.values()):,} archives across {len(counts)} countries")

    rows, seen, withsite = [], set(), 0
    for i, (cc, n) in enumerate(sorted(counts.items(), key=lambda kv: -kv[1]), 1):
        try:
            got = ask(ONE % cc)
        except Exception as e:
            print(f"  {cc}: failed, skipped ({e})")
            continue
        added = 0
        for r in got:
            q = r["a"]["value"].rsplit("/", 1)[-1]
            if q in seen:
                continue
            xy = point(r.get("xy", {}).get("value"))
            if not xy:
                continue
            seen.add(q)
            rec = {"q": q, "n": (r.get("label") or {}).get("value") or q,
                   "y": xy[0], "x": xy[1], "cc": cc}
            site = (r.get("site") or {}).get("value")
            if site:
                rec["sites"] = [site]
                withsite += 1
            else:
                rec["sites"] = []
            rows.append(rec)
            added += 1
        if i % 20 == 0 or added > 200:
            print(f"  {i}/{len(counts)} {cc}: {added}")
        time.sleep(0.4)

    rows.sort(key=lambda r: (r["cc"], r["n"]))
    out = {
        "note": ("Every archive on Wikidata with a coordinate, worldwide, "
                 "with its website where Wikidata has one. UNVERIFIED: "
                 "nobody here has opened these, checked what they hold or "
                 "what it costs to look, and some are municipal record "
                 "offices with nothing genealogical in them. The map draws "
                 "them apart from the curated providers for that reason. "
                 "Dissolved institutions are excluded on P576."),
        "source": "Wikidata via QLever, P31/P279* Q166118",
        "licence": "CC0 1.0 (Wikidata)",
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"archives": len(rows), "withSite": withsite,
                   "countries": len({r["cc"] for r in rows})},
        "archives": rows,
    }
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"\n{OUT}: {len(rows):,} archives, {withsite:,} with a website, "
          f"{out['counts']['countries']} countries")


if __name__ == "__main__":
    main()

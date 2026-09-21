#!/usr/bin/env python3
"""The names a place answers to in another language.

318,798 harvested books name somewhere this atlas cannot place, and the top
of that list is not missing towns at all:

    Antwerpen  1,000 books   the shelf holds Antwerp
    Brussel    1,000 books   the shelf holds Brussels
    Ciudad de Buenos Aires   the shelf holds Buenos Aires

FamilySearch files under the local form and the gazetteer carries the
English one, so the join misses on a naming convention rather than on a
gap in the ground. That is the same failure the whole atlas exists to fix —
Gallignana is Gračišće — and it was happening inside the matcher.

DEMAND-DRIVEN, BECAUSE THE ALTERNATIVE IS 28.7 MILLION ROWS. Wikidata holds
that many name-forms for settlements with a country, which is not something
to copy wholesale for the sake of a few thousand books. Only 25 countries
have unplaced volumes at all, so this asks those countries for their
settlement names and keeps ONLY the forms that match a name this atlas has
actually failed on.

    python3 scripts/harvest-exonyms.py
"""
import collections, json, os, re, sys, time, unicodedata
import urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "data/exonyms.json"
ENDPOINT = "https://qlever.dev/api/wikidata"
UA = "RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; exonyms)"
PAGE = 150000

Q = """
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?form ?canon ?coord WHERE {
  ?p wdt:P31/wdt:P279* wd:Q486972 ;
     wdt:P17 ?c .
  ?c wdt:P297 "%s" .
  { ?p rdfs:label ?form } UNION { ?p skos:altLabel ?form }
  ?p rdfs:label ?canon . FILTER(LANG(?canon) = "en")
  OPTIONAL { ?p wdt:P625 ?coord }
}
LIMIT %d OFFSET %d
"""


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def ask(q, tries=3):
    for a in range(tries):
        try:
            req = urllib.request.Request(
                ENDPOINT, data=urllib.parse.urlencode({"query": q}).encode(),
                headers={"User-Agent": UA,
                         "Accept": "application/sparql-results+json",
                         "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=600) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:
            if a == tries - 1:
                print(f"    gave up: {e}", flush=True)
                return None
            time.sleep(15 * (a + 1))
    return None


POINT = re.compile(r"POINT\(([-0-9.]+) ([-0-9.]+)\)")


def main():
    # Only the names this atlas has actually failed on, and only the
    # countries those failures are in.
    try:
        gaps = json.load(open("data/fs-volumes-unplaced.json"))["names"]
    except FileNotFoundError:
        sys.exit("run scripts/match-fs-volumes.py first")
    wanted = collections.defaultdict(dict)   # cc -> folded form -> books
    for g in gaps:
        cc = g.get("cc")
        if cc and g["n"]:
            wanted[cc][fold(g["n"])] = g["volumes"]
    ccs = sorted(wanted, key=lambda c: -sum(wanted[c].values()))
    print(f"{len(ccs)} countries hold unplaced books; "
          f"{sum(len(v) for v in wanted.values()):,} distinct names to look for\n")

    found, t0 = {}, time.time()
    for i, cc in enumerate(ccs, 1):
        want = wanted[cc]
        hits, offset, seen = {}, 0, 0
        while True:
            rows = ask(Q % (cc, PAGE, offset))
            if not rows:
                break
            seen += len(rows)
            for r in rows:
                f = fold(r["form"]["value"])
                if f not in want or f in hits:
                    continue
                m = POINT.search(r.get("coord", {}).get("value", "") or "")
                hits[f] = {"n": r["canon"]["value"], "cc": cc,
                           "x": float(m.group(1)) if m else None,
                           "y": float(m.group(2)) if m else None}
            if len(rows) < PAGE:
                break
            offset += PAGE
            time.sleep(1)
        got = sum(want[f] for f in hits)
        print(f"  [{i}/{len(ccs)}] {cc}  {len(hits):5,} of {len(want):,} names "
              f"matched · {got:,} books freed · {seen:,} forms scanned "
              f"({int(time.time()-t0)}s)", flush=True)
        for f, v in hits.items():
            found[cc + "|" + f] = v
        json.dump({
            "source": "Wikidata: settlements (Q486972 and subclasses) with a "
                      "country, every label and alias.",
            "licence": "CC0.",
            "note": ("One row per NAME FORM this atlas failed on, resolved to "
                     "the settlement it belongs to. Demand-driven: Wikidata "
                     "holds 28.7 million settlement name-forms and this keeps "
                     "only the few thousand that were actually costing books."),
            "harvested": time.strftime("%Y-%m-%d"),
            "counts": {"forms": len(found)},
            "forms": found,
        }, open(OUT, "w"), ensure_ascii=False)
    print(f"\n{len(found):,} name forms resolved -> {OUT}")


if __name__ == "__main__":
    main()

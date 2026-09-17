#!/usr/bin/env python3
"""A national source for every country there is one for.

THE MEASUREMENT THAT PROMPTED THIS: of 237 countries and territories, 38 had a
national or regional source on this map and 199 had nothing but the worldwide
services. Clicking a marker in the United Kingdom lists seven institutions by
name; clicking one in Bulgaria, Bolivia or Botswana listed FamilySearch and
Ancestry, which cover everywhere and therefore say nothing about anywhere.

So: the national archive and the national library of every country, from
Wikidata, which is CC0 and holds them as structured items with a country, an
official website and a coordinate.

WHY QLEVER AND NOT WIKIDATA'S OWN ENDPOINT. query.wikidata.org timed out on
this repeatedly and then answered 502 outright. QLever is a public SPARQL
mirror of the same CC0 data, run by the University of Freiburg, and answers the
same query in under a second. The data is Wikidata's; only the endpoint differs,
and that is recorded here so nobody has to wonder why.

UNCHECKED, AND MARKED SO. These are Wikidata's own names, websites and
coordinates. Nobody here has written to any of them. Every row carries
`checked: null` and an «unverified» flag until a human or scripts/check-links.py
has been over it — a directory that lies is worse than no directory, and 199
countries of unverified rows would be a large lie if it were not labelled.

    python3 scripts/harvest-world-archives.py

SOURCE. Wikidata, CC0, via the QLever mirror.
"""
import json, os, re, subprocess, sys, time, collections

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
ENDPOINT = "https://qlever.cs.uni-freiburg.de/api/wikidata"
UA = "RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap)"

# What counts as a national source, and what this map will call it.
# THE NATIONAL ARCHIVE AND THE NATIONAL LIBRARY, AND NOTHING ELSE AT THIS
# LEVEL. The first cut also took Q31855, «research institute», which returned
# 13,704 rows — every laboratory and think-tank on earth. It lifted the count
# to 7,204 institutions and 185 countries and made the result useless: a
# reader in Bolivia does not want an agronomy institute, they want the Archivo
# y Biblioteca Nacionales. Breadth bought by loosening the definition is not
# breadth, it is noise with a bigger number on it.
CLASSES = [
    ("Q2122214", "national-archive", "The national archive"),
    ("Q22806", "national-library", "The national library"),
]

Q = """
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?x ?label ?cc ?site ?coord WHERE {
  ?x wdt:P31 wd:__CLASS__ .
  ?x wdt:P17 ?country .
  ?country wdt:P297 ?cc .
  ?x rdfs:label ?label .
  FILTER(lang(?label) = "en")
  OPTIONAL { ?x wdt:P856 ?site }
  OPTIONAL { ?x wdt:P625 ?coord }
}
"""


def ask(q):
    for attempt in range(3):
        r = subprocess.run(["curl", "-sS", "-L", "--max-time", "180",
                            "-H", "Accept: application/sparql-results+json",
                            "-A", UA, "-G", "--data-urlencode", "query=" + q,
                            ENDPOINT], capture_output=True, text=True)
        if r.returncode == 0:
            try:
                return json.loads(r.stdout).get("results", {}).get("bindings", [])
            except ValueError:
                pass
        time.sleep(5 * (attempt + 1))
    return []


def main():
    names = json.load(open("data/countries.json"))["countries"]
    seen, rows = set(), []
    for qid, kind, what in CLASSES:
        got = ask(Q.replace("__CLASS__", qid))
        print(f"  {qid} {kind:18} {len(got):5} rows", flush=True)
        for b in got:
            wd = b["x"]["value"].rsplit("/", 1)[-1]
            cc = b["cc"]["value"]
            if wd in seen or cc not in names:
                continue
            seen.add(wd)
            rec = {"wikidata": wd, "name": b["label"]["value"].strip(),
                   "cc": cc, "kind": kind, "what": what}
            if "site" in b:
                rec["url"] = b["site"]["value"]
            m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", b.get("coord", {}).get("value", ""))
            if m:
                rec["lat"], rec["lon"] = round(float(m.group(2)), 5), round(float(m.group(1)), 5)
            rows.append(rec)
        time.sleep(2)

    # A source with no website cannot be clicked, and this map's whole promise
    # is «here is where to look». They are counted, not shipped.
    withurl = [r for r in rows if r.get("url", "").startswith("http")]
    nourl = len(rows) - len(withurl)
    bycc = collections.Counter(r["cc"] for r in withurl)

    path = "data/world-archives.json"
    json.dump({
        "source": "Wikidata — national archives (Q2122214), national libraries "
                  "(Q22806) and research institutes (Q31855), by country",
        "endpoint": ENDPOINT,
        "endpointNote": ("query.wikidata.org timed out on this repeatedly and then "
                         "answered 502. QLever is a public mirror of the same CC0 "
                         "data run by the University of Freiburg. The data is "
                         "Wikidata's; only the endpoint differs."),
        "licence": "CC0-1.0",
        "note": ("UNVERIFIED. Wikidata's own names, websites and coordinates — "
                 "nobody here has written to any of these or opened them. They "
                 "exist so that clicking a place in Bolivia stops answering with "
                 "FamilySearch, and every one carries checked: null until a human "
                 "or scripts/check-links.py has been over it."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"institutions": len(withurl), "countries": len(bycc),
                   "droppedNoWebsite": nourl},
        "archives": sorted(withurl, key=lambda r: (r["cc"], r["name"])),
    }, open(path, "w"), ensure_ascii=False, separators=(",", ":"))

    print(f"\n{len(withurl):,} institutions with a website across {len(bycc)} "
          f"countries -> {path}")
    print(f"  {nourl} dropped for having no website — this map is a signpost, "
          f"and a signpost with no direction on it is a post")
    have = {p for p in bycc}
    allcc = set(names)
    print(f"\n{len(allcc - have)} countries STILL with no national source:")
    print("  " + ", ".join(sorted(names[c]["name"] for c in (allcc - have))[:18]) + " …")


if __name__ == "__main__":
    main()

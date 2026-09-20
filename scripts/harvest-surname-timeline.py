#!/usr/bin/env python3
"""WHEN and WHERE a surname was being born — the third axis.

The surname dataset already answers two of the three questions David asked
for. Where a name is found TODAY: 763,946 country attestations from national
registers. Its VARIATIONS, harmonised: 241,523 names carrying curated,
grammatical and phonetic forms. The third — where the name was found ACROSS
TIME — existed for exactly one country, France, from the INSEE births file,
and nowhere else.

This is the rest of the world. Wikidata holds 2,573,683 people who have a
family name, a date of birth and a place of birth in a country, running from
the 1300s to now:

    1700s    97,455 people    42,079 surnames
    1800s   601,673 people   154,852 surnames
    1900s 1,764,287 people   330,578 surnames

Grouped by surname, country and DECADE — decade because that is the grain
the French series already uses, and because a year-by-year count of notable
people is noise dressed as precision.

THE BIAS HAS TO BE SAID OUT LOUD, ON THE PAGE. These are people notable
enough for an encyclopaedia. That is not a census: it over-counts men,
over-counts the recent, over-counts Europe and North America, and misses
almost everybody. It is evidence that a name was BORNE in a place at a time,
never evidence of how common it was. The atlas has tiers for exactly this
reason and these rows are their own tier.

NOTHING HERE COMES FROM THE VOLUME HARVEST. A surname in a register title is
a book's subject, not a person, and conflating the two would put a name
wherever a book happened to be catalogued.

    python3 scripts/harvest-surname-timeline.py
"""
import gzip, json, os, sys, time, urllib.parse, urllib.request


def _open_out(path):
    return (gzip.open(path, "wt", encoding="utf-8")
            if path.endswith(".gz") else open(path, "w"))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
# GZIPPED. 25 MB of plain JSON timed out a push at HTTP 408, and the same
# shape compresses to about a tenth. The build reads the gz directly, so
# nothing is unpacked on disk and nothing large enters git.
OUT = "data/surname-timeline.json.gz"
# QLever's mirror, because query.wikidata.org answers this shape with a 502
# or a timeout — it is a large aggregate and the public endpoint is fair to
# refuse it.
# qlever.cs.uni-freiburg.de now answers a POST with 308 to qlever.dev, and
# urllib does not follow a redirect on POST — it raises. The old host is
# still in half the documentation, so the new one is used directly and the
# reason is written here rather than rediscovered.
ENDPOINT = "https://qlever.dev/api/wikidata"
UA = "RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; surname timeline)"
PAGE = 200000

Q = """
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?surname ?cc ?dec (COUNT(*) AS ?n) WHERE {
  ?p wdt:P31 wd:Q5 ;
     wdt:P734 ?sn ;
     wdt:P569 ?dob ;
     wdt:P19 ?birth .
  ?birth wdt:P17 ?country .
  ?country wdt:P297 ?cc .
  ?sn rdfs:label ?surname . FILTER(LANG(?surname) = "en")
  FILTER(YEAR(?dob) > 1300 && YEAR(?dob) < 2027)
  BIND(FLOOR(YEAR(?dob) / 10) * 10 AS ?dec)
}
GROUP BY ?surname ?cc ?dec
ORDER BY ?surname ?cc ?dec
LIMIT %d OFFSET %d
"""


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
                print(f"  gave up: {e}", flush=True)
                return None
            time.sleep(20 * (a + 1))
    return None


def main():
    by = {}
    offset, rows, t0 = 0, 0, time.time()
    while True:
        got = ask(Q % (PAGE, offset))
        if got is None:
            break
        if not got:
            break
        for r in got:
            n = r["surname"]["value"].strip()
            cc = r["cc"]["value"]
            dec = int(float(r["dec"]["value"]))
            c = int(r["n"]["value"])
            if not n or len(n) > 60:
                continue
            by.setdefault(n, {}).setdefault(cc, {})[str(dec)] = c
        rows += len(got)
        print(f"  {rows:,} rows · {len(by):,} surnames · "
              f"{int(time.time()-t0)}s", flush=True)
        if len(got) < PAGE:
            break
        offset += PAGE
        time.sleep(2)

    json.dump({
        "source": "Wikidata: humans (Q5) with family name P734, date of birth "
                  "P569 and place of birth P19 resolved to a country.",
        "licence": "CC0.",
        "grain": "One count per surname, country and decade of birth.",
        "bias": ("These are people notable enough for an encyclopaedia, not a "
                 "census. The series over-counts men, the recent, Europe and "
                 "North America, and misses almost everybody. Read it as "
                 "evidence that a name was BORNE in a place at a time, never "
                 "as how common it was."),
        "note": "Nothing here comes from the volume harvest. A surname in a "
                "register's title is a book's subject, not a person.",
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(by),
                   "rows": sum(len(d) for v in by.values() for d in v.values())},
        "when": by,
    }, _open_out(OUT), ensure_ascii=False)
    print(f"\n{len(by):,} surnames with a timeline -> {OUT}")


if __name__ == "__main__":
    main()

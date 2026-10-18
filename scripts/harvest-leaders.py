#!/usr/bin/env python3
"""Harvest heads of state for every country from Wikidata (CC0) into data/leaders.json.

WHY. The atlas records ONE ruler per era, the first of the era, as a text tag. A page of 1861–1922
Italy says Victor Emmanuel II for an event in 1888, when Umberto I reigned. This builds the table
that fixes it: who held the office, from which day to which, with a Wikidata id for the person so
the claim can be checked.

HOW. Two kinds of Wikidata statement, merged:
  1. the person's `position held` (P39) with a start and an end, where the position is an office
     the country item names as its head of state's (`office held by head of state`, P1906);
  2. the country item's own `head of state` (P35) statements that carry a start date.
Neither is complete; together they are what Wikidata knows. Nothing is inferred and nothing is
filled in: a country-year with no row is silent, and `coverage` says how many years of each
country's modern history have a named holder.

CACHE. Raw SPARQL answers go to data/leaders-raw/<cc>.json, so a rerun only asks for what is
missing; the build never calls Wikidata (this script is hand-run, like the other harvests).
"""
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "leaders-raw")
OUT = os.path.join(ROOT, "data", "leaders.json")
EP = "https://query.wikidata.org/sparql"
UA = "RecordAtlas/1.0 (https://recordatlas.org; david.defranceski@gmail.com)"


def sparql(q, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(EP + "?" + urllib.parse.urlencode({"query": q, "format": "json"}),
                                         headers={"Accept": "application/sparql-results+json", "User-Agent": UA})
            return json.load(urllib.request.urlopen(req, timeout=90))["results"]["bindings"]
        except Exception as e:
            print("   retry", i + 1, str(e)[:80])
            time.sleep(4 * (i + 1))
    return None


def countries():
    rows = sparql("""SELECT ?c ?iso WHERE { ?c wdt:P297 ?iso . FILTER NOT EXISTS { ?c wdt:P576 [] } }""")
    return {r["iso"]["value"]: r["c"]["value"].rsplit("/", 1)[1] for r in rows}


Q = """
SELECT ?person ?personLabel ?start ?end ?officeLabel ?via WHERE {
  {
    wd:%(q)s wdt:P1906 ?office .
    ?person p:P39 ?s . ?s ps:P39 ?office ; pq:P580 ?start .
    OPTIONAL { ?s pq:P582 ?end }
    BIND("P39" AS ?via)
  } UNION {
    wd:%(q)s p:P35 ?st . ?st ps:P35 ?person ; pq:P580 ?start .
    OPTIONAL { ?st pq:P582 ?end }
    BIND("head of state" AS ?officeLabel0) BIND("P35" AS ?via)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
"""


def year(s):
    return int(s[:4]) if s and s[0].isdigit() else (-int(s[1:5]) if s and s[0] == "-" else None)


def main():
    os.makedirs(RAW, exist_ok=True)
    cs = countries()
    print(len(cs), "countries")
    out = {}
    for iso, q in sorted(cs.items()):
        f = os.path.join(RAW, iso + ".json")
        if os.path.exists(f):
            rows = json.load(open(f))
        else:
            rows = sparql(Q % {"q": q})
            if rows is None:
                print(iso, "FAILED"); continue
            json.dump(rows, open(f, "w"))
            time.sleep(1.0)
        seen, lst = set(), []
        for r in rows:
            who = r["person"]["value"].rsplit("/", 1)[1]
            f0, t0 = year(r["start"]["value"]), year(r.get("end", {}).get("value"))
            if f0 is None or (who, f0) in seen:
                continue
            seen.add((who, f0))
            lst.append({"q": who, "name": r["personLabel"]["value"], "from": f0, "to": t0,
                        "start": r["start"]["value"][:10], "end": (r.get("end", {}).get("value") or "")[:10] or None,
                        "office": r.get("officeLabel", {}).get("value") or "head of state", "via": r["via"]["value"]})
        lst.sort(key=lambda x: (x["from"], x["name"]))
        out[iso] = {"q": q, "holders": lst}
        print(iso, q, len(lst))
    doc = {"note": ("Heads of state by country, from Wikidata (CC0): each holder with a Wikidata id, the day the "
                    "statement starts and ends, and the office. Harvested by scripts/harvest-leaders.py. "
                    "Neither statement kind is complete; a country-year with no holder here means Wikidata names none, "
                    "not that nobody ruled."),
           "source": "https://www.wikidata.org", "licence": "CC0 1.0 Universal (public domain)",
           "generated": time.strftime("%Y-%m-%d"), "countries": out}
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("holders:", sum(len(v["holders"]) for v in out.values()))


if __name__ == "__main__":
    main()

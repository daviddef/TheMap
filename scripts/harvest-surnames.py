#!/usr/bin/env python3
"""Surnames, their variants, and the countries they are attested in.

THE HONEST SCOPE, SAID FIRST. There is no open dataset of every surname in the
world. Forebears claims twenty-seven million with country distribution and is
commercial; it is not redistributable and is not used here. What IS open is
Wikidata's 696,558 surname items (CC0), of which 45,916 carry a curated
«said to be the same as» link, and a handful of national frequency lists
published by governments.

So this builds the biggest CC0-clean surname dataset it honestly can, and says
where each fact came from. «Attested in Poland» will always mean «appears in an
open Polish dataset», never «exists in Poland» — the same distinction the map
makes between a grey dot and an empty one, and for the same reason.

WHY SPARQL AND NOT A DUMP. The full Wikidata dump is 140 GB. The query service
is the published, rate-limited, intended route for exactly this, and 696k rows
comes out in pages of twenty thousand with a second between them.

    python3 scripts/harvest-surnames.py --out data/surnames-wikidata.json
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

ENDPOINT = "https://query.wikidata.org/sparql"
UA = ("RecordAtlasSurnames/1.0 (+https://github.com/daviddef/TheMap; "
      "paged surname harvest, one page a second)")
CACHE = "/tmp/record-atlas-surnames"

# Labels only, in one pass. Variants, languages and origins are asked for
# separately, because joining them in one query makes it too slow to finish.
Q_NAMES = """
SELECT ?s ?label WHERE {
  ?s wdt:P31 wd:Q101352 .
  ?s rdfs:label ?label . FILTER(LANG(?label) = "en")
} ORDER BY ?s LIMIT __LIMIT__ OFFSET __OFFSET__
"""

# One initial letter at a time. Each slice is small enough that the offset
# never gets deep, which is the whole trick: OFFSET 400000 is what 504s, not
# the size of the result.
Q_NAMES_LETTER = """
SELECT ?s ?label WHERE {
  ?s wdt:P31 wd:Q101352 .
  ?s rdfs:label ?label . FILTER(LANG(?label) = "en" && STRSTARTS(?label, "__L__"))
} ORDER BY ?s LIMIT __LIMIT__ OFFSET __OFFSET__
"""

Q_VARIANTS = """
SELECT ?s ?v WHERE { ?s wdt:P31 wd:Q101352 ; wdt:P460 ?v . }
ORDER BY ?s LIMIT __LIMIT__ OFFSET __OFFSET__
"""

Q_PROPS = """
SELECT ?s ?p ?o WHERE {
  ?s wdt:P31 wd:Q101352 .
  VALUES ?p { wdt:P407 wdt:P495 wdt:P1705 }
  ?s ?p ?o .
} ORDER BY ?s LIMIT __LIMIT__ OFFSET __OFFSET__
"""


def sparql(q, tries=3):
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/sparql-results+json"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))["results"]["bindings"]
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def page(name, template, size):
    """Walk a query in pages, caching each so a re-run costs nothing.

    The queries carry __LIMIT__/__OFFSET__ tokens and are filled by plain
    replacement. Two neater-looking options both failed first: printf slots,
    because a %s for the language in a string that also holds two %d for the
    paging blows up; and str.format, because SPARQL is made of braces and
    format tried to read the whole query body as field names.
    """
    os.makedirs(CACHE, exist_ok=True)
    out, off = [], 0
    while True:
        p = os.path.join(CACHE, f"{name}-{off}.json")
        if os.path.exists(p):
            rows = json.load(open(p))
        else:
            rows = sparql(template.replace("__LIMIT__", str(size))
                                  .replace("__OFFSET__", str(off)))
            json.dump(rows, open(p, "w"))
            time.sleep(1.0)
        out.extend(rows)
        print(f"  {name}: {len(out)} rows", flush=True)
        if len(rows) < size:
            break
        off += size
    return out


qid = lambda u: u.rsplit("/", 1)[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/surnames-wikidata.json")
    # Deep OFFSET is what kills this. Wikidata has to materialise and sort
    # every row up to the offset before it can skip them, so page 30 costs
    # thirty times page 1 and the service gives up with a 504 long before the
    # end. Small pages do not fix that on their own — see --by-letter.
    ap.add_argument("--size", type=int, default=5000)
    a = ap.parse_args()

    names = {}
    letters = [chr(c) for c in range(ord("A"), ord("Z") + 1)] + list("ÀÁÂÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÖØÙÚÜŁŚŻŹČŠŽ")
    for L in letters:
        try:
            rows = page(f"names-{L}", Q_NAMES_LETTER.replace("__L__", L), a.size)
        except Exception as e:
            print(f"  {L}: gave up ({type(e).__name__})", flush=True)
            continue
        for row in rows:
            names[qid(row["s"]["value"])] = row["label"]["value"]
    print(f"{len(names)} surnames with an English label")

    variants = {}
    for row in page("variants", Q_VARIANTS, a.size):
        variants.setdefault(qid(row["s"]["value"]), []).append(qid(row["v"]["value"]))
    print(f"{len(variants)} surnames carrying a curated variant link")

    props = {}
    for row in page("props", Q_PROPS, a.size):
        s, p, o = qid(row["s"]["value"]), qid(row["p"]["value"]), row["o"]["value"]
        props.setdefault(s, {}).setdefault(p, []).append(
            qid(o) if o.startswith("http") else o)
    print(f"{len(props)} surnames carrying a language, origin or native label")

    out = []
    for q, label in sorted(names.items(), key=lambda kv: kv[1]):
        rec = {"q": q, "name": label}
        v = [names[x] for x in variants.get(q, []) if x in names]
        if v:
            rec["variants"] = sorted(set(v))
        pr = props.get(q, {})
        if pr.get("P1705"):
            rec["native"] = pr["P1705"][0]
        if pr.get("P407"):
            rec["langQ"] = pr["P407"]
        if pr.get("P495"):
            rec["originQ"] = pr["P495"]
        out.append(rec)

    json.dump({"source": "Wikidata, instance of family name (Q101352). CC0.",
               "harvested": time.strftime("%Y-%m-%d"),
               "note": "Variants here are CURATED — Wikidata's «said to be the same as». "
                       "Phonetic clusters are generated separately and labelled as such, "
                       "because a human saying two names are the same is a different "
                       "quality of fact from an algorithm saying they sound alike.",
               "surnames": out}, open(a.out, "w"), ensure_ascii=False)
    print(f"\n{len(out)} surnames -> {a.out}  "
          f"({os.path.getsize(a.out)/1024/1024:.1f} MB)")
    print(f"  with curated variants: {sum(1 for r in out if r.get('variants'))}")


if __name__ == "__main__":
    main()

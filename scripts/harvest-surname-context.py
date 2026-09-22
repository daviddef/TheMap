#!/usr/bin/env python3
"""What a surname IS, where Wikidata says so and can be cited.

WHAT THIS DELIBERATELY DOES NOT DO.

Every genealogy site on the web will tell you a surname's meaning. Almost
none of them will tell you who says so. «Defranceschi: from the Latin
Franciscus, meaning free man» is the genre — confident, unsourced, and
the same three sentences on forty sites. This atlas's whole argument is
that an unsourced claim is worth less than a gap you can see, and a
surname page that asserts an etymology it cannot attribute would throw
that away on the one page people arrive at by name.

So nothing here is generated, inferred or paraphrased. Four things are
copied from Wikidata, each with the item id that said it:

  lang   the language of the name (P407). 175,308 items carry one. This
         is NOT where a family is from: «Kowalski is a Polish surname»
         says the name is Polish, not that the bearer's people were.
         The wording on the page has to keep that line.
  after  what the name is named after (P138). 3,191 items, and the best
         of the four: Aab after Adelbert, a name after a village.
  kind   patronymic, toponymic, based on a given name — the subclasses
         of family name. Thin, about 20,000 across all types, and
         precise where it exists.
  wiki   an English Wikipedia article, 75,415 of them. Not a claim at
         all: a place to go and read, with its own sources.

Wikidata is crowd-sourced and wrong in places. Everything here carries
its QID so a reader can check, and the page must say where it came from
rather than presenting it as the atlas's own finding.

Only names already in data/surnames.json are kept. Wikidata has 697,000
family names and most of them mean nothing to this corpus; matching
first keeps the file to what the atlas can actually show.
"""
import json, os, sys, time, unicodedata, urllib.parse, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

QLEVER = "https://qlever.dev/api/wikidata"
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources)")
OUT = "data/surname-context.json"
PAGE = 25000

Q = """PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
SELECT ?s ?name ?langl ?afterl ?typel ?art WHERE {
  ?s wdt:P31 wd:Q101352 .
  ?s rdfs:label ?name . FILTER(LANG(?name) = "en")
  OPTIONAL { ?s wdt:P407 ?lang . ?lang rdfs:label ?langl .
             FILTER(LANG(?langl) = "en") }
  OPTIONAL { ?s wdt:P138 ?after . ?after rdfs:label ?afterl .
             FILTER(LANG(?afterl) = "en") }
  OPTIONAL { ?s wdt:P31 ?type . ?type wdt:P279 wd:Q101352 .
             ?type rdfs:label ?typel . FILTER(LANG(?typel) = "en") }
  OPTIONAL { ?art schema:about ?s ;
                  schema:isPartOf <https://en.wikipedia.org/> }
  FILTER(BOUND(?langl) || BOUND(?afterl) || BOUND(?typel) || BOUND(?art))
}
ORDER BY ?s
LIMIT %d OFFSET %d
"""


def fold(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def ask(query, tries=4):
    url = QLEVER + "?" + urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(url, headers={
        "Accept": "application/sparql-results+json", "User-Agent": UA})
    for n in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())["results"]["bindings"]
        except Exception as e:
            if n == tries - 1:
                raise
            wait = 25 * (n + 1)
            print(f"    {e} — waiting {wait}s", file=sys.stderr)
            time.sleep(wait)


def main():
    try:
        corpus = {fold(r["n"]) for r in
                  json.load(open("data/surnames.json"))["surnames"]}
    except FileNotFoundError:
        sys.exit("data/surnames.json is missing — run build-surnames.py first")
    print(f"{len(corpus):,} surnames in the corpus to match against")

    out, offset, seen_rows = {}, 0, 0
    while True:
        rows = ask(Q % (PAGE, offset))
        if not rows:
            break
        seen_rows += len(rows)
        for r in rows:
            name = r["name"]["value"]
            k = fold(name)
            if k not in corpus:
                continue
            qid = r["s"]["value"].rsplit("/", 1)[-1]
            # A CITATION THAT 404s IS WORSE THAN NONE.
            # Two of these are Lexemes, not items — «Smith» and «Lister»,
            # both legitimately tagged as family names — and a lexeme
            # lives at /wiki/Lexeme:L500927, not /wiki/L500927. Two rows
            # out of 99,560, and the whole value of this file is that
            # every claim can be checked, so the address is written here
            # rather than assembled from the id by a page that cannot
            # know the difference.
            rec = out.setdefault(k, {
                "n": name, "q": qid,
                "cite": "https://www.wikidata.org/wiki/"
                        + ("Lexeme:" + qid if qid.startswith("L") else qid),
                "lang": [], "after": [], "kind": []})
            for field, key in (("langl", "lang"), ("afterl", "after"),
                               ("typel", "kind")):
                v = (r.get(field) or {}).get("value")
                if v and v not in rec[key]:
                    rec[key].append(v)
            art = (r.get("art") or {}).get("value")
            if art and "wiki" not in rec:
                rec["wiki"] = art
        offset += PAGE
        print(f"  {seen_rows:,} rows read, {len(out):,} of ours matched")
        if len(rows) < PAGE:
            break
        time.sleep(0.5)

    for rec in out.values():
        for key in ("lang", "after", "kind"):
            if not rec[key]:
                del rec[key]

    doc = {
        "note": ("What Wikidata says a surname is, for the names this atlas "
                 "already holds. NOTHING HERE IS GENERATED OR INFERRED: "
                 "`lang` is the language of the NAME (P407), which is not "
                 "where a family is from; `after` is what it is named after "
                 "(P138); `kind` is the subclass of family name; `wiki` is "
                 "an English Wikipedia article to read, not a claim. Every "
                 "row carries the Wikidata id that said it, because "
                 "Wikidata is crowd-sourced and wrong in places, and a "
                 "surname page asserting an unattributable etymology is the "
                 "one thing this atlas exists not to do."),
        "source": "Wikidata via QLever, P31 = Q101352 (family name)",
        "licence": "CC0 1.0 (Wikidata)",
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"matched": len(out), "rowsRead": seen_rows,
                   "withLanguage": sum(1 for r in out.values() if "lang" in r),
                   "withNamedAfter": sum(1 for r in out.values() if "after" in r),
                   "withKind": sum(1 for r in out.values() if "kind" in r),
                   "withArticle": sum(1 for r in out.values() if "wiki" in r)},
        "surnames": out,
    }
    json.dump(doc, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"\n{OUT}: {len(out):,} of our surnames have context")
    for k, v in doc["counts"].items():
        print(f"    {k:<16} {v:,}")


if __name__ == "__main__":
    main()

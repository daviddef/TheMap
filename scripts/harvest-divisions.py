#!/usr/bin/env python3
"""The administrative divisions this atlas is missing, from Wikidata.

data/admin-divisions.json is how a book that names only a province or a
county gets onto the map — 362,850 volumes are placed that way. Its
coverage is uneven: it holds Alaska's boroughs and not North Carolina's
counties, 1,851 US divisions against roughly 3,143. So Gates County,
Chowan County and Bertie County head the unplaced list with thousands of
books each, and the matcher is not at fault: it is looking something up
that is not there.

586 county-like names carrying 44,755 unplaced volumes are missing.

WHY THE PARENT MATTERS MORE THAN THE NAME. County names repeat: there
are Butler Counties in Alabama, Kansas, Missouri and Ohio. The matcher
disambiguates on the parent level in the book's own path, so every row
written here carries `adm1` — the state — and a row without one is worse
than no row at all, because it would be picked arbitrarily.

    python3 scripts/harvest-divisions.py            # US counties
    python3 scripts/harvest-divisions.py --dry-run  # look, do not write
"""
import argparse, json, os, re, sys, time, unicodedata
import urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "data/admin-divisions.json"
ENDPOINT = "https://qlever.dev/api/wikidata"
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "administrative divisions)")
POINT = re.compile(r"POINT\(([-0-9.]+) ([-0-9.]+)\)")

# Counties and their equivalents, through the subclass tree. Each state
# models its own — Gates County is a "county of North Carolina", Q13414758,
# not the generic Q47168 — so the walk up P279 is what finds them.
Q_US = """
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?name ?st ?coord WHERE {
  ?c wdt:P31/wdt:P279* wd:Q47168 ;
     rdfs:label ?name ; wdt:P625 ?coord ; wdt:P131 ?s .
  ?s rdfs:label ?st .
  FILTER(LANG(?name) = "en") FILTER(LANG(?st) = "en")
  FILTER NOT EXISTS { ?c wdt:P576 ?abolished }
}
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
                sys.exit(f"Wikidata would not answer: {e}")
            time.sleep(15 * (a + 1))
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    doc = json.load(open(OUT, encoding="utf-8"))
    rows = doc["divisions"]
    have = {(r.get("cc"), fold(r.get("name", "")), fold(r.get("adm1", "")))
            for r in rows}
    have_name = {(r.get("cc"), fold(r.get("name", ""))) for r in rows}
    print(f"{len(rows):,} divisions already, {len(have_name):,} distinct names")

    got = ask(Q_US)
    print(f"{len(got):,} rows from Wikidata")

    # A state is a state; anything else as a parent means the county is
    # historical or the data is odd, and a wrong parent is worse than none.
    STATES = {fold(x) for x in [
        "Alabama","Alaska","Arizona","Arkansas","California","Colorado",
        "Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho",
        "Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine",
        "Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
        "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
        "New Mexico","New York","North Carolina","North Dakota","Ohio",
        "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
        "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia",
        "Washington","West Virginia","Wisconsin","Wyoming",
        "District of Columbia"]}

    added, skipped_parent, already = 0, 0, 0
    seen_new = set()
    for b in got:
        name = b["name"]["value"].strip()
        st = b["st"]["value"].strip()
        m = POINT.search(b["coord"]["value"])
        if not m or fold(st) not in STATES:
            skipped_parent += 1
            continue
        key = ("US", fold(name), fold(st))
        if key in have or key in seen_new:
            already += 1
            continue
        seen_new.add(key)
        rows.append({
            "key": "US." + re.sub(r"[^A-Za-z0-9]+", "", st)[:6].upper()
                   + "." + re.sub(r"[^a-z0-9]+", "-", fold(name))[:28],
            "cc": "US", "level": "adm2", "name": name, "adm1": st,
            "lat": round(float(m.group(2)), 4),
            "lon": round(float(m.group(1)), 4),
            "towns": 0,
            "from": "wikidata",
        })
        added += 1

    print(f"  added {added:,}   already held {already:,}   "
          f"refused for a parent that is not a state {skipped_parent:,}")
    dup = len({(r.get('cc'), fold(r.get('name',''))) for r in rows})
    print(f"  now {len(rows):,} divisions, {dup:,} distinct names "
          f"— the rest are shared and need their parent to tell apart")
    if a.dry_run:
        print("  --dry-run, nothing written")
        return
    doc["divisions"] = rows
    doc["note"] = (doc.get("note", "") +
                   " US counties completed from Wikidata "
                   f"({time.strftime('%Y-%m-%d')}); every added row carries "
                   "its state in `adm1`, because county names repeat and the "
                   "matcher disambiguates on the parent.")
    tmp = OUT + ".tmp"
    json.dump(doc, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, OUT)
    print(f"  written -> {OUT}")


if __name__ == "__main__":
    main()

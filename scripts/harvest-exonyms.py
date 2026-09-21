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
import collections, json, math, os, re, sys, time, unicodedata
import urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "data/exonyms.json"
# A country's scan is expensive and the whole run is long. Each one is
# written as it finishes, so an interrupted harvest resumes instead of
# starting again.
CACHE = "data/.exonym-scan.json"
ENDPOINT = "https://qlever.dev/api/wikidata"
UA = "RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; exonyms)"
PAGE = 150000

# CITY DISTRICTS AS WELL AS SETTLEMENTS, but ranked below them.
# Mercato, Vicaria, Montecalvario, Pendino and Avvocata are quartieri of
# Naples carrying about 3,000 volumes between them, filed as though they
# were towns. Wikidata types them Q3927261, a subclass of "quarter of a
# city in Italy", which sits outside the Q486972 settlement tree entirely —
# so no amount of searching settlements would ever have found them.
# Q123705 (neighbourhood) is the general class and reaches all of them.
#
# Adding a class can LOSE placements as easily as gain them: a district
# sharing a town's name turns a name this harvest could resolve into an
# ambiguous one it must refuse. So the kind comes back with each row and a
# settlement always wins; a district is taken only when no settlement of
# that name exists.
CLASSES = [("Q486972", "settlement"), ("Q123705", "district")]

# Bump when the SPARQL changes shape. The cache already keys on the name list
# and the classes, and adding population to the query changed neither — so a
# stale cache would have supplied rows with no population, every tie would
# have been refused for want of a number that was never fetched, and the
# improvement would have looked like it simply did not work.
QUERY_VERSION = 2

Q = """
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?form ?canon ?coord ?pop WHERE {
  ?p wdt:P31/wdt:P279* wd:%s ;
     wdt:P17 ?c .
  ?c wdt:P297 "%s" .
  { ?p rdfs:label ?form } UNION { ?p skos:altLabel ?form }
  ?p rdfs:label ?canon . FILTER(LANG(?canon) = "en")
  OPTIONAL { ?p wdt:P625 ?coord }
  OPTIONAL { ?p wdt:P1082 ?pop }
}
LIMIT %d OFFSET %d
"""


# THE COUNTRY ON AN UNPLACED NAME IS THE COLLECTION'S, NOT THE GROUND'S.
# Ragogna, Moruzzo, Pocenia, Fagagna and 160 other Friulian villages are
# listed here under AT, because the books are filed in an Austrian
# collection — the Kuestenland, the Littoral, Habsburg ground that is Italy
# today. So this asked Austria for an Italian village 168 times and found
# nothing, while Wikidata answers "Moruzzo" with IT and a coordinate
# immediately. 32,579 books were stranded behind that one wrong assumption.
#
# The same ten historical filing groups the matcher uses. Searching a whole
# group is a licence to be wrong, so it is spent carefully: a name found in
# its own country wins outright, and a name found only abroad is accepted
# ONLY if the entire group offers exactly one place of that name. "Palma"
# in an Austrian collection stays unplaced, because it is Palmanova in
# Friuli and Palma de Mallorca and several more, and a wrong dot is worse
# than a missing one.
FILING_GROUPS = [
    set("AT HU CZ SK SI HR BA RO PL UA IT RS ME".split()),
    set("HR SI BA RS ME MK".split()),
    set("DE PL RU LT CZ DK".split()),
    set("RU UA BY LT LV EE PL MD GE AM AZ KZ FI".split()),
    set("TR GR BG RS MK AL BA RO ME CY".split()),
    set("SE NO DK FI IS".split()),
    set("NL BE LU FR DE".split()),
    set("ES PT".split()),
    set("GB IE IM".split()),
    set("FR IT CH AT DE".split()),
]


# HOW FAR A BOOK MAY PLAUSIBLY HAVE CROSSED.
# A filing group is a regional accident of history, not a licence to travel:
# the Habsburg lands, the Russian Empire, the Low Countries. Nothing in one
# is ten thousand kilometres from anything else in it.
#
# Without this, a Swiss collection's «Hane» resolved to Hane in the
# Marquesas Islands — which is genuinely in France by country code, and
# 15,000 km from Switzerland. The country-code test could never catch that,
# because the country code was right.
MAX_CROSSING_KM = 1500


def km(a_lat, a_lon, b_lat, b_lon):
    R, t = 6371.0, math.pi / 180
    dlat, dlon = (b_lat - a_lat) * t, (b_lon - a_lon) * t
    h = (math.sin(dlat / 2) ** 2
         + math.cos(a_lat * t) * math.cos(b_lat * t) * math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def country_boxes():
    """Rough extent per country, from the places this atlas already trusts."""
    try:
        g = json.load(open("data/gazetteer.json", encoding="utf-8"))
    except Exception:
        return {}
    G = g if isinstance(g, list) else g.get("places", list(g.values()))
    box = {}
    for r in G:
        if not isinstance(r, dict) or not r.get("k") or r.get("y") is None:
            continue
        b = box.setdefault(r["k"], [90.0, -90.0, 180.0, -180.0])
        b[0] = min(b[0], r["y"]); b[1] = max(b[1], r["y"])
        b[2] = min(b[2], r["x"]); b[3] = max(b[3], r["x"])
    return box


def far_from(box, cc, y, x):
    """Distance in km from a point to a country's extent; 0 if inside it."""
    b = box.get(cc)
    if not b:
        return 0.0
    cy = min(max(y, b[0]), b[1])
    cx = min(max(x, b[2]), b[3])
    return km(y, x, cy, cx)


def neighbours(cc):
    out = set()
    for g in FILING_GROUPS:
        if cc in g:
            out |= g
    return sorted(out - {cc})


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

    # Every form anybody is looking for, so a country's scan can throw away
    # the 99.9% of Wikidata that is not wanted before it costs any memory.
    want_all = set()
    for v in wanted.values():
        want_all |= set(v)

    # The countries worth asking: the ones with unplaced books, plus the
    # ones their books could historically have been filed across.
    ask_ccs = set(ccs)
    for cc in ccs:
        ask_ccs |= set(neighbours(cc))
    ask_ccs = sorted(ask_ccs)

    print(f"{len(ccs)} countries hold unplaced books; "
          f"{len(want_all):,} distinct names to look for")
    print(f"asking {len(ask_ccs)} countries, the filing groups included\n")

    # form -> cc -> list of {n,x,y}. One scan per country, kept only where
    # the form is one somebody is actually waiting on.
    seen_forms = collections.defaultdict(lambda: collections.defaultdict(list))
    done = {}
    if os.path.exists(CACHE):
        try:
            cached = json.load(open(CACHE))
            # The cache key includes the classes queried. Without that, adding
            # Q123705 would have been silently ignored on every machine that
            # already had a cache, and the quartieri would have stayed missing
            # with nothing to show why.
            if (set(cached.get("want", [])) == want_all
                    and cached.get("classes") == [c for c, _ in CLASSES]
                    and cached.get("query_version") == QUERY_VERSION):
                done = cached.get("by_cc", {})
                for cc_, rows in done.items():
                    for rec in rows:
                        seen_forms[rec["f"]][cc_].append(
                            {"n": rec["n"], "cc": cc_, "x": rec["x"], "y": rec["y"],
                             "kind": rec.get("kind", "settlement"),
                             "p": rec.get("p", 0)})
                print(f"resuming: {len(done)} countries already scanned\n")
            else:
                print("cache is for a different name list, starting over\n")
        except Exception:
            done = {}

    t0 = time.time()
    for i, cc in enumerate(ask_ccs, 1):
        if cc in done:
            print(f"  [{i}/{len(ask_ccs)}] {cc}  cached, {len(done[cc]):,} wanted")
            continue
        scanned, kept = 0, 0
        for cls, kind in CLASSES:
            offset = 0
            while True:
                rows = ask(Q % (cls, cc, PAGE, offset))
                if not rows:
                    break
                scanned += len(rows)
                for r in rows:
                    fm = fold(r["form"]["value"])
                    if fm not in want_all:
                        continue
                    m = POINT.search(r.get("coord", {}).get("value", "") or "")
                    if not m:
                        continue
                    try:
                        pop = int(float(r.get("pop", {}).get("value") or 0))
                    except (TypeError, ValueError):
                        pop = 0
                    rec = {"n": r["canon"]["value"], "cc": cc, "kind": kind,
                           "x": float(m.group(1)), "y": float(m.group(2)),
                           "p": pop}
                    bucket = seen_forms[fm][cc]
                    # The same place arrives once per label and alias, and
                    # again under a second class if it belongs to both.
                    if not any(abs(b["x"] - rec["x"]) < 0.01 and
                               abs(b["y"] - rec["y"]) < 0.01 for b in bucket):
                        bucket.append(rec)
                        kept += 1
                if len(rows) < PAGE:
                    break
                offset += PAGE
                time.sleep(1)
        done[cc] = [{"f": fm, "n": r["n"], "x": r["x"], "y": r["y"],
                     "kind": r.get("kind", "settlement"), "p": r.get("p", 0)}
                    for fm, per in seen_forms.items()
                    for r in per.get(cc, [])]
        tmp = CACHE + ".tmp"
        json.dump({"want": sorted(want_all),
                   "classes": [c for c, _ in CLASSES],
                   "query_version": QUERY_VERSION, "by_cc": done},
                  open(tmp, "w"), ensure_ascii=False)
        os.replace(tmp, CACHE)
        print(f"  [{i}/{len(ask_ccs)}] {cc}  {scanned:8,} forms scanned, "
              f"{kept:5,} wanted ({int(time.time() - t0)}s)", flush=True)

    # Resolve. Home country first; abroad only when the whole filing group
    # offers exactly one place of that name.
    def pick(cands, strict):
        """One place, or none.

        A settlement always beats a district. Districts are in this data only
        so that Naples' quartieri can be found; if a name is both a town and
        somebody's neighbourhood, the town is what a record means, and
        letting the neighbourhood make the name "ambiguous" would lose a
        placement this harvest used to make.

        WHERE TWO REAL TOWNS SHARE A NAME, `strict` decides.

        At home, no: prefer the decisively larger one. That is not a new
        licence, it is the rule the matcher has always used — its gazetteer
        index is sorted by population and it takes the first — so refusing
        here while the matcher decides there was inconsistent, and it was
        costing a large share of the 4,880 names this harvest gives up on.
        "Decisively" means at least three times the runner-up, so two towns
        of comparable size are still refused rather than settled by a coin
        toss.

        Abroad, yes, strictly: crossing a border on a guess is how Bale
        becomes Basel. Nothing but a single unambiguous candidate will do.
        """
        if not cands:
            return None, 0
        towns = [c for c in cands if c.get("kind", "settlement") == "settlement"]
        if len(towns) == 1:
            return towns[0], 0
        if towns:
            if strict:
                return None, 1
            ranked = sorted(towns, key=lambda c: -(c.get("p") or 0))
            top, next_ = ranked[0], ranked[1]
            if (top.get("p") or 0) > 0 and \
               (top.get("p") or 0) >= 3 * max(1, next_.get("p") or 0):
                return top, 0
            return None, 1
        districts = [c for c in cands if c.get("kind") == "district"]
        if len(districts) == 1:
            return districts[0], 0
        return None, 1

    boxes = country_boxes()
    found, home_n, abroad_n, district_n, ambiguous = {}, 0, 0, 0, 0
    for cc in ccs:
        for fm, books in wanted[cc].items():
            hit, amb = pick(seen_forms.get(fm, {}).get(cc, []), strict=False)
            if hit:
                found[cc + "|" + fm] = hit
                home_n += 1
                if hit.get("kind") == "district":
                    district_n += 1
                continue
            if amb:
                ambiguous += 1
                continue
            # Only candidates a book could plausibly have crossed to. A
            # filing group is a regional accident of history, not a licence
            # to travel: «Hane» in a Swiss collection resolved to Hane in
            # the Marquesas, which is France by country code and 15,000 km
            # from Switzerland.
            away = [r for nb in neighbours(cc)
                    for r in seen_forms.get(fm, {}).get(nb, [])
                    if far_from(boxes, cc, r["y"], r["x"]) <= MAX_CROSSING_KM]
            hit, amb = pick(away, strict=True)
            if hit:
                rec = dict(hit)
                rec["via"] = cc          # the collection it was filed under
                found[cc + "|" + fm] = rec
                abroad_n += 1
                if rec.get("kind") == "district":
                    district_n += 1
            elif amb or away:
                ambiguous += 1

    freed = sum(wanted[k.split("|", 1)[0]][k.split("|", 1)[1]] for k in found)
    json.dump({
        "source": "Wikidata: settlements (Q486972 and subclasses) with a "
                  "country, every label and alias.",
        "licence": "CC0.",
        "note": ("One row per NAME FORM this atlas failed on, resolved to "
                 "the settlement it belongs to. Demand-driven: Wikidata "
                 "holds 28.7 million settlement name-forms and this keeps "
                 "only the few thousand that were actually costing books. "
                 "A row carrying `via` was found not in the country its "
                 "collection is filed under but elsewhere in that country's "
                 "historical filing group, and only because the whole group "
                 "offered exactly one place of the name."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"forms": len(found), "home": home_n, "abroad": abroad_n,
                   "of_which_city_districts": district_n,
                   "ambiguous_left_unplaced": ambiguous, "books_freed": freed},
        "forms": found,
    }, open(OUT + ".tmp", "w"), ensure_ascii=False)
    # Renamed into place, like every other write here. A crash during the
    # final dump would otherwise leave data/exonyms.json truncated, and the
    # matcher reads it on every run.
    os.replace(OUT + ".tmp", OUT)
    print(f"\n{len(found):,} name forms resolved "
          f"({home_n:,} at home, {abroad_n:,} across a border, "
          f"{district_n:,} of them city districts), "
          f"{ambiguous:,} left unplaced as ambiguous")
    print(f"{freed:,} books freed -> {OUT}")


if __name__ == "__main__":
    main()

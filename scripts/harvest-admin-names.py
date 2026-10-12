#!/usr/bin/env python3
"""What a province is called in its own language — and the ones that no longer exist.

THE WHOLE GEOGRAPHIC BACKBONE WAS KEYED IN ENGLISH, and that is a bug, not a
preference. data/admin-divisions.json holds 20,841 divisions under GeoNames'
own names, which are English: «Tuscany», never «Toscana». FamilySearch's tree
names a province the way the archive that holds the books names it, which is
«Toscana» — so 1,001 Tuscan volumes asked for an area this atlas holds and
were told it does not exist. «Antwerpen» missed «Antwerp». «Bács-Bodrog»,
«Szabolcs», «Jász-Nagy-Kun-Szolnok» missed everything, for a second reason:
they are counties of a kingdom that ended in 1920 and GeoNames only lists what
exists now.

So two harvests, one query each per country:

  ALIASES for a division this atlas already holds — every label and alias
  Wikidata carries for it in the country's own language. Joined on the point,
  not the name, because the name is the thing that is missing.

DIVISIONS THAT ENDED WERE TRIED AND REFUSED, and that is worth writing down
because the need is real. «Szabolcs», «Bács-Bodrog», «Тверь», «Бессарабия» are
counties of a kingdom that ended in 1920 and governorates of an empire that
ended in 1917, the books are filed under them, and GeoNames lists only what
exists now. Wikidata's «former administrative territorial entity» (Q19953632)
looked like the answer and is not: its subtree returned 1,139 rows for Italy
and Hungary of which most are not divisions at all — merged comuni (Zambana,
Bolbeno), archaeological sites (Amiternum, Savaria), the Roman Republic, and
the Caliphate of Córdoba filed under Italy because one of its coordinates
falls there. One row offered a tram company as an alias of a village.

A bad row is worse than a missing one: it would put a dot somewhere no record
was ever kept and this atlas would assert it. Historical divisions need a
whitelist of actual classes — county of the Kingdom of Hungary, governorate of
the Russian Empire — which is its own careful job, not a filter bolted onto
this one.

WHAT THIS DELIBERATELY DOES NOT DO: promote a town. An area gets an area —
the matcher's admin-division path, which says «province» on the dot it draws
and does not pretend the provincial capital holds the province's records.
That refusal is the Aargau lesson and this harvest is built to respect it.

    python3 scripts/harvest-admin-names.py            # the world
    python3 scripts/harvest-admin-names.py --cc IT,HU # two countries
"""
import argparse, json, math, os, re, sys, time, unicodedata
import urllib.error, urllib.parse, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SRC = "data/admin-divisions.json"
OUT = "data/admin-names.json"
UA = ("RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap; "
      "administrative-division names in their own language)")
CACHE = "/tmp/record-atlas-adminnames"

# The country's own language, which is the language its archives file in.
# Imported rather than retyped: match-via-wikipedia.py built this table over
# two passes and 156 countries, and a second copy would drift from it.
try:
    from importlib.machinery import SourceFileLoader
    LANG = SourceFileLoader(
        "_mvw", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "match-via-wikipedia.py")).load_module().LANG
except Exception:
    LANG = {}

# A LEVEL, NOT A SETTLEMENT. Q56061 would bring Italy's eight thousand comuni,
# which are towns wearing an administrative hat; these two classes are the
# province and the region and nothing below them.
LEVELS = "wd:Q10864048 wd:Q13220204"

Q_ALIAS = """
SELECT ?x ?en ?loc ?alt ?coord WHERE {
  ?country wdt:P297 "__CC__" .
  ?x wdt:P17 ?country ; wdt:P625 ?coord ;
     wdt:P31/wdt:P279* ?lvl .
  VALUES ?lvl { __LEVELS__ }
  OPTIONAL { ?x rdfs:label ?en  FILTER(lang(?en)  = "en") }
  OPTIONAL { ?x rdfs:label ?loc FILTER(lang(?loc) = "__LG__") }
  OPTIONAL { ?x skos:altLabel ?alt FILTER(lang(?alt) = "__LG__" || lang(?alt) = "en") }
}
"""



# A SECOND QUERY FOR THE COUNTRIES THE FIRST ONE CANNOT ANSWER. Germany,
# France and India all came back 504 Gateway Timeout, and the size of the
# country was not the reason — «wdt:P31/wdt:P279*» walks the class tree for
# every candidate item, and in a country with four hundred districts that walk
# is the whole cost. Asking the hierarchy DOWNWARD instead is one indexed
# property and no reasoning at all: P150 is «contains the administrative
# territorial entity», so the country's P150 is its first level and P150/P150
# its second. Germany answers in four seconds.
#
# KEPT AS A FALLBACK RATHER THAN THE ONLY QUERY, because ninety-one countries
# had already answered the first one correctly and P150 is editorially
# maintained — a country whose P150 nobody has filled in would quietly return
# nothing, and silently losing a country is worse than a slow query. The class
# walk is tried first and this runs only where it times out.
Q_CONTAINS = """
SELECT ?x ?en ?loc ?alt ?coord WHERE {
  ?country wdt:P297 "__CC__" .
  { ?country wdt:P150 ?x } UNION { ?country wdt:P150/wdt:P150 ?x }
  ?x wdt:P625 ?coord .
  OPTIONAL { ?x rdfs:label ?en  FILTER(lang(?en)  = "en") }
  OPTIONAL { ?x rdfs:label ?loc FILTER(lang(?loc) = "__LG__") }
  OPTIONAL { ?x skos:altLabel ?alt FILTER(lang(?alt) = "__LG__" || lang(?alt) = "en") }
}
"""


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


# THE KIND IS NOT THE NAME. GeoNames writes «Provincia di Frosinone» and
# «Szabolcs-Szatmár-Bereg»; Wikidata writes «Frosinone» and
# «Szabolcs-Szatmár-Bereg County». The same division, spelt with and without
# the word for what it is, and comparing the whole strings fails on both.
KIND = {
    "provincia", "provincie", "province", "provins", "prowincja", "provinz",
    "county", "counties", "megye", "varmegye", "comitatus", "comitat",
    "kraj", "okres", "powiat", "wojewodztwo", "voivodeship", "jaras",
    "oblast", "raion", "rajon", "gubernia", "guberniya", "uyezd", "uezd",
    "region", "regione", "regiune", "regio", "departement", "department",
    "district", "distretto", "distrito", "bezirk", "kreis", "landkreis",
    "amt", "lan", "herred", "fylke", "canton", "kanton", "prefecture",
    "arrondissement", "comune", "municipality", "autonoma", "autonomous",
    "metropolitan", "administrative", "unit", "territory", "statutory",
    # the joining words every one of those names is strung together with
    "di", "de", "del", "della", "dello", "du", "des", "da", "do", "of",
    "the", "la", "le", "les", "el", "i", "y", "e", "and", "in", "an", "am",
}


# TAKING THE KIND OUT OF BOTH NAMES MAKES TWO LEVELS LOOK ALIKE, which is the
# cost of the rule above and has to be paid back here. «Okres Karlovy Vary» is
# a district and «Karlovarský kraj» is the region around it; strip okres and
# kraj and both read {karlovy, vary}, so the district took the region's names.
# A district is not a region and its records are not the region's records.
#
# So the kind is removed from the comparison but not forgotten: where both
# names say what level they are and the two levels disagree, there is no join.
# Where only one of them says — «Szabolcs-Szatmár-Bereg» against
# «Szabolcs-Szatmár-Bereg County» — there is nothing to disagree with.
WIDE = {"kraj", "region", "regione", "regiune", "regio", "oblast", "gubernia",
        "guberniya", "lan", "fylke", "provincia", "provincie", "province",
        "provins", "provinz", "prowincja", "wojewodztwo", "voivodeship",
        "county", "counties", "megye", "varmegye", "comitatus", "comitat",
        "departement", "department", "canton", "kanton", "prefecture", "land"}
NARROW = {"okres", "powiat", "jaras", "district", "distretto", "distrito",
          "arrondissement", "uyezd", "uezd", "bezirk", "kreis", "landkreis",
          "herred", "raion", "rajon", "amt", "comune", "municipality"}
# A NAME, NOT A CODE. Wikidata's alias list carries NUTS codes («NUTS:AT34»),
# ISO 3166-2 codes («AT-7», «DE-HH», «SE-K», «DEU-MV») and library authority
# headings («Karlovarský kraj (Česko : 2000-).»). None of them is a name
# anybody's certificate says, and «SE-K» is four characters, which is exactly
# the shape that collides with something.
#
# Informal names are KEPT — «Oberbayern» arrives beside «MeckPomm», «The
# Länd», «Подмосковье» and «Третий Рим». They are real things people call
# these places, which is what an alias list is for, and the index they go into
# refuses a name that is already answered by a different division.
CODEISH = re.compile(r"\d|[:()\[\]]|^[A-Z]{2,5}$|^[A-Z]{2,3}-[A-Z0-9]{1,3}$")


def core(s):
    """A name with the word for what it is taken out of it."""
    return frozenset(t for t in re.split(r"[^a-z0-9]+", fold(s))
                     if t and t not in KIND)


def level(s):
    """Wide, narrow, or silent on the question."""
    t = set(re.split(r"[^a-z0-9]+", fold(s)))
    return ("wide" if t & WIDE else None), ("narrow" if t & NARROW else None)


def levels_agree(a, b):
    aw, an = level(a)
    bw, bn = level(b)
    if (aw and bn and not bw) or (an and bw and not aw):
        return False
    return True


def km(a, b, c, d):
    p = math.pi / 180
    return 6371 * math.acos(min(1.0, max(-1.0,
        math.sin(a * p) * math.sin(c * p) +
        math.cos(a * p) * math.cos(c * p) * math.cos((d - b) * p))))


def sparql(q, tries=3):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
        {"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "application/sparql-results+json"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.loads(r.read().decode())["results"]["bindings"]
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(15 * (i + 1))


def ask(cc, kind):
    """One country, one query, cached — the service is a shared resource."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{cc}-{kind}.json")
    if os.path.exists(path):
        return json.load(open(path))
    lg = LANG.get(cc, "en")
    def _q(tpl):
        return tpl.replace("__CC__", cc).replace("__LG__", lg) \
                  .replace("__LEVELS__", LEVELS)
    try:
        rows = sparql(_q(Q_ALIAS))
    except urllib.error.HTTPError as e:
        if e.code not in (500, 502, 503, 504):
            raise
        print(f"  {cc}  the class walk timed out — asking the hierarchy instead")
        rows = sparql(_q(Q_CONTAINS))
    out = {}
    for r in rows:
        qid = r["x"]["value"].rsplit("/", 1)[-1]
        rec = out.setdefault(qid, {"qid": qid, "en": None, "names": [],
                                   "lat": None, "lon": None})
        if r.get("en") and not rec["en"]:
            rec["en"] = r["en"]["value"]
        for k in ("loc", "alt"):
            if r.get(k):
                v = r[k]["value"].strip()
                if v and v not in rec["names"]:
                    rec["names"].append(v)
        if r.get("coord") and rec["lat"] is None:
            m = r["coord"]["value"]              # Point(lon lat)
            try:
                lon, lat = m[m.index("(") + 1:m.index(")")].split()
                rec["lat"], rec["lon"] = round(float(lat), 4), round(float(lon), 4)
            except Exception:
                pass
    with open(path, "w") as f:
        json.dump(out, f)
    time.sleep(1.0)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cc", default="")
    ap.add_argument("--write", action="store_true",
                    help="write data/admin-names.json (default is a dry run)")
    a = ap.parse_args()

    divs = json.load(open(SRC))["divisions"]
    by_cc = {}
    for d in divs:
        by_cc.setdefault(d["cc"], []).append(d)
    ccs = [c.strip().upper() for c in a.cc.split(",") if c.strip()] \
        if a.cc else sorted(by_cc)

    aliases = {}
    gained = 0
    print(f"{len(ccs)} countries, {sum(len(by_cc.get(c, [])) for c in ccs):,} "
          f"divisions already held\n")
    for i, cc in enumerate(ccs, 1):
        mine = by_cc.get(cc) or []
        try:
            al = ask(cc, "alias")
        except Exception as e:
            print(f"  {cc}  refused: {type(e).__name__}")
            continue

        # THE POINT SCOPES IT, THE ENGLISH NAME PROVES IT IS THE SAME THING.
        #
        # The point alone is not enough, and a loose radius showed why: at
        # 60 km the «Prince-Bishopric of Trent» and the «Apostolic Delegation
        # of Orvieto» both snapped onto the nearest modern province and lent
        # it their names. They are instances of a class that is a subclass of
        # a second-level division, so the query admitted them honestly; they
        # are simply not the province.
        #
        # So both tests. The point rules out a name shared by two provinces in
        # one country; the English label rules out a different entity sitting
        # near the same point. Neither test uses the LOCAL name, which is the
        # thing being added, so this does not quietly assume its answer.
        #
        # THE NAMES ARE COMPARED WITHOUT THE WORD FOR WHAT THEY ARE, because a
        # string test on the whole label was wrong in both directions at once:
        # it refused «Szabolcs-Szatmár-Bereg» ~ «Szabolcs-Szatmár-Bereg
        # County», which is one county written twice, and a similarity
        # threshold loose enough to admit it also admitted «Provincia di
        # Frosinone» ~ «Apostolic Delegation of Frosinone», which is a
        # province and a nineteenth-century papal district. Measured across
        # Italy and Hungary, no threshold separates them — the right and wrong
        # answers interleave from 0.86 down to 0.21.
        #
        # Comparing the names with their kind words removed does separate
        # them: {szabolcs, szatmar, bereg} is {szabolcs, szatmar, bereg}, and
        # {frosinone} is not {apostolic, delegation, frosinone}. It costs
        # «Trentino-Alto Adige» ~ «Trentino-South Tyrol», which is a genuine
        # pair of English names for one region and costs nothing: the division
        # is already called Trentino-Alto Adige, which is what an Italian
        # archive files it under.
        hit = 0
        for rec in al.values():
            if rec["lat"] is None or not rec["names"] or not rec["en"]:
                continue
            best, bd = None, 25.0
            for d in mine:
                if core(d["name"]) != core(rec["en"]) or not core(rec["en"]):
                    continue
                if not levels_agree(d["name"], rec["en"]):
                    continue
                dd = km(rec["lat"], rec["lon"], d["lat"], d["lon"])
                if dd < bd:
                    best, bd = d, dd
            if not best:
                continue
            have = {fold(best["name"])}
            add = [n for n in rec["names"]
                   if fold(n) not in have and len(fold(n)) > 2
                   and not CODEISH.search(n)]
            if not add:
                continue
            cur = aliases.setdefault(best["key"], [])
            for n in add:
                if fold(n) not in {fold(x) for x in cur}:
                    cur.append(n)
            hit += 1
        gained += hit

        if hit:
            print(f"  {cc}  {hit:>4} divisions gained a name of their own   "
                  f"[{i}/{len(ccs)}]")

    print(f"\n  {gained:,} of {sum(len(by_cc.get(c, [])) for c in ccs):,} "
          f"divisions now answer to their own language")
    print(f"  {sum(len(v) for v in aliases.values()):,} names added")
    if not a.write:
        print("\n  dry run — pass --write to save")
        return
    with open(OUT, "w") as f:
        json.dump({
            "source": "Wikidata (CC0), via query.wikidata.org",
            "licence": "CC0",
            "note": ("What a province is called in its own language, and the "
                     "provinces that no longer exist. GeoNames names every "
                     "division in English, FamilySearch files them in the "
                     "language of the archive, and the gap between those two "
                     "is why «Toscana» could not find «Tuscany». Aliases are "
                     "joined to a held division BY ITS POINT, never by name, "
                     "because the name is the thing that is missing. Former "
                     "A division that no longer exists is NOT in here — see "
                     "the script, which tried and refused."),
            "counts": {"divisionsWithOwnName": gained,
                       "namesAdded": sum(len(v) for v in aliases.values()),
                       "countries": len([c for c in ccs if by_cc.get(c)])},
            "aliases": aliases,
        }, f, ensure_ascii=False, indent=1)
    print(f"  -> {OUT}")


if __name__ == "__main__":
    main()

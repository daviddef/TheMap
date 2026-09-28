#!/usr/bin/env python3
"""Publish site/public/eras.json — what this atlas holds, per polity per period.

THE CONTRACT BETWEEN TWO SITES THAT DO NOT SCRAPE EACH OTHER.

Flag History (daviddef.github.io/Flag-History) holds 1,471 era cards across 210
countries: who governed this ground, when, and the flag they flew. Record Atlas
holds 41 regions with 230 researched eras, and — the part nobody else publishes —
`filedUnder`, which archive a regime's paper actually went to.

David asked for both directions. This is the one they both need: a file their
flag pages can fetch to show the RECORDS for each period on their timeline,
without either side parsing the other's HTML. Their era data stays theirs, ours
stays ours, and neither build breaks when the other changes its markup.

WHY NOT SCRAPE THEM INSTEAD. Their pages carry no JSON; `card-dates` is a
display string like "1949 – 1990" or "990 – present" with no structured end
year, so consuming it means parsing a date out of prose on every build, and a
wording change on their side would give us wrong dates rather than no dates.
docs/flag-history-integration.md has the full argument. It would also be a
fourth copy of the sort of duplicated rule build.py already carries a scar from.

THE DENOMINATOR IS NOT OPTIONAL. Ninety per cent of this atlas is `unsurveyed`:
19,416 of 21,473 places are correctly placed ground nobody has walked. A card
headed «Records for this period» over a bare count would promise holdings that
do not exist for most of the world. So every row carries `places` AND `surveyed`
AND `unsurveyed`, and the note in the file asks consumers to render the shape
"34 places on this ground, 6 surveyed". A cross-link that oversells is worse
than no cross-link, because the one thing this directory sells is that a row can
be trusted.

VOLUME TITLES ARE EXCLUDED ON PURPOSE. They are FamilySearch's catalogue
metadata, not this project's writing, and not open. Counts are ours; titles are
not, so titles do not travel.

    python3 scripts/build-eras.py
"""
import collections, json, os, sys
from importlib.machinery import SourceFileLoader

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
geo = SourceFileLoader("_geo", "scripts/geo.py").load_module()

OUT = "site/public/eras.json"
# THE ORIGIN IS NOT OURS TO HARD-CODE, AND THIS FEED IS READ FROM ONE PLACE.
# eras.json used to carry 1,644 absolute URLs naming daviddef.github.io. Its
# only consumer is the 197 flag pages, every one of which lives at
# <site>/flags/<country>-flags.html — so «..» is the site root for all of
# them, on the old origin, on recordatlas.org when the cutover lands, and in
# a local preview on any port. (The Astro pages read flag-eras.json, a
# different file, and build their own URLs with u().)
BASE = ".."
FLAGS = "https://daviddef.github.io/Flag-History"

# Their pages are <slug>-flags.html, lowercase and hyphenated. We hold ISO2, so
# the map has to exist somewhere; it lives here rather than in the JSON so that
# a country we cannot name does not silently become a broken link.
SLUG = {
    "AR": "argentina", "AT": "austria", "AU": "australia", "BA": "bosnia-and-herzegovina",
    "BE": "belgium", "BY": "belarus", "CA": "canada", "CZ": "czechia",
    "DE": "germany", "DK": "denmark", "EE": "estonia", "FI": "finland",
    "FR": "france", "GB": "united-kingdom", "HR": "croatia", "HU": "hungary",
    "IE": "ireland", "IT": "italy", "LT": "lithuania", "LV": "latvia",
    "NL": "netherlands", "NO": "norway", "PL": "poland", "PT": "portugal",
    "RO": "romania", "RS": "serbia", "RU": "russia", "SE": "sweden",
    "SI": "slovenia", "SK": "slovakia", "UA": "ukraine", "US": "united-states",
    "ZA": "south-africa",
}

SURVEYED = {"free", "account", "index", "mixed", "paid", "catalogue", "onsite"}


def main():
    idx = json.load(open("site/public/index.json"))
    regions = json.load(open("site/public/regions.json"))
    places = idx["places"]
    ranks = idx["rank"]

    # The quiet half is real ground and belongs in these counts; leaving it out
    # would undercount every region by the places nobody has walked, which are
    # exactly the ones a reader most needs told about.
    try:
        places = places + json.load(open("site/public/index-quiet.json"))["places"]
    except FileNotFoundError:
        pass

    def access_of(p):
        a = p.get("a")
        if isinstance(a, int) and 0 <= a < len(ranks):
            return ranks[a]
        return a if isinstance(a, str) else "unsurveyed"

    # ---- which places sit inside which region ------------------------------
    # The rings are deliberately approximate — they shade a filing system, they
    # do not adjudicate a border — so a place near an edge may fall in two, and
    # that is correct rather than a bug to resolve.
    inside = collections.defaultdict(list)
    for r in regions["regions"]:
        ring = r["ring"]
        for p in places:
            if geo.in_ring_latlon(p["y"], p["x"], ring):
                inside[r["id"]].append(p)

    rows = []
    for r in regions["regions"]:
        ps = inside[r["id"]]
        surveyed = [p for p in ps if access_of(p) in SURVEYED]
        vols = sum(p.get("v") or 0 for p in ps)
        cols = sum(p.get("c") or 0 for p in ps)
        for e in r["eras"]:
            # A place answers for an era when its own year span overlaps it. A
            # place with no span is counted in `places` but not in `answering`:
            # it is on the ground, and whether its books cover these years is
            # not known, which is a different claim.
            answering = 0
            for p in ps:
                s = p.get("s")
                if s and s[0] <= (e.get("to") or 9999) and (s[1] or 9999) >= e["from"]:
                    answering += 1
            for cc in (r.get("countries") or []):
                rows.append(dict(
                    cc=cc, region=r["id"], regionLabel=r["label"],
                    **{"from": e["from"], "to": e.get("to")},
                    regime=e.get("regime"), polity=e.get("polity"),
                    filedUnder=e.get("filedUnder") or [],
                    places=len(ps), surveyed=len(surveyed),
                    unsurveyed=len(ps) - len(surveyed),
                    answeringThisPeriod=answering,
                    volumes=vols, collections=cols,
                    note=e.get("note"),
                    map=f"{BASE}/?year={e['from']}",
                    region_page=f"{BASE}/region/{r['id']}/",
                    # NO ANCHOR, DELIBERATELY. Their ids are #era-<startyear>
                    # keyed on the year a FLAG changed; ours is the year a
                    # FILING system changed. Croatia's page has 18 anchors and
                    # era-1374 is not one of them, so emitting «#era-1374» would
                    # have produced a link that silently lands at the top of the
                    # page and looks like it worked. The year is data; resolving
                    # it to one of their anchors is the consumer's job, because
                    # only they hold the list. See `matching` in this file.
                    flags=(f"{FLAGS}/{SLUG[cc]}-flags.html" if cc in SLUG else None),
                    flagsEraHint=e["from"],
                ))

    # ---- the countries with no region, so a flag page still gets an answer --
    covered = {cc for r in regions["regions"] for cc in (r.get("countries") or [])}
    bycc = collections.defaultdict(list)
    for p in places:
        if p.get("cc"):
            bycc[p["cc"]].append(p)
    country_rows = []
    # EVERY COUNTRY THE ATLAS NAMES, not only those that happen to have a place
    # carrying a cc. The first cut iterated the places and produced 68 rows for
    # 204 uncovered countries, so a flag page for two thirds of the world would
    # have fetched this file and found nothing — which reads as «the atlas has
    # never heard of us» rather than «the atlas has no place here yet». The
    # second is true and is the more useful thing to be told.
    for cc in sorted(idx["countries"]):
        if cc in covered:
            continue
        ps = bycc.get(cc, [])
        surveyed = [p for p in ps if access_of(p) in SURVEYED]
        country_rows.append(dict(
            cc=cc, name=idx["countries"][cc], region=None,
            places=len(ps), surveyed=len(surveyed),
            unsurveyed=len(ps) - len(surveyed),
            volumes=sum(p.get("v") or 0 for p in ps),
            collections=sum(p.get("c") or 0 for p in ps),
            map=f"{BASE}/country/{cc.lower()}/",
        ))

    out = {
        "note": ("What Record Atlas holds, per polity per period, for anyone "
                 "showing a historical timeline. `eras` is joined on our own "
                 "region — sub-national, which is the grain a border question "
                 "actually has — and `countries` is the fallback where we have "
                 "no region."),
        "howToRender": ("ALWAYS SHOW THE DENOMINATOR. Ninety per cent of this "
                        "atlas is unsurveyed: correctly placed ground nobody "
                        "has walked. Render «34 places on this ground, 6 "
                        "surveyed», never «34 places of records». "
                        "`answeringThisPeriod` is the honest count for one era: "
                        "places whose own year span overlaps it."),
        "matching": ("Our `from` is the year a FILING system changed; a flag "
                     "timeline's is the year a flag changed. They will often "
                     "disagree and neither is wrong. Match nearest-preceding-"
                     "or-equal, never exact."),
        "rings": ("Region rings are approximate by design — they shade which "
                  "filing system a place fell under, they do not adjudicate a "
                  "border. A place near an edge may count in two regions."),
        "licences": {
            "this file": "CC BY 4.0 — credit Record Atlas and link to it.",
            "the counts": ("Derived from data under several licences. Crediting "
                           "Record Atlas covers this file; if you reuse the "
                           "underlying rows, see /TheMap/data/ for the licence "
                           "of each source — OpenStreetMap is ODbL, GeoNames "
                           "and Statbel and Istat are CC BY, the National "
                           "Records of Scotland is OGL."),
            "excluded": ("Volume TITLES are FamilySearch catalogue metadata and "
                         "not open, so they are deliberately absent from this "
                         "file. The counts are ours; the titles are not."),
        },
        "built": __import__("time").strftime("%Y-%m-%d"),
        "counts": {"eras": len(rows), "countriesWithARegion": len(covered),
                   "countriesFallbackOnly": len(country_rows)},
        "eras": rows,
        "countries": country_rows,
    }
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    kb = os.path.getsize(OUT) / 1024
    print(f"{len(rows):,} era rows over {len(covered)} countries, "
          f"{len(country_rows)} fallback countries -> {OUT} ({kb:.0f} KB)")
    linked = sum(1 for r in rows if r["flags"])
    print(f"  {linked:,} rows carry a Flag History link "
          f"({len(rows) - linked:,} have no slug for their country)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

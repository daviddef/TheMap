#!/usr/bin/env python3
"""Draw the places the collections already name.

THE MAP LOOKED LIKE A MAP OF CROATIA AND DAVID ASKED WHY. The answer was a gap
in this project rather than in the world.

The shelf — the dots — had only ever been fed from two places: the Defranceski
archive's 1,239 walked Croatian parishes, and 231 places lifted out of the six
sibling archives. Everything harvested since attached somewhere else entirely.
FamilySearch's 3,488 collections were attached to COUNTRIES. Antenati's 119
archives went on the institutions layer. The gazetteer's 45,985 places are a
search corpus and are never drawn. So three large harvests went by and the
shelf did not move.

Meanwhile the collections themselves carry 970 distinct sub-country places —
Naples, Somerset, Vermont, Rosario — each with coordinates, each resolved
against FamilySearch's own place authority. This map had them all along and
used them only to sort a list by distance.

A COLLECTION CATALOGUED UNDER A TOWN IS A SHELF ENTRY. That is the whole
argument. «Italy, Napoli, Civil Registration (State Archive), 1809-1866» filed
under Naples is not a vague claim over Italy; it is a statement that there are
registers for Naples and here is where they are. A collection filed under
«Italy» is not, and stays a country-level fact.

    python3 scripts/promote-collection-places.py
"""
import json, os, re, sys, unicodedata, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
from geo import country_of, in_ring_latlon, km_to

XLAT = str.maketrans({"đ": "d", "ł": "l", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe"})


def fold(s):
    s = (s or "").translate(XLAT)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-")[:60]


# A place a reader could actually go to and ask for a record.
#
# The first cut allowed only towns, which threw away the level that matters
# most in two of the biggest record traditions on this map: an AMERICAN county
# courthouse holds the deeds, wills and marriages, and an ENGLISH county record
# office holds the parish registers. «England, Somerset, Church Records,
# 1501-1999» is filed under Somerset because Somerset is where the books are.
#
# A STATE, a REGION or a COUNTRY is a filing category rather than a destination,
# and drawing one would drop a marker in a field in the middle of Texas and
# call it a record office. Those stay country-level facts.
TOWN = {"CITY", "TOWN", "COMMUNE", "HAMLET", "VILLAGE", "PARISH", "MUNICIPALITY",
        "BOROUGH", "SUBURB", "CIVIL_PARISH", "TOWNSHIP"}
AREA = {"COUNTY", "BR_COUNTY", "PROVINCE", "DEPARTMENT", "DISTRICT", "SHIRE",
        "CANTON", "PREFECTURE", "OBLAST", "COMARCA"}
LOCAL = TOWN | AREA


def main():
    cols = json.load(open("data/collections.json"))["collections"]
    regions = json.load(open("data/regions.json"))["regions"]
    doc = json.load(open("data/places.json"))
    by_id = {p["id"]: p for p in doc["places"]}

    try:
        PIN = json.load(open("data/place-overrides.json"))["overrides"]
    except FileNotFoundError:
        PIN = {}

    # Gather the collections filed under each local place.
    at = {}
    for c in cols:
        for p in c["places"]:
            if p.get("lat") is None or p.get("type") not in LOCAL:
                continue
            key = (p["name"], round(p["lat"], 4), round(p["lon"], 4))
            at.setdefault(key, {"short": p.get("short") or p["name"],
                                "cc": (p.get("cc") or [None])[0],
                                "level": "town" if p["type"] in TOWN else "area",
                                "type": p["type"],
                                "cols": []})["cols"].append(c)

    added, enriched, skipped = 0, 0, 0
    for (full, lat, lon), v in sorted(at.items()):
        name = v["short"]
        pid = slug(name)
        if not pid:
            continue
        if pid in by_id:
            enriched += 1
            continue                      # already walked; its own volumes are better

        # WHERE IT IS, versus WHERE IT IS FILED. FamilySearch names the country
        # it catalogues under, which for Posen is Germany and for Viipuri is
        # Finland — true of 1900 and not of the ground. The outline says where
        # the ground actually is. When they disagree, the distance decides:
        # within 25 km and it is the outline being coarse (El Paso is metres
        # from Mexico); further and the source is filing historically, which is
        # worth recording rather than correcting away.
        src, geo = v["cc"], country_of(lat, lon)
        cc, filed = src or geo, None
        if src and geo and src != geo:
            edge = km_to(lat, lon, src)
            if edge is not None and edge < 25:
                cc = src                      # a border town, and the source is right
            else:
                cc, filed = geo, src          # the ground moved; say both
        cc = PIN.get(pid, {}).get("country") or cc
        if not cc:
            skipped += 1
            continue

        region = None
        for r in regions:
            if in_ring_latlon(lat, lon, r["ring"]):
                region = r["id"]
                break

        vols = []
        for c in v["cols"]:
            vols.append({
                "provider": "familysearch",
                "title": c["title"],
                "kinds": [],
                "from": c.get("from"), "to": c.get("to"),
                "access": "account",
                "url": c["url"],
                "note": f"A FamilySearch collection catalogued under {name}. "
                        f"{(c.get('records') or 0):,} indexed records.",
            })

        rec = {"id": pid, "name": name, "country": cc,
               "lat": round(lat, 5), "lon": round(lon, 5),
               "collections": vols, "via": "familysearch-catalogue"}
        if filed:
            rec["filedUnder"] = filed
        if v["level"] == "area":
            # Say so. The coordinate is the centroid of a county, not the door
            # of a building, and a reader deserves to know which they are
            # looking at before they plan a journey.
            rec["level"] = v["type"].replace("BR_", "").lower()
        if full != name:
            rec["names"] = [{"n": full, "kind": "alt"}]
        if region:
            rec["region"] = region
        by_id[pid] = rec
        added += 1

    doc["places"] = sorted(by_id.values(), key=lambda x: x["name"])
    # The note is NOT appended to. Every importer used to add its sentence on
    # every run, and after six runs data/places.json opened with the same three
    # sentences seven times over. The note is written once, by hand, and says
    # what all four importers do; see the top of data/places.json.
    json.dump(doc, open("data/places.json", "w"), ensure_ascii=False, indent=1)

    cnt = collections.Counter(p.get("country") for p in doc["places"])
    moved = [p for p in doc["places"] if p.get("filedUnder")]
    if moved:
        print(f"\n{len(moved)} places are filed under a country that no longer holds them:")
        for p in moved[:12]:
            print(f"   {p['name']:24} is in {p['country']}, filed under {p['filedUnder']}")
    lv = collections.Counter(p.get("level", "town") for p in doc["places"]
                             if p.get("via") == "familysearch-catalogue")
    print(f"{added} places added ({dict(lv)}), {enriched} already walked, "
          f"{skipped} unplaceable")
    print(f"{len(doc['places'])} places in all")
    print("  " + " · ".join(f"{k}:{n}" for k, n in cnt.most_common(14)))
    hr = cnt.get("HR", 0)
    print(f"\nCroatia is now {100*hr/len(doc['places']):.0f}% of the shelf "
          f"(was {100*1147/1470:.0f}%)")


if __name__ == "__main__":
    main()

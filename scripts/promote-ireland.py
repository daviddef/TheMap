#!/usr/bin/env python3
"""Put Ireland's civil parishes on the shelf.

A CIVIL PARISH IS NOT A CURIOSITY, IT IS THE IRISH FILING UNIT. Griffith's
Valuation is arranged by it. So are the Tithe Applotment books, the registration
districts and what survives of the censuses. The administrative backbone this
atlas drew from GeoNames gave Ireland its 26 counties and nothing narrower,
because GeoNames has no second level for Ireland worth the name — and a county
is far too coarse for a country whose records were kept parish by parish.

2,463 of them go on the map, each carrying both the English and the Irish form
of its name, because half of Irish research is the same place written two ways.

    python3 scripts/promote-ireland.py
"""
import json, os, re, sys, math, unicodedata, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
from geo import in_ring_latlon, country_of

XLAT = str.maketrans({"đ": "d", "ł": "l", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe"})


def fold(s):
    s = (s or "").translate(XLAT)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-")[:60]


def km(a, b, c, d):
    p = math.pi / 180
    return 12742 * math.asin(math.sqrt(
        0.5 - math.cos((c - a) * p) / 2
        + math.cos(a * p) * math.cos(c * p) * (1 - math.cos((d - b) * p)) / 2))


def main():
    ie = json.load(open("data/ireland-osm.json"))
    doc = json.load(open("data/places.json"))
    by_id = {p["id"]: p for p in doc["places"]}
    here = collections.defaultdict(list)
    for p in doc["places"]:
        here[(p.get("country"), fold(p["name"]))].append(p)
    before = len(doc["places"])

    added, enriched, skipped = 0, 0, 0
    for cp in ie["civilParishes"]:
        # The border runs through this data. A parish in Fermanagh is in the
        # United Kingdom and a parish in Cavan is in Ireland, and the outline
        # is the only thing here that knows which — the source names a county
        # and a county is not a sovereignty.
        cc = country_of(cp["y"], cp["x"]) or "IE"
        fn = fold(cp["n"])

        twin = None
        for p in here.get((cc, fn), []):
            if km(p["lat"], p["lon"], cp["y"], cp["x"]) < 25:
                twin = p
                break
        if twin is not None:
            for alt in cp.get("a", []):
                if not any(fold(x["n"]) == fold(alt) for x in twin.setdefault("names", [])):
                    twin["names"].append({"n": alt, "kind": "alt"})
            enriched += 1
            continue

        pid = slug(f"{cp['n']}-{cp['co']}") if slug(cp["n"]) in by_id else slug(cp["n"])
        if not pid or pid in by_id:
            pid = slug(f"{cp['n']}-{cp['co']}-cp")
            if pid in by_id:
                skipped += 1
                continue

        rec = {"id": pid, "name": cp["n"], "country": cc,
               "lat": cp["y"], "lon": cp["x"],
               "collections": [], "via": "townlands-ie", "level": "civil parish",
               "admin": {"adm1": cp["co"]} if cp.get("co") else {},
               "note": (f"A civil parish in County {cp['co']}. This is the unit "
                        f"Griffith's Valuation, the Tithe Applotment books and the "
                        f"registration districts are arranged by — not the Catholic "
                        f"parish, which is a different map of the same ground."
                        if cp.get("co") else "A civil parish."),
               }
        if not rec["admin"]:
            rec.pop("admin")
        if cp.get("a"):
            rec["names"] = [{"n": x, "kind": "alt"} for x in cp["a"]]
        by_id[pid] = rec
        here[(cc, fn)].append(rec)
        added += 1

    doc["places"] = sorted(by_id.values(), key=lambda x: x["name"])
    json.dump(doc, open("data/places.json", "w"), ensure_ascii=False, indent=1)

    cnt = collections.Counter(p.get("country") for p in doc["places"])
    print(f"{added} civil parishes drawn, {enriched} handed their Irish name to a "
          f"place already on the map, {skipped} skipped")
    print(f"{before} -> {len(doc['places'])} places")
    print(f"  IE:{cnt.get('IE', 0)} · GB:{cnt.get('GB', 0)}")


if __name__ == "__main__":
    main()

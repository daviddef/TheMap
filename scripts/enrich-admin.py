#!/usr/bin/env python3
"""Give every place its province and county, from GeoNames' admin hierarchy.

WHY. A FamilySearch collection is attached to a place by how specifically it
reaches it, and the middle rung of that ladder — «this province or state» — was
being decided by DISTANCE: within 75 km and it counted as local. That proxy put
Torino at the top of Arienzo's page until the proximity ranking was fixed, and
even working it is wrong in both directions. Two towns forty kilometres apart
can sit in different provinces with different archives, and a long thin
province can be three hundred kilometres end to end while being exactly the
filing unit that matters.

An administrative name is not a proxy for that. It is the thing itself.

    python3 scripts/enrich-admin.py --geonames cities500.txt --admin1 ... --admin2 ...
"""
import argparse, json, os, re, sys, unicodedata
from math import radians, sin, cos, asin, sqrt

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)


def fold(s):
    s = (s or "").translate(str.maketrans({"đ": "d", "ł": "l", "ø": "o", "ß": "ss"}))
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def km(a, b, c, d):
    a, b, c, d = map(radians, (a, b, c, d))
    return 12742 * asin(sqrt(sin((c - a) / 2) ** 2
                             + cos(a) * cos(c) * sin((d - b) / 2) ** 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geonames", required=True)
    ap.add_argument("--admin1", required=True)
    ap.add_argument("--admin2", required=True)
    ap.add_argument("--max-km", type=float, default=25.0)
    a = ap.parse_args()

    a1 = {}
    for line in open(a.admin1, encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if len(f) >= 2:
            a1[f[0]] = f[1]
    a2 = {}
    for line in open(a.admin2, encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if len(f) >= 2:
            a2[f[0]] = f[1]

    # Every GeoNames settlement, bucketed by country, so a place can be matched
    # to the nearest entry of the same name in the same country.
    byname = {}
    for line in open(a.geonames, encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if len(f) < 15:
            continue
        rec = (float(f[4]), float(f[5]), f[8], f[10], f[11], int(f[14] or 0))
        for nm in (f[1], f[2]):
            k = fold(nm)
            if k:
                byname.setdefault((f[8], k), []).append(rec)

    doc = json.load(open("data/places.json"))
    hit = miss = 0
    for p in doc["places"]:
        cands = byname.get((p.get("country"), fold(p["name"])), [])
        if not cands:
            miss += 1
            continue
        best = min(cands, key=lambda c: km(p["lat"], p["lon"], c[0], c[1]))
        d = km(p["lat"], p["lon"], best[0], best[1])
        if d > a.max_km:
            # The name matches but the place does not. Better to say nothing
            # than to hang a province on a town this is not.
            miss += 1
            continue
        cc, ad1, ad2 = best[2], best[3], best[4]
        n1 = a1.get(f"{cc}.{ad1}") if ad1 else None
        n2 = a2.get(f"{cc}.{ad1}.{ad2}") if ad1 and ad2 else None
        admin = {}
        if n1:
            admin["adm1"] = n1
        if n2:
            admin["adm2"] = n2
        if admin:
            p["admin"] = admin
            hit += 1
        else:
            miss += 1

    json.dump(doc, open("data/places.json", "w"), ensure_ascii=False, indent=1)
    print(f"{hit} places given a province or county, {miss} left without one")
    import collections
    ex = [p for p in doc["places"] if p.get("admin")][:6]
    for p in ex:
        print(f"   {p['name']:22} {p.get('country')}  "
              f"{p['admin'].get('adm1','—')} / {p['admin'].get('adm2','—')}")


if __name__ == "__main__":
    main()

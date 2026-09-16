#!/usr/bin/env python3
"""Audit the places whose coordinates came from a shortened phrase.

The importer resolves «Arienzo, Caserta» and falls back to bare «Arienzo» when
the full phrase misses. That fallback found a hamlet near Salerno, 44 km from
the comune of that name in Caserta — right country, right spelling, wrong town,
and no build gate could see it. 146 places matched that way and only one has
ever been checked.

This checks the rest, against GeoNames' own admin hierarchy: find every
GeoNames entry with that name in that country, and see whether the one we chose
agrees with the province the source named. Where it does not, say so, with the
better candidate and how far away it is.

    python3 scripts/check-geocodes.py --geonames cities500.txt
"""
import argparse, json, os, re, sys, unicodedata
from math import radians, sin, cos, asin, sqrt

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)


def fold(s):
    s = (s or "").translate(str.maketrans({"đ": "d", "ł": "l", "ø": "o", "ß": "ss"}))
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def key(s):
    return re.sub(r"[^a-z0-9 ]+", " ", fold(s)).strip()


def km(a, b, c, d):
    a, b, c, d = map(radians, (a, b, c, d))
    return 12742 * asin(sqrt(sin((c - a) / 2) ** 2
                             + cos(a) * cos(c) * sin((d - b) / 2) ** 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geonames", required=True)
    ap.add_argument("--near", type=float, default=10.0,
                    help="km within which a candidate counts as the same place")
    a = ap.parse_args()

    places = json.load(open("data/places.json"))["places"]
    try:
        PIN = json.load(open("data/place-overrides.json"))["overrides"]
    except FileNotFoundError:
        PIN = {}
    # Places a human has already ruled on. Without this the audit asks the
    # same three questions every time it runs, and an audit that repeats
    # itself is one people stop reading.
    try:
        SEEN = json.load(open("data/geocode-checked.json"))["checked"]
    except FileNotFoundError:
        SEEN = {}

    # Every GeoNames entry, by folded name, carrying its admin codes so that a
    # province named in the source can be matched against one.
    byname = {}
    for line in open(a.geonames, encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if len(f) < 15:
            continue
        for nm in (f[1], f[2]):
            k = key(nm)
            if k:
                byname.setdefault(k, []).append({
                    "name": f[1], "lat": float(f[4]), "lon": float(f[5]),
                    "cc": f[8], "adm1": f[10], "adm2": f[11],
                    "pop": int(f[14] or 0)})

    suspect, checked, single = [], 0, 0
    for p in places:
        if p.get("via") == "familysearch-catalogue" or p["id"] in PIN or p["id"] in SEEN:
            continue
        cands = [c for c in byname.get(key(p["name"]), [])
                 if c["cc"] == p.get("country")]
        if not cands:
            continue
        checked += 1
        if len(cands) == 1:
            single += 1
            continue
        # More than one place of this name in this country: is ours the one
        # the biggest, or is there a far larger one we passed over?
        ours = min(cands, key=lambda c: km(p["lat"], p["lon"], c["lat"], c["lon"]))
        d_ours = km(p["lat"], p["lon"], ours["lat"], ours["lon"])
        biggest = max(cands, key=lambda c: c["pop"])
        d_big = km(p["lat"], p["lon"], biggest["lat"], biggest["lon"])
        if d_big > a.near and biggest["pop"] > max(ours["pop"], 0) * 5:
            suspect.append({
                "id": p["id"], "name": p["name"], "country": p.get("country"),
                "ours": [round(p["lat"], 4), round(p["lon"], 4)],
                "oursPop": ours["pop"],
                "alt": [round(biggest["lat"], 4), round(biggest["lon"], 4)],
                "altPop": biggest["pop"], "km": round(d_big),
                "candidates": len(cands)})

    suspect.sort(key=lambda x: -x["altPop"])
    print(f"{checked} places had a GeoNames match to check; "
          f"{single} had exactly one candidate and are not in doubt")
    print(f"{len(suspect)} sit on a smaller place when a much larger one of the "
          f"same name exists more than {a.near:.0f} km away:\n")
    for s in suspect[:40]:
        print(f"  {s['name']:26} {s['country']}  ours pop {s['oursPop']:>7,} "
              f"| alt pop {s['altPop']:>8,} at {s['km']:>5} km  "
              f"({s['candidates']} candidates)")
    json.dump(suspect, open("/tmp/geocode-suspects.json", "w"), ensure_ascii=False, indent=1)
    print(f"\nfull list -> /tmp/geocode-suspects.json")


if __name__ == "__main__":
    main()

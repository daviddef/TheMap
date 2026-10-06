#!/usr/bin/env python3
"""Burial grounds from OpenStreetMap — including the ones nobody named.

WHY THIS EXISTS AT ALL. data/cemeteries-osm.json was produced ad hoc, by no
script in this repository, which is how its one consequential decision went
unreviewed for so long. Its own note records the decision:

    «Named cemeteries only — Overpass returned 24,996 in the region bounding
     boxes and most carry no name at all, which makes them a shape on a map
     rather than a place a researcher can ask about.»

THAT RULE IS WRONG FOR THIS ATLAS, and David found it the way these things are
always found — by looking for something he knew was there. Senj has a municipal
graveyard. The map showed him Groblje Podbilo, 6.7 km away, and nothing else.
Asked directly, OpenStreetMap has three cemeteries around Senj:

    (NO NAME)          44.9848, 14.9241     <- Senj's own, 2.7 km
    Groblje Podbilo    45.0432, 14.9398     <- the only one we kept
    (NO NAME)          44.9739, 14.9578

A burial ground you can walk to and read stones in is a finding whether or not
OpenStreetMap knows what it is called. «Unnamed» is a fact about the map data,
not about the ground, and this atlas's own rule is that positive evidence
counts: OSM positively records a cemetery there. Withholding it because it has
no label is the same mistake as treating a silent catalogue as proof of absence.

WHAT CHANGES. Every cemetery in a region's ring is kept. A row with no name
carries `n: null` and the pages say «a burial ground, unnamed in OpenStreetMap»
rather than inventing one. Across the harvest that is 10,165 grounds the old
rule discarded, a 41% increase before a single new region is added.

AND THE NINETEEN REGIONS NOBODY HARVESTED. The old file covers 22 of this
atlas's 41 regions. acadia, alsace-lorraine, baltic-governorates, belgium,
bosnia, carniola, congress-poland, denmark, finland, ireland, netherlands,
norway, portugal, quebec, scotland, silesia, sweden, vojna-krajina and
vojvodina have never had a single burial ground, and a reader there cannot tell
that from a place that genuinely has none. All 41 are queried here.

POLITE, AND SLOW ON PURPOSE. Overpass is a free service run for everybody;
region by region with a pause between, a real User-Agent, and a retry that
backs off rather than hammering. It declines a query spanning every region at
once, which is why the old harvest went region by region too.

    python3 scripts/harvest-cemeteries.py            # all regions
    python3 scripts/harvest-cemeteries.py --only kvarner istria-south
"""
import argparse, json, os, sys, time, urllib.error, urllib.parse, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

API = "https://overpass-api.de/api/interpreter"
UA = ("RecordAtlas/1.0 (+https://recordatlas.org/; "
      "burial grounds for a genealogy atlas)")
# GZIPPED, for the same reason the gazetteer is: 118,204 burial grounds is
# 9.4 MB of JSON and 2.0 MB compressed, on a .git that has already paid dearly
# for committing generated files and written that down. check-data.py gates
# `.json.gz` alongside `.json`, so this costs the file nothing in scrutiny.
OUT = "data/cemeteries-osm.json.gz"


def ring_box(ring):
    ys = [p[0] for p in ring]
    xs = [p[1] for p in ring]
    return min(ys), min(xs), max(ys), max(xs)


def inside(y, x, ring):
    """Ray casting. The box is what Overpass can be asked for; the ring is what
    the region actually is, and the old harvest clipped to it for the same
    reason — a bounding box around Istria contains a good deal of Italy."""
    hit = False
    n = len(ring)
    for i in range(n):
        y1, x1 = ring[i]
        y2, x2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xx = x1 + (y - y1) * (x2 - x1) / ((y2 - y1) or 1e-12)
            if x < xx:
                hit = not hit
    return hit


def ask(q, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(
                API, data=urllib.parse.urlencode({"data": q}).encode(),
                headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as fh:
                return json.load(fh)
        except Exception as e:
            wait = 20 * (i + 1)
            print(f"      overpass said no ({e}) — waiting {wait}s", flush=True)
            time.sleep(wait)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="region ids, default all")
    ap.add_argument("--pause", type=float, default=8.0)
    a = ap.parse_args()

    doc = json.load(open("data/regions.json"))
    regions = [r for r in doc["regions"] if r.get("ring")]
    if a.only:
        regions = [r for r in regions if r["id"] in set(a.only)]
    print(f"{len(regions)} regions to ask about\n")

    feats, seen = [], set()
    named = unnamed = 0
    for r in regions:
        s, w, n, e = ring_box(r["ring"])
        bbox = f"{s},{w},{n},{e}"
        q = ("[out:json][timeout:180];("
             f'way["landuse"="cemetery"]({bbox});'
             f'way["amenity"="grave_yard"]({bbox});'
             f'relation["landuse"="cemetery"]({bbox});'
             f'relation["amenity"="grave_yard"]({bbox});'
             f'node["landuse"="cemetery"]({bbox});'
             f'node["amenity"="grave_yard"]({bbox});'
             ");out tags center;")
        d = ask(q)
        if d is None:
            print(f"  {r['id']:<22} FAILED — left out rather than half-taken")
            continue
        kept = 0
        for el in d.get("elements", []):
            c = el.get("center") or {}
            y = c.get("lat", el.get("lat"))
            x = c.get("lon", el.get("lon"))
            if y is None or x is None:
                continue
            if not inside(y, x, r["ring"]):
                continue
            key = f"{el['type'][0]}{el['id']}"
            if key in seen:
                continue
            seen.add(key)
            nm = (el.get("tags") or {}).get("name")
            rel = (el.get("tags") or {}).get("religion")
            row = {"id": key, "n": nm, "y": round(y, 5), "x": round(x, 5),
                   "r": r["id"]}
            if rel:
                row["rel"] = rel
            feats.append(row)
            kept += 1
            if nm:
                named += 1
            else:
                unnamed += 1
        print(f"  {r['id']:<22} {kept:>5} in the ring", flush=True)
        time.sleep(a.pause)

    out = {
        "source": "OpenStreetMap via Overpass",
        "licence": "ODbL 1.0 — © OpenStreetMap contributors",
        "licenceNote": ("© OpenStreetMap contributors, Open Database Licence. "
                        "Attribution is carried on every page that draws these."),
        "harvested": time.strftime("%Y-%m-%d"),
        "note": ("Every burial ground OpenStreetMap holds inside these regions' "
                 "rings, named or not. `n` is null where OSM records the ground "
                 "and no name for it — which is most of them, and is a fact "
                 "about the map rather than about the ground. Clipped to the "
                 "rings, not the bounding boxes. Built by "
                 "scripts/harvest-cemeteries.py."),
        "counts": {"cemeteries": len(feats), "named": named,
                   "unnamed": unnamed, "regions": len(regions)},
        "features": feats,
    }
    import gzip as _gz
    with _gz.open(OUT, "wt", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"\n{OUT}: {len(feats):,} burial grounds "
          f"({named:,} named, {unnamed:,} unnamed) over {len(regions)} regions")


if __name__ == "__main__":
    main()

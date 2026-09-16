#!/usr/bin/env python3
"""Every settlement inside a record region, findable but not drawn.

THE TEMPTING VERSION OF THIS WAS WRONG. There are 8,352 GeoNames settlements
inside the fourteen record regions and 8,144 are not on the map. Promoting them
to the shelf would have quintupled it with grey «nobody has looked here» dots
and buried the 2,128 places that actually hold volumes — and a dot that means
nothing is worse than no dot.

But a researcher holding a village name still deserves an answer, and there is
one: the village is inside a record region, and the region knows which empire
held that ground and therefore where the paper is. That answer needs the
village to be FINDABLE, not drawn.

So they go in the search corpus, tagged with their region, and the map draws
none of them.

    python3 scripts/build-region-settlements.py --geonames cities500.txt
"""
import argparse, json, os, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
from geo import in_ring_latlon

XLAT = str.maketrans({"đ": "d", "ł": "l", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe"})


def fold(s):
    s = (s or "").translate(XLAT)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geonames", required=True)
    a = ap.parse_args()

    regions = json.load(open("data/regions.json"))["regions"]
    boxes = []
    for r in regions:
        la = [p[0] for p in r["ring"]]
        lo = [p[1] for p in r["ring"]]
        boxes.append((r, min(la), min(lo), max(la), max(lo)))

    rows = []
    for line in open(a.geonames, encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if len(f) < 15:
            continue
        lat, lon = float(f[4]), float(f[5])
        for r, s, w, n, e in boxes:
            if s <= lat <= n and w <= lon <= e and in_ring_latlon(lat, lon, r["ring"]):
                names = {f[1], f[2]} | set(x for x in (f[3].split(",") if f[3] else []) if x)
                q = " ".join(sorted({fold(x) for x in names if x and len(x) > 2}))
                rows.append({"n": f[1], "y": round(lat, 4), "x": round(lon, 4),
                             "k": f[8], "r": r["id"], "q": q,
                             "p": int(f[14] or 0)})
                break

    rows.sort(key=lambda z: (z["r"], -z["p"]))
    json.dump({
        "source": "GeoNames cities500, CC BY 4.0, clipped to this map's record regions.",
        "note": "FINDABLE, NOT DRAWN. These are settlements inside a record region that hold "
                "no volumes on this map. Drawing them would bury the places that do under "
                "four times as many dots meaning «nobody has looked». Searching one tells a "
                "reader which region it is in, and the region knows whose archive held that "
                "ground — which is the answer they came for.",
        "counts": {"settlements": len(rows),
                   "regions": len({z["r"] for z in rows})},
        "settlements": rows}, open("data/region-settlements.json", "w"),
        ensure_ascii=False, separators=(",", ":"))
    import collections
    print(f"{len(rows)} settlements inside {len({z['r'] for z in rows})} regions")
    for rid, n in collections.Counter(z["r"] for z in rows).most_common():
        print(f"   {rid:16} {n}")


if __name__ == "__main__":
    main()

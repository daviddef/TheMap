#!/usr/bin/env python3
"""Wikidata features inside the record regions, by class.

WHY SCOPED. There are 295,702 cemeteries and 273,894 churches on Wikidata with
coordinates. Drawing all of them would be a map of Wikidata rather than a map
of where records are, and would bury 2,130 walked places under half a million
dots. The record regions are the ground this map has actually worked out, so
they are the ground worth populating.

The query service will do this cheaply because a bounding box IS indexed —
which is the difference between this and the surname harvest that failed four
times on a label scan.

    python3 scripts/harvest-wikidata-geo.py --class Q39614 --out cemeteries
"""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
UA = ("RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap; "
      "region-scoped feature harvest)")
CACHE = "/tmp/record-atlas-wdgeo"

Q = """
SELECT ?x ?xLabel ?coord WHERE {
  SERVICE wikibase:box {
    ?x wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(__W__ __S__)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(__E__ __N__)"^^geo:wktLiteral .
  }
  ?x wdt:P31/wdt:P279* wd:__CLASS__ .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,hr,it,de,pl,es,nl,pt,fr". }
}
"""


def sparql(q, tries=3):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
        {"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "application/sparql-results+json"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.loads(r.read().decode())["results"]["bindings"]
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(10 * (i + 1))


def fetch_box(klass, rid, box, depth, tag=""):
    """One bounding box, split into quarters if the service will not serve it.

    England's ring is the whole country and its box timed out — a query service
    that is happy with a Croatian county is not happy with Great Britain. Four
    smaller boxes ask the same question and get an answer, and the recursion
    stops at three levels so a genuinely broken query cannot fan out forever."""
    p = os.path.join(CACHE, f"{klass}-{rid}{tag}.json")
    if os.path.exists(p):
        return json.load(open(p))
    q = (Q.replace("__CLASS__", klass)
          .replace("__S__", f"{box[0]:.4f}").replace("__W__", f"{box[1]:.4f}")
          .replace("__N__", f"{box[2]:.4f}").replace("__E__", f"{box[3]:.4f}"))
    try:
        rows = sparql(q, tries=2)
    except Exception:
        if depth >= 5:
            raise
        s0, w0, n0, e0 = box
        midlat, midlon = (s0 + n0) / 2, (w0 + e0) / 2
        print(f"    splitting {rid}{tag} at depth {depth}", flush=True)
        rows = []
        for i, sub in enumerate([(s0, w0, midlat, midlon), (s0, midlon, midlat, e0),
                                 (midlat, w0, n0, midlon), (midlat, midlon, n0, e0)]):
            rows += fetch_box(klass, rid, sub, depth + 1, f"{tag}-{i}")
    json.dump(rows, open(p, "w"))
    time.sleep(1.5)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--klass", required=True, help="Wikidata QID, e.g. Q39614")
    ap.add_argument("--out", required=True, help="basename under data/")
    ap.add_argument("--pad", type=float, default=0.15, help="degrees of slack round a ring")
    a = ap.parse_args()

    regions = json.load(open("data/regions.json"))["regions"]
    os.makedirs(CACHE, exist_ok=True)
    seen, failed = {}, []
    for r in regions:
        lats = [p[0] for p in r["ring"]]
        lons = [p[1] for p in r["ring"]]
        box = (min(lats) - a.pad, min(lons) - a.pad,
               max(lats) + a.pad, max(lons) + a.pad)
        try:
            rows = fetch_box(a.klass, r["id"], box, depth=0)
        except Exception as e:
            failed.append((r["id"], type(e).__name__))
            print(f"  {r['id']:16} FAILED {type(e).__name__}", flush=True)
            continue
        got = 0
        for b in rows:
            qid = b["x"]["value"].rsplit("/", 1)[-1]
            m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", b["coord"]["value"])
            name = b.get("xLabel", {}).get("value", "")
            if not m or not name or name == qid:
                continue
            if qid not in seen:
                seen[qid] = {"q": qid, "n": name,
                             "y": round(float(m.group(2)), 5),
                             "x": round(float(m.group(1)), 5),
                             "r": r["id"]}
                got += 1
        print(f"  {r['id']:16} {got:5} new  (total {len(seen)})", flush=True)

    rows = sorted(seen.values(), key=lambda z: (z["r"], z["n"]))
    out = f"data/{a.out}-wikidata.json"
    json.dump({
        "source": f"Wikidata, instance of (or subclass of) {a.klass}, "
                  f"within the bounding boxes of this map's record regions. CC0.",
        "harvested": time.strftime("%Y-%m-%d"),
        "note": "UNCHECKED, and scoped on purpose. Wikidata knows hundreds of thousands of "
                "these worldwide; drawing all of them would make a map of Wikidata rather "
                "than a map of where records are. The record regions are the ground this "
                "project has actually worked out, so they are the ground worth populating.",
        "counts": {"features": len(rows), "regions": len({z["r"] for z in rows})},
        "features": rows}, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"\n{len(rows)} -> {out}")
    if failed:
        print(f"{len(failed)} regions failed: {failed}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build site/public/history-ground.json: who held the ground, year by year, for /history/.

SOURCE: data/ohm/boundaries.json, OpenHistoricalMap's sovereign boundaries (CC0), already cached
for the flag pages. 1.09 million points across 3,931 shapes is far too heavy for a page, so
each ring is simplified (Douglas-Peucker, 0.3 degrees) and small ones are dropped. The map is
a world view; a coastline accurate to 30 km is the right grain for it and the wrong one for a
parish, which is why this layer is never offered on the records map.

NOTHING IS GUESSED. A year with no shape for a place shows no tint there. OHM covers about 96%
of 1900s eras, 92% of 1800s, 85% of 1700s, 68% of 1500s and half of 1200-1400, and almost nothing
before 900; the page says how many polities it holds for the year on screen.
"""
import hashlib, json, math, os, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "public", "history-ground.json")
KEPT = os.path.join(ROOT, "data", "history-ground.json")   # committed: the OHM cache itself (20 MB) is not in the repository
TOL = 0.3
MIN_AREA = 0.6          # square degrees; a ring smaller than this is an islet at world scale
MIN_YEAR = 600


def rdp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        d2 = dx * dx + dy * dy
        far, fi = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if d2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / d2
                t = max(0, min(1, t))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > far:
                far, fi = d, i
        if far > tol and fi > 0:
            keep[fi] = True
            stack.append((a, fi)); stack.append((fi, b))
    return [p for p, k in zip(pts, keep) if k]


def area(r):
    s = 0.0
    for i in range(len(r)):
        x1, y1 = r[i]; x2, y2 = r[(i + 1) % len(r)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def rings_of(g):
    """Every ring in a shape, whatever the nesting: a ring is a list of [lon, lat] pairs."""
    if g and isinstance(g[0], (int, float)):
        return []
    if g and isinstance(g[0], list) and g[0] and isinstance(g[0][0], (int, float)):
        return [g]
    out = []
    for x in g:
        out += rings_of(x)
    return out


def build():
    b = json.load(open(os.path.join(ROOT, "data", "ohm", "boundaries.json"), encoding="utf-8"))
    out = []
    for rid, m in b["meta"].items():
        sh = b["shapes"].get(rid)
        if not sh or m.get("s") is None:
            continue
        e = m["e"] if m.get("e") is not None else 2027      # no end: still standing
        if e < MIN_YEAR:
            continue
        polys = []
        for ring in rings_of(sh):
            r = rdp([(p[0], p[1]) for p in ring], TOL)
            if len(r) >= 4 and area(r) >= MIN_AREA:
                polys.append([[round(x, 1), round(y, 1)] for x, y in r])
        if not polys:
            continue
        out.append({"n": m["name"], "q": m.get("wikidata"), "s": max(m["s"], MIN_YEAR), "e": min(e, 2027), "p": polys})
    out.sort(key=lambda r: (r["s"], r["n"]))
    return {
        "note": ("Sovereign boundaries from OpenHistoricalMap (CC0), simplified to 0.3 degrees for a world map. "
                 "`s` and `e` are the years a shape begins and ends; `p` is a list of rings, "
                 "each a list of [lon, lat]. A year with no shape for a place has no data there."),
        "source": "https://www.openhistoricalmap.org", "licence": "CC0 1.0 Universal (public domain)",
        "generatedBy": "scripts/build-history-ground.py", "generated": time.strftime("%Y-%m-%d"),
        "sourceSha1": hashlib.sha1(open(os.path.join(ROOT, "data", "ohm", "boundaries.json"), "rb").read()).hexdigest(),
        "counts": {"shapes": len(out)}, "shapes": out,
    }


def main():
    src = os.path.join(ROOT, "data", "ohm", "boundaries.json")
    if not os.path.exists(src):
        # CI and fresh clones have no OHM cache; the committed cut is the artefact.
        s = open(KEPT, encoding="utf-8").read()
        open(OUT, "w", encoding="utf-8").write(s)
        print(f"history-ground.json {len(s)/1024:8.1f} KB   copied from data/history-ground.json (no OHM cache here)")
        return
    d = build()
    s = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8").write(s)
    open(KEPT, "w", encoding="utf-8").write(s)
    pts = sum(len(r) for sh in d["shapes"] for r in sh["p"])
    print(f"history-ground.json {len(s)/1024:8.1f} KB   {d['counts']['shapes']} shapes, {pts:,} points")


if __name__ == "__main__":
    main()

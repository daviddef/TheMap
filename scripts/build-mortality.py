#!/usr/bin/env python3
"""Build site/public/mortality.json: the mass-mortality events of data/mass-death-events.json, with the black outlines the
History map draws, ready to paint.

An event's area is one of: `countries` (the modern outline, simplified, from the Natural Earth rings the site already uses
at build time), `circles` ([lat, lon, km]), `bbox` ([south, west, north, east]), `shapes` (rings of [lat, lon], drawn by hand from a map)
or `lines` ({km, pts}: a route, widened to a corridor, for marches and sea crossings) or `global` (no area: a pandemic that
belongs to no map). The outline says WHERE, not the borders of the day. Nothing here decides a toll or a label: those
come from the entry, which cites its sources.
"""
import json, math, os, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "mass-death-events.json")
OUT = os.path.join(ROOT, "site", "public", "mortality.json")

# What the records of a death look like in each kind of catastrophe, in general terms. These are guidance about where to look,
# not claims about any one place: the card says so.
RECORDS = {
    "epidemic": "Deaths in an epidemic bunch into a few months of burial registers, sometimes with the register left blank or kept "
                "by a different hand. In the worst weeks the dead were buried in pits without an entry, so absent names are not "
                "absent people. Plague pits, lazaretto and hospital registers, wills made in the year, and a drop in baptisms "
                "and marriages afterwards can fill the gap.",
    "famine": "Famine deaths are often the least recorded: clerks and clergy died too, and the dead were buried quickly. Look instead "
              "for relief lists, workhouse, hospital and prison registers, emigration lists, land and tax records that show a house "
              "emptied, and a fall in births and marriages in the years that follow.",
    "genocide": "Records of the dead may never have been made, were destroyed, or were made by those who killed them. Look for "
                "deportation and camp lists, survivor testimony and memorial books, tracing-service and relief archives, and registers "
                "of the displaced and of the survivors, which can name people the death registers do not.",
    "massacre": "A massacre may leave no register of its own. Look for the burial and parish registers of the days after, official "
                "inquiries and claims for compensation, newspapers, and the records of the survivors and of those who fled.",
    "war": "Civil registers and churchbooks may be damaged, lost or interrupted in the years of fighting, and many dead were never "
           "registered. Look for military and civilian casualty lists, evacuation and refugee records, and registers kept afterwards "
           "from memory and testimony.",
    "atrocity": "Where killing was a system, the dead were often not registered at all, or were registered under a false cause. Look "
                "for administrative lists, prison and camp records, rehabilitation files opened later, and the testimony of survivors "
                "and families.",
    "displacement": "People who died on a forced march or in a camp were rarely entered in a home register. Look for removal and "
                    "enrolment lists, the records of the agencies that ran the removal, and the registers of the places they reached.",
}


def dp(pts, tol):
    """Douglas-Peucker on [lon, lat] points."""
    if len(pts) < 4:
        return pts
    def d(p, a, b):
        ax, ay, bx, by = a[0], a[1], b[0], b[1]
        dx, dy = bx - ax, by - ay
        if dx == dy == 0:
            return math.hypot(p[0] - ax, p[1] - ay)
        t = max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        m, idx = 0, None
        for k in range(i + 1, j):
            v = d(pts[k], pts[i], pts[j])
            if v > m:
                m, idx = v, k
        if idx is not None and m > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def corridor(pts, km):
    """A route widened to a strip `km` wide: the left edge out, the right edge back, mitred at the bends. [lat, lon] in and out."""
    half = km / 2.0
    def off(i, sign):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        k = math.cos(math.radians(pts[i][0]))
        dx, dy = (b[1] - a[1]) * k, b[0] - a[0]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        dlat = sign * ny * half / 111.0
        dlon = sign * nx * half / (111.0 * (k or 1))
        return [round(pts[i][0] + dlat, 2), round(pts[i][1] + dlon, 2)]
    left = [off(i, 1) for i in range(len(pts))]
    right = [off(i, -1) for i in range(len(pts))][::-1]
    return left + right


def bbox_area(r):
    xs = [p[0] for p in r]; ys = [p[1] for p in r]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def circle(lat, lon, km, n=40):
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        dlat = (km / 111.0) * math.cos(a)
        dlon = (km / (111.0 * max(math.cos(math.radians(lat)), 0.2))) * math.sin(a)
        out.append([round(lat + dlat, 3), round(lon + dlon, 3)])
    return out


def polys(geo, countries):
    if geo.get("global"):
        return [], None
    rings, at = [], None
    if "countries" in geo:
        best = None
        for cc in geo["countries"]:
            c = countries.get(cc)
            if not c:
                raise SystemExit(f"mass-death-events: no outline for country {cc}")
            rs = sorted(c["rings"], key=bbox_area, reverse=True)
            for k, r in enumerate(rs):
                a = bbox_area(r)
                if k > 0 and a < 0.4:
                    continue                    # drop specks and far islets; the outline is for seeing, not measuring
                tol = 0.08 if a < 5 else 0.2
                s = dp(r, tol)
                rings.append([[round(y, 2), round(x, 2)] for x, y in s])
            top = rs[0]
            cen = [sum(p[1] for p in top) / len(top), sum(p[0] for p in top) / len(top)]
            if best is None or bbox_area(top) > best[0]:
                best = (bbox_area(top), [round(cen[0], 2), round(cen[1], 2)])
        at = best[1] if best else None
    if "circles" in geo:
        for lat, lon, km in geo["circles"]:
            rings.append(circle(lat, lon, km))
        at = at or [geo["circles"][0][0], geo["circles"][0][1]]
    for ring in geo.get("shapes", []):
        rings.append([[round(a, 2), round(b, 2)] for a, b in ring])
        at = at or [round(sum(a for a, _ in ring) / len(ring), 2), round(sum(b for _, b in ring) / len(ring), 2)]
    for ln in geo.get("lines", []):
        rings.append(corridor(ln["pts"], ln["km"]))
        mid = ln["pts"][len(ln["pts"]) // 2]
        at = at or [mid[0], mid[1]]
    if "bbox" in geo:
        s, w, n, e = geo["bbox"]
        rings.append([[s, w], [s, e], [n, e], [n, w]])
        at = at or [round((s + n) / 2, 2), round((w + e) / 2, 2)]
    return rings, at


def build():
    src = json.load(open(SRC, encoding="utf-8"))
    countries = json.load(open(os.path.join(ROOT, "data", "countries.json"), encoding="utf-8"))["countries"]
    out = []
    for e in src["events"]:
        rings, at = polys(e["geo"], countries)
        row = {"id": e["id"], "n": e["name"], "ty": e["type"], "f": e["from"], "t": e["to"]}
        if e.get("headline"):
            row["hd"] = True
        if e["geo"].get("global"):
            row["g"] = True
        else:
            row["poly"] = rings
            row["at"] = at
        if "countries" in e["geo"]:
            row["cc"] = e["geo"]["countries"]
        for k_src, k_out in (("says", "says"), ("open", "open"), ("toll", "toll"), ("sources", "src"), ("qid", "qid")):
            if e.get(k_src) not in (None, "", []):
                row[k_out] = e[k_src]
        out.append(row)
    return {
        "contract": {"name": "recordatlas-mortality", "version": 1},
        "note": src["note"],
        "generated": time.strftime("%Y-%m-%d"),
        "types": src["types"],
        "records": RECORDS,
        "events": out,
    }


def main():
    d = build()
    s = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8").write(s)
    print(f"mortality.json {len(s)/1024:8.1f} KB   {len(d['events'])} events")


if __name__ == "__main__":
    main()

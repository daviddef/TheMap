#!/usr/bin/env python3
"""Scotland's civil parishes — the unit the Old Parish Registers are kept in.

THE FIRST SEARCH FOR THESE GAVE UP and this file exists because giving up was
premature. nrscotland.gov.uk's civil-parishes page 404s, statistics.gov.scot
did not answer at all, scotlandsplaces.gov.uk is a search box with no download,
and the National Library of Scotland's boundary pages are behind a CAPTCHA. It
looked like a closed door and it was not one: data.gov.uk lists «Civil Parishes
- Scotland», and behind it National Records of Scotland runs a live WFS service
that hands the whole layer over on request.

WHY IT MATTERS. Scottish records are kept BY PARISH. The Old Parish Registers
run from 1553 in a few places and the statutory registers from 1855, and both
are arranged parish by parish; ScotlandsPeople searches them that way. This
atlas had Scotland's 33 council areas and nothing narrower, which is like
offering Ireland its provinces.

THE GEOMETRY IS THROWN AWAY ON PURPOSE. The WFS hands over 22 MB of polygon —
every wiggle of every coastline — and this map needs one point per parish and
its name. The centroid kept here is the mean of the outline's points, which
for a parish is close enough to put a marker in the right glen and is not
offered as anything more precise than that.

    curl -o sco.json "https://maps.gov.scot/server/services/NRS/NRS/MapServer/\\
WFSServer?service=WFS&version=2.0.0&request=GetFeature&\\
typeNames=NRS:CivilParish&outputFormat=GEOJSON&srsName=EPSG:4326"
    python3 scripts/harvest-scotland-parishes.py --src sco.json

SOURCE. National Records of Scotland via maps.gov.scot, Crown copyright under
the Open Government Licence v3.0.
"""
import argparse, json, os, re, time, collections

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)


def points(geom):
    """Every coordinate pair in a geometry, however deeply nested."""
    if not isinstance(geom, dict):
        return
    for ring in _walk(geom.get("coordinates")):
        yield ring


def _walk(c):
    if not isinstance(c, list) or not c:
        return
    if isinstance(c[0], (int, float)) and len(c) >= 2:
        yield c
        return
    for x in c:
        yield from _walk(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="the WFS GeoJSON")
    a = ap.parse_args()
    doc = json.load(open(a.src))

    rows, skipped = [], 0
    for f in doc.get("features", []):
        pr = f.get("properties") or {}
        name = ""
        for k in ("name", "NAME", "CivilParish", "civil_parish", "PARISH", "parish"):
            if pr.get(k):
                name = str(pr[k]).strip()
                break
        if not name:
            for k, v in pr.items():
                if isinstance(v, str) and v.strip() and not v.strip().isdigit():
                    name = v.strip()
                    break
        pts = list(points(f.get("geometry") or {}))
        if not name or not pts:
            skipped += 1
            continue
        # The WFS answers in EPSG:4326 but writes the pair LAT,LON — which is
        # correct for that CRS's own axis order and the opposite of GeoJSON's
        # own rule. Taking it as lon,lat puts every Scottish parish in Somalia,
        # so the order is decided by which reading lands in Scotland.
        lat = sum(p[0] for p in pts) / len(pts)
        lon = sum(p[1] for p in pts) / len(pts)
        if not (54.0 < lat < 61.5 and -9.0 < lon < 0.0):
            lat, lon = lon, lat
        if not (54.0 < lat < 61.5 and -9.0 < lon < 0.0):
            skipped += 1
            continue
        rec = {"n": name, "y": round(lat, 5), "x": round(lon, 5)}
        for k in ("council", "COUNCIL", "la_name", "district", "COUNTY", "county"):
            if pr.get(k):
                rec["co"] = str(pr[k]).strip()
                break
        for k in ("code", "CODE", "cp_code", "PARISH_CODE"):
            if pr.get(k):
                rec["code"] = str(pr[k]).strip()
                break
        rows.append(rec)

    rows.sort(key=lambda r: r["n"])
    path = "data/scotland-parishes.json"
    json.dump({
        "source": "National Records of Scotland — Civil Parishes (WFS)",
        "url": "https://www.nrscotland.gov.uk/statistics-and-data/geography-products/",
        "licence": "Open Government Licence v3.0",
        "note": ("The unit Scottish records are kept in. The Old Parish Registers "
                 "run from 1553 where they survive and the statutory registers from "
                 "1855, and both are arranged parish by parish — ScotlandsPeople "
                 "searches them that way. The point is the mean of the boundary's "
                 "own coordinates: right glen, not right door."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"parishes": len(rows), "skipped": skipped},
        "parishes": rows,
    }, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows):,} civil parishes ({skipped} unusable) -> {path}")
    for r in rows[:6]:
        print(f"  {r['n']:26}{r['y']:9.4f}{r['x']:10.4f}  {r.get('co','')}")


if __name__ == "__main__":
    main()

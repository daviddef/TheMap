#!/usr/bin/env python3
"""Municipality and diocese boundaries from OpenStreetMap, each with the office to suggest inside it, into data/contact-areas/osm/<CC>.json.gz.
Run after harvest_osm.py for the same country: the town halls suggested are rows that file already holds.

WHICH LEVEL IS THE MUNICIPALITY differs by country, so a country is listed in LEVELS only once somebody has looked at what the level holds.
LICENCE: ODbL 1.0, (c) OpenStreetMap contributors. POLITE: as harvest_osm.py.

    python3 scripts/contacts/harvest_osm_areas.py HR
    python3 scripts/contacts/harvest_osm_areas.py HR --from-json saved.json     # a saved Overpass answer; no network
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from contacts import areas, core, harvest_osm  # noqa: E402

# country: the admin_level of its municipalities, and relations at another level that are municipalities too.
LEVELS = {
    "HR": {"level": "7", "also": [226224]},   # općine and gradovi; Grad Zagreb is both city and county, drawn at level 4
}
QUERY = """[out:json][timeout:600];
area["ISO3166-1"="%(cc)s"]["admin_level"="2"]->.a;
(
  rel(area.a)["boundary"="administrative"]["admin_level"="%(level)s"];
  %(also)srel(area.a)["boundary"="religious_administration"];
);
out geom;"""


def query(cc):
    c = LEVELS[cc]
    return QUERY % {"cc": cc, "level": c["level"], "also": "".join(f"rel({i});\n  " for i in c["also"])}


def rings_of(element):
    return areas.stitch([[(p["lon"], p["lat"]) for p in m["geometry"] if p] for m in element.get("members", [])
                         if m.get("type") == "way" and m.get("role") in ("outer", "inner", "") and m.get("geometry")])


def areas_from(answer, cc, town_halls):
    """(areas, relations left out because their outline did not close). `town_halls`: this country's rows of that kind."""
    c = LEVELS[cc]
    out, broken = [], 0
    reachable = [r for r in town_halls if any(k in r for k in core.REACH + ("web",))]
    for e in answer.get("elements", []):
        tags = e.get("tags") or {}
        if e.get("type") != "relation" or not tags.get("name"):
            continue
        diocese = tags.get("boundary") == "religious_administration"
        if not diocese and not (tags.get("boundary") == "administrative" and (tags.get("admin_level") == c["level"] or e["id"] in c["also"])):
            continue
        full = rings_of(e)
        if not full:
            broken += 1
            continue
        if diocese:
            xs, ys = [p[0] for r in full for p in r], [p[1] for r in full for p in r]
            at = {"lat": (min(ys) + max(ys)) / 2, "lon": (min(xs) + max(xs)) / 2}
            row = harvest_osm.row_from({**e, "tags": {**tags, "amenity": "place_of_worship"}, "center": at}, cc)
            rows = [dict(row, kind="diocese")] if row and any(k in row for k in core.REACH + ("web",)) else []
        else:
            rows = [r for r in reachable if areas.inside(full, r["x"], r["y"])]
            # an office inside it under the same Wikidata item, or under the area's own name, is the municipality's; a neighbourhood
            # committee or another municipality's office standing inside is then left out
            own = [r for r in rows if f"wd:{tags.get('wikidata')}" in r.get("ids", []) or r.get("name", "").casefold() == tags["name"].casefold()]
            rows = sorted(own or rows, key=lambda r: (-sum(k in r for k in core.REACH), r["id"]))[:areas.SHOWN]
        rings = [s for s in (areas.simplify(r) for r in full) if s]
        if rows and rings:
            out.append({"id": f"osm:r{e['id']}", "kind": "diocese" if diocese else "town-hall", "name": " ".join(tags["name"].split())[:160],
                        "box": areas.box(rings), "rings": rings, "rows": rows})
    return out, broken


def main(argv=None):
    ap = argparse.ArgumentParser(description="Harvest the areas offices cover, from OpenStreetMap, a country at a time.")
    ap.add_argument("countries", nargs="+", help="two-letter country codes: " + " ".join(LEVELS))
    ap.add_argument("--from-json", help="read a saved Overpass answer instead of asking (one country)")
    args = ap.parse_args(argv)
    failed = []
    for i, cc in enumerate(c.upper() for c in args.countries):
        rows_file = os.path.join(core.STORE, "osm", f"{cc}.json.gz")
        if cc not in LEVELS or not os.path.exists(rows_file):
            print(f"{cc}: not harvested (no municipality level listed, or no contacts harvested for it yet)")
            failed.append(cc)
            continue
        try:
            if args.from_json:
                with open(args.from_json, encoding="utf-8") as fh:
                    answer = json.load(fh)
            else:
                if i:
                    time.sleep(20)
                answer = harvest_osm.ask(cc, query(cc), timeout=620)
        except Exception as e:
            print(f"{cc}: not harvested ({e})")
            failed.append(cc)
            continue
        halls = [r for r in core.read_file(rows_file)["rows"] if r["kind"] == "town-hall"]
        found, broken = areas_from(answer, cc, halls)
        if not found:
            print(f"{cc}: the answer held no area with an office to suggest, so nothing is written")
            failed.append(cc)
            continue
        path = areas.write("osm", cc, found, time.strftime("%Y-%m-%d"))
        print(f"{cc}: {sum(a['kind'] == 'town-hall' for a in found):,} municipalities and {sum(a['kind'] == 'diocese' for a in found):,} dioceses "
              f"with an office to suggest; {broken:,} outlines did not close; {os.path.getsize(path) // 1024:,} KB")
    if failed:
        sys.exit("not harvested: " + " ".join(failed))


if __name__ == "__main__":
    main()

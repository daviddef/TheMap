#!/usr/bin/env python3
"""Every burial ground the Atlas holds, cut into one-degree cells for the story plan.

WHY. The plan's «Where it would be on the ground» read site/public/cemeteries-osm.json,
an old thinned copy that holds 14,831 NAMED grounds, while data/cemeteries-osm.json.gz
holds 118,204, named or not. So the plan told a family there was no named cemetery near
Nova Gradiska when the Atlas held nine within fifteen kilometres. Nothing here is
harvested: the rows are the ones already committed under data/.

WHAT. site/public/cem/osm/{lat}_{lon}.json and site/public/cem/wd/{lat}_{lon}.json,
one file per one-degree square that holds anything (floor of each coordinate, so -68.8
is in -69), as compact rows

    [lat, lon, name or null, id]

A square too dense for one file is written as {lat}_{lon}.json, {lat}_{lon}-1.json and
so on, and counted under `parts`. (An OpenStreetMap id starts n, w or r; a Wikidata id starts Q). cem/index.json lists
the cells of each source with their counts, so a reader knows the difference between
«nothing here» (not listed) and «that file did not arrive» (listed, and missing). The
two sources are kept in separate files for the same reason data/ keeps them apart:
OpenStreetMap is share-alike and Wikidata is not. The old public files stay as they
are: outside users read them.

LICENCE. cem/osm/ is ODbL 1.0 (c) OpenStreetMap contributors; cem/wd/ is CC0. The
attribution is printed under the plan that draws them.
"""
import gzip
import json
import math
import os
import shutil

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
OUT = os.path.join("site", "public", "cem")
# the most one file may weigh: scripts/check-built.py holds the built site to the same figure
LIMIT = 80 * 1024


def load(stem):
    # gzip first, plain second: the same bargain scripts/build.py makes
    if os.path.exists(stem + ".gz"):
        with gzip.open(stem + ".gz", "rt", encoding="utf-8") as fh:
            return json.load(fh)
    with open(stem, encoding="utf-8") as fh:
        return json.load(fh)


def cell_key(lat, lon):
    return f"{math.floor(lat)}_{math.floor(lon)}"


def parts_of(rows):
    """The cell's file bodies: one, or several when one would be over the limit (dense squares around Munich and London)."""
    n = 1
    while True:
        step = math.ceil(len(rows) / n)
        bodies = [json.dumps({"rows": rows[i:i + step]}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                  for i in range(0, len(rows), step)]
        if all(len(b) <= LIMIT for b in bodies):
            return bodies
        n += 1


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    index = {"row": ["lat", "lon", "name or null", "id"], "sources": {}}
    biggest = size = files = 0
    for src, stem, idk, licence in (
            ("osm", "data/cemeteries-osm.json", "id", "ODbL 1.0, (c) OpenStreetMap contributors"),
            ("wd", "data/cemeteries-wikidata.json", "q", "CC0 1.0 (Wikidata)")):
        doc = load(stem)
        cells = {}
        for c in doc["features"]:
            lat, lon = c["y"], c["x"]
            cells.setdefault(cell_key(lat, lon), []).append(
                [round(lat, 5), round(lon, 5), c.get("n") or None, c[idk]])
        os.makedirs(os.path.join(OUT, src))
        split = {}
        for key, rows in cells.items():
            rows.sort(key=lambda r: (r[0], r[1], r[3]))
            bodies = parts_of(rows)
            if len(bodies) > 1:
                split[key] = len(bodies)
            for i, body in enumerate(bodies):
                with open(os.path.join(OUT, src, key + (f"-{i}" if i else "") + ".json"), "wb") as fh:
                    fh.write(body)
                biggest = max(biggest, len(body))
                size += len(body)
                files += 1
        index["sources"][src] = {
            "licence": licence, "harvested": doc.get("harvested"),
            "total": len(doc["features"]),
            # how many record regions the harvest was scoped to: the plan says so, because outside them nothing here means anything
            "regions": len({c.get("r") for c in doc["features"] if c.get("r")}),
            "cells": {k: len(v) for k, v in sorted(cells.items())},
            # squares written as several files: {key}.json, {key}-1.json …
            "parts": dict(sorted(split.items())),
        }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    s = index["sources"]
    print(f"site/public/cem: {files:,} cells, {s['osm']['total']:,} OpenStreetMap and "
          f"{s['wd']['total']:,} Wikidata burial grounds, {size / 1e6:.1f} MB, "
          f"largest cell {biggest / 1024:.0f} KB, regions {s['osm']['regions']} / {s['wd']['regions']}")


if __name__ == "__main__":
    main()

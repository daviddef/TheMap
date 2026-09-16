"""Where a point actually is. Shared by the importer and the check gate.

The first import hard-coded `country: "HR"` across the whole Croatian shelf and
quietly filed the Carnian comuni — Ampezzo, Mione, Comeglians, in Italy — and
the Prekmurje parishes, in Slovenia, as Croatian. The gate caught it. Guessing
the country from the importer's context is how that happens; asking the
coordinates is how it stops.
"""
import functools, json, os

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@functools.lru_cache(maxsize=1)
def _countries():
    d = json.load(open(os.path.join(_HERE, "data", "countries.json")))["countries"]
    # Pre-compute bounding boxes: 1,570 rings per point is slow, a box test is not.
    out = []
    for iso, v in d.items():
        for r in v["rings"]:
            xs = [p[0] for p in r]
            ys = [p[1] for p in r]
            out.append((iso, min(xs), min(ys), max(xs), max(ys), r))
    return out


def in_ring(lat, lon, ring):
    """Ray casting, on [lon, lat] pairs. Points exactly on an edge may fall
    either way, which at these scales nobody can tell from the truth."""
    inside = False
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        if (y0 > lat) != (y1 > lat):
            xint = (x1 - x0) * (lat - y0) / (y1 - y0) + x0
            if lon < xint:
                inside = not inside
    return inside


def country_of(lat, lon, tol=0.5):
    """ISO-3166 alpha-2, or None.

    A containment test alone is not enough. Rounded to three decimals, a ragged
    coast loses its inlets, and Split — which is unambiguously in Croatia —
    falls outside every ring. Neither are the offshore islands: Vis, Silba, Susak,
    Premuda and Komiža are all real Croatian parishes and all missing from a
    50 m outline. So a point no ring claims is given to the nearest ring within
    `tol` degrees — half a degree, which reaches the far islands — and anything
    beyond that stays None rather than being assigned to whatever happens to be
    closest across an ocean. Containment is always tried first, so this only
    ever fires for a point that is, as far as the outline knows, at sea."""
    near, best = None, tol
    for iso, x0, y0, x1, y1, ring in _countries():
        if x0 - tol <= lon <= x1 + tol and y0 - tol <= lat <= y1 + tol:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and in_ring(lat, lon, ring):
                return iso
            for px, py in ring:
                d = abs(px - lon) + abs(py - lat)      # manhattan is plenty here
                if d < best:
                    near, best = iso, d
    return near


def in_ring_latlon(lat, lon, ring):
    """Same test for the record regions, whose rings are written [lat, lon]
    because that is the order Leaflet wants and they are drawn by hand."""
    return in_ring(lat, lon, [[p[1], p[0]] for p in ring])

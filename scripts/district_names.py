"""«Opatovac (Vukovar)» is the Opatovac in Vukovar's district, not any Opatovac.

WHY THIS EXISTS. The Croatian shelf came in with sixteen places drawn on a
namesake: Opatovac (Vukovar) near Nova Gradiška, Soline (Zadar) near
Dubrovnik. The geocoder threw the bracket away, took the first or the largest
place of the bare name, and nothing downstream could see it — right country,
right spelling, wrong ground. It also folded «Gorica (Pag)» and «Gorica
(Zadar)» into one row, so one dot listed the other parish's books.

So the bracket is part of the name. Where the district it names is itself a
place in the same country, a candidate more than LIMIT_KM from it is not that place, unless a person has
checked the exact point (data/geocode-checked.json, verdict «correct», with
lat and lon).

Used by scripts/check-data.py, scripts/import-defranceski.py,
scripts/import-fs-catalogue.py and scripts/build.py (the map's «position
doubtful»), so they cannot disagree.
"""
import math
import re
import unicodedata

# Straight-line, district town to parish. The two real exceptions seen so far
# are 65 and 66 km (Beli on Cres, Trstenik on Pelješac): districts reached
# further than this only along a coast or across water.
LIMIT_KM = 60

_BRACKET = re.compile(r"^(.*?)\s*\(([^()]+)\)\s*$")


def split(name):
    """«X (Y)» -> ("X", "Y"), or None."""
    m = _BRACKET.match(name or "")
    return (m.group(1), m.group(2)) if m else None


def fold(s):
    s = (s or "").translate(str.maketrans({"đ": "d", "Đ": "D", "ł": "l", "ø": "o"}))
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def km(a, b, c, d):
    a, b, c, d = map(math.radians, (a, b, c, d))
    return 12742 * math.asin(math.sqrt(math.sin((c - a) / 2) ** 2
                                       + math.cos(a) * math.cos(c) * math.sin((d - b) / 2) ** 2))


class Districts:
    """Where the district in a bracket is: the same-country place of that name.

    NOT THE GAZETTEER. A bracket may name an island, a county or a quarter of
    the town itself, and some village somewhere answers to it: «Osijek (Donji
    Grad)», Osijek's lower town, was refused as 213 km from a Donji Grad. A
    district nobody has drawn is left untested."""

    def __init__(self, places):
        self._places = {}
        for p in places:
            if p.get("lat") is not None:
                self._places.setdefault((p.get("country"), fold(p["name"])), []).append(p)

    def distance(self, name, cc, lat, lon):
        """km from the point to the district the name carries; None when the
        name carries none or the district is not a place."""
        parts = split(name)
        if not parts:
            return None
        pts = self._places.get((cc, fold(parts[1])))
        if not pts:
            return None
        return min(km(lat, lon, p["lat"], p["lon"]) for p in pts)


def checked_here(checked, pid, lat, lon):
    """Has a person confirmed THIS point? A verdict does not follow a place that
    has since been moved."""
    v = checked.get(pid) or {}
    return (v.get("verdict") == "correct" and v.get("lat") is not None
            and km(lat, lon, v["lat"], v["lon"]) <= 1)


def too_far(places, districts, checked):
    """[(place, km)] for every settlement drawn too far from its own district."""
    out = []
    for p in places:
        if p.get("level") or p.get("lat") is None:
            continue
        d = districts.distance(p["name"], p.get("country"), p["lat"], p["lon"])
        if d is not None and d > LIMIT_KM and not checked_here(checked, p["id"], p["lat"], p["lon"]):
            out.append((p, d))
    return out


def latin(s):
    return all("LATIN" in unicodedata.name(c, "") for c in s or "" if c.isalpha())


def doubtful(places, checked):
    """What the story reader calls «position doubtful»: {place id: [Y, km]}.

    The gate's own rule (too_far: LIMIT_KM, a `level` row untested, a checked
    point accepted) over every place the build draws, many of which the gate
    never reads: it sees data/places.json only. Two brackets give nothing to
    measure from. One in another script, «Dobromil (Добромиль)», is the name
    written again, not a district. And an administrative area's point (`level`)
    is its middle, which a village of that province can be far from."""
    districts = Districts([p for p in places if not p.get("level")])
    out = {}
    for p, d in too_far(places, districts, checked):
        y = split(p["name"])[1]
        if latin(y):
            out[p["id"]] = [y, round(d)]
    return out


def shelf_waypoints(place):
    """The FamilySearch book waypoints a place's own shelf links to."""
    out = set()
    for c in place.get("collections") or []:
        if c.get("provider") != "familysearch":
            continue
        m = re.search(r"[?&]wc=([A-Z0-9-]{6,9})(?::|%3A)", c.get("url") or "")
        if m:
            out.add(m.group(1))
    return out


def shelf_parishes(place):
    """The FamilySearch parish numbers in a shelf's links:
    wc=<book>:<collection tree>,<PARISH>,<book id>."""
    out = set()
    for c in place.get("collections") or []:
        m = re.search(r"[?&]wc=[A-Z0-9-]+(?::|%3A)\d+(?:,|%2C)(\d+)", c.get("url") or "")
        if m:
            out.add(m.group(1))
    return out

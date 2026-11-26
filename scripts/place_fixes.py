"""Apply data/place-fixes.json to a list of places: corrections with evidence, and places added by hand. Idempotent."""
import json, os

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "place-fixes.json")


def apply(places, path=PATH):
    doc = json.load(open(path, encoding="utf-8"))
    by = {p["id"]: p for p in places}
    for f in doc["fixes"]:
        p = by.get(f["id"])
        if p is None:
            continue
        for k, v in f["set"].items():
            if k == "names":
                have = p.setdefault("names", [])
                have.extend(n for n in v if n not in have)
            else:
                p[k] = v
        # an admin unit worked out from a wrong point is wrong with it
        if "lat" in f["set"]:
            p.pop("admin", None)
    places.extend(dict(a) for a in doc["add"] if a["id"] not in by)
    return places

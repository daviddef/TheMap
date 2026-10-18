#!/usr/bin/env python3
"""Replace voyage coordinates written from memory with coordinates a source holds.

The voyage researchers gave waypoints and landfalls to about 0.1 degree "from general geography".
That is a claim without a witness. Wikidata (CC0) holds a coordinate (P625) for nearly every port,
cape, strait and island a voyage names, so each NAMED waypoint and each place reached is looked up
there, and the nearest candidate carrying that name replaces the remembered coordinate when it
lies within 400 km of it (further off, it is a homonym or the name is a region, and the remembered
point is kept and flagged). Every checked point records the Wikidata item and how far it moved.

Helper points that only keep a line at sea (`aid`) and schematic ones are not places; they stay as
they were and are not checked. Hand-run; writes data/voyages.json in place.
"""
import concurrent.futures, json, math, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "data", "voyages.json")
API = "https://www.wikidata.org/w/api.php"
UA = "RecordAtlas/1.0 (https://recordatlas.org; david.defranceski@gmail.com)"
MAXKM = 400
cache = {}


def get(params):
    url = API + "?" + urllib.parse.urlencode(params | {"format": "json", "origin": "*"})
    for i in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60))
        except Exception:
            time.sleep(3 * (i + 1))
    return {}


def km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))


def candidates(name):
    if name in cache:
        return cache[name]
    hits = get({"action": "wbsearchentities", "search": name, "language": "en", "limit": 7, "type": "item"}).get("search", [])
    ids = [h["id"] for h in hits]
    out = []
    if ids:
        ents = get({"action": "wbgetentities", "ids": "|".join(ids), "props": "claims|labels", "languages": "en"}).get("entities", {})
        for h in hits:
            e = ents.get(h["id"], {})
            cl = (e.get("claims") or {}).get("P625")
            if cl:
                v = cl[0]["mainsnak"].get("datavalue", {}).get("value")
                if v:
                    out.append({"q": h["id"], "label": h.get("label", ""), "lat": v["latitude"], "lon": v["longitude"]})
    if out:                       # a failed or empty answer is not cached: it may be the API, not the place
        cache[name] = out
    return out


def names_of(w):
    """[(name, replace)]: the whole name and any parenthesised name may replace the remembered point;
    a part of a compound name (\"Hispaniola, north-west coast\") only vouches that the place is where it
    was put, because the part is usually a large feature whose centre is not the landfall."""
    n = w["name"]
    if w.get("aid") or re.search(r"sea connector|schematic|\bat sea\b|mid-ocean|helper", n + " " + (w.get("note") or ""), re.I):
        return []
    base = re.sub(r"\s*\(.*?\)", "", n).strip()
    base = re.sub(r"\b(approximate|approx\.?|area|return|north coast of|south coast of|east coast of|west coast of|coast of)\b", "", base, flags=re.I).strip(" ,;-")
    out = [(base, True)] if len(base) > 2 else []
    out += [(x, True) for x in re.findall(r"\((.*?)\)", n) if len(x) > 2 and not re.search(r"approx|possibly|or ", x, re.I)]
    for part in re.split(r"\s*[,/]\s*| and ", base):
        part = part.strip()
        if len(part) > 3 and part != base:
            out.append((part, False))
    return out


def fix(w, stats, who):
    for nm, replace in names_of(w):
        cs = candidates(nm)
        if not cs:
            continue
        best = min(cs, key=lambda c: km(w["lat"], w["lon"], c["lat"], c["lon"]))
        d = km(w["lat"], w["lon"], best["lat"], best["lon"])
        if d <= MAXKM:
            w["geo"] = {"q": best["q"], "label": best["label"], "movedKm": round(d), "source": "Wikidata P625"}
            if replace:
                w["lat"], w["lon"] = round(best["lat"], 3), round(best["lon"], 3)
            else:
                w["geo"]["mode"] = "region only: the remembered point was kept"
            stats["checked"] += 1
            if d > 150:
                stats["moved150"].append((who, w["name"], round(d)))
            return
    w["geo"] = None
    stats["unverified"].append((who, w["name"]))


def main():
    doc = json.load(open(P, encoding="utf-8"))
    stats = {"checked": 0, "unverified": [], "moved150": []}
    todo = set()
    for v in doc["voyages"]:
        for w in v["route"] + list(v.get("reached") or []):
            if "name" in w and not isinstance(w.get("geo"), dict):
                todo.update(n for n, _ in names_of(w))
    print(len(todo), "distinct names to look up", flush=True)
    with concurrent.futures.ThreadPoolExecutor(4) as ex:
        list(ex.map(candidates, sorted(todo)))
    for v in doc["voyages"]:
        print(v["id"], flush=True)
        for w in v["route"]:
            if names_of(w) and not isinstance(w.get("geo"), dict):
                fix(w, stats, v["id"])
        for r in v.get("reached") or []:
            if r.get("name") and not isinstance(r.get("geo"), dict):
                fix(r, stats, v["id"])
    json.dump(doc, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(stats, open("/tmp/flagwork/voyage-coords-report.json", "w"), indent=1, ensure_ascii=False)
    print("checked", stats["checked"], "unverified", len(stats["unverified"]), "moved >150 km", len(stats["moved150"]))


if __name__ == "__main__":
    main()

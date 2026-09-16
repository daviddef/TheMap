#!/usr/bin/env python3
"""Lift the GROUND out of the other six family archives.

The eight new record regions — Campania, Sicily, Calabria, Posen, the eastern
Cape, England, Queensland, Santa Fe — were written because somebody is actually
stuck on that ground. They arrived as era tables with no places standing on
them, which is a map of nowhere. Every one of those archives has already
geocoded its own places; this puts them on the map.

WHAT COMES ACROSS: the name of a place, where it is, and every other form the
name has been written in.

WHAT DOES NOT, AND THIS IS NOT NEGOTIABLE: people. Record Atlas holds records
and the institutions that keep them, and its privacy page says in as many words
that it carries no names of individuals, living or dead. The Booyzen places
carry beautiful prose — "Johanna Catharina Montjoy was born here on 30 April
1819" — and none of it belongs here. Neither do the Blažević surname spans, nor
the Lerena person lists, nor the Mazza birth counts, all of which are facts
about a family rather than about a shelf.

The one exception is a statement about what an institution HOLDS rather than
about who is in it: the Falco archive records that the Collegiate Church of
Sant'Andrea Apostolo keeps baptisms from 1672. That is true of the world, not
of the Falcos, so it becomes a volume.

    python3 scripts/import-archives.py [--dry]
"""
import argparse, json, os, re, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
from geo import country_of, in_ring_latlon

PROJ = "/Users/daviddefranceski/Claude/Projects"
KIT_GAZ = os.path.join(PROJ, "Archive Kit/kit/data/gazetteer.json")
GEONAMES = None

XLAT = str.maketrans({"đ": "d", "Đ": "D", "ł": "l", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe"})


def fold(s):
    s = (s or "").translate(XLAT)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def key(s):
    """A cache key. The hand-set caches write "soriano calabro vibo valentia
    calabria" with no punctuation at all, so a fold that keeps the commas
    matches none of them."""
    return re.sub(r"[^a-z0-9 ]+", " ", fold(s)).strip()
    


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-")[:60]


# ---- every coordinate this family of projects has already worked out -------
# Four sources, in order of how much a human was involved: the kit's hand-set
# overrides, one archive's own hand-set local file, the shared cache the
# geocoder fills, and finally Record Atlas's own worldwide gazetteer, which
# reaches anywhere with five thousand people in it. Nothing is invented: a
# place none of the four can place stays off the map and gets reported.
CACHES = [
    os.path.join(PROJ, "Archive Kit/kit/data/gazetteer-overrides.json"),
    os.path.join(PROJ, "Mazza Family/data/gazetteer-local.json"),
    KIT_GAZ,
]


def load_gaz():
    out = {}
    for path in CACHES:
        try:
            g = json.load(open(path))
        except FileNotFoundError:
            continue
        for k, v in g.items():
            fk = key(k)
            if isinstance(v, dict) and v.get("lat") is not None and fk not in out:
                out[fk] = (v["lat"], v["lon"], v.get("conf"))

    # Our own gazetteer last, under every name each place answers to.
    try:
        own = json.load(open("data/gazetteer.json"))["places"]
    except FileNotFoundError:
        own = []
    # WHOLE NAMES, not the tokens `q` splits into. "New York" folded and split
    # on spaces is "new" and "york", and neither of them is a place.
    for r in own:
        for form in [r["n"]] + r["a"]:
            k = key(form)
            if len(k) > 3 and k not in out:
                out[k] = (r["y"], r["x"], "gazetteer")

    # And finally the full GeoNames list, if it has been downloaded. Record
    # Atlas's own gazetteer keeps only places that carry a FORMER NAME, which
    # is right for answering "what was this called" and useless for finding
    # Briatico — an ordinary Calabrian comune of four thousand people that has
    # never been called anything else. Geocoding needs every place, not every
    # interesting one.
    if GEONAMES and os.path.exists(GEONAMES):
        for line in open(GEONAMES, encoding="utf-8"):
            fl = line.split("\t")
            if len(fl) < 15:
                continue
            for nm in (fl[1], fl[2]):
                k = key(nm)
                if len(k) > 3 and k not in out:
                    out[k] = (float(fl[4]), float(fl[5]), "geonames")
    return out


def resolve(gaz, name):
    """Try the whole phrase, then progressively shorter leading parts of it —
    "Briatico, Vibo Valentia, Calabria" then "Briatico, Vibo Valentia" then
    "Briatico" — because the cache was filled by whoever asked first.

    Returns (lat, lon, loose). LOOSE MATTERS: falling back from «Arienzo,
    Caserta» to bare «Arienzo» found a hamlet near Salerno, 44 km from the
    comune of that name in Caserta. Right country, right spelling, wrong town,
    and no build gate can see it. Loose hits are counted and reported so that a
    human can pin the ones that matter in data/place-overrides.json."""
    parts = [p.strip() for p in name.split(",")]
    for i in range(len(parts), 0, -1):
        hit = gaz.get(key(", ".join(parts[:i])))
        if hit:
            return hit[0], hit[1], i < len(parts) and len(parts) > 1
    return None


# ---- one adapter per archive, because no two of them agree on a shape ------
def falco(base):
    for r in json.load(open(f"{base}/Falco Family/site/src/data/places.json")):
        name = r["name"] + (", " + r["prov"] if r.get("prov") else "")
        vols = []
        # A statement about what the PARISH holds, which is true of the world.
        # Some of these run to "present", which is a word rather than a year.
        yr = lambda v: int(v) if str(v).isdigit() else None
        fr, to = yr(r.get("from")), yr(r.get("to"))
        if fr:
            vols.append({"title": "Parish registers", "kinds": ["b", "m", "d"],
                         "from": fr, "to": to or fr,
                         "access": "onsite", "held": "the parish"})
        yield {"name": r["name"], "geo": name, "collections": vols}


def mazza(base):
    for r in json.load(open(f"{base}/Mazza Family/site/src/data/places.json")):
        yield {"name": r["name"].split(",")[0].strip(), "geo": r["name"]}


def lerena(base):
    for r in json.load(open(f"{base}/Lerena Family/site/src/data/places.json")):
        yield {"name": r["name"], "geo": r["name"]}


def darcy(base):
    for r in json.load(open(f"{base}/D'arcy Family/site/src/data/places.json")):
        head = r["place"].split(",")[0].strip()
        if not head or head.lower() in ("england", "ireland", "scotland", "wales", "australia"):
            continue                       # a country is not a place on a shelf
        yield {"name": head, "geo": r["place"],
               "names": [v.split(",")[0].strip() for v in (r.get("variants") or [])]}


def booyzen(base):
    j = json.load(open(f"{base}/Booyzen Family/site/src/data/places.json"))
    rows = j.get("places") if isinstance(j, dict) else j
    for r in rows:
        if r.get("lat") is None:
            continue
        yield {"name": r["n"], "geo": r["n"], "lat": r["lat"], "lon": r["lon"]}


def blazevic(base):
    g = json.load(open(f"{base}/Blazevic Family/site/src/data/gazetteer.json"))
    seen = set()
    for surname, v in g.items():
        for p in v.get("places", []):
            n = p.get("village")
            # The n/from/to on these rows count one SURNAME's records. That is
            # a fact about the Blaževićs, not about the village, and it stays
            # in their archive.
            if n and n not in seen:
                seen.add(n)
                yield {"name": n, "geo": n}


ADAPTERS = [("Falco", falco), ("Mazza", mazza), ("Lerena", lerena),
            ("D'Arcy", darcy), ("Booyzen", booyzen), ("Blažević", blazevic)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--geonames", help="GeoNames cities500.txt, for places too small "
                                       "to carry a former name")
    a = ap.parse_args()

    global GEONAMES
    GEONAMES = a.geonames
    gaz = load_gaz()
    regions = json.load(open("data/regions.json"))["regions"]
    doc = json.load(open("data/places.json"))
    by_id = {p["id"]: p for p in doc["places"]}
    ovr = json.load(open("data/country-overrides.json"))["overrides"]
    try:
        PIN = json.load(open("data/place-overrides.json"))["overrides"]
    except FileNotFoundError:
        PIN = {}

    added, merged, unplaced, loosely = 0, 0, [], []
    for label, fn in ADAPTERS:
        got = 0
        for rec in fn(PROJ):
            lat, lon, loose = rec.get("lat"), rec.get("lon"), False
            if lat is None:
                hit = resolve(gaz, rec.get("geo") or rec["name"])
                if not hit:
                    unplaced.append(f"{label}: {rec['name']}")
                    continue
                lat, lon, loose = hit
            pid = slug(rec["name"])
            if not pid:
                continue
            pin = PIN.get(pid)
            if pin:
                lat, lon, loose = pin["lat"], pin["lon"], False
            elif loose:
                loosely.append(f"{label}: {rec['name']}  <- {rec.get('geo')}")

            cc = ovr.get(pid, {}).get("country") or country_of(lat, lon)
            reg = None
            for r in regions:
                if in_ring_latlon(lat, lon, r["ring"]):
                    reg = r["id"]
                    break

            if pid in by_id:
                p = by_id[pid]                       # already here: only enrich
                # A pin has to reach a place that is ALREADY on the map, or it
                # silently does nothing on every run after the first — which is
                # exactly what happened to Arienzo, pinned and still 44 km out.
                if pin:
                    p["lat"], p["lon"] = round(pin["lat"], 5), round(pin["lon"], 5)
                have = {n["n"] for n in p.get("names", [])} | {p["name"]}
                for n in rec.get("names", []):
                    if n and n not in have:
                        p.setdefault("names", []).append({"n": n, "kind": "alt"})
                        have.add(n)
                if reg and not p.get("region"):
                    p["region"] = reg
                merged += 1
                continue

            p = {"id": pid, "name": rec["name"],
                 "lat": round(lat, 5), "lon": round(lon, 5),
                 "collections": rec.get("collections", [])}
            if cc:
                p["country"] = cc
            if reg:
                p["region"] = reg
            names = [{"n": n, "kind": "alt"} for n in rec.get("names", []) if n and n != rec["name"]]
            if names:
                p["names"] = names
            by_id[pid] = p
            added += 1
            got += 1
        print(f"  {label:10} {got} new")

    doc["places"] = sorted(by_id.values(), key=lambda x: x["name"])
    doc["note"] = (doc["note"] + " Ground from the six sibling archives was added by "
                   "scripts/import-archives.py — places, coordinates and name variants only, "
                   "never people.")
    if not a.dry:
        json.dump(doc, open("data/places.json", "w"), ensure_ascii=False, indent=1)

    print(f"\n{added} places added, {merged} already present and enriched")
    if unplaced:
        print(f"{len(unplaced)} could not be geocoded from the shared cache:")
        for x in unplaced[:10]:
            print("   ", x)
    if loosely:
        print(f"\n{len(loosely)} matched only on a shortened phrase — CHECK THESE, this is "
              f"how Arienzo ended up 44 km from Arienzo:")
        for x in loosely[:14]:
            print("   ", x)
    inreg = sum(1 for p in doc["places"] if p.get("region"))
    print(f"{len(doc['places'])} places total, {inreg} inside a record region")


if __name__ == "__main__":
    main()

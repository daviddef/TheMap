#!/usr/bin/env python3
"""Put the world's filing units on the shelf.

promote-collection-places.py drew the places FamilySearch's catalogue names by
name — 660 of them, and it moved Croatia from 78% of the shelf to 54%. It could
not do better, because it could only draw what a catalogue happened to mention.

This one draws the districts themselves, from data/admin-divisions.json.

WHAT EARNS A DOT, AND WHAT DOES NOT. Three rules, and the middle one is the
argument:

  · EVERY FIRST-LEVEL DIVISION of every country this atlas covers. A county, a
    province, a département, a Bundesland, a state. 2,049 of them. This is the
    level at which a researcher actually knows where their people came from —
    «somewhere in Galicia», «County Cork» — and it is the level at which a
    national archive is organised.

  · A SECOND-LEVEL DIVISION ONLY WHEN A COLLECTION NAMES IT. There are 17,466
    of these and drawing them all would be a worse lie than drawing none. A
    single collection filed under «Brazil, Minas Gerais» reaches all 853 of
    that state's municípios by administrative descent, and 853 identical dots
    for one collection is not coverage, it is wallpaper — it would replace a
    map that looks Croatian with a map that looks Brazilian and neither would
    be telling the truth about the records. The 146 adm2 divisions a collection
    names outright have earned their dot; the rest stay findable and undrawn,
    sharded into a/ exactly as the 18,629 settlements are.

  · NOTHING THAT IS ALREADY THERE. A division whose name and ground already
    carry a walked place keeps the walked place — Istria the division must not
    bury Istria the archive's own hard-won entry. The walked place inherits the
    division's adm1/adm2 instead, which is worth more: it is what reach() needs
    to match a collection to it.

A DIVISION WITH NOTHING LOCAL IS STILL WORTH DRAWING. Clicking your district
and being told «nothing narrower than the national collections covers this
ground, and here they are» is an answer. It is the answer this atlas exists to
give, and it is different from not being on the map at all — the difference
between «nothing here» and «not surveyed», which is the one thing a coverage
map must never blur.

    python3 scripts/promote-admin-divisions.py
"""
import json, os, re, sys, math, unicodedata, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
from geo import in_ring_latlon

XLAT = str.maketrans({"đ": "d", "ł": "l", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe"})


def fold(s):
    s = (s or "").translate(XLAT)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-")[:60]


def km(a, b, c, d):
    p = math.pi / 180
    return 12742 * math.asin(math.sqrt(
        0.5 - math.cos((c - a) * p) / 2
        + math.cos(a * p) * math.cos(c * p) * (1 - math.cos((d - b) * p)) / 2))


# GeoNames writes the division's own kind into its name often enough — «State of
# São Paulo», «Provincia di Bergamo» — that leaving it in would give every dot
# a label three words longer than the map has room for. The full form survives
# as an alternative name, because that is the form a collection title uses.
TRIM = re.compile(
    r"^(state of |province of |provincia d[ie] |provincie |département d[eu]s? |"
    r"departamento d[eo] |departament of |region of |regione |comarca d[eo] |"
    r"county of |canton of |kanton |powiat |judetul |judeţul |județul |megye |"
    r"oblast[' ]|governorate of |prefecture of )", re.I)


def main():
    divs = json.load(open("data/admin-divisions.json"))["divisions"]
    cols = json.load(open("data/collections.json"))["collections"]
    regions = json.load(open("data/regions.json"))["regions"]
    doc = json.load(open("data/places.json"))
    places = doc["places"]
    before = len(places)
    hr_before = sum(1 for p in places if p.get("country") == "HR")

    by_cc = collections.defaultdict(list)
    for c in cols:
        for cc in c.get("countries", []):
            by_cc[cc].append(c)

    # Which second-level divisions a collection names outright.
    named = set()
    for d in divs:
        if d["level"] != "adm2":
            continue
        fn = fold(d["name"])
        for c in by_cc.get(d["cc"], []):
            for p in c.get("places", []):
                if p.get("type") == "COUNTRY":
                    continue
                chain = [fold(x.strip()) for x in (p.get("name") or "").split(",")]
                if fn and (fn == fold(p.get("short") or "") or fn in chain):
                    named.add(d["key"])
                    break
            if d["key"] in named:
                break

    # Existing ground, so nothing is drawn twice.
    by_id = {p["id"]: p for p in places}
    here = collections.defaultdict(list)
    for p in places:
        here[(p.get("country"), fold(p["name"]))].append(p)

    added, enriched, undrawn, collided = 0, 0, [], 0
    for d in sorted(divs, key=lambda x: (x["cc"], x["level"], x["name"])):
        if d["level"] == "adm2" and d["key"] not in named:
            undrawn.append(d)
            continue

        full = d["name"]
        short = TRIM.sub("", full).strip() or full
        fn = fold(short)

        # Already walked? Hand it the administrative chain and step back.
        twin = None
        for p in here.get((d["cc"], fn), []):
            if km(p["lat"], p["lon"], d["lat"], d["lon"]) < 120:
                twin = p
                break
        if twin is not None:
            adm = twin.setdefault("admin", {})
            if d["level"] == "adm1":
                adm.setdefault("adm1", full)
            else:
                adm.setdefault("adm2", full)
                if d.get("adm1"):
                    adm.setdefault("adm1", d["adm1"])
            enriched += 1
            continue

        pid = slug(f"{short}-{d['cc']}") if slug(short) in by_id else slug(short)
        if not pid:
            continue
        if pid in by_id:
            pid = slug(f"{short}-{d['key'].replace('.', '-')}")
            if pid in by_id:
                collided += 1
                continue

        rec = {
            "id": pid, "name": short, "country": d["cc"],
            "lat": d["lat"], "lon": d["lon"],
            "collections": [], "via": "geonames-admin",
            "level": "region" if d["level"] == "adm1" else "district",
            "admin": ({"adm1": full} if d["level"] == "adm1"
                      else {"adm1": d.get("adm1"), "adm2": full}),
            # The dot is the population-weighted centre of the towns inside,
            # not a building. Say so on the page rather than letting a reader
            # plan a journey to a field.
            "note": (f"A {'first' if d['level'] == 'adm1' else 'second'}-level "
                     f"administrative division, carrying {d['towns']} town"
                     f"{'' if d['towns'] == 1 else 's'} of 5,000 or more. The "
                     f"marker is their population-weighted centre, not an address."),
        }
        rec["admin"] = {k: v for k, v in rec["admin"].items() if v}
        if full != short:
            rec["names"] = [{"n": full, "kind": "official"}]
        for r in regions:
            if in_ring_latlon(d["lat"], d["lon"], r["ring"]):
                rec["region"] = r["id"]
                break
        by_id[pid] = rec
        here[(d["cc"], fn)].append(rec)
        added += 1

    doc["places"] = sorted(by_id.values(), key=lambda x: x["name"])
    # The note is written by hand and not appended to here; see the sibling
    # importer for why.
    json.dump(doc, open("data/places.json", "w"), ensure_ascii=False, indent=1)

    json.dump({
        "note": ("Second-level administrative divisions no collection names. "
                 "Findable by search, deliberately not drawn — one collection "
                 "filed under a state would otherwise put an identical dot on "
                 "every district inside it. Written by "
                 "scripts/promote-admin-divisions.py."),
        "divisions": undrawn,
    }, open("data/admin-undrawn.json", "w"), ensure_ascii=False, separators=(",", ":"))

    cnt = collections.Counter(p.get("country") for p in doc["places"])
    n = len(doc["places"])
    print(f"{added} divisions drawn, {enriched} handed to a place already walked, "
          f"{collided} name collisions skipped")
    print(f"{len(undrawn)} second-level divisions findable and not drawn "
          f"-> data/admin-undrawn.json")
    print(f"\n{before} -> {n} places")
    print("  " + " · ".join(f"{k}:{v}" for k, v in cnt.most_common(18)))
    print(f"\nCroatia is {100 * cnt.get('HR', 0) / n:.0f}% of the shelf "
          f"(was {100 * hr_before / before:.0f}%); "
          f"{len(cnt)} countries carry ground, was "
          f"{len(set(p.get('country') for p in places[:before]))}")


if __name__ == "__main__":
    main()

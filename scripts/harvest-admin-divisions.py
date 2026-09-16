#!/usr/bin/env python3
"""The administrative backbone — the filing units of the whole world.

DAVID HAS ASKED TWICE WHY THE MAP IS STILL A MAP OF CROATIA. The first answer
was promote-collection-places.py, which drew the 660 towns FamilySearch's
catalogue names outright. It helped and it was not enough, and the reason is
visible in one number: of 2,128 shelf places, 1,145 are Croatian, because one
family archive walked every Croatian parish by hand and nothing else on earth
has had that done to it.

The rest of the world will not be walked parish by parish. It does not need to
be. RECORDS ARE NOT FILED BY VILLAGE, THEY ARE FILED BY DISTRICT — by county,
départment, Kreis, comarca, provincia, powiat. That is the unit a registrar
worked in, the unit an archive was built for, and the unit a collection title
names: «Italy, Trento, Civil Registration», «Ireland, County Cork», «Germany,
Prussia, Posen». reach() already matches a collection to a place by adm1 and
adm2 name. It has simply never had the adm1 and adm2 units themselves as
places to match against, outside the handful the catalogue happened to name.

So: draw them. Every first- and second-level division on earth, for every
country where this atlas holds a collection.

WHERE THE COORDINATES COME FROM, AND WHY NOT FROM GEONAMES DIRECTLY. GeoNames
publishes admin1CodesASCII.txt and admin2Codes.txt — names and codes, 51,508
rows, no coordinates. The coordinates live in allCountries.zip, which is 1.5 GB
for a field this file needs twice. Instead each division's position is the
population-weighted centre of the cities5000 towns inside it — already
downloaded, already the gazetteer's source, and a better answer than a
geometric centroid anyway: it puts the dot where the people were, which is
where the registrar was.

A division with no town of 5,000 gets no dot. That is the right refusal. It
means the division is rural enough that nothing in cities5000 sits in it, and
a coordinate invented for it would be a coordinate this map could not defend.
They are counted and reported, not silently dropped.

    python3 scripts/harvest-admin-divisions.py --src <dir with the three files>

SOURCE. GeoNames, CC BY 4.0 — https://www.geonames.org/. Already credited in
the footer; this adds no new licence to the repo.
"""
import argparse, json, os, sys, collections

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

# A division so large it is a country's whole self — city-states and the like —
# is not a filing unit, it is the country row again under another name.
SKIP_WHOLE_COUNTRY = {"SG", "MC", "VA", "GI", "MO", "HK", "BH", "MT"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True,
                    help="directory holding cities5000.txt, admin1.txt, admin2.txt")
    a = ap.parse_args()

    cols = json.load(open("data/collections.json"))["collections"]
    wanted = set()
    for c in cols:
        for cc in c.get("countries", []):
            wanted.add(cc)
    # Plus every country the shelf already stands on, so a country that has
    # places but no catalogued collection still gets its districts.
    for p in json.load(open("data/places.json"))["places"]:
        if p.get("country"):
            wanted.add(p["country"])
    wanted -= SKIP_WHOLE_COUNTRY
    print(f"{len(wanted)} countries carry a collection or a place")

    names1, names2 = {}, {}
    for line in open(os.path.join(a.src, "admin1.txt"), encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if len(f) >= 2:
            names1[f[0]] = f[1]
    for line in open(os.path.join(a.src, "admin2.txt"), encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if len(f) >= 2:
            names2[f[0]] = f[1]
    print(f"{len(names1)} first-level and {len(names2)} second-level divisions named")

    # Population-weighted centres, gathered in one pass over cities5000.
    # Columns: 0 id, 1 name, 2 ascii, 3 alt, 4 lat, 5 lon, 8 cc, 10 adm1, 11 adm2, 14 pop
    acc = collections.defaultdict(lambda: [0.0, 0.0, 0.0, 0])   # wlat, wlon, w, towns
    for line in open(os.path.join(a.src, "cities5000.txt"), encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if len(f) < 15:
            continue
        cc, a1, a2 = f[8], f[10], f[11]
        if cc not in wanted or not a1:
            continue
        try:
            lat, lon, pop = float(f[4]), float(f[5]), int(f[14] or 0)
        except ValueError:
            continue
        # Weight by population, but never by zero: a town of 5,000 recorded as
        # 0 is a missing figure, not an empty town.
        w = float(max(pop, 5000))
        keys = [f"{cc}.{a1}"] + ([f"{cc}.{a1}.{a2}"] if a2 else [])
        for key in keys:
            s = acc[key]
            s[0] += lat * w
            s[1] += lon * w
            s[2] += w
            s[3] += 1

    out, missing = [], collections.Counter()
    for key, (wlat, wlon, w, towns) in sorted(acc.items()):
        parts = key.split(".")
        cc = parts[0]
        level = len(parts) - 1
        name = (names1 if level == 1 else names2).get(key)
        if not name:
            missing[cc] += 1
            continue
        out.append({
            "key": key, "cc": cc, "level": "adm1" if level == 1 else "adm2",
            "name": name,
            "adm1": names1.get(f"{cc}.{parts[1]}"),
            "lat": round(wlat / w, 4), "lon": round(wlon / w, 4),
            "towns": towns,
        })

    named = collections.Counter(d["cc"] for d in out)
    print(f"\n{len(out)} divisions with a defensible centre")
    print("  " + " · ".join(f"{k}:{v}" for k, v in named.most_common(16)))
    if missing:
        print(f"\n{sum(missing.values())} division codes appear in cities5000 but "
              f"are unnamed in GeoNames' own tables — skipped, not invented:")
        print("  " + " · ".join(f"{k}:{v}" for k, v in missing.most_common(10)))

    path = "data/admin-divisions.json"
    json.dump({
        "note": ("Every first- and second-level administrative division on earth "
                 "that holds a town of 5,000, for the countries this atlas covers. "
                 "The filing units records are actually kept in. Position is the "
                 "population-weighted centre of the towns inside, which puts the "
                 "dot where the registrar was. Built by "
                 "scripts/harvest-admin-divisions.py."),
        "source": "GeoNames admin1CodesASCII, admin2Codes and cities5000, CC BY 4.0 — https://www.geonames.org/",
        "divisions": out,
    }, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"\n{len(out)} -> {path}")


if __name__ == "__main__":
    main()

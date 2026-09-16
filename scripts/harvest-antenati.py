#!/usr/bin/env python3
"""Every Italian State Archive that publishes through Antenati.

WHY THE SITEMAP AND NOTHING ELSE. Antenati's robots.txt permits everything —
`User-agent: * / Disallow:` — and advertises a sitemap index, which is a site
saying in the clearest available terms «here is what I have, come and read
it». Its firewall does not agree: the sitemap is served to a browser and
refused to an honest RecordAtlasHarvest user agent. Rather than dress up as
Chrome to get round a firewall, this script asks for the ONE file the site
publishes for crawlers and then stops. The archive slugs inside it already name
every institution and the town it stands in, so not one further request is made
— no catalogue pages, no browse tree, nothing.

That is the whole harvest: a hundred-odd institutions, from one file.

WHAT IT DOES NOT GET, and this is worth saying: the comuni and their volumes.
Those live behind a browse tree that would take thousands of requests to walk,
and the polite way to that is to ask the Archivio di Stato for the data rather
than to take it a page at a time.

    python3 scripts/harvest-antenati.py --sitemap ant_archivio-sitemap.xml
"""
import argparse, json, os, re, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def titlecase(s):
    small = {"di", "del", "della", "dei", "e", "in", "a", "da", "sezione"}
    out = []
    for i, w in enumerate(s.split("-")):
        out.append(w if (w in small and i) else w.capitalize())
    return " ".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sitemap", required=True)
    ap.add_argument("--geonames", help="GeoNames cities500.txt, to place each archive")
    a = ap.parse_args()

    x = open(a.sitemap, encoding="utf-8").read()
    slugs = set()
    for loc in re.findall(r"<loc>(.*?)</loc>", x):
        if "?lang=" in loc:                       # the same archive in six languages
            continue
        m = re.search(r"/archivio/([a-z0-9-]+)/?$", loc)
        if m and m.group(1).startswith("archivio-di-stato-di"):
            slugs.add(m.group(1))

    # The town an archive stands in. A «sezione di X» is a branch with its own
    # building in X, which is the town a reader would have to travel to.
    rows = []
    for s in sorted(slugs):
        rest = s[len("archivio-di-stato-di-"):]
        if "-sezione-di-" in rest:
            prov, town = rest.split("-sezione-di-", 1)
        else:
            prov, town = rest, rest
        rows.append({"slug": s, "prov": titlecase(prov), "town": titlecase(town),
                     "name": "Archivio di Stato di " + titlecase(rest.replace("-sezione-di-", " — sezione di "))})

    # Coordinates, from the same GeoNames file the place importer uses.
    coords = {}
    if a.geonames and os.path.exists(a.geonames):
        for line in open(a.geonames, encoding="utf-8"):
            f = line.split("\t")
            if len(f) < 15 or f[8] != "IT":
                continue
            # ALTERNATE NAMES TOO. GeoNames files Napoli under «Naples», Roma
            # under «Rome» and Firenze under «Florence», so indexing only the
            # primary name lost the four biggest archives in Italy.
            names = [f[1], f[2]] + (f[3].split(",") if f[3] else [])
            for nm in names:
                k = fold(nm.strip())
                if k and k not in coords:
                    coords[k] = (float(f[4]), float(f[5]))

    provs = json.load(open("data/providers.json"))
    have = {p["id"] for p in provs["providers"]}
    added, unplaced = 0, []
    for r in rows:
        pid = "asd-" + re.sub(r"[^a-z0-9]+", "-", fold(r["slug"][len("archivio-di-stato-di-"):]))[:40].strip("-")
        if pid in have:
            continue
        # Slugs carry artefacts — «genova-2», «pesaro-urbino» — so a few
        # shortened forms are tried before giving up.
        cand = [r["town"], r["prov"],
                re.sub(r"\s*\d+$", "", r["town"]), re.sub(r"\s*\d+$", "", r["prov"]),
                r["town"].split(" ")[0], r["prov"].split(" ")[0]]
        xy = next((coords[fold(c)] for c in cand if fold(c) in coords), None)
        if not xy:
            unplaced.append(r["town"])
            continue
        provs["providers"].append({
            "id": pid, "name": r["name"],
            "url": f"https://antenati.cultura.gov.it/archivio/{r['slug']}/",
            "kind": "regional-archive", "access": "free", "countries": ["IT"],
            # NO DATE CLAIM. The first draft told all 119 of these that "Italy's
            # civil registers begin in 1809 on the mainland and 1820 in Sicily",
            # which is true of the Kingdom of Naples and wrong for every archive
            # north of it — the Napoleonic Kingdom of Italy started in 1806 and
            # Lombardy-Venetia is different again. One sentence, repeated a
            # hundred times, would have been a hundred wrong answers.
            "what": (f"The state archive of {r['town']}, publishing civil registration "
                     f"images through Antenati — free, and without an account. Its own "
                     f"page states how far the digitisation has got and which years it "
                     f"covers; those differ archive by archive."),
            "deepLink": None, "checked": "2026-09-16",
            "at": {"lat": round(xy[0], 4), "lon": round(xy[1], 4),
                   "place": f"{r['town']}, Italy"},
        })
        have.add(pid)
        added += 1

    json.dump(provs, open("data/providers.json", "w"), ensure_ascii=False, indent=2)
    print(f"{len(slugs)} archives in the sitemap, {added} added, "
          f"{len(provs['providers'])} providers in all")
    if unplaced:
        print(f"{len(unplaced)} could not be placed: {unplaced[:10]}")


if __name__ == "__main__":
    main()

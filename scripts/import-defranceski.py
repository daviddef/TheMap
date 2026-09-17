#!/usr/bin/env python3
"""One-shot: lift the Croatian shelf out of the Defranceski archive.

A SNAPSHOT, deliberately — not a live cross-repo read. Record Atlas must build
on a fresh clone with nothing beside it, and the family archive must be free to
change its own shapes without breaking a public site.

What comes across: places, coordinates, name variants, and every register
volume with its deep link. What does NOT: people, graves, and above all the
read/unread progress. «How far David has got» is a fact about David. This map
colours by what a stranger can actually open, which is a fact about the world.

    python3 scripts/import-defranceski.py [--src PATH] [--out data/places.json]
"""
import argparse, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import country_of, in_ring_latlon

SRC = "/Users/daviddefranceski/Claude/Projects/Defranceski Family/site/src/data/researchmap.json"

# HAND-RUN ONLY, AND NEVER FROM THE BUILD. This reads a sibling repository
# through an absolute path that exists on one laptop. That is fine for a
# snapshot importer — it writes a committed file and stops — and it is
# catastrophic in a build step, which is exactly what happened to
# build-surnames.py: in CI the path did not exist, the read returned nothing,
# and the deployed dataset silently lost every archive attestation. If this
# ever needs to run at build time, snapshot it first.
import sys as _sys, os as _os2
if not _os2.path.exists(SRC):
    _sys.exit("SRC is not here: " + SRC + "
"
              "This is a hand-run snapshot importer. It cannot run without the "
              "sibling archives, and it must never be wired into npm run build.")

# The family archive's eight provider keys collapse to three real providers.
# `fs-cat` is the library CATALOGUE, not the image collections — a card saying
# a book exists. Calling that "images, free with an account" would be a lie of
# exactly the kind this map exists to stop.
PROVIDER = {
    "fs-hr": "familysearch", "fs-it": "familysearch", "fs-it-pola": "familysearch",
    "fs-si-mj": "familysearch", "fs-hr-delnice": "familysearch", "fs-cat": "familysearch",
    "dapa": "dapa", "antenati": "antenati",
}
CATALOGUE_ONLY = {"fs-cat"}

DENOM = {"rc": "Roman Catholic", "orth": "Orthodox", "gc": "Greek Catholic",
         "jew": "Jewish", "mil": "Military", "ref": "Reformed",
         "civil": "Civil registration", "ev": "Evangelical", "all": ""}

# Record kinds, read off the volume title in the four languages these books
# are actually titled in.
KINDS = [
    ("b", r"\b(births?|ro[dđ]eni|krstenih|nati|battesimi|taufen|geboren)\b"),
    ("m", r"\b(marriages?|vjen[cč]ani|matrimoni|trauungen|heiraten)\b"),
    ("d", r"\b(deaths?|umrli|burials?|morti|sterben|verstorbene)\b"),
    ("s", r"\b(status animarum|anagrafe|soul)\b"),
    ("i", r"\b(index|kazalo|indice)\b"),
]


def kinds_of(title):
    t = (title or "").lower()
    return [k for k, rx in KINDS if re.search(rx, t)] or []


ANTENATI_BASE = "https://antenati.cultura.gov.it/ark:/12657/"


def antenati_url(b):
    return ANTENATI_BASE + b["ark"] if b.get("ark") else None


def fs_url(b):
    ark = b.get("ark")
    if not ark:
        return None
    q = ""
    if b.get("cc"):
        q = "?cc=" + str(b["cc"])
        if b.get("wc"):
            from urllib.parse import quote
            q += "&wc=" + quote(str(b["wc"]))
    return f"https://www.familysearch.org/ark:/61903/{ark}{q}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=SRC)
    ap.add_argument("--out", default="data/places.json")
    ap.add_argument("--regions", default="data/regions.json")
    a = ap.parse_args()

    if not os.path.exists(a.src):
        sys.exit(f"source not found: {a.src}\n"
                 "This importer is a one-shot against a local sibling checkout. "
                 "data/places.json is committed, so a fresh clone never needs to run it.")

    src = json.load(open(a.src))
    regions = json.load(open(a.regions))["regions"]
    OVR = json.load(open("data/country-overrides.json"))["overrides"]

    places, skipped, ncoll, nocountry = [], 0, 0, []
    for p in src["places"]:
        if not p.get("lat") or not p.get("lon"):
            skipped += 1
            continue

        names = []
        for n in (p.get("alt") or []):
            names.append({"n": n, "kind": "alt"})
        for n in (p.get("older") or []):
            names.append({"n": n, "kind": "older"})

        collections = []
        for key, sv in (p.get("sources") or {}).items():
            provider = PROVIDER.get(key)
            if not provider:
                continue
            for denom, shelf in (sv.get("shelves") or {}).items():
                for b in shelf.get("books", []):
                    title = b.get("t") or ""
                    if provider == "familysearch":
                        url = fs_url(b)
                    elif provider == "antenati":
                        url = antenati_url(b)
                    else:
                        url = None

                    if key in CATALOGUE_ONLY or (provider == "familysearch" and not url):
                        access = "catalogue"
                    elif provider == "familysearch":
                        access = "account"
                    elif provider == "antenati":
                        access = "free" if url else "catalogue"
                    else:                                   # dapa
                        access = "onsite"

                    c = {
                        "provider": provider, "title": title,
                        "kinds": kinds_of(title),
                        "from": b.get("from"), "to": b.get("to"),
                        "access": access,
                    }
                    if url:
                        c["url"] = url
                    if denom and denom != "all":
                        c["denom"] = denom
                    if b.get("held"):
                        c["held"] = b["held"]
                    if b.get("no"):
                        c["ref"] = str(b["no"])
                    if key in CATALOGUE_ONLY:
                        c["note"] = "A catalogue entry. The book exists; nobody has photographed it for the web."
                    collections.append(c)
                    ncoll += 1

        # Which record region is this in? Most are in none of the six drawn so
        # far, and that must stay visible — an unmapped place is not a place
        # with no history.
        region = None
        for r in regions:
            if in_ring_latlon(p["lat"], p["lon"], r["ring"]):
                region = r["id"]
                break

        rec = {
            "id": p["key"], "name": p["name"],
            "lat": round(p["lat"], 5), "lon": round(p["lon"], 5),
            "collections": collections,
        }
        cc = OVR.get(p["key"], {}).get("country") or country_of(p["lat"], p["lon"])
        if cc:
            rec["country"] = cc
        else:
            nocountry.append(p["key"])
        if names:
            rec["names"] = names
        if region:
            rec["region"] = region
        if p.get("layers"):
            rec["denoms"] = p["layers"]
        places.append(rec)

    places.sort(key=lambda x: x["name"])
    out = {
        "note": "Snapshot of the Croatian shelf, imported from the Defranceski archive "
                "by scripts/import-defranceski.py. Progress state was dropped on the way "
                "in; access was re-derived. Committed, so a fresh clone needs no sibling.",
        "source": "The Defranceschi Archive — researchmap.json",
        "imported": "2026-09-16",
        "places": places,
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=1)

    inreg = sum(1 for p in places if p.get("region"))
    print(f"{len(places)} places, {ncoll} collections -> {a.out}")
    print(f"{skipped} skipped for want of coordinates")
    print(f"{inreg} fall inside a drawn record region; {len(places)-inreg} do not yet")
    import collections as _c
    print("countries:", dict(_c.Counter(p.get("country") for p in places).most_common()))
    if nocountry:
        print(f"{len(nocountry)} could not be placed in any country: {nocountry[:8]}")


if __name__ == "__main__":
    main()

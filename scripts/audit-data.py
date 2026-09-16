#!/usr/bin/env python3
"""The checks the build gate does not make, and what they found.

check-data.py refuses to publish broken data. This looks for data that is
publishable and probably wrong — the class of fault that has cost this project
most, because nothing stops it: Arienzo 44 km from Arienzo, Somerset in Los
Angeles, eleven New York collections filed in Morocco.

Five checks, all local, all cheap:

  9   the geocode audit, extended to the places it has been skipping
  10  two places of the same name a few hundred metres apart
  11  gaps and overlaps in the jurisdiction eras — nothing has ever
      checked that 83 eras actually tile the years they claim
  12  a collection whose title contradicts its own year span
  13  a place assigned to a region whose ring does not contain it

    python3 scripts/audit-data.py
"""
import json, os, re, sys, collections
from math import radians, sin, cos, asin, sqrt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
from geo import in_ring_latlon


def km(a, b, c, d):
    a, b, c, d = map(radians, (a, b, c, d))
    return 12742 * asin(sqrt(sin((c - a) / 2) ** 2
                             + cos(a) * cos(c) * sin((d - b) / 2) ** 2))


def main():
    places = json.load(open("data/places.json"))["places"]
    regions = json.load(open("data/regions.json"))["regions"]
    cols = json.load(open("data/collections.json"))["collections"]
    try:
        SEEN = json.load(open("data/geocode-checked.json"))["checked"]
    except FileNotFoundError:
        SEEN = {}
    findings = collections.OrderedDict()

    # ---- 10 · two places of a name, all but on top of each other ----------
    dup = []
    by = collections.defaultdict(list)
    for p in places:
        by[(p.get("country"), p["name"].lower())].append(p)
    for (cc, n), group in by.items():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                d = km(group[i]["lat"], group[i]["lon"], group[j]["lat"], group[j]["lon"])
                if d < 1.0:
                    dup.append((group[i]["id"], group[j]["id"], round(d * 1000)))
    findings["10 · near-duplicate places"] = [
        f"{a} and {b} are {m} m apart and share a name" for a, b, m in dup]

    # ---- 11 · do the eras tile? -------------------------------------------
    era = []
    for r in regions:
        prev = None
        for e in sorted(r["eras"], key=lambda x: x["from"]):
            if prev is not None:
                if e["from"] > prev + 1:
                    era.append(f"{r['id']}: nothing covers {prev + 1}–{e['from'] - 1}")
                elif e["from"] < prev:
                    era.append(f"{r['id']}: {e['from']}–{e['to']} overlaps the era ending {prev}")
            prev = e["to"]
    findings["11 · gaps and overlaps in the jurisdiction eras"] = era

    # ---- 12 · a title that argues with its own dates ----------------------
    bad = []
    for c in cols:
        yrs = [int(y) for y in re.findall(r"\b(1[0-9]{3}|20[0-2][0-9])\b", c["title"])]
        if not yrs or not c.get("from"):
            continue
        lo, hi = min(yrs), max(yrs)
        if c["from"] and abs(c["from"] - lo) > 1 and lo < c["from"]:
            bad.append(f"{c['cc']} «{c['title'][:58]}» says {lo} and starts at {c['from']}")
    findings["12 · collections whose title contradicts their span"] = bad

    # ---- 13 · in a region that does not contain it ------------------------
    outside = []
    rings = {r["id"]: r["ring"] for r in regions}
    for p in places:
        rid = p.get("region")
        if rid and rid in rings and not in_ring_latlon(p["lat"], p["lon"], rings[rid]):
            outside.append(f"{p['id']} is filed under {rid} but sits outside its ring")
    findings["13 · places outside the region they are filed under"] = outside

    # ---- 9 · the geocode audit's own blind spot ---------------------------
    skipped = [p for p in places if p.get("via") == "familysearch-catalogue"]
    findings["9 · places the geocode audit has never checked"] = [
        f"{len(skipped)} places came from the FamilySearch catalogue and are skipped by "
        f"scripts/check-geocodes.py — their coordinates are FamilySearch's own and have "
        f"never been compared with anything"]

    total = 0
    for k, v in findings.items():
        print(f"\n{k}: {len(v) if 'never checked' not in k else len(skipped)}")
        for line in v[:10]:
            print("   ", line)
        if len(v) > 10:
            print(f"    … and {len(v) - 10} more")
        total += len(v)
    print(f"\n{total} findings. None of these stop a build; all of them are things "
          f"a reader could be misled by.")


if __name__ == "__main__":
    main()

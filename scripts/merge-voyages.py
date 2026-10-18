#!/usr/bin/env python3
"""Merge reviewed voyage patches (/tmp/.../V*-voyages.json or the paths given) into data/voyages.json.

Hand-run. Refuses a voyage that breaks scripts/voyages_check.py, and a duplicate id; prints why.
"""
import glob, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import voyages_check as vc
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "voyages.json")
slugs = {f[:-5] for f in os.listdir(os.path.join(ROOT, "site", "src", "flags-pages")) if f.endswith(".html")}
cur = json.load(open(OUT)) if os.path.exists(OUT) else {"voyages": []}
have = {v["id"]: v for v in cur["voyages"]}
files = sys.argv[1:] or sorted(glob.glob("/tmp/flagwork/patches/V*-voyages.json"))
bad = 0
for f in files:
    for v in json.load(open(f))["voyages"]:
        p = vc.problems(v, slugs)
        if p:
            bad += len(p); print("REJECT", f.split("/")[-1], *p, sep="\n   ")
            continue
        have[v["id"]] = v
doc = {"note": ("Expeditions and voyages drawn on the History page: dated waypoints, a leader with a Wikidata id, a sponsor, "
                "what was reached and the claim made for it, and at least two sources. 'Reached' is worded as the sources "
                "word it (first recorded landing by Europeans, first crossing): nobody discovers an inhabited land."),
       "voyages": sorted(have.values(), key=lambda v: (v["from"], v["id"]))}
json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(doc["voyages"]), "voyages;", bad, "problems")

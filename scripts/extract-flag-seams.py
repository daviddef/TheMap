#!/usr/bin/env python3
"""Write data/flag-seams.json, keeping every verdict a person has already given.

    python3 scripts/extract-flag-seams.py          # add new seams as `unreviewed`, drop gone ones
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flag_seams as fs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
eras = json.load(open("data/flag-eras.json", encoding="utf-8"))["eras"]
art = json.load(open("data/era-flags.json", encoding="utf-8")).get("art") or {}
try:
    old = json.load(open("data/flag-seams.json", encoding="utf-8"))
except Exception:
    old = {}
had = {k: v for k, v in (old.get("seams") or {}).items()}
out = {}
for s in fs.seams(eras):
    k = fs.key(s)
    prev = had.get(k) or {}
    out[k] = {"kind": s[1], "years": s[4],
              "verdict": prev.get("verdict", "unreviewed"),
              **({"why": prev["why"]} if prev.get("why") else {})}
noid, noimg = fs.structure(eras, art)
doc = {
    "note": "Every place on a flag page where one era does not meet the next, and every era with no id or no image. A new one fails the build until it has a verdict; `unreviewed` is the honest default and the count is printed on every build. See scripts/flag_seams.py.",
    "verdicts": fs.VERDICTS,
    "seams": dict(sorted(out.items())),
    "noId": [list(x) for x in noid],
    "noImage": [list(x) for x in noimg],
}
json.dump(doc, open("data/flag-seams.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
open("data/flag-seams.json", "a").write("\n")
n = {}
for v in out.values():
    n[v["verdict"]] = n.get(v["verdict"], 0) + 1
print(f"{len(out)} seams {n}; {len(noid)} eras without an id; {len(noimg)} without an image")

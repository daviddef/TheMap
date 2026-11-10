#!/usr/bin/env python3
"""File the FamilySearch collections that reached no country, by the country their own title names.

data/collections.json is a harvest. A collection whose place ids resolved to nothing and whose title's first
word was not in the harvester's table (ISO, SUBDIVISION) was kept with `countries: []`, so no country page
listed it. This applies the harvester's own table (scripts/harvest-familysearch.py `from_title`) to those
rows and writes nothing else. Evidence is the title alone: «British Virgin Islands, Civil Registration» names
its country. A title that names none (IGI, Find a Grave, «World Miscellaneous Births») stays unfiled, which
is true: it belongs to no one country. Idempotent; run it after a re-harvest.

    python3 scripts/file-collections-by-title.py [--dry-run]
"""
import importlib.util, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
spec = importlib.util.spec_from_file_location("hf", "scripts/harvest-familysearch.py")
hf = importlib.util.module_from_spec(spec); spec.loader.exec_module(hf)

PATH = "data/collections.json"
d = json.load(open(PATH, encoding="utf-8"))
known = set(json.load(open("data/countries.json", encoding="utf-8"))["countries"])
changed, left = [], []
for c in d["collections"]:
    if c.get("countries"):
        continue
    t = [x for x in (hf.from_title(c["title"]) or []) if x in known]
    if not t:
        left.append(c); continue
    c["countries"] = sorted(t)
    c["filedUnder"] = sorted(t)
    changed.append(c)
for c in changed:
    print(f"  filed {','.join(c['countries']):3s} {c['records'] or 0:>10,}  {c['title'][:70]}")
print(f"{len(changed)} filed; {len(left)} still name no country: " + "; ".join(c["title"][:40] for c in left))
if changed and "--dry-run" not in sys.argv:
    json.dump(d, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("written", PATH)

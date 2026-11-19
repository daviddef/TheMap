#!/usr/bin/env python3
"""data/{place-names,directory,collections}.json -> site/public/<same name>, so that each has an address on recordatlas.org.

These three catalogues were readable only on GitHub. Each is published as it stands, with two additive top-level fields so that a person or a program
reading the PUBLISHED file finds the licence in the file itself (the rule /data/ states for every file): `licence` and, where one is needed, `licenceNote`.
The source files in data/ are not rewritten here. A file whose licence is missing and not covered below stops the build rather than going out unlabelled.

  place-names.json   declares CC0 itself (scripts/place_names.py writes it).
  directory.json     contributed by David Defranceski, who released it under CC0 on 19 Nov 2026 (the licence field in data/directory.json says so).
  collections.json   FamilySearch's public catalogue metadata. NO LICENCE IS STATED for it and none is asserted: it is published with that said plainly,
                     the way the Croatian State Archives holdings are, so that a reuser is told what they are taking on and not left to assume.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "public")

NOTES = {
    "collections.json": {
        "licence": "No licence stated",
        "licenceNote": ("FamilySearch's public catalogue metadata: collection titles, years, and record and image counts, read on the date in `harvested`. "
                        "FamilySearch states no licence for it here and none is asserted. Titles and counts are facts about its catalogue, not this project's work, "
                        "and are published so a researcher can see what exists. Read FamilySearch's own terms before reusing them at scale."),
    },
}


def main():
    for name in ("place-names.json", "directory.json", "collections.json"):
        src = os.path.join(ROOT, "data", name)
        d = json.load(open(src, encoding="utf-8"))
        if not isinstance(d, dict):
            sys.exit(f"{name}: expected an object at the top")
        for k, v in NOTES.get(name, {}).items():
            d.setdefault(k, v)
        if not (d.get("licence") or d.get("license")):
            sys.exit(f"{name} declares no licence and build-open-data.py has none for it. Say what it is under before publishing it.")
        dst = os.path.join(OUT, name)
        with open(dst, "w", encoding="utf-8") as fh:
            json.dump(d, fh, ensure_ascii=False, separators=(",", ":"))
            fh.write("\n")
        print(f"{name:20} {os.path.getsize(dst) / 1024:8.1f} KB   licence: {(d.get('licence') or d.get('license'))[:48]}")


if __name__ == "__main__":
    main()

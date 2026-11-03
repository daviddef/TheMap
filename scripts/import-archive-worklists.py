#!/usr/bin/env python3
"""Count each family archive's work list, for the Atlas's /worklist/ page.

The Atlas work list is the Atlas's own. Each family archive keeps another, in its own repo, and
nothing joined them: a reader of /worklist/ could take it for the whole estate's. This reads the
sibling checkouts (../<Name> Family/site/src/data/worklist.json) and writes the COUNTS only to
site/src/data/archive-worklists.json, which the page shows as a roll-up with a link to each
archive's own list. No row text is copied: the archive's page is the one that is kept true.

CI builds the Atlas from a lone clone, so it cannot read the siblings; this runs on the
machine that has them, and the result is committed. The page says when it was read.

    python3 scripts/import-archive-worklists.py
"""
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FAMILY = os.path.dirname(ROOT)
OUT = os.path.join(ROOT, "site", "src", "data", "archive-worklists.json")
STATES = ["running", "next", "blocked", "done", "struck"]

# (folder, name on the page, published host). Alphabetical by name: a list ordered by size reads as unsorted.
ARCHIVES = [
    ("Blazevic Family", "Blažević", "blazevic.defranceski.com"),
    ("Booyzen Family", "Booyzen", "booyzen.defranceski.com"),
    ("D'arcy Family", "D'Arcy", "darcy.defranceski.com"),
    ("Defranceski Family", "Defranceschi", "archive.defranceski.com"),
    ("Falco Family", "Falco", "falco.defranceski.com"),
    ("Lerena Family", "Lerena", "lerena.defranceski.com"),
    ("Luwinski Family", "Luwinski", "luwinski.defranceski.com"),
    ("Mazza Family", "Mazza", "mazza.defranceski.com"),
]


def main():
    out = []
    for folder, name, host in sorted(ARCHIVES, key=lambda a: a[1].lower()):
        path = os.path.join(FAMILY, folder, "site", "src", "data", "worklist.json")
        try:
            rows = json.load(open(path, encoding="utf-8"))["rows"]
        except (OSError, ValueError, KeyError) as e:
            print(f"cannot read {path}: {e}", file=sys.stderr)
            return 1
        counts = {s: sum(1 for r in rows if r.get("state") == s) for s in STATES}
        unknown = sorted({str(r.get("state")) for r in rows} - set(STATES))
        if unknown:
            print(f"{name}: states not counted: {unknown}", file=sys.stderr)
            return 1
        out.append({"id": folder.split(" ")[0].lower().replace("'", ""), "name": name,
                    "url": f"https://{host}/worklist/", "counts": counts,
                    "open": counts["running"] + counts["next"] + counts["blocked"]})
    doc = {"exported": datetime.date.today().isoformat(),
           "note": "Counts only, read from each archive's own worklist.json by scripts/import-archive-worklists.py. "
                   "The archive's page is the live one; this is a summary taken on the date above.",
           "archives": out}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    for a in out:
        print(f"{a['name']:<14} open {a['open']:>3}  {a['counts']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

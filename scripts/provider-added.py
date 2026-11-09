#!/usr/bin/env python3
"""When each source first appeared in data/providers.json, kept in data/provider-added.json.

The directory has a `checked` date (when a person last looked), which says nothing about
when a source arrived. The /providers/ page shows the newest arrivals at the top, so it needs
the arrival date; it is derived once from git history and then only extended:

    python3 scripts/provider-added.py          # add dates for ids not yet in the file
    python3 scripts/provider-added.py --rebuild  # recompute everything from history

An id with no entry is shown with its `checked` date instead (a new row is written the day it
is checked), so forgetting to run this never hides a source; it only dates it less exactly.
"""
import json, subprocess, sys, os, collections

OUT = "data/provider-added.json"

def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True, check=True).stdout

def main():
    rebuild = "--rebuild" in sys.argv
    have = {} if rebuild or not os.path.exists(OUT) else json.load(open(OUT, encoding="utf-8"))
    cur = {p["id"] for p in json.load(open("data/providers.json", encoding="utf-8"))["providers"]}
    todo = cur - set(have)
    if todo:
        seen = set()
        commits = [l.split("\t") for l in git("log", "--reverse", "--format=%H\t%ad", "--date=short",
                                              "--", "data/providers.json").splitlines() if l]
        for h, day in commits:
            try:
                ids = {p["id"] for p in json.loads(git("show", f"{h}:data/providers.json"))["providers"]}
            except Exception:
                continue
            for i in ids - seen:
                if i in todo:
                    have[i] = day
            seen |= ids
            if not (todo - set(have)):
                break
    # ids still unknown are in the working tree but not yet committed: dated today
    import datetime
    today = datetime.date.today().isoformat()
    for i in todo - set(have):
        have[i] = today
    have = {k: have[k] for k in sorted(have) if k in cur}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(have, f, ensure_ascii=False, indent=0, sort_keys=True)
        f.write("\n")
    c = collections.Counter(have.values())
    print(f"{len(have)} sources dated; newest days:", sorted(c.items(), reverse=True)[:8])

main()

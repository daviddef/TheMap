#!/usr/bin/env python3
"""Which register files really changed in the weekly refresh, ignoring the date.

The harvest scripts stamp `harvested` with today's date, so every run changes
every file by one line and `git diff --stat` said «new answers» every week
whether or not DZS or Statbel had said anything new. This compares the old
(HEAD) and new content with that key left out, and says in numbers what moved,
so a person reading the issue can see a growth from a shrinkage (a refresh that
returns FEWER answers than the committed file is a failed refresh, not news).

Prints one line per file that really changed, nothing if none did."""
import json
import subprocess

FILES = ["data/frequencies/hr.json", "data/frequencies/be.json",
         "data/belgium-by-municipality.json"]


def strip(d):
    return {k: v for k, v in d.items() if k != "harvested"} if isinstance(d, dict) else d


def sizes(d):
    """Length of every top-level list or dict: what a reader can count."""
    return {k: len(v) for k, v in d.items() if isinstance(v, (list, dict))} if isinstance(d, dict) else {}


def main():
    for f in FILES:
        old = subprocess.run(["git", "show", "HEAD:" + f], capture_output=True, text=True)
        if old.returncode:
            print(f"{f}: new file")
            continue
        try:
            a, b = json.loads(old.stdout), json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError) as e:
            print(f"{f}: could not be compared ({e})")
            continue
        if strip(a) == strip(b):
            continue
        sa, sb = sizes(a), sizes(b)
        moved = [f"{k} {sa.get(k, 0)} -> {sb.get(k, 0)}" for k in sorted(set(sa) | set(sb))
                 if sa.get(k, 0) != sb.get(k, 0)]
        shrank = any(sb.get(k, 0) < sa.get(k, 0) for k in sa)
        print(f"{f}: changed" + (" (" + "; ".join(moved) + ")" if moved else " (values, same counts)")
              + ("  ** SHRANK: check before trusting **" if shrank else ""))


if __name__ == "__main__":
    main()

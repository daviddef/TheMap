#!/usr/bin/env python3
"""Does a collection filed under Italy still reach its Croatian parishes?

This is the product thesis in one test. It runs the real matcher over a real
walk of "Italy, Pola and Trieste, Catholic Church Records" and asserts both
halves of the behaviour:

  MUST CROSS — Verteneglio is Brtonigla in Croatia, Buie is Buje in Croatia,
  Isola d'Istria is Izola in Slovenia. A collection filed under Italy has to
  put those books on those places, or somebody with Istrian family will
  never find them.

  MUST NOT CROSS — a lone parish name that happens to exist over a border is
  a coincidence, not a finding. Davor, Bale and Čabar are Croatian villages
  this shelf has not drawn, and each is also a real village in Bosnia,
  Montenegro or Slovenia. An earlier cut of the matcher put 126 Croatian
  books into those three countries, confidently and wrongly.

    python3 scripts/test-cross-border.py
"""
import json, os, subprocess, sys, tempfile, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
LIVE = "data/fs-waypoints.json"
FIX = "data/_fixtures/pola-trieste-waypoints.json"

MUST_CROSS = {"brtonigla": "HR", "buje": "HR", "izola": "SI"}
MUST_NOT = {"Davor", "Bale", "Čabar", "Borojevići", "Topolo",
            # Brazilian municipalities whose names are shared across the
            # Americas. Brazil's registers do not interleave with anyone's.
            "Califórnia", "Colorado", "Flórida", "Belém", "Buenos Aires"}

# A province may say WHICH COUNTRY a path is in; it may never be the answer
# to which town. "Pola" is an alternate name of Polla in Campania, so four
# books from Materada near Umag in Croatia were placed 600km away in Italy —
# in the collection's own country, which is what made it look reasonable.
MUST_NOT_PLACE = {"g-polla-it"}


def main():
    # EVERYTHING THIS TOUCHES IS PUT BACK. The matcher writes three real
    # data files, so a test run left the repository holding results derived
    # from a 38-volume fixture — which then built into the site. A test that
    # quietly replaces the data it was checking is worse than no test.
    OUTPUTS = ["data/fs-volumes-world.json.gz", "data/fs-volumes-world.json", "data/fs-volumes-unplaced.json",
               "data/fs-volumes-promote.json"]
    backup = {}
    for f in [LIVE] + OUTPUTS:
        if os.path.exists(f):
            backup[f] = tempfile.mktemp(suffix=".json")
            shutil.copy(f, backup[f])
    try:
        shutil.copy(FIX, LIVE)
        r = subprocess.run([sys.executable, "scripts/match-fs-volumes.py"],
                           capture_output=True, text=True)
        if r.returncode:
            print(r.stdout, r.stderr)
            sys.exit("the matcher itself failed")
        import gzip
        with gzip.open("data/fs-volumes-world.json.gz", "rt", encoding="utf-8") as fh:
            world = json.load(fh)["byPlace"]
    finally:
        for f, b in backup.items():
            shutil.copy(b, f)
            os.unlink(b)

    fails = []
    for pid, cc in MUST_CROSS.items():
        rows = world.get(pid) or []
        crossed = [r for r in rows if r.get("crossed")]
        if not crossed:
            fails.append(f"{pid} ({cc}) got no book from the Italian collection — "
                         f"the cross-border join has stopped working")
        else:
            print(f"  ok   {pid:12s} {len(crossed):3d} books, filed under "
                  f"{crossed[0].get('filedCc')}, via {crossed[0].get('in','')[:38]}")
    for pid in MUST_NOT_PLACE:
        if pid in world:
            fails.append(f"{pid} has books again — a province level was used as "
                         f"the destination instead of only vouching for a country")
    for pid, rows in world.items():
        for r in rows:
            if r.get("crossed") and any(m in (r.get("in") or "") for m in MUST_NOT):
                fails.append(f"{pid} crossed a border on a lone name: {r.get('in')}")
    if fails:
        print("\nFAIL:")
        for f in fails:
            print("  " + f)
        sys.exit(1)
    print("\ncross-border matching holds")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Re-open the oldest provider links, a batch at a time.

check-data.py warns when a provider has not been re-checked in 365 days.
506 of them now carry the same handful of dates, so in a year the whole
directory goes off at once and the warning becomes a wall nobody reads —
which is the same failure mode as a gate that cries wolf.

So: take the N oldest, open them, and write the date back. A link that
stops resolving is reported and NOT silently dropped, because a provider
disappearing from the directory without anybody deciding it should is
worse than a stale date. ARHiNET — Croatia's national catalogue, served
as a dead NXDOMAIN for weeks — is the case this whole discipline exists
for, and it was found by a reader clicking it, not by this project.

    python3 scripts/recheck-providers.py --n 50 --write
"""
import argparse, collections, io, json, os, sys, time
import concurrent.futures as cf
from importlib.machinery import SourceFileLoader

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
verify = SourceFileLoader("_pa", "scripts/promote-archives.py").load_module().verify


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=50)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    prov = json.load(open("data/providers.json"),
                     object_pairs_hook=collections.OrderedDict)
    rows = [r for r in prov["providers"] if r.get("url")]
    rows.sort(key=lambda r: (r.get("checked") or "0000-00-00", r["id"]))
    batch = rows[:a.n]
    print(f"re-opening the {len(batch)} oldest of {len(rows)} "
          f"(oldest checked {batch[0].get('checked')})")

    with cf.ThreadPoolExecutor(8) as ex:
        out = list(ex.map(lambda r: (r, *verify(r["url"])), batch))

    today = time.strftime("%Y-%m-%d")
    tally, broken = collections.Counter(), []
    for r, verdict, url in out:
        tally[verdict] += 1
        if verdict == "https":
            r["checked"] = today
            if url != r["url"]:
                print(f"  moved   {r['id']:<28} -> {url[:56]}")
                r["url"] = url
        else:
            broken.append((r, verdict))
            print(f"  {verdict:<10} {r['id']:<28} {r['url'][:56]}")

    print(f"\n{dict(tally)}")
    if broken:
        print(f"{len(broken)} need a human: a dead link is worse than a "
              f"missing one, and removing an institution is somebody's "
              f"decision, not a script's.")
    if not a.write:
        print("(dry run — pass --write to apply)")
        return
    io.open("data/providers.json", "w", encoding="utf-8").write(
        json.dumps(prov, ensure_ascii=False, indent=1) + "\n")
    print("written")


if __name__ == "__main__":
    main()

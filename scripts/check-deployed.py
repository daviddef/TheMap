#!/usr/bin/env python3
"""What is live, against what is here — because green is not the same as right.

ELEVEN BUILDS WENT GREEN OVER A DATASET THAT HAD LOST A THIRD OF ITS
ATTESTATIONS. build-surnames.py read the family archives through a path that
exists on one laptop, CI had no such path, the glob returned nothing, and
nothing is a perfectly valid answer to a glob. Every check passed. The site
served Lerena with Spain and the United States and without Argentina and
Uruguay, and the only way anybody found out was David looking at it.

data/_floors.json now stops a shrinkage before it deploys. This asks the other
question, the one a floor cannot: does the thing on the internet match the
thing in this directory?

    python3 scripts/check-deployed.py [--base https://daviddef.github.io/TheMap]

It is deliberately NOT part of the build — it needs the network and it compares
against the PREVIOUS deploy, so a legitimate change makes it disagree. It is a
thing to run after pushing, and its job is to make an unexplained difference
impossible to miss rather than to have an opinion about an explained one.
"""
import argparse, json, subprocess, sys, os

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
UA = "RecordAtlasCheck/1.0 (+https://github.com/daviddef/TheMap)"


def get(url):
    """curl, not urllib — urllib's TLS cannot reach several of these hosts."""
    r = subprocess.run(["curl", "-sS", "-L", "--max-time", "60", "-A", UA, url],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


# Probe surnames whose attestations come from a family archive rather than a
# national register. They are the ones the path bug erased, so they are the
# ones worth asking about by name.
PROBES = ["Defranceski", "Lerena", "Blažević", "Booyzen", "Mazza", "D'Arcy"]


def fold(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://daviddef.github.io/TheMap")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    bad, notes = [], []

    live = get(base + "/index.json")
    if live is None:
        sys.exit("could not read the live index — is it deployed?")
    here = json.load(open("site/public/index.json"))

    for label, l, h in (("places", len(live["places"]), len(here["places"])),
                        ("countries named", len(live.get("countries") or {}),
                         len(here.get("countries") or {}))):
        mark = "same" if l == h else ("GREW" if h > l else "SHRANK")
        (bad if h < l else notes).append(f"  {label:22} live {l:>7,}  here {h:>7,}   {mark}")

    # The surnames, by name, from the sharded corpus the site actually serves.
    local = {}
    try:
        for r in json.load(open("data/surnames.json"))["surnames"]:
            k = fold(r["n"])
            if k in {fold(x) for x in PROBES}:
                local[k] = r
    except OSError:
        pass

    for name in PROBES:
        f = fold(name)
        key = "".join(c for c in f[:3] if c.isalnum())
        shard = get(f"{base}/s/{key}.json") or []
        got = next((r for r in shard if fold(r["n"]) == f), None)
        mine = local.get(f)
        lcc = sorted(c["cc"] for c in (got or {}).get("countries", []))
        hcc = sorted(c["cc"] for c in (mine or {}).get("countries", []))
        lost = [c for c in hcc if c not in lcc]
        line = f"  {name:14} live {','.join(lcc) or '—':<22} here {','.join(hcc) or '—'}"
        if lost:
            bad.append(line + f"   MISSING LIVE: {','.join(lost)}")
        else:
            notes.append(line)

    print("Deployed vs. built\n")
    for n in notes:
        print(n)
    if bad:
        print("\nWHAT THE LIVE SITE IS MISSING\n")
        for b in bad:
            print(b)
        print("\nIf you have just pushed, this is the previous deploy and will "
              "settle. If you have not, something shipped smaller than it was "
              "built — which is the exact shape of the bug this script exists for.")
        sys.exit(1)
    print("\nthe live site matches what is built here")


if __name__ == "__main__":
    main()

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


def shard_key(form):
    """First three alphanumerics anywhere in the string — see build.py."""
    k = ""
    for ch in form:
        if ch.isalnum():
            k += ch
            if len(k) == 3:
                break
    return k if len(k) == 3 else ""


def fold(s):
    """Accents off, separators KEPT — the same fold the dataset itself keys by.

    This got it wrong twice in opposite directions and both were instructive.
    Keeping the apostrophe made «D'Arcy» miss its own record and this script
    reported a name as absent from a live site that was serving it under seven
    countries. Stripping the apostrophe then made «D'Arcy» and «Darcy» — two
    genuinely different surnames, with different countries — collide onto one
    key, so the lookup returned whichever was written last and reported a
    mismatch that did not exist.

    A checker that cries wolf is worse than no checker: the one time it is
    right, nobody believes it. So it folds exactly as build-surnames.py does,
    and where that is not enough it says so rather than guessing."""
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

    # COUNT THE WHOLE ATLAS ON BOTH SIDES OF THE SPLIT.
    # index.json stopped being the whole index the day the quiet dots moved
    # into their own file. Comparing its length live-to-local would have
    # read that move as the map losing 4,932 places, and this script's whole
    # job is to shout when the map shrinks — a gate that cries wolf at its
    # own release is a gate that gets ignored.
    def _total(d, url_or_path, remote):
        n = len(d.get("places") or [])
        q = (d.get("quiet") or {}).get("file")
        if not q:
            return n
        if remote:
            o = get(url_or_path.replace("index.json", q))
            return n + len((o or {}).get("places") or [])
        try:
            return n + len(json.load(open(
                os.path.join("site", "public", q))).get("places") or [])
        except OSError:
            return n

    for label, l, h in (("places", _total(live, base + "/index.json", True),
                         _total(here, "", False)),
                        ("countries named", len(live.get("countries") or {}),
                         len(here.get("countries") or {}))):
        mark = "same" if l == h else ("GREW" if h > l else "SHRANK")
        (bad if h < l else notes).append(f"  {label:22} live {l:>7,}  here {h:>7,}   {mark}")

    # The surnames, by name, from the sharded corpus the site actually serves.
    local = {}
    try:
        want = {fold(x) for x in PROBES}
        for r in json.load(open("data/surnames.json"))["surnames"]:
            k = fold(r["n"])
            if k in want and k not in local:
                local[k] = r
    except OSError:
        pass

    for name in PROBES:
        f = fold(name)
        # THE SAME RULE THE BUILD AND THE CLIENT USE. This script found the
        # shard-key bug and then turned out to be carrying its own copy of it:
        # «d'arcy»[:3] is «d'a», which filters to «da», which is not a shard.
        # It fetched a file that does not exist, got nothing, and reported a
        # name as missing from a live site that was serving it. Three copies of
        # one rule, and fixing two of them is not fixing it.
        key = shard_key(f)
        shard = get(f"{base}/s/{key}.json") or []
        # Prefer the record whose name folds exactly; fall back to one that
        # matches once separators are ignored, so «D'Arcy» still finds itself
        # if the display form ever loses its apostrophe.
        import re as _re
        bare = lambda x: _re.sub(r"[ '\u2019-]", "", fold(x))
        got = (next((r for r in shard if fold(r["n"]) == f), None)
               or next((r for r in shard if bare(r["n"]) == bare(name)), None))
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

#!/usr/bin/env python3
"""Irish place names that arrived as UTF-8 read through Latin-1.

WHAT WAS WRONG. 1,276 places carried names like «Domhnach MÃ³r» where the name
is «Domhnach Mór», and «Mainistir Ã\u0093 gCormacÃ¡in» for «Mainistir Ó
gCormacáin» — 1,165 in Ireland and 111 in Northern Ireland, every one of them
from the Townlands.ie import. They were not merely ugly in the data: a place
page puts its other names in the meta description, so this was the text a
searcher would have been shown.

WHERE IT CAME FROM. data/ireland-osm.json already holds the damage, so it
arrived with the harvest rather than being done by this build —
scripts/harvest-ireland.py reads with utf-8-sig, which is right. The bytes
were mangled upstream or in transit, which is why this repairs the data rather
than re-running the harvest: a re-run would fetch the same mangled bytes.

WHY A REPAIR IS SAFE HERE, AND THE TEST THAT SAYS SO. A string is touched only
when it carries the signature of this specific damage — Ã or Â followed by a
continuation byte — AND survives the round trip back through Latin-1 to UTF-8.
Anything that does not round-trip is left exactly as it was. Run over both
files that hold it, 23,790 damaged strings repaired and NOT ONE refused, and
no repair produced a replacement character. A random sample reads as Irish
again: Cill an Dúin, Baile Uí Choltair, An tSráidbhaile.

It is idempotent: a second run finds nothing, because a repaired string no
longer carries the signature.

    python3 scripts/repair-mojibake.py [--write]

Without --write it reports and changes nothing.
"""
import json, os, re, sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

FILES = ("data/ireland-osm.json", "data/places.json")
# Ã or Â followed by a byte that could only be a UTF-8 continuation. That pair
# does not occur in correctly encoded Irish, Croatian or Italian text; it is
# the fingerprint of UTF-8 bytes that were read as Latin-1 and written again.
SIG = re.compile(r"[ÃÂ][\u0080-¿]")


def repaired(s):
    """(text, changed). Only ever returns a change that round-trips cleanly."""
    if not isinstance(s, str) or not SIG.search(s):
        return s, False
    try:
        fixed = s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s, False                      # not this damage; leave it alone
    if "�" in fixed or fixed == s:
        return s, False
    return fixed, True


def walk(o, counter):
    if isinstance(o, str):
        new, changed = repaired(o)
        if changed:
            counter[0] += 1
        return new
    if isinstance(o, dict):
        return {k: walk(v, counter) for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v, counter) for v in o]
    return o


def main():
    write = "--write" in sys.argv
    total = 0
    for path in FILES:
        if not os.path.exists(path):
            print(f"  {path}: not here, skipped")
            continue
        d = json.load(open(path, encoding="utf-8"))
        n = [0]
        out = walk(d, n)
        total += n[0]
        print(f"  {path}: {n[0]:,} names repaired")
        if write and n[0]:
            # ensure_ascii=False, because the whole point is the accented
            # characters. The separators match what the harvesters write.
            json.dump(out, open(path, "w", encoding="utf-8"),
                      ensure_ascii=False, separators=(",", ":"))
    print(f"\n{total:,} in all" + ("" if write else " — nothing written; pass --write"))


if __name__ == "__main__":
    main()

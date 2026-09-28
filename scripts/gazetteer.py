"""One way to open the gazetteer, because nine scripts open it.

WHY IT IS GZIPPED. The gazetteer used to be GeoNames `cities5000` — 45,985
places, 6.8 MB, and 73 of them in Croatia. David searched for Lovinac, a
village of 290 people, and the map said nothing; the per-country files hold
11,631 Croatian places and every village his own family archive names. Taking
them costs 631,103 rows and 56 MB.

`data/gazetteer.json` is COMMITTED — CI does not rebuild it, because building
it needs a GeoNames download CI does not make — so 56 MB would be 50 MB added
to a .git already at 613 MB, on a repository that has already paid 330 MB for
committing generated files and written that down. Gzipped the same data is
13 MB, a six-megabyte net increase for fourteen times the places.

The same trick data/surname-timeline.json.gz already uses, for the same
reason, made shared so that the next script to read the gazetteer cannot
quietly read the stale plain file instead.

BOTH ARE ACCEPTED, AND THE GZIP WINS. A working tree part-way through a
rebuild, or an older checkout, may still have the plain file; reading it is
better than failing. When both exist the compressed one is the newer contract.
"""
import gzip
import io
import json
import os

GZ = "data/gazetteer.json.gz"
PLAIN = "data/gazetteer.json"


def path():
    """Whichever form is present, gzip first. None when neither is."""
    if os.path.exists(GZ):
        return GZ
    if os.path.exists(PLAIN):
        return PLAIN
    return None


def exists():
    return path() is not None


def load():
    """The whole document, or None when the file is missing.

    Callers keep their own ["places"], because some of them want the note and
    the licence beside it.
    """
    p = path()
    if not p:
        return None
    if p.endswith(".gz"):
        with gzip.open(p, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    with io.open(p, encoding="utf-8") as fh:
        return json.load(fh)


def places():
    """Just the rows, for the callers that want nothing else."""
    d = load()
    if not d:
        return []
    return d if isinstance(d, list) else d.get("places", [])


def dump(doc, out=None):
    """Write it back in whichever form the caller asked for, gzip by default."""
    out = out or GZ
    if out.endswith(".gz"):
        with gzip.open(out, "wt", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    else:
        with io.open(out, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    return out

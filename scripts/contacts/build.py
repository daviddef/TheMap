#!/usr/bin/env python3
"""What the site serves from the contact store.

site/public/contacts/<group>/<lat>_<lon>.json   the rows in each one-degree square, `open` and share-alike `odbl` kept apart
                                                (a dense square continues in -1, -2 ...)
site/public/contacts/index.json                 which squares exist, how many parts each has, and the sources to credit
site/public/contacts/coverage.json              how many of each kind the Atlas knows, and how many of those can be reached

The browser asks only for the squares round the place being looked at, so no place page carries a contact itself.
"""
import gzip
import json
import math
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from contacts import core  # noqa: E402

ROOT = core.ROOT
OUT = os.path.join(ROOT, "site", "public", "contacts")
LIMIT = 80 * 1024   # the most one file may weigh
KIND_OF_PROVIDER = {"national-archive": "archive", "regional-archive": "archive", "diocesan": "diocese", "library": "library",
                    "national-library": "library", "volunteer": "society", "memorial": "museum"}


def load(rel, default=None):
    path = os.path.join(ROOT, rel)
    for p, opener in ((path + ".gz", gzip.open), (path, open)):
        if os.path.exists(p):
            with opener(p, "rt", encoding="utf-8") as fh:
                return json.load(fh)
    if default is None:
        raise FileNotFoundError(rel)
    return default


def atlas_rows(providers, own, wikidata):
    """Rows for the Atlas's own sources: what was read by hand or answered (`own`) and what Wikidata states, one row each per provider."""
    mail, office, dead = {}, {}, set()
    for e in own.get("emails", []):
        if e["state"] == "dead":
            dead.add(e["email"].lower())
            continue
        for pid in e.get("providers", []):
            mail.setdefault(pid, []).append(e)
    for o in own.get("offices", []):
        for pid in o["providers"]:
            office[pid] = o
    order = {"answered": 0, "delivered": 1, "listed": 2, "unverified": 3}
    rows = []
    for p in providers:
        kind = KIND_OF_PROVIDER.get(p.get("kind"))
        if not kind:
            continue
        at, ccs = p.get("at") or {}, p.get("countries") or []
        ids = [f"provider:{p['id']}"] + ([f"wd:{p['wikidata']}"] if p.get("wikidata") else [])
        base = {"kind": kind, "name": p["name"], "y": at.get("lat"), "x": at.get("lon"), "cc": ccs[0] if len(ccs) == 1 else None, "ids": ids}
        o = office.get(p["id"], {})
        mine = sorted(mail.get(p["id"], []), key=lambda e: (bool(e.get("branch")), order[e["state"]]))
        if mine or o:
            # These passed scripts/check-data.py's role-mailbox rule by hand, so they are carried as they stand.
            row = core.make_row({**base, "id": f"own:{p['id']}", "tel": [o["tel"]] if o.get("tel") else [], "web": [p.get("url", "")],
                                 "post": o.get("post"), "form": o.get("form"), "url": p.get("url")}) or {}
            if mine:
                row = row or {k: v for k, v in {**base, "id": f"own:{p['id']}"}.items() if v is not None}
                row["email"] = [e["email"] for e in mine][:3]
            if any(k in row for k in core.REACH):
                rows.append(("own", row))
        w = wikidata.get(p.get("wikidata") or "")
        if w:
            email = w.get("email") if (w.get("email") or "").lower() not in dead else None
            row = core.make_row({**base, "id": f"wikidata:{p['id']}", "email": [email] if email else [], "tel": [w["tel"]] if w.get("tel") else [],
                                 "post": w.get("post"), "url": f"https://www.wikidata.org/wiki/{p['wikidata']}"})
            if row:
                rows.append(("wikidata", row))
    return rows


def all_rows():
    providers = load("data/providers.json")["providers"]
    rows = atlas_rows(providers, load("data/provider-emails.json", {}), load("data/provider-contacts.json", {}).get("contacts", {}))
    dead = {e["email"].lower() for e in load("data/provider-emails.json", {}).get("emails", []) if e["state"] == "dead"}
    for source, path in core.stored_files():
        for row in core.read_file(path)["rows"]:
            if "email" in row:
                row["email"] = [e for e in row["email"] if e.lower() not in dead]
                if not row["email"]:
                    del row["email"]
            rows.append((source, row))
    return providers, rows


def parts_of(rows):
    n = 1
    while True:
        step = math.ceil(len(rows) / n)
        bodies = [json.dumps({"rows": rows[i:i + step]}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                  for i in range(0, len(rows), step)]
        if all(len(b) <= LIMIT for b in bodies):
            return bodies
        n += 1


def write_cells(rows, registry, out):
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    groups = {"open": {}, "odbl": {}}
    for source, row in rows:
        if "y" in row:
            key = f"{math.floor(row['y'])}_{math.floor(row['x'])}"
            groups[registry[source]["group"]].setdefault(key, []).append({**row, "src": source})
    index = {"v": 1, "sources": {k: {f: s[f] for f in ("title", "licence", "attribution", "url", "rank")} for k, s in registry.items()},
             "groups": {}}
    for group, cells in groups.items():
        os.makedirs(os.path.join(out, group))
        parts = {}
        for key, cell in cells.items():
            cell.sort(key=lambda r: r["id"])
            bodies = parts_of(cell)
            for i, body in enumerate(bodies):
                with open(os.path.join(out, group, f"{key}-{i}.json" if i else f"{key}.json"), "wb") as fh:
                    fh.write(body)
            parts[key] = len(bodies)
        index["groups"][group] = dict(sorted(parts.items()))
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    return index


def known_entities(providers):
    """(kind, [ids]) for every institution and place the Atlas lists, contact or none: what coverage is measured against."""
    for p in providers:
        kind = KIND_OF_PROVIDER.get(p.get("kind"))
        if kind:
            yield kind, [f"provider:{p['id']}"] + ([f"wd:{p['wikidata']}"] if p.get("wikidata") else [])
    for f in load("data/churches-wikidata.json", {}).get("features", []):
        yield "church", [f"wd:{f['q']}"]
    for f in load("data/cemeteries-osm.json", {}).get("features", []):
        yield "cemetery", [f"osm:{f['id']}"]
    for f in load("data/cemeteries-wikidata.json", {}).get("features", []):
        yield "cemetery", [f"wd:{f['q']}"]
    for f in load("data/libraries-wikidata.json", {}).get("features", []):
        yield "library", [f"wd:{f['q']}"]
    for f in load("data/archives-wikidata.json", {}).get("archives", []):
        yield "archive", [f"wd:{f['q']}"]
    for f in load("data/archives-osm.json", {}).get("archives", []):
        yield "archive", [f"osm:{f['id']}"]


def coverage(known, rows):
    """Entities are joined on shared identifiers only. The same ground listed by two sources with no shared identifier counts twice."""
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def join(ids):
        for other in ids[1:]:
            parent[find(other)] = find(ids[0])

    listed = list(known)
    for _, row in rows:
        listed.append((row["kind"], row.get("ids") or [row["id"]]))
    for _, ids in listed:
        join(ids)
    kinds, has = {}, {}
    for kind, ids in listed:
        kinds.setdefault(find(ids[0]), kind)   # the first listing names the kind: the Atlas's own lists come first
    for _, row in rows:
        key = find((row.get("ids") or [row["id"]])[0])
        has.setdefault(key, set()).update(k for k in core.REACH + ("web", "operator") if k in row)
    out = {k: {"kind": k, "known": 0, "reach": 0, "email": 0, "webOnly": 0, "managerOnly": 0} for k in core.KINDS}
    for key, kind in kinds.items():
        c, h = out[kind], has.get(key, set())
        c["known"] += 1
        c["reach"] += bool(h & set(core.REACH))
        c["email"] += "email" in h
        c["webOnly"] += bool("web" in h and not h & set(core.REACH))
        c["managerOnly"] += h == {"operator"}
    return [c for c in out.values() if c["known"]]


def main():
    registry = core.sources()
    providers, rows = all_rows()
    index = write_cells(rows, registry, OUT)
    table = coverage(known_entities(providers), rows)
    countries = {}
    for source, path in core.stored_files():
        countries.setdefault(source, []).append(os.path.basename(path).split(".")[0])
    with open(os.path.join(OUT, "coverage.json"), "w", encoding="utf-8") as fh:
        json.dump({"kinds": table, "harvested": countries,
                   "rows": {s: sum(1 for src, _ in rows if src == s) for s in registry}}, fh, ensure_ascii=False, separators=(",", ":"))
    squares = {g: len(c) for g, c in index["groups"].items()}
    print(f"contacts: {len(rows):,} rows in squares {squares}")
    for c in table:
        print(f"  {c['kind']:17} known {c['known']:>8,}  can be written to or rung {c['reach']:>7,}  website only {c['webOnly']:>6,}")


if __name__ == "__main__":
    main()

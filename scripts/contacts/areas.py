"""The ground an office covers, so that where a burial ground or a parish has no contact of its own the page can SUGGEST who to ask:
the town hall inside the municipality the spot lies in, or the diocese whose boundary holds it. David, 26 November 2026: yes, suggest it,
clearly labelled, never as the ground's own address.

COVERING IS A CLAIM, SO IT COMES FROM A BOUNDARY. Nothing here is «the nearest»: a spot is covered only where a source draws an area round
it. A municipality whose boundary does not close, or holds no town hall we have a contact for, suggests nobody.

    data/contact-areas/<source>/<CC>.json.gz
    {source, licence, attribution, harvested, areas: [{id, kind: "town-hall"|"diocese", name, box: [w, s, e, n], rings: [[[x, y], ...]], rows}]}

`rows` are contact rows (scripts/contacts/core.py): the offices to suggest for that area. Rings are read even-odd, so a hole is a ring."""
import gzip
import io
import json
import os

from contacts import core

STORE = os.path.join(core.ROOT, "data", "contact-areas")
KINDS = ("town-hall", "diocese")
SHOWN = 3   # the most offices one area suggests


def stitch(segments):
    """Closed rings from the ways of a boundary, or None where an end meets nothing: half an outline must not decide who covers a spot."""
    left = [list(s) for s in segments if len(s) > 1]
    rings = []
    while left:
        ring = left.pop()
        while ring[0] != ring[-1]:
            for i, s in enumerate(left):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[-2::-1]
                else:
                    continue
                del left[i]
                break
            else:
                return None
        if len(ring) >= 4:
            rings.append(ring)
    return rings or None


def inside(rings, x, y):
    hit = False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                hit = not hit
    return hit


def simplify(ring, tolerance=0.001):
    """Douglas-Peucker, about a hundred metres: enough to say which municipality, a fraction of the bytes. None where nothing is left."""
    keep = {0, len(ring) - 1}
    # a closed ring starts and ends on one point, so split it at the point farthest from there
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    keep.add(far)
    stack = [(0, far), (far, len(ring) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = ring[a], ring[b]
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        worst, at = tolerance * tolerance, None
        for i in range(a + 1, b):
            px, py = ring[i][0] - ax, ring[i][1] - ay
            t = max(0, min(1, (px * dx + py * dy) / length)) if length else 0
            d = (px - t * dx) ** 2 + (py - t * dy) ** 2
            if d > worst:
                worst, at = d, i
        if at is not None:
            keep.add(at)
            stack += [(a, at), (at, b)]
    out = []
    for i in sorted(keep):
        p = [round(ring[i][0], 4), round(ring[i][1], 4)]
        if not out or p != out[-1]:
            out.append(p)
    return out if len(out) >= 4 else None


def box(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return [min(xs), min(ys), max(xs), max(ys)]


def write(source, cc, areas, harvested, store=None):
    """The same areas give the same bytes, as core.write_source does for rows."""
    meta = core.sources()[source]
    areas = sorted(areas, key=lambda a: a["id"])
    folder = os.path.join(store or STORE, source)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{cc}.json.gz")
    if os.path.exists(path) and core.read_file(path)["areas"] == areas:
        return path
    doc = {"source": source, "licence": meta["licence"], "attribution": meta["attribution"], "harvested": harvested, "areas": areas}
    with open(path, "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as gz:
        gz.write(json.dumps(doc, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return path


def stored_files(store=None):
    return core.stored_files(store or STORE) if os.path.isdir(store or STORE) else iter(())


def check(store=None):
    """The problems in the area store, as lines; empty when it is sound."""
    problems, registry, seen = [], core.sources(), {}
    for source, path in stored_files(store):
        name = f"areas {source}/{os.path.basename(path)}"
        if source not in registry or not registry[source].get("stored"):
            problems.append(f"contact {name}: no registered source stores areas here")
            continue
        doc = core.read_file(path)
        if doc.get("source") != source or doc.get("licence") != registry[source]["licence"]:
            problems.append(f"contact {name}: source or licence differs from sources.json")
        for a in doc.get("areas", []):
            aid = a.get("id")
            if (source, aid) in seen:
                problems.append(f"contact {name} {aid}: also in {seen[(source, aid)]}")
            seen[(source, aid)] = name
            rings = a.get("rings") or []
            if a.get("kind") not in KINDS or not a.get("name") or not rings or any(len(r) < 4 or r[0] != r[-1] for r in rings):
                problems.append(f"contact {name} {aid}: no kind, name or closed outline")
                continue
            if a.get("box") != box(rings):
                problems.append(f"contact {name} {aid}: the box is not the outline's")
            rows = a.get("rows") or []
            if not 0 < len(rows) <= SHOWN:
                problems.append(f"contact {name} {aid}: suggests {len(rows)} offices")
            for r in rows:
                if r.get("kind") != a["kind"] or core.make_row(r) != r or not any(k in r for k in core.REACH + ("web",)):
                    problems.append(f"contact {name} {aid} {r.get('id')}: not an office this area may suggest")
    return problems

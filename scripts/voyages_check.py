"""The rules a voyage in data/voyages.json must meet. Used by the merge script and the data gate.

A voyage is a claim about people and places, drawn as a moving marker; so it carries the same
discipline as a flag era: dated waypoints a reader can check, a leader with an id, at least two
sources, and an honest class. `attested` needs two sources from different publishers.
"""
import os, re

KINDS = ("sea", "land", "polar", "river", "air", "space")
CLASSES = ("attested", "unreviewed")


def problems(v, flag_slugs=()):
    out = []
    w = v.get("id", "?")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*-c?\d{3,4}", w or ""):
        out.append(f"{w}: id must look like da-gama-1497 (or leif-erikson-c1000)")
    if not v.get("title"):
        out.append(f"{w}: no title")
    if v.get("kind") not in KINDS:
        out.append(f"{w}: kind {v.get('kind')!r}")
    ld = v.get("leader") or {}
    if not ld.get("name"):
        out.append(f"{w}: no leader")
    if ld.get("q") and not re.fullmatch(r"Q\d+", ld["q"]):
        out.append(f"{w}: leader Q-id {ld['q']!r} is not Q<digits>")
    f, t = v.get("from"), v.get("to")
    if not isinstance(f, (int, float)) or not isinstance(t, (int, float)) or f > t:
        out.append(f"{w}: from/to must be numbers with from <= to")
        return out
    rt = v.get("route") or []
    if len(rt) < 3:
        out.append(f"{w}: a route needs at least three waypoints")
    last = None
    for i, p in enumerate(rt):
        if not (isinstance(p.get("lat"), (int, float)) and -90 <= p["lat"] <= 90 and isinstance(p.get("lon"), (int, float)) and -180 <= p["lon"] <= 180):
            out.append(f"{w}: waypoint {i} has bad coordinates")
        y = p.get("year")
        if not isinstance(y, (int, float)):
            out.append(f"{w}: waypoint {i} has no year"); continue
        if not (f - 1 <= y <= t + 1):
            out.append(f"{w}: waypoint {i} year {y} outside {f}-{t}")
        if last is not None and y < last:
            out.append(f"{w}: waypoint {i} goes back in time")
        last = y
        if not p.get("name"):
            out.append(f"{w}: waypoint {i} has no name")
    for r in v.get("reached") or []:
        if not (r.get("name") and r.get("claim") and isinstance(r.get("lat"), (int, float)) and isinstance(r.get("lon"), (int, float)) and isinstance(r.get("year"), (int, float))):
            out.append(f"{w}: a reached place needs name, claim, lat, lon, year")
    srcs = v.get("sources") or []
    if len(srcs) < 2:
        out.append(f"{w}: needs at least two sources")
    for s in srcs:
        if not (s.get("title") and s.get("publisher") and str(s.get("url", "")).startswith("https://")):
            out.append(f"{w}: a source needs title, publisher and an https url")
    if v.get("evidence") not in CLASSES:
        out.append(f"{w}: evidence must be one of {CLASSES}")
    if v.get("evidence") == "attested" and len({s.get("publisher") for s in srcs}) < 2:
        out.append(f"{w}: attested needs sources from two publishers")
    if v.get("evidence") == "unreviewed" and not v.get("open"):
        out.append(f"{w}: unreviewed and does not say why")
    sp = v.get("sponsor") or {}
    if sp.get("polity") and flag_slugs and sp["polity"] not in flag_slugs:
        out.append(f"{w}: sponsor polity {sp['polity']!r} is not a flag page")
    if not sp.get("name") and not sp.get("polity"):
        out.append(f"{w}: no sponsor")
    return out

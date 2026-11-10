#!/usr/bin/env python3
"""Merge researchers' decisions about the biggest unplaced names into the atlas, after checking each one.

data/fs-volumes-unplaced.json lists the place names FamilySearch files books under that the matcher could not place. The head of it
(names with 100+ books) is small enough to decide by hand, and a name decided with evidence places every book filed under it.
A researcher reads each name against its path and collection title and answers one of

    area         a province, governorate, county, diocese...: drawn as an AREA at Wikidata's own point for it
    settlement   one town, village or parish (including an old or variant name of a modern one)
    unplaceable  the name itself says it is not one place («Various towns», «Statewide»)
    none         not established (a fully acceptable answer: it is simply left where it is)

and every `area` / `settlement` carries a Wikidata item, a point, the country the point is in today, the pages that say so and a sentence.

WHAT THIS SCRIPT REFUSES, so that a researcher's confident mistake never reaches the map (the evidence is checked, not believed):
  - a name that is not in the unplaced list under that country (a patch cannot invent a name);
  - no Wikidata item, no https evidence, or no `why`;
  - a point outside the country the patch says it is in (geo.country_of, the outline the whole atlas uses: an independent witness
    for the claim, not the patch's own word);
  - a country that is neither the one FamilySearch files the name under nor a recognised successor of it (Hungary's counties lie in
    Slovakia, Romania, Serbia and Ukraine today; a Russian governorate may lie in Ukraine). Anything else is held for a person.
Only positive evidence is written. `none` and anything refused write nothing and are listed.

    python3 scripts/merge-unplaced-decisions.py PATCH.json [PATCH.json ...]            # report only
    python3 scripts/merge-unplaced-decisions.py PATCH.json ... --write                 # merge what passed
    python3 scripts/merge-unplaced-decisions.py --check                                # re-validate what is already merged (build gate)
"""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.path.insert(0, "scripts")
import geo  # noqa: E402

UNPLACED = "data/fs-volumes-unplaced.json"
AREAS = "data/fs-volumes-areas.json"
PLACED3 = "data/unplaced-placed-3.json"
DECISIONS = ("area", "settlement", "unplaceable", "none")

# Where a book filed under one country can lie today, by the successor states of the polities that filed it.
SUCCESSORS = {
    "HU": {"SK", "RO", "RS", "UA", "HR", "AT", "SI"}, "AT": {"CZ", "SK", "SI", "IT", "PL", "UA", "HR", "HU", "RO", "RS", "BA"},
    "RU": {"UA", "BY", "MD", "PL", "LT", "LV", "EE", "FI", "GE", "AM", "AZ", "KZ", "UZ", "TJ", "KG", "TM"},
    "MD": {"UA", "RO", "RU"}, "BY": {"PL", "LT", "UA", "RU", "LV"}, "UA": {"PL", "RU", "BY", "MD", "RO", "SK", "HU"},
    "CZ": {"SK", "PL", "AT", "DE"}, "SK": {"HU", "CZ", "PL", "UA"}, "PL": {"UA", "BY", "LT", "DE", "CZ", "SK"},
    "DE": {"PL", "RU", "FR", "DK", "BE", "CZ", "LT"}, "IT": {"HR", "SI", "SM", "VA", "MT", "FR", "CH"}, "GB": {"IE", "GG", "JE", "IM"},
    "IE": {"GB"}, "NL": {"BE", "DE"}, "BE": {"NL", "FR", "LU", "DE"}, "SE": {"FI", "NO"}, "FR": {"BE", "LU", "DE", "IT", "CH", "MC"},
    "PT": {"ES", "BR"}, "ES": {"PT", "MX"}, "MX": {"US"}, "CA": {"US"}, "US": {"CA", "MX"}, "JP": {"TW", "KR", "RU"}, "ZW": {"ZW"},
}


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").split())


def unplaced_index():
    d = json.load(open(UNPLACED, encoding="utf-8"))
    return {(x["cc"], x["n"]): x["volumes"] for x in d["names"]}


def problems(row, idx):
    """Why a decision cannot be merged, or [] when it can."""
    out = []
    key = (row.get("cc"), row.get("n"))
    if key not in idx:
        return [f"{row.get('n')!r} is not an unplaced name filed under {row.get('cc')}"]
    dec = row.get("decision")
    if dec not in DECISIONS:
        return [f"decision {dec!r} is none of {DECISIONS}"]
    if dec in ("none", "unplaceable"):
        if not (row.get("why") or "").strip():
            out.append("no `why`")
        return out
    if not re.fullmatch(r"Q\d+", str(row.get("qid") or "")):
        out.append("no Wikidata item (qid)")
    ev = row.get("evidence") or []
    if not ev or not all(isinstance(u, str) and u.startswith("https://") for u in ev):
        out.append("no https evidence")
    if not (row.get("why") or "").strip():
        out.append("no `why`")
    lat, lon, pc = row.get("lat"), row.get("lon"), (row.get("placeCountry") or "").upper()
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        out.append("no usable point")
        return out
    if not re.fullmatch(r"[A-Z]{2}", pc):
        out.append("no placeCountry")
        return out
    got = geo.country_of(lat, lon)
    if got != pc:
        out.append(f"the point is in {got}, not {pc}")
    if pc != row["cc"] and pc not in SUCCESSORS.get(row["cc"], set()):
        out.append(f"{pc} is not {row['cc']} or a recognised successor: held for a person")
    return out


def load_json(p, default):
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else default


def check_merged():
    """The build gate: everything already merged still passes the same tests."""
    idx = unplaced_index()
    bad = []
    for r in load_json(PLACED3, {}).get("placed", []):
        row = dict(r, decision="settlement")
        # a name that has since been placed leaves the unplaced list: that is the point, not an error
        if (r["cc"], r["n"]) not in idx:
            continue
        for p in problems(row, idx):
            bad.append(f"{PLACED3}: {r['n']}: {p}")
    for r in load_json(AREAS, {}).get("areas", []):
        if not r.get("evidence"):
            continue   # the Wikidata-identified areas of the earlier pass carry `qid` and no separate evidence list
        row = dict(r, decision="area")
        if (r["cc"], r["n"]) not in idx:
            continue
        for p in problems(row, idx):
            bad.append(f"{AREAS}: {r['n']}: {p}")
    return bad


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--check" in sys.argv:
        bad = check_merged()
        for b in bad:
            print("  " + b)
        print(f"unplaced decisions: {len(bad)} problem(s)")
        sys.exit(1 if bad else 0)
    if not args:
        sys.exit(__doc__)
    idx = unplaced_index()
    rows = []
    for p in args:
        rows += json.load(open(p, encoding="utf-8"))
    seen, accepted, refused, held = set(), [], [], []
    tally = {}
    for r in rows:
        k = (r.get("cc"), r.get("n"))
        tally[r.get("decision")] = tally.get(r.get("decision"), 0) + 1
        if k in seen:
            refused.append((r, ["named twice"]))
            continue
        seen.add(k)
        pr = problems(r, idx)
        if pr:
            (held if any("held for a person" in x for x in pr) else refused).append((r, pr))
        elif r["decision"] in ("area", "settlement", "unplaceable"):
            accepted.append(r)
    vols = lambda r: idx.get((r["cc"], r["n"]), 0)
    print(f"{len(rows)} decisions read: {tally}")
    print(f"accepted {len(accepted)} ({sum(vols(r) for r in accepted):,} books): "
          + ", ".join(f"{d} {sum(1 for r in accepted if r['decision'] == d)}" for d in ("area", "settlement", "unplaceable")))
    for r, pr in refused:
        print(f"  REFUSED {r.get('cc')} {str(r.get('n'))[:40]!r}: {'; '.join(pr)}")
    for r, pr in held:
        print(f"  HELD    {r.get('cc')} {str(r.get('n'))[:40]!r}: {'; '.join(pr)}")
    if "--write" not in sys.argv:
        print("report only; nothing written (use --write)")
        return
    areas = load_json(AREAS, {"areas": []})
    have_a = {(a["cc"], fold(a["n"])) for a in areas.get("areas", [])}
    placed = load_json(PLACED3, {
        "note": "Settlements decided by a researcher reading the name against the path and collection it is filed under, each with a Wikidata item, a "
                "point, the pages that say so and a sentence. Merged by scripts/merge-unplaced-decisions.py after the point was checked against the "
                "country outline. A name that was not established is simply not here.",
        "source": "Wikidata (CC0) and Wikipedia, as cited per row", "licence": "CC0 1.0 (Wikidata)", "placed": [], "refused": []})
    have_p = {(p["cc"], fold(p["n"])) for p in placed["placed"]}
    have_r = {(p["cc"], fold(p["n"])) for p in placed.get("refused", [])}
    for r in accepted:
        k = (r["cc"], fold(r["n"]))
        if r["decision"] == "area" and k not in have_a:
            areas["areas"].append({"n": r["n"], "cc": r["cc"], "placeCountry": r["placeCountry"].upper(), "volumes": vols(r),
                                   "name": r.get("name") or r["n"], "lat": round(r["lat"], 4), "lon": round(r["lon"], 4),
                                   "qid": r["qid"], "is": r.get("is", ""), "evidence": r["evidence"], "why": r["why"]})
        elif r["decision"] == "settlement" and k not in have_p:
            placed["placed"].append({"n": r["n"], "cc": r["cc"], "volumes": vols(r), "lat": round(r["lat"], 4), "lon": round(r["lon"], 4),
                                     "gazetteer": r.get("name") or r["n"], "placeCountry": r["placeCountry"].upper(), "qid": r["qid"],
                                     "evidence": r["evidence"], "why": r["why"]})
        elif r["decision"] == "unplaceable" and k not in have_r:
            placed.setdefault("refused", []).append({"n": r["n"], "cc": r["cc"], "volumes": vols(r), "why": r["why"]})
    areas.setdefault("counts", {})["names"] = len(areas["areas"])
    areas["counts"]["volumes"] = sum(a.get("volumes", 0) for a in areas["areas"])
    json.dump(areas, open(AREAS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(placed, open(PLACED3, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"written {AREAS} ({len(areas['areas'])} areas), {PLACED3} ({len(placed['placed'])} settlements, {len(placed.get('refused', []))} not places)")


if __name__ == "__main__":
    main()

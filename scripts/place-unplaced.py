#!/usr/bin/env python3
"""Give the unplaced books a dot, where the evidence allows one.

Phase 4A. data/fs-volumes-unplaced.json holds 45,668 place names FamilySearch
has books for and this atlas has never drawn — 1,181,581 volumes. The 714
largest carry 554,918 of them, and scripts/unplaced-context.py has already
recovered, for each, the waypoint path and the collection it sits in.

What remains is a coordinate. The gazetteer has 45,985 settlements with every
name each has ever answered to, which is the same machinery that makes
«Gallignana» resolve to Gračišće — and it resolves «Kings County» to Brooklyn,
40.6501 -73.9496, because Kings County IS Brooklyn. The collection title,
«New York, Kings County Estate Files, 1866-1923», agrees.

THREE OUTCOMES, AND ONLY THE FIRST PRODUCES A DOT.

  placed      exactly one gazetteer candidate in the right country, and where
              the collection title names a state, that state agrees
  ambiguous   more than one candidate and nothing decides between them
  unknown     no candidate at all — the gazetteer does not hold it

27 of the US names have several candidates. A county name repeats across
states: there is a Mecklenburg County in North Carolina and another in
Virginia, and this atlas has already seen what name-only matching does — it
filed Australian newspapers in Perth, Scotland. An ambiguous name gets no dot
and is reported, because a wrong dot is worse than a missing one and looks
exactly as correct.

    python3 scripts/place-unplaced.py            # report
    python3 scripts/place-unplaced.py --write    # data/fs-volumes-promote.json
"""
import argparse, collections, json, os, re, sys, unicodedata
import gazetteer as _gazetteer

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

CTX = "data/_unplaced-context.json"
OUT = "data/unplaced-placed.json"

# The state a US collection title names, e.g. «North Carolina, Estate Files».
US_STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
    "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
    "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
    "Washington", "West Virginia", "Wisconsin", "Wyoming",
]


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--min-volumes", type=int, default=0)
    a = ap.parse_args()

    gz = _gazetteer.load()
    grows = gz.get("places") or gz
    # (folded name, cc) -> every candidate, by display name AND by every other
    # name it has answered to. The aliases are the point: Kings County is not a
    # settlement name, it is what Brooklyn was also called.
    # Display names and aliases are kept APART, because they are not equally
    # good evidence. See the corroboration rule below.
    cand = collections.defaultdict(list)
    alias = collections.defaultdict(list)
    for r in grows:
        cc = r.get("k")
        if fold(r["n"]):
            cand[(fold(r["n"]), cc)].append(r)
        for x in (r.get("a") or []):
            if fold(x):
                alias[(fold(x), cc)].append(r)

    ctx = json.load(open(CTX))["rows"]
    placed, ambiguous, unknown = [], [], []
    for x in ctx:
        if x["volumes"] < a.min_volumes:
            continue
        key = (fold(x["n"]), x.get("cc"))
        cs = cand.get(key) or []
        via = "name"

        # AN ALIAS MATCH NEEDS THE CATALOGUE TO AGREE, and this is the rule the
        # first run of this script did not have. Aliases are why «Kings County»
        # resolves to Brooklyn, which is right — Kings County IS Brooklyn, and
        # the collection is «New York, Kings County Estate Files». They are
        # also why it resolved «Clark» to Livingston and «Somogy» to Pécs,
        # which are both wrong: Somogy is a Hungarian county and Pécs is in
        # Baranya. Each had exactly one candidate, so «one candidate» was never
        # the test it looked like.
        #
        # What separates them is whether FamilySearch's own collection title
        # names the place. «New York, Kings County Estate Files» does. «Hungary,
        # Civil Registration» does not, and neither does «Washington, County
        # Records» for Clark — whose paths name Arkansas anyway. So an alias is
        # accepted only when the catalogue independently calls the record set
        # by that name.
        if not cs:
            titles = " ".join(t["title"] for t in (x.get("collections") or []))
            if fold(x["n"]) in fold(titles):
                cs = alias.get(key) or []
                via = "alias, corroborated by the collection title"
        if not cs:
            unknown.append(x)
            continue

        # Dedupe candidates that are the same dot under two names.
        seen, uniq = set(), []
        for c in cs:
            k = (round(c["y"], 3), round(c["x"], 3))
            if k not in seen:
                seen.add(k)
                uniq.append(c)

        # A NAME FILED UNDER DOZENS OF PATHS IS NOT ONE PLACE. «Essex» appears
        # under 297 distinct waypoint paths, «Heves» 120, «Worcester» 66 —
        # they are names the world reuses, and the gazetteer happening to hold
        # exactly one settlement of that name in the country the row was
        # tagged with says nothing. Essex was about to be placed in CANADA on
        # the strength of a row whose own paths read «England › Essex ›
        # Chelmsford». Kings County has one path, the Bronx has five and the
        # catalogue names it; those are places. A generic name needs the
        # catalogue to name it, and past fifty paths nothing rescues it.
        dis = x.get("distinct") or 1
        corroborated = via.startswith("alias") or (
            fold(x["n"]) in fold(" ".join(t["title"]
                                          for t in (x.get("collections") or []))))
        if dis > 50 or (dis > 8 and not corroborated):
            ambiguous.append({**x, "candidates": len(uniq),
                              "why": f"{dis} distinct filing paths"})
            continue

        chosen, why = None, None
        if len(uniq) == 1:
            chosen, why = uniq[0], via + ", one candidate in " + str(x.get("cc"))
        else:
            # THE COLLECTION TITLE IS THE TIEBREAK, and only when it is decisive.
            # «North Carolina, Estate Files» names a state; if exactly one
            # candidate sits in it, that is evidence rather than a preference.
            titles = " ".join(t["title"] for t in (x.get("collections") or []))
            states = [s for s in US_STATES if s in titles]
            if len(states) == 1:
                st = states[0]
                inpath = [c for c in uniq
                          if st.lower() in " ".join(
                              [c.get("n", "")] + (c.get("a") or [])).lower()]
                if len(inpath) == 1:
                    chosen, why = inpath[0], "collection names " + st
            if not chosen:
                # Population is not evidence. A bigger town is not the right
                # town, and this atlas has already filed newspapers in the
                # wrong Perth by reaching for the likelier-looking answer.
                ambiguous.append({**x, "candidates": len(uniq)})
                continue

        placed.append({
            "n": x["n"], "cc": x.get("cc"), "volumes": x["volumes"],
            "lat": chosen["y"], "lon": chosen["x"],
            "gazetteer": chosen["n"], "why": why,
            "collection": (x.get("collections") or [{}])[0].get("title"),
        })

    pv = sum(p["volumes"] for p in placed)
    av = sum(p["volumes"] for p in ambiguous)
    uv = sum(p["volumes"] for p in unknown)
    print(f"{len(ctx):,} unplaced names with recovered context")
    print(f"  placed    {len(placed):>4}  {pv:>9,} volumes")
    print(f"  ambiguous {len(ambiguous):>4}  {av:>9,} volumes  (no dot — several candidates)")
    print(f"  unknown   {len(unknown):>4}  {uv:>9,} volumes  (the gazetteer does not hold it)")
    print()
    print("  largest placed:")
    for p in sorted(placed, key=lambda r: -r["volumes"])[:6]:
        print(f"    {p['volumes']:>8,}  {p['n']} -> {p['gazetteer']}  ({p['why']})")
    if ambiguous:
        print("  largest left ambiguous:")
        for p in sorted(ambiguous, key=lambda r: -r["volumes"])[:4]:
            print(f"    {p['volumes']:>8,}  {p['n']} ({p['candidates']} candidates)")

    if not a.write:
        print("  (dry run — pass --write)")
        return 0

    json.dump({
        "note": ("Unplaced FamilySearch book names resolved to coordinates, by "
                 "matching the gazetteer on every name a place has answered to "
                 "and refusing anything a second candidate could explain. "
                 "`why` records what decided it."),
        "source": "data/gazetteer.json (GeoNames, CC BY 4.0) + FamilySearch waypoints",
        "licence": "CC BY 4.0",
        "generatedBy": "scripts/place-unplaced.py",
        "counts": {"placed": len(placed), "volumes": pv,
                   "ambiguous": len(ambiguous), "unknown": len(unknown)},
        "placed": placed,
        "ambiguous": [{"n": p["n"], "cc": p.get("cc"), "volumes": p["volumes"],
                       "candidates": p["candidates"],
                       "why": p.get("why", "several candidates")}
                      for p in ambiguous],
    }, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"  wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Put the Antenati registers on the Italian places they belong to.

5,591 volumes were harvested from the Ministry's open data in September and
then read by nothing at all. They sat in data/antenati-registers.json while
the site went on showing Italian places with whatever FamilySearch happened
to have. Research that reaches no page is research nobody did.

WHY THIS IS A SEPARATE SCRIPT FROM THE FAMILYSEARCH MATCHER. Antenati names
a COMUNE and nothing below it — no parish, no province in the key — so the
two-witness rule that makes a cross-border FamilySearch match trustworthy
has nothing to work with here and would refuse everything. It does not need
it: these registers are Italian state civil registration, held by Italian
state archives, and the comune is Italian by construction. Scoped to Italy,
matched on the name, and never allowed to cross a border.

    python3 scripts/match-antenati.py
"""
import collections, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SRC = "data/antenati-registers.json"
OUT = "data/antenati-volumes.json"


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def main():
    if not os.path.exists(SRC):
        sys.exit(f"{SRC} is missing — run scripts/harvest-antenati-oai.py")
    src = json.load(open(SRC))
    vols = src["volumes"]

    places = json.load(open("data/places.json"))["places"]
    idx = {}
    for p in places:
        if p.get("country") != "IT":
            continue
        forms = {p["name"]}
        for n in p.get("names", []):
            v = n.get("n", "")
            forms.add(v)
            if "," in v:
                forms.add(v.split(",")[0])
        for f in forms:
            k = fold(f)
            # The place's own name wins over a name it merely answers to.
            if len(k) > 2 and (k not in idx or fold(p["name"]) == k):
                idx[k] = p

    # The comuni gazetteer, so a register can draw a place the shelf lacks.
    try:
        comuni = {fold(c["n"]): c for c in
                  json.load(open("data/italy-comuni.json"))["comuni"]}
    except Exception:
        comuni = {}

    by_place, promote, missed = collections.defaultdict(list), {}, collections.Counter()
    for key, v in vols.items():
        com = (v.get("comune") or "").strip()
        if not com:
            continue
        # "Gracisce (Pisino)" and "Bagni di Lucca, frazione" both reduce.
        cands = [com, re.sub(r"\s*\([^)]*\)\s*$", "", com).strip(),
                 com.split(",")[0].strip()]
        hit = None
        for c in cands:
            hit = idx.get(fold(c))
            if hit:
                break
        pid = None
        if hit:
            pid = hit["id"]
        else:
            for c in cands:
                g = comuni.get(fold(c))
                if g:
                    pid = "g-" + re.sub(r"[^a-z0-9]+", "-", fold(c))[:48] + "-it"
                    promote.setdefault(pid, {
                        "id": pid, "name": g.get("n", c), "country": "IT",
                        "lat": g.get("y"), "lon": g.get("x"),
                        "from": "italy-comuni"})
                    break
        if not pid:
            missed[com] += 1
            continue
        by_place[pid].append({
            "t": " — ".join(x for x in (v.get("fondo"), v.get("what")) if x),
            "from": v.get("from"), "to": v.get("to"),
            "held": v.get("arch"),
            "images": v.get("images") or 0,
            "provider": "antenati",
        })

    for rows in by_place.values():
        rows.sort(key=lambda r: (r.get("from") or 9999, r["t"]))

    json.dump({
        "source": src.get("source"),
        "licence": src.get("licence"),
        "why": src.get("why"),
        "note": ("One row per register, on the comune it was kept in. Matched "
                 "within Italy only: Antenati names a comune and nothing "
                 "below it, and these are Italian state records held by "
                 "Italian state archives, so a cross-border match would be "
                 "an invention rather than a finding."),
        "harvested": src.get("harvested"),
        "counts": {"volumes": sum(len(v) for v in by_place.values()),
                   "places": len(by_place),
                   "promoted": len(promote),
                   "unmatched": sum(missed.values())},
        "promote": sorted(promote.values(), key=lambda x: x["id"]),
        "byPlace": {k: v for k, v in sorted(by_place.items())},
    }, open(OUT, "w"), ensure_ascii=False, indent=1)

    print(f"{len(vols):,} Antenati registers")
    print(f"  {sum(len(v) for v in by_place.values()):,} placed on "
          f"{len(by_place):,} comuni ({len(promote)} drawn from the comuni gazetteer)")
    print(f"  {sum(missed.values()):,} name no comune this atlas knows")
    if missed:
        print("  commonest misses: " + ", ".join(
            f"{n} ({c})" for n, c in missed.most_common(6)))
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()

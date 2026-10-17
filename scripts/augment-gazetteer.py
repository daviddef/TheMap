#!/usr/bin/env python3
"""Put back the local spellings the gazetteer's cap threw away — only the ones somebody is looking for.

WHY. build-gazetteer.py keeps at most twelve Latin alternates per place, chosen by how DIFFERENT
they are from the modern name, after collapsing near-identical forms to the shortest. That is the
right rule for a reader browsing «what was this called». It is the wrong rule for matching, because
the name a FamilySearch book is filed under is usually the local spelling, which is exactly the one
that was clustered away: Antwerpen collapsed into Antwerp, Wien into Vienna.

THE FIX IS NOT TO KEEP EVERY NAME. It is to keep, for each place, the alternates that are EXACTLY a
name FamilySearch holds books for and this atlas could not place — data/fs-volumes-unplaced.json,
same country. That is identity, not resemblance: the form is one GeoNames itself records for this
very place, and it is added only when somebody is looking for it. The file grows by one name per
hit, not by a thousand per place.

ADD-ONLY. The existing data/gazetteer.json.gz is read, and a row is changed only by appending an
alternate it lacks; no row is removed, reordered or re-ranked, so nothing that matched yesterday
can stop matching. Rows are tied to the GeoNames dump by country, the folded display name and the
coordinates to three decimals, never by guess. A dump row that matches no existing row is ignored
(it was filtered out for a reason).

    python3 scripts/augment-gazetteer.py DIR            # report what would be added
    python3 scripts/augment-gazetteer.py DIR --write    # rewrite data/gazetteer.json.gz

DIR holds GeoNames per-country dumps named CC.txt (CC.zip from download.geonames.org/export/dump/).
"""
import argparse, collections, glob, json, os, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import gazetteer as gzmod


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    unplaced = json.load(open("data/fs-volumes-unplaced.json", encoding="utf-8"))["names"]
    want = collections.defaultdict(int)             # (folded name, cc) -> volumes
    for x in unplaced:
        want[(fold(x["n"]), x["cc"])] += x["volumes"]

    doc = gzmod.load()
    rows = doc["places"] if isinstance(doc, dict) else doc
    index = collections.defaultdict(list)           # (cc, folded name, lat3, lon3) -> row
    for r in rows:
        index[(r["k"], fold(r["n"]), round(r["y"], 3), round(r["x"], 3))].append(r)

    added = collections.Counter()
    gained = {}                                     # (name, cc) -> volumes, newly answerable
    for path in sorted(glob.glob(os.path.join(a.dir, "*.txt"))):
        cc = os.path.basename(path)[:-4]
        for line in open(path, encoding="utf-8"):
            f = line.rstrip("\n").split("\t")
            if len(f) < 15 or not f[3]:
                continue
            name, alts, lat, lon, fclass, fcode = f[1], f[3], f[4], f[5], f[6], f[7]
            if fclass != "P" and not (fclass == "T" and fcode == "ISL"):
                continue
            wanted = [x.strip() for x in alts.split(",") if (fold(x), cc) in want]
            if not wanted:
                continue
            hit = index.get((cc, fold(name), round(float(lat), 3), round(float(lon), 3)))
            if not hit:
                continue
            for r in hit:
                have = {fold(r["n"])} | {fold(x) for x in (r.get("a") or [])}
                for alt in wanted:
                    if fold(alt) in have:
                        continue
                    have.add(fold(alt))
                    r.setdefault("a", []).append(alt)
                    if r.get("q") is not None:
                        r["q"] = (r["q"] + " " + fold(alt)).strip()
                    added[cc] += 1
                    gained[(fold(alt), cc)] = want[(fold(alt), cc)]
    print(f"{sum(added.values()):,} alternates to add across {len(added)} countries; "
          f"{len(gained):,} unplaced names now answer to a place, {sum(gained.values()):,} volumes "
          f"(an upper bound: the matcher still refuses ambiguous ones)")
    for cc, n in added.most_common(12):
        print(f"  {cc} +{n:,}")
    if a.write:
        gzmod.dump(doc)
        print("rewrote", gzmod.GZ)


if __name__ == "__main__":
    main()

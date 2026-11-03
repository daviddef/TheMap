#!/usr/bin/env python3
"""Merge researched region patches into data/regions.json.

    python3 scripts/merge-region-patch.py [--root DIR] PATCH.json [PATCH.json ...]

WHY A PATCH AND NOT A HAND EDIT. David: «we need it for everything». There are 35,771 places and
60 record regions; ground without a region gets only its country's flag history, which is wrong
wherever the ground's own history differed from the country's (Almería was Nasrid to 1489, the
Azores were empty until the 1430s). Regions are researched in batches by readers who fetch pages
and write one patch each; this is the one place those patches join the data, so the rules that
protect data/regions.json are applied once, here, and not remembered by each author.

A PATCH is {"regions": [...], "newRegimes": {id: {label, archives, ...}}}. Each era carries
`sources` (URLs actually read), which is what lets the next reader tell a researched era from a
guessed one. `sources` is not kept on the era: it goes to data/region-provenance.json, under
regions[id].sources[<era from year>], with basis "researched:<date>", so the published context.json
can say where each band came from.

What it refuses: an unknown regime, an unknown provider id, eras that overlap or run backwards,
an id already in the file, an era with no sources, a ring of fewer than three points. What it adds
for a new regime: a colour variable in site/public/styles.css, in the light block and both dark
blocks, picked from a fixed palette in the order regimes arrive.
"""
import argparse, datetime, json, os, re, sys

PALETTE = [  # (light, dark): hues kept apart from the 52 regimes already drawn
    ("#8C5A2B", "#C9935C"), ("#6B4E9B", "#A58BD0"), ("#B5483A", "#E08A7C"), ("#2F7F86", "#6FC1C8"),
    ("#8A8A2E", "#C5C56A"), ("#B0457F", "#DE88B8"), ("#4F6D3B", "#97B982"), ("#5C5C8A", "#9C9CCB"),
    ("#A3622F", "#E0A06A"), ("#3F6E9E", "#85B1DC"), ("#8F3F5A", "#D487A3"), ("#6A7F2E", "#AFC464"),
    ("#7A5CA8", "#B9A0E0"), ("#2F8A68", "#6FCFAA"), ("#B07A1E", "#E6B95C"), ("#6E5B4A", "#B8A28E"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("patches", nargs="+")
    a = ap.parse_args()
    root = a.root
    rp = os.path.join(root, "data", "regions.json")
    pp = os.path.join(root, "data", "region-provenance.json")
    css = os.path.join(root, "site", "public", "styles.css")
    regions = json.load(open(rp, encoding="utf-8"))
    prov = json.load(open(pp, encoding="utf-8"))
    pids = {p["id"] for p in json.load(open(os.path.join(root, "data", "providers.json"), encoding="utf-8"))["providers"]}
    today = datetime.date.today().isoformat()
    errs, added_regimes = [], {}

    def err(m):
        errs.append(m)

    have = {r["id"] for r in regions["regions"]}
    new_regions = []
    for path in a.patches:
        patch = json.load(open(path, encoding="utf-8"))
        for rg, spec in patch.get("newRegimes", {}).items():
            if rg in added_regimes:
                continue  # two patches of one batch may both need «castile»; the first label wins
            if rg in regions["regimes"]:
                err(f"{path}: regime {rg} already exists")
                continue
            if not spec.get("label") or not isinstance(spec.get("archives"), list):
                err(f"{path}: regime {rg} needs label and archives[]")
                continue
            added_regimes[rg] = {k: v for k, v in spec.items() if k in ("label", "archives", "existed", "wikidata")}
        known = set(regions["regimes"]) | set(added_regimes)
        for r in patch["regions"]:
            rid = r["id"]
            if rid in have:
                err(f"{path}: region {rid} is already in regions.json")
                continue
            have.add(rid)
            if len(r.get("ring", [])) < 3:
                err(f"{rid}: ring needs three points")
            last, srcs = None, {}
            for e in r["eras"]:
                w = f"{rid} {e.get('from')}"
                if e["regime"] not in known:
                    err(f"{w}: unknown regime {e['regime']}")
                if not (isinstance(e["from"], int) and isinstance(e["to"], int)) or e["from"] > e["to"]:
                    err(f"{w}: from/to must be years in order")
                if last is not None and e["from"] < last:
                    err(f"{w}: eras out of order or overlapping")
                last = e["to"]
                for f in e["filedUnder"]:
                    if f not in pids:
                        err(f"{w}: filedUnder {f} is not a provider")
                if not e.get("sources"):
                    err(f"{w}: no sources")
                srcs[str(e["from"])] = e.get("sources", [])
            new_regions.append((r, srcs))
    if errs:
        print("NOT MERGED:")
        for m in errs:
            print(" -", m)
        return 1

    # colours first, so a failure leaves the data untouched
    if added_regimes:
        text = open(css, encoding="utf-8").read()
        for i, (rg, spec) in enumerate(added_regimes.items()):
            light, dark = PALETTE[(len(regions["regimes"]) + i) % len(PALETTE)]
            pat = re.compile(r"(--r-portugal:#[0-9A-Fa-f]{6};)")
            hits = pat.findall(text)
            if len(hits) != 3:
                print(f"NOT MERGED: expected --r-portugal in 3 places in styles.css, found {len(hits)}")
                return 1
            idx = {"i": 0}

            def sub(m):
                idx["i"] += 1
                col = light if idx["i"] == 1 else dark
                return f"{m.group(1)} --r-{rg}:{col};"
            text = pat.sub(sub, text)
            regions["regimes"][rg] = {"label": spec["label"], "var": f"--r-{rg}", **{k: v for k, v in spec.items() if k != "label"}}
        open(css, "w", encoding="utf-8").write(text)

    for r, srcs in new_regions:
        r = {**r, "eras": [{k: v for k, v in e.items() if k != "sources"} for e in r["eras"]]}
        regions["regions"].append(r)
        prov["regions"][r["id"]] = {"basis": f"researched:{today}", "sources": srcs}
    json.dump(regions, open(rp, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    open(rp, "a", encoding="utf-8").write("\n")
    json.dump(prov, open(pp, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    open(pp, "a", encoding="utf-8").write("\n")
    print(f"merged {len(new_regions)} regions, {len(added_regimes)} new regimes; regions.json now has {len(regions['regions'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

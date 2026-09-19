#!/usr/bin/env python3
"""Fold David's contributed collections directory into the atlas.

1,399 rows, 656 repositories, 73 jurisdictions, from a CSV he assembled. It
brings two things the atlas did not have:

  * A TAXONOMY. 231 rows are tagged Church & Parish, which is the thing he
    asked for months ago — "many people really want to look at church
    records, do we know which are which" — and until now nothing in this
    project knew which were which. The other ten tags come free with it.
  * DEPTH IN COUNTRIES THAT HAD ALMOST NONE. Mexico had 65 collections here
    and a handful in the atlas; Russia 54; the Netherlands 29.

PROVENANCE IS RECORDED, NOT ASSUMED. These descriptions are David's, not an
archive's, and nobody has opened the volumes behind them. Every row carries
`via: "contributed"` and a `checked` date that means ONE THING ONLY: the link
answered on that day. It does not mean the holdings are as described, and the
pages say so rather than letting a reader infer otherwise.

DEAD LINKS DO NOT SHIP. scripts/check-directory-links.py tries every distinct
address first and this refuses to run without its results. A 403 is kept — a
great many archives answer that to a script and serve people perfectly well,
and the atlas records a gate rather than climbing over it.
"""
import csv, json, os, re, sys, time, collections

SRC = "/Users/daviddefranceski/Downloads/Global_Genealogy_Collections_Directory.csv"
LINKS = "data/directory-linkcheck.json"
OUT = "data/directory.json"

# 73 jurisdictions as David wrote them. A compound one lands in both places,
# because a collection spanning Poland and Ukraine is genuinely in both.
CC = {
    "argentina": ["AR"], "australia": ["AU"], "austria": ["AT"],
    "austria / central europe": ["AT", "CZ", "SK", "HU", "SI"],
    "barbados": ["BB"], "belgium": ["BE"], "brazil": ["BR"], "canada": ["CA"],
    "chile": ["CL"], "china": ["CN"], "colombia": ["CO"], "cuba": ["CU"],
    "czech republic": ["CZ"], "denmark": ["DK"],
    "eastern europe": ["PL", "UA", "BY", "LT", "LV", "EE", "RO", "HU", "SK"],
    "egypt": ["EG"], "estonia": ["EE"], "finland": ["FI"], "france": ["FR"],
    "france / europe": ["FR"], "germany": ["DE"], "germany / austria": ["DE", "AT"],
    "germany / global": ["DE"], "ghana": ["GH"], "global": ["*"],
    "greece": ["GR"], "hungary": ["HU"], "iceland": ["IS"], "india": ["IN"],
    "indonesia": ["ID"], "international": ["*"], "ireland": ["IE"],
    "israel / palestine": ["IL", "PS"], "italy": ["IT"], "italy / global": ["IT"],
    "jamaica / caribbean": ["JM"], "japan": ["JP"], "kenya": ["KE"],
    "latvia": ["LV"], "lithuania": ["LT"], "mauritius": ["MU"], "mexico": ["MX"],
    "morocco": ["MA"], "netherlands": ["NL"], "new zealand": ["NZ"],
    "nigeria": ["NG"], "norway": ["NO"], "peru": ["PE"], "philippines": ["PH"],
    "poland": ["PL"], "poland / ukraine": ["PL", "UA"], "portugal": ["PT"],
    "puerto rico": ["PR"], "romania": ["RO"], "russia": ["RU"],
    "russia / ussr": ["RU"], "sierra leone": ["SL"], "slovakia": ["SK"],
    "south africa": ["ZA"], "spain": ["ES"], "sweden": ["SE"],
    "switzerland": ["CH"], "trinidad & tobago": ["TT"],
    "turkey / ottoman empire": ["TR"], "uk / europe": ["GB"],
    "uk / global": ["GB"], "ukraine": ["UA"], "united kingdom": ["GB"],
    "uruguay": ["UY"], "usa": ["US"], "usa / global": ["US"],
    "venezuela": ["VE"], "zimbabwe": ["ZW"],
}

# The eleven tags, reduced to slugs the map can filter on. A row tagged with a
# compound like "Church & Parish / Civil Registration" gets both.
TAG = {
    "church & parish": "church", "civil registration": "civil",
    "censuses & revision lists": "census", "military & wartime": "military",
    "cemeteries & directories": "cemetery", "immigration & maritime": "migration",
    "jewish & minority": "minority", "probate & land": "probate",
    "general historical archives": "archives",
}
ACCESS = {"free": "free", "partially free": "mixed", "paid subscription": "paid"}

def slug(s, n=60):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:n].strip("-")

def tags_of(cell):
    out = []
    for part in cell.split(","):
        for bit in part.split("/"):
            k = TAG.get(bit.strip().lower())
            # "Church & Parish / Civil Registration" splits on the slash into
            # two halves that are each a whole tag; "Cemeteries & Directories"
            # must not be split on its ampersand, which is why only / is cut.
            if k and k not in out:
                out.append(k)
        k = TAG.get(part.strip().lower())
        if k and k not in out:
            out.append(k)
    return out

def years(cell):
    ys = [int(y) for y in re.findall(r"\b(1[0-9]{3}|20[0-2][0-9])\b", cell or "")]
    if not ys:
        return None, None
    lo = min(ys)
    hi = time.gmtime().tm_year if re.search(r"present", cell or "", re.I) else max(ys)
    return lo, hi

def main():
    if not os.path.exists(LINKS):
        sys.exit(f"{LINKS} is missing — run scripts/check-directory-links.py first. "
                 f"Nothing from this file ships on an untested link.")
    lc = json.load(open(LINKS))
    status = {r["url"]: r.get("status", 0) for r in lc["results"]}
    checked = lc["checked"]

    rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
    out, dropped, seen = [], collections.Counter(), set()
    unknown_cc, unknown_tag = collections.Counter(), collections.Counter()

    for r in rows:
        url = r["Collection Level URL / Link"].strip()
        st = status.get(url, 0)
        # Gone, or never answered at all. A reader clicking either learns
        # nothing except that this directory cannot be trusted.
        if st == 0 or st in (404, 410):
            dropped["dead link" if st else "no answer"] += 1
            continue
        juris = r["Country / Jurisdiction"].strip()
        ccs = CC.get(juris.lower())
        if not ccs:
            unknown_cc[juris] += 1
            dropped["unplaceable"] += 1
            continue
        tg = tags_of(r["Taxonomy Tag"])
        if not tg:
            unknown_tag[r["Taxonomy Tag"].strip()] += 1
        lo, hi = years(r["Time Period Covered"])
        repo = r["Parent Repository / Source"].strip()
        name = r["Collection / Fonds Name"].strip()
        rid = slug(repo + "-" + name)
        if rid in seen:
            n = 2
            while f"{rid}-{n}" in seen:
                n += 1
            rid = f"{rid}-{n}"
        seen.add(rid)
        out.append({
            "id": rid, "repo": repo, "name": name, "url": url,
            "countries": ccs, "tags": tg,
            "access": ACCESS.get(r["Access Model"].strip().lower(), "free"),
            "from": lo, "to": hi,
            "what": r["Scope & Contents / Description"].strip(),
            "checked": checked,
            # 200 means it answered; 401/403/429 means it answered by refusing
            # a script, which is a fact about the gate and not about the paper.
            "gated": st in (401, 403, 429),
        })

    out.sort(key=lambda x: (x["countries"][0], x["repo"].lower(), x["name"].lower()))
    by_cc = collections.Counter(c for r in out for c in r["countries"])
    by_tag = collections.Counter(t for r in out for t in r["tags"])

    json.dump({
        "source": "Contributed by David Defranceski, September 2026",
        "licence": "Descriptions as supplied by the contributor.",
        "note": ("One row per named collection at a named repository. The "
                 "`checked` date means the LINK answered on that day and "
                 "nothing more — nobody has opened the volumes behind it, and "
                 "the descriptions are the contributor's own, not an "
                 "archive's catalogue."),
        "checked": checked,
        "counts": {"rows": len(out), "countries": len(by_cc), "repos":
                   len({r["repo"] for r in out})},
        "rows": out,
    }, open(OUT, "w"), indent=1, ensure_ascii=False)

    print(f"{len(rows)} rows in -> {len(out)} kept")
    for k, v in dropped.most_common():
        print(f"   dropped {v:4d}  {k}")
    if unknown_cc:
        print("   UNPLACEABLE JURISDICTIONS:", dict(unknown_cc))
    if unknown_tag:
        print("   untagged:", dict(unknown_tag))
    print("\n   by tag: " + " · ".join(f"{k} {v}" for k, v in by_tag.most_common()))
    print("   top countries: " + " · ".join(f"{k} {v}" for k, v in by_cc.most_common(12)))
    print(f"\n-> {OUT}")

if __name__ == "__main__":
    main()

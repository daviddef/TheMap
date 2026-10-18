#!/usr/bin/env python3
"""Build site/public/context.json: one versioned file that answers
«what held this ground in this year?» for a region or a country.

WHY THIS FILE EXISTS. The family archives want a muted line beside a dated
place-event ("Briatico, 1860 · Kingdom of the Two Sicilies · per the Record
Atlas"). The Atlas already published the pieces — regions.json for
sub-national ground, flag-eras.json and flag-map.json for countries — but
none of them carried a stable id for a region era, flag-map.json is keyed on
the MODERN country (so Vodnjan in 1925 came back as the Kingdom of Serbs,
Croats and Slovenes), and nothing said which eras the Atlas had checked.
A consumer that snapshots this file can cite one era permanently and can tell
when to stay silent.

THE CONTRACT (documented on /data/#context; bump VERSION on any change that a
consumer could notice):

  * A region era's id is `<region>--era-<from>`. A country era's id is
    `<slug>--era-<id>`, exactly the id the flag layer already uses.
  * An era covers from <= year < to. The year an era ends is the year the
    next one begins, so a bare year equal to a boundary belongs to the newer
    era. A consumer holding only a year should say so, or stay silent.
  * Countries are keyed by FLAG PAGE SLUG, not by ISO code. Great Britain is
    four pages (uk, scotland, wales, northern-ireland) and merging them under
    GB made a lookup of 1700 return Gaelic and Plantation Ulster.
  * Look a place up in `regions` first. Only fall back to `countries` when no
    region covers the place, and then only when `quality` says the country's
    border did not move in that period.
  * `contested` and `approx` on a region era are null: nobody has assessed
    them. null is NOT false. A consumer that wants to be silent about the
    uncertain should treat null as uncertain.
"""
import json, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "public", "context.json")
VERSION = "1.8.0"
CHANGES = [
    {"version": "1.8.0", "change": "Each region carries its ring ([lat, lon] vertices, approximate by design) and a bbox [south, west, north, east], so a consumer needs no second file; the 16 regions written in October 2026 carry assessed contested and approx values (false means looked at and clean, null still means unassessed), with a `why` where true."},
    {"version": "1.7.0", "change": "Region serbia (Belgrade, Šumadija and the Morava), placed ahead of vojvodina so Belgrade stops being filed under Vojvodina."},
    {"version": "1.6.0", "change": "Croatia outside the first five regions: civil-croatia, slavonia, istria-west (copies istria-south, so seeded), plus ring fixes for dalmatia (now reaches Zadar), vojna-krajina (Karlobag) and carniola (no longer takes Karlovac)."},
    {"version": "1.5.0", "change": "Two River Plate regions: uruguay and buenos-aires, with new uruguay and brazil regimes."},
    {"version": "1.4.0", "change": "Five regions: west-prussia, frankfurt, hesse-darmstadt, rhenish-hesse, palatinate, with new hesse, confed and germany regimes."},
    {"version": "1.3.0", "change": "Three Italian regions: trentino, veneto, lazio, with new hre, bavaria and papal regimes."},
    {"version": "1.2.0", "change": "Four South African regions: western-cape, transvaal, natal, orange-free-state, with a new `boer` regime."},
    {"version": "1.1.0", "change": "Eras dated in decades (\"1816 - 1820s\") now carry the first year of the decade and approx: true instead of no number, which closes the Argentina and Uruguay holes."},
    {"version": "1.0.0", "change": "First release."},
]
THIS_YEAR = 2026


def j(path):
    return json.load(open(os.path.join(ROOT, path), encoding="utf-8"))


def build():
    regions = j("data/regions.json")
    prov = j("data/region-provenance.json")
    eras = j("site/public/flag-eras.json")["eras"]
    fmap = j("site/public/flag-map.json")
    ev = j("data/flag-evidence.json")["pages"]
    seams = j("data/flag-seams.json")["seams"]

    # ---- regions -------------------------------------------------------
    out_regions = []
    for r in regions["regions"]:
        p = prov["regions"].get(r["id"])
        es = []
        for e in r["eras"]:
            asm = (prov.get("assessments") or {}).get(r["id"], {}).get(str(e["from"]), {})
            present = e["to"] >= THIS_YEAR
            es.append({
                "id": f"{r['id']}--era-{e['from']}",
                "from": e["from"],
                "to": None if present else e["to"],
                "present": present,
                "regime": e["regime"],
                "regimeLabel": regions["regimes"][e["regime"]]["label"],
                "polity": e.get("polity"),
                "filedUnder": e.get("filedUnder", []),
                "basis": (p or {}).get("basis", "not-recorded"),
                "contested": asm.get("contested"),
                "approx": asm.get("approx"),
                "url": f"/region/{r['id']}/#era-{e['from']}",
                **({"why": asm["why"]} if asm.get("why") else {}),
            })
        ids = [e["id"] for e in es]
        assert len(set(ids)) == len(ids), r["id"]
        out_regions.append({
            "id": r["id"], "label": r["label"], "alt": r.get("alt", []),
            "countries": r.get("countries", []),
            "ring": r["ring"],
            "bbox": [min(p[0] for p in r["ring"]), min(p[1] for p in r["ring"]),
                     max(p[0] for p in r["ring"]), max(p[1] for p in r["ring"])],
            "eras": es,
            "url": f"/region/{r['id']}/",
        })

    # ---- countries -----------------------------------------------------
    cc_of = fmap["slug"]
    seam_of = {}
    for key, s in seams.items():
        slug, a, b = key.split("|")
        seam_of.setdefault(slug, []).append((a, b, s))
    concurrent = {}
    for slug, lst in seam_of.items():
        for a, b, s in lst:
            if s["kind"] == "overlap" and s["verdict"] == "concurrent":
                concurrent.setdefault(slug, set()).update([a, b])

    by = {}
    for e in eras:
        if e.get("id"):
            by.setdefault(e["slug"], []).append(e)
    out_countries = []
    for slug in sorted(by):
        es = []
        for e in by[slug]:
            cls = (ev.get(slug) or {}).get(e["id"], {}).get("class")
            es.append({
                "id": f"{slug}--{e['id']}",
                "from": e.get("from"),
                "to": e.get("to"),
                "present": bool(e.get("present")),
                "approx": bool(e.get("approx")),
                "dates": e.get("dates"),
                "polity": e.get("polity"),
                "evidence": cls or "unlabelled",
                "concurrent": e["id"] in concurrent.get(slug, set()),
                "url": f"/flags/{slug}/#{e['id']}",
            })
        out_countries.append({"slug": slug, "cc": cc_of.get(slug), "eras": es})

    # ---- quality: where a lookup should stay silent ----------------------
    gaps, overlaps = [], []
    for slug, lst in sorted(seam_of.items()):
        for a, b, s in lst:
            row = {"slug": slug, "from": f"{slug}--{a}", "to": f"{slug}--{b}",
                   "years": s["years"], "verdict": s["verdict"]}
            (gaps if s["kind"] == "gap" else overlaps).append(row)

    return {
        "contract": {
            "name": "recordatlas-context",
            "version": VERSION,
            "documented": "/data/#context",
            "changes": CHANGES,
        },
        "licence": ("This atlas's own compilation. Cite it as «per the Record Atlas» "
                    "with a link to the era's url. See /data/ for the licence column."),
        "generatedBy": "scripts/build-context.py",
        "generated": time.strftime("%Y-%m-%d"),
        "rule": ("An era covers from <= year < to; a year equal to a boundary belongs to "
                 "the newer era. Look in `regions` first, fall back to `countries` by slug, "
                 "and stay silent where `quality` lists a gap or an overlap. "
                 "null in `contested` or `approx` means nobody has assessed it."),
        "evidenceClasses": j("data/flag-evidence.json")["classes"],
        "basisNote": prov["note"],
        "counts": {
            "regions": len(out_regions),
            "regionEras": sum(len(r["eras"]) for r in out_regions),
            "countries": len(out_countries),
            "countryEras": sum(len(c["eras"]) for c in out_countries),
            "gaps": len(gaps), "overlaps": len(overlaps),
        },
        "regions": out_regions,
        "countries": out_countries,
        "quality": {"gaps": gaps, "overlaps": overlaps},
    }


def main():
    doc = build()
    s = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8").write(s)
    c = doc["counts"]
    print(f"context.json   {len(s)/1024:8.1f} KB   v{VERSION}: {c['regions']} regions "
          f"({c['regionEras']} eras), {c['countries']} countries ({c['countryEras']} eras), "
          f"{c['gaps']} gaps, {c['overlaps']} overlaps")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Where the Atlas's catalogue of sources is thin, measured from what it already holds.

WHY. The catalogue (data/providers.json) grew by sweeps, so it is heaviest where someone happened to look. This reads the data
already in the repository and says, country by country, where a harvest would pay: how many sources we hold, how many of them have
had their access checked, how many institutions Wikidata and the world-archives sweep know that the catalogue does not, how many
FamilySearch volumes the Atlas places there, and how much of the family sessions' own research happens there.

IT MEASURES. IT DOES NOT DECIDE. "Reservoir" is institutions with a website of their own that no provider row points at; many of
those are small municipal offices and some are not archives in a sense a family researcher can use. The demand column is the only
evidence of what the families actually need. Nothing here is a finding about any record or person.

    python3 scripts/source-gap-report.py                 # writes docs/source-gap-report.md and docs/source-gap-report.json
    python3 scripts/source-gap-report.py --print         # the report on screen, writes nothing

Lists are grouped by tier and ALPHABETICAL inside each tier, not by size: a count ordering reads as "not sorted".
"""
import collections
import datetime
import json
import os
import sys
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def host(u):
    try:
        h = urlparse(u).netloc.lower()
    except Exception:
        return ""
    h = h.split(":")[0]
    return h[4:] if h.startswith("www.") else h


def main():
    providers = load("data/providers.json")["providers"]
    names = {k: v["name"] for k, v in load("data/countries.json")["countries"].items()}
    wd = load("data/archives-wikidata.json")["archives"]
    world = load("data/world-archives.json")["archives"]
    cov = load("site/public/coverage-by-country.json")["countries"]
    places = {p["id"]: p.get("country") for p in load("data/places.json")["places"]}
    sessions = load("site/public/research-sessions.json")["marks"]

    have_hosts = {host(p["url"]) for p in providers if p.get("url")}
    have_hosts |= {host(p["deepLink"]) for p in providers if p.get("deepLink")}
    have_hosts.discard("")

    C = collections.defaultdict(lambda: collections.Counter())
    for p in providers:
        for cc in p.get("countries") or []:
            if cc == "*":
                continue
            C[cc]["providers"] += 1
            C[cc]["unsurveyed"] += p.get("access") == "unsurveyed"
            k = p.get("kind")
            C[cc]["holders"] += k in ("national-archive", "regional-archive", "diocesan")
            C[cc]["libraries"] += k in ("library", "national-library")
            C[cc]["finding"] += k in ("index", "aggregator", "volunteer", "catalogue", "memorial")
    # Wikidata archives with a site of their own, and the ones no provider row points at.
    for a in wd:
        cc = a.get("cc")
        sites = [host(s) for s in a.get("sites") or []]
        if not cc or not sites:
            continue
        C[cc]["wd_sites"] += 1
        if not any(s in have_hosts for s in sites):
            C[cc]["wd_uncatalogued"] += 1
    for a in world:
        cc = a.get("cc")
        if cc and a.get("url") and host(a["url"]) not in have_hosts:
            C[cc]["world_uncatalogued"] += 1
    for cc, v in cov.items():
        C[cc]["volumes"] = v.get("volumes", 0)
    # What the family sessions actually research: a mark is placed by its place id, or by its provider's countries.
    pc = {p["id"]: p.get("countries") or [] for p in providers}
    for mid, m in sessions.items():
        kind, _, key = mid.partition(":")
        if kind == "source":
            # A source that lists many countries (an Africa-wide index, a worldwide aggregator) says nothing about any one of them.
            ccs = [c for c in pc.get(key, []) if c != "*"]
            if len(ccs) > 3:
                ccs = []
        else:
            ccs = [places.get(m.get("where"))] if places.get(m.get("where")) else []
        for cc in set(ccs):
            C[cc]["marks"] += 1

    rows = []
    for cc in sorted(C, key=lambda c: names.get(c, c)):
        c = C[cc]
        c["reservoir"] = c["wd_uncatalogued"] + c["world_uncatalogued"]
        if c["marks"] and c["providers"] < 15:
            tier = "A"
        elif c["reservoir"] >= 40:
            tier = "B"
        elif c["providers"] < 8 and (c["volumes"] or c["wd_sites"] >= 10):
            tier = "C"
        else:
            tier = "D"
        rows.append(dict(cc=cc, name=names.get(cc, cc), tier=tier, **{k: c[k] for k in (
            "providers", "unsurveyed", "holders", "libraries", "finding", "volumes", "marks", "wd_sites", "wd_uncatalogued", "world_uncatalogued", "reservoir")}))

    total = collections.Counter()
    for r in rows:
        for k in ("providers", "unsurveyed", "wd_sites", "wd_uncatalogued", "world_uncatalogued"):
            total[k] += r[k]
    TIER = {
        "A": ("A. Thin where the families already work", "Research marks exist here and the catalogue holds fewer than 15 sources. The strongest case for a targeted sweep."),
        "B": ("B. A large reservoir not yet catalogued", "40 or more institutions with websites of their own that no provider row points at. Best harvested from a directory, not by hand."),
        "C": ("C. Thin elsewhere", "Fewer than 8 sources and some record or institution evidence, but no family research marks yet."),
        "D": ("D. No gap flagged", "Neither rule above applies."),
    }
    out = []
    out.append("# Where the source catalogue is thin\n")
    out.append(f"Generated {datetime.date.today().isoformat()} by `scripts/source-gap-report.py` from the repository's own data. It measures; it does not decide. See the notes at the end.\n")
    out.append("## The headline\n")
    out.append(f"- **{len(providers):,}** sources are catalogued, in **{len([r for r in rows if r['providers']])}** countries. Access has not been checked (`unsurveyed`) on **{sum(1 for p in providers if p.get('access') == 'unsurveyed'):,}** of them.")
    out.append(f"- Wikidata knows **{total['wd_sites']:,}** archives with a website of their own; **{total['wd_uncatalogued']:,}** have a site that no provider row's address matches (an upper bound: see the notes).")
    out.append(f"- The world-archives sweep (national archives and libraries) has **{total['world_uncatalogued']:,}** institutions whose site is not catalogued.")
    out.append(f"- Tier A: **{sum(r['tier']=='A' for r in rows)}** countries, tier B: **{sum(r['tier']=='B' for r in rows)}**, tier C: **{sum(r['tier']=='C' for r in rows)}**.\n")
    hdr = "| Country | Sources | Unsurveyed | Holders / libraries / finding aids | FamilySearch volumes | Family research marks | Wikidata sites not catalogued | National institutions not catalogued |\n|---|--:|--:|---|--:|--:|--:|--:|"
    for t in "ABC":
        sel = [r for r in rows if r["tier"] == t]
        out.append(f"## {TIER[t][0]} ({len(sel)})\n")
        out.append(TIER[t][1] + " Alphabetical.\n")
        out.append(hdr)
        for r in sel:
            out.append(f"| {r['name']} ({r['cc']}) | {r['providers']} | {r['unsurveyed']} | {r['holders']} / {r['libraries']} / {r['finding']} | {r['volumes']:,} | {r['marks']} | {r['wd_uncatalogued']} of {r['wd_sites']} | {r['world_uncatalogued']} |")
        out.append("")
    out.append("## Notes and limits\n")
    out.append("- **Demand is thin evidence.** Family research marks come from the published research-sessions file (the sessions' own work); a country with no marks may simply not have been researched yet.")
    out.append("- **\"Not catalogued\" compares websites.** A provider row whose site is on a different host from Wikidata's (a regional portal, a catalogue sub-domain) shows its institution as not catalogued. Expect some false gaps.")
    out.append("- **Wikidata is uneven.** It has many small municipal offices and few archives in some countries. A small reservoir is not proof of a small supply.")
    out.append("- **Nothing here was opened.** The Wikidata and world-archives rows are unverified; see the notes in those files.")
    out.append("- **Sources with country `*`** (worldwide) are excluded from every count; a source listing more than three countries is not counted as research in any of them.")
    out.append("- **A source with several countries counts once in each**, so the per-country columns add up to more than the catalogue total.")
    text = "\n".join(out) + "\n"
    if "--print" in sys.argv:
        print(text)
        return
    with open("docs/source-gap-report.md", "w", encoding="utf-8") as f:
        f.write(text)
    with open("docs/source-gap-report.json", "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.date.today().isoformat(), "rows": rows}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote docs/source-gap-report.md and .json: {len(rows)} countries; tiers " + ", ".join(f"{t}={sum(r['tier']==t for r in rows)}" for t in "ABCD"))


if __name__ == "__main__":
    main()

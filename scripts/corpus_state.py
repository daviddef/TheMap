#!/usr/bin/env python3
"""THE STATE OF THE CORPUS: how big the gaps are, measured from what the repository holds, and a ceiling on each so a gap can only be closed, never quietly reopened.

data/_floors.json already stops the corpus getting SMALLER. This is its mirror for the GAPS: it counts what is still missing (volumes with no place, catalogue rows
nobody has surveyed, countries with no source, ...), writes the table to docs/corpus-state.md and data/corpus-state.json, and fails the data check if any gap is
BIGGER than its ceiling in data/_floors.json (key "ceilings"). A ceiling comes down only after a verified gain, with `--lower`; it is never raised to make a build pass.

    python3 scripts/corpus_state.py            # print the table
    python3 scripts/corpus_state.py --write    # write docs/corpus-state.md and data/corpus-state.json
    python3 scripts/corpus_state.py --check    # exit 1 if any gap is over its ceiling
    python3 scripts/corpus_state.py --lower    # bring every ceiling down to today's figure (only ever lowers)

Measures only. Nothing here is a finding about a record or a person, and nothing here writes a data row.
"""
import collections
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return json.load(f)


def measure():
    m = collections.OrderedDict()
    providers = load("data/providers.json")["providers"]
    countries = load("data/countries.json")["countries"]
    # sources
    m["providers"] = len(providers)
    m["providersUnsurveyed"] = sum(1 for p in providers if p.get("access") == "unsurveyed")
    m["providersUnsurveyedTenthsPct"] = round(1000 * m["providersUnsurveyed"] / max(1, len(providers)))   # the share, in tenths of a percent: adding sources must not trip the gate, adding unsurveyed ones faster than they are surveyed must
    m["providersNoWikidata"] = sum(1 for p in providers if not p.get("wikidata"))
    m["providersNoDeepLink"] = sum(1 for p in providers if not p.get("deepLink"))
    by = collections.Counter()
    for p in providers:
        for cc in p.get("countries") or []:
            if cc != "*":
                by[cc] += 1
    m["countries"] = len(countries)
    m["countriesWithNoSource"] = sum(1 for cc in countries if by[cc] == 0)
    m["countriesWithThreeOrFewer"] = sum(1 for cc in countries if by[cc] <= 3)
    # places: FamilySearch books with no place
    try:
        u = load("data/fs-volumes-unplaced.json")["counts"]
        m["unplacedNames"] = u["names"]
        m["unplacedVolumes"] = u["volumes"]
    except (OSError, KeyError):
        pass
    try:
        pn = load("data/place-names.json")
        m["datedPlaces"] = len(pn.get("places") or [])
    except OSError:
        pass
    # names
    try:
        sn = load("data/surnames.json")["counts"]
        m["surnames"] = sn["surnames"]
        m["surnamesWithoutVariants"] = sn["surnames"] - sn["withVariants"]
        m["surnamesWithoutCountry"] = sn["surnames"] - sn["withCountries"]
    except (OSError, KeyError):
        pass
    sf = load("data/surname-families.json")
    m["surnameFamilies"] = len(sf.get("families") or [])
    gf = load("data/given-name-families.json").get("families") or []
    forms = [f for fam in gf for f in fam.get("members") or []]
    m["givenNameFamilies"] = len(gf)
    m["givenNameForms"] = len(forms)
    m["givenNameFormsLeadOnly"] = sum(1 for f in forms if f.get("status") == "lead")
    m["givenNameFamiliesTwoFormsOrFewer"] = sum(1 for fam in gf if len(fam.get("members") or []) <= 2)
    regs = 0
    fdir = os.path.join(ROOT, "data/frequencies")
    for f in sorted(os.listdir(fdir)):
        if f.endswith(".json") and not f.startswith("_"):
            try:
                if json.load(open(os.path.join(fdir, f), encoding="utf-8")).get("enumerable") is not False:
                    regs += 1
            except Exception:
                pass
    m["surnameRegisters"] = regs
    return m


# which way is "better": gaps must not grow (ceilings); sizes must not shrink (floors, in check-data.py)
GAPS = ["providersUnsurveyedTenthsPct", "countriesWithNoSource", "countriesWithThreeOrFewer", "unplacedNames", "unplacedVolumes",
        "surnamesWithoutVariants", "surnamesWithoutCountry", "givenNameFormsLeadOnly", "givenNameFamiliesTwoFormsOrFewer"]

LABEL = {
    "providers": "Catalogue rows (sources)", "providersUnsurveyed": "Rows whose access has never been surveyed", "providersUnsurveyedTenthsPct": "Share of rows never surveyed (tenths of a percent)", "providersNoWikidata": "Rows with no Wikidata id",
    "providersNoDeepLink": "Rows with no deep link", "countries": "Countries", "countriesWithNoSource": "Countries with no source at all",
    "countriesWithThreeOrFewer": "Countries with three sources or fewer", "unplacedNames": "FamilySearch book names with no place", "unplacedVolumes": "FamilySearch volumes with no place (12 Nov figure)",
    "datedPlaces": "Places with dated names", "surnames": "Surnames", "surnamesWithoutVariants": "Surnames with no recorded variant", "surnamesWithoutCountry": "Surnames with no country",
    "surnameFamilies": "Surname families (hand-built)", "givenNameFamilies": "Given-name families", "givenNameForms": "Given-name forms",
    "givenNameFormsLeadOnly": "Given-name forms that are only a lead", "givenNameFamiliesTwoFormsOrFewer": "Given-name families with two forms or fewer",
    "surnameRegisters": "Countries with a published surname table",
}


def table(m, ceil):
    out = ["| Measure | Now | Ceiling |", "|---|--:|--:|"]
    for k, v in m.items():
        c = (ceil or {}).get(k)
        out.append(f"| {LABEL.get(k, k)} | {v:,} | {('%s' % format(c, ',')) if c is not None else ''} |")
    return "\n".join(out)


def main():
    a = sys.argv[1:]
    m = measure()
    fl = load("data/_floors.json")
    ceil = fl.get("ceilings") or {}
    if "--lower" in a:
        for k in GAPS:
            if k in m:
                ceil[k] = min(ceil.get(k, m[k]), m[k])
        fl["ceilings"] = ceil
        json.dump(fl, open(os.path.join(ROOT, "data/_floors.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        open(os.path.join(ROOT, "data/_floors.json"), "a").write("\n")
        print("ceilings:", json.dumps(ceil))
        return 0
    if "--check" in a:
        bad = [f"{LABEL.get(k, k)}: {m[k]:,} is over its ceiling of {c:,} — a gap that was closed has been reopened. Fix it, or raise the ceiling in data/_floors.json and say why."
               for k, c in sorted(ceil.items()) if k in m and m[k] > c]
        for b in bad:
            print("✗", b)
        return 1 if bad else 0
    t = table(m, ceil)
    if "--write" in a:
        doc = ("# The state of the corpus\n\nWritten by `scripts/corpus_state.py` from the data files in the repository. Each gap has a ceiling in `data/_floors.json`; "
               "the data check fails if a gap is bigger than its ceiling, so a gap can only be closed, never quietly reopened. A ceiling comes down with `--lower` after a verified gain.\n\n"
               + t + "\n\nThe unplaced-volume figure is the one recorded in `data/fs-volumes-unplaced.json` (12 Nov 2026); the live world file is a release asset this script does not download.\n")
        open(os.path.join(ROOT, "docs/corpus-state.md"), "w", encoding="utf-8").write(doc)
        json.dump(m, open(os.path.join(ROOT, "data/corpus-state.json"), "w", encoding="utf-8"), indent=1)
        open(os.path.join(ROOT, "data/corpus-state.json"), "a").write("\n")
    print(t)
    return 0


if __name__ == "__main__":
    sys.exit(main())

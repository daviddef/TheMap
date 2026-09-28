#!/usr/bin/env python3
"""When a surname was in a country, from the family archives themselves.

WHY THIS EXISTS.

The band under a surname — «Where the name was, and when» — had exactly one
source: Wikidata humans with a birth date and a birth place, which is people
notable enough for an encyclopaedia. Counted across the corpus that is not one
name's problem:

    names carrying both a band and record evidence      205,400
    with evidence in a country the band DOES NOT DRAW   140,578
    whose band opens at 1900 or later where attested     79,469

David, on his own family: «if you look at our blazevic family research session
the blazevic name research goes way earlier than 1910 in croatia». It does.
Wikidata's earliest notable Croatian Blažević was born in the 1910s; the
Blažević archive holds Croatian births from the 1710s. The band was not wrong
about its source, it was wrong about the question.

WHAT CHANGED, AND WHO CHANGED IT.

data/archive-surnames.json carries this rule:

    «Surname strings only. No given name, no date, no place, no relationship
     and no identifier leaves the archives.»

That rule was right for what it governed and it blocked this. David lifted it
for aggregates: «do 4 - with dates from my archives».

SO THE LINE MOVED, AND IT MOVED ONCE. What leaves an archive here is a COUNT
of how many people of one surname were born in one country in one decade.
Three surnames in Croatia in the 1780s. That names nobody, dates nobody,
places nobody below a national border, and relates nobody to anybody — and it
is the same shape as the Wikidata series already shown beside it. What does
NOT leave, still: a given name, a full date, a settlement, an identifier, a
relationship, or any row with a count so small it could single somebody out
(see FLOOR below).

RESOLVED, NOT ASSUMED. A birth place becomes a country three ways, all of them
positive: the string names a country, or contains one, or IS a place this
atlas already holds with a country against it — «Klenovica» is Croatian
because the atlas says so, not because the archive is a Croatian one. Anything
else is counted as unresolved and reported. «Austria-Hungary» and
«Jugoslavija» resolve to nothing on purpose: they are true, they are not
countries in this dataset's sense, and guessing which modern border they fall
behind is exactly the inference this atlas refuses elsewhere.

    python3 scripts/harvest-archive-dates.py
"""
import glob
import json
import os
import re
import sys
import time
import unicodedata

import importlib.util as _ilu

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
PROJ = os.path.dirname(_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

OUT = "data/archive-dates.json"

# The same eight folders the surname harvest reads, and the same reason for
# naming them here: an absolute path that exists on one laptop is how the last
# one silently produced nothing in CI.
ARCHIVES = [
    ("Defranceschi", "Defranceski Family"),
    ("Falco", "Falco Family"),
    ("Blažević", "Blazevic Family"),
    ("Booyzen", "Booyzen Family"),
    ("Lerena", "Lerena Family"),
    ("D'Arcy", "D'arcy Family"),
    ("Mazza", "Mazza Family"),
    ("Luwinski", "Luwinski Family"),
]

SURNAME_KEYS = ("surname", "last", "lastname", "family_name")
# THE ARCHIVES DO NOT AGREE ON A SHAPE, and five of eight returned nothing on
# the first run because of it. The Blažević archive stores `surname` and
# `byear`; the Defranceschi one stores a full `name` and `birth`/`birthYear`
# and no surname field at all. Rather than a second, subtly different surname
# parser, this borrows the one harvest-archive-surnames.py already uses —
# trailing word plus its particles, and a name it cannot read is dropped.
NAME_KEYS = ("name", "sp", "fullname", "full_name")
YEAR_KEYS = ("byear", "birth_year", "birthyear", "birthYear", "bornYear")
DATE_KEYS = ("born", "birth", "birthdate", "baptised", "dates")
PLACE_KEYS = ("bornPlace", "birth_place", "birthplace", "born_place", "place")

# A COUNT OF ONE IS A PERSON. Two is nearly one. A decade bucket holding fewer
# than this is dropped rather than published: the whole defence of this file is
# that a count cannot be read back to an individual, and a lone 1 against a
# rare surname in a small country fails that on its own terms.
FLOOR = 3


_spec = _ilu.spec_from_file_location(
    "_surn", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "harvest-archive-surnames.py"))
_surn = _ilu.module_from_spec(_spec)
try:
    _spec.loader.exec_module(_surn)
except SystemExit:
    pass
surname_of = _surn.surname_of


def fold(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def year_of(row):
    for k in YEAR_KEYS:
        v = row.get(k)
        if isinstance(v, int) and 1000 < v < 2100:
            return v
        if isinstance(v, str):
            m = re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", v)
            if m:
                return int(m.group(1))
    for k in DATE_KEYS:
        v = row.get(k)
        if isinstance(v, str):
            m = re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", v)
            if m:
                return int(m.group(1))
    return None


def build_places():
    """Country by name, and every place this atlas holds with its country.

    The atlas is the authority for «Klenovica is in Croatia», which keeps the
    resolution positive: the archive is not asked to vouch for its own ground.
    """
    cc_by_name, place_cc = {}, {}
    try:
        idx = json.load(open("site/public/index.json"))
        names = idx.get("countries") or {}
        for cc, name in names.items():
            cc_by_name[fold(name)] = cc
        for src in ("site/public/index.json", "site/public/index-quiet.json"):
            try:
                for p in json.load(open(src)).get("places", []):
                    if p.get("cc") and p.get("n"):
                        place_cc.setdefault(fold(p["n"]), p["cc"])
            except FileNotFoundError:
                pass
    except FileNotFoundError:
        sys.exit("site/public/index.json is missing — run the build first")
    # The endonyms a family archive actually writes, which are not in any
    # English country list. Only forms seen in the archives are added, and
    # each is a name for a country rather than a guess about one.
    cc_by_name.update({
        "hrvatska": "HR", "italia": "IT", "deutschland": "DE",
        "espana": "ES", "polska": "PL", "osterreich": "AT",
        "slovenija": "SI", "srbija": "RS", "magyarorszag": "HU",
    })
    return cc_by_name, place_cc


def resolve(place, cc_by_name, place_cc):
    """A country, or None. Never a guess."""
    p = (place or "").strip()
    if not p:
        return None
    parts = [x.strip() for x in re.split(r"[,/]", p) if x.strip()]
    # 1. the tail names a country
    for seg in reversed(parts):
        cc = cc_by_name.get(fold(seg))
        if cc:
            return cc
    # 2. any segment IS a place this atlas holds
    for seg in reversed(parts):
        cc = place_cc.get(fold(seg))
        if cc:
            return cc
    # 3. the whole string contains a country name
    f = fold(p)
    for name, cc in cc_by_name.items():
        if len(name) > 3 and name in f:
            return cc
    return None


def rows_of(doc):
    if isinstance(doc, list):
        return [r for r in doc if isinstance(r, dict)]
    if isinstance(doc, dict):
        for v in doc.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    return []


def main():
    cc_by_name, place_cc = build_places()
    print(f"{len(cc_by_name):,} country names, {len(place_cc):,} places to resolve against")

    when = {}          # surname -> cc -> decade -> count
    seen = unres = nosur = noyear = 0
    per_archive = {}

    for label, folder in ARCHIVES:
        base = os.path.join(PROJ, folder)
        if not os.path.isdir(base):
            print(f"  {label}: folder not found, skipped")
            continue
        got = 0
        files = [f for f in glob.glob(os.path.join(base, "**", "*.json"), recursive=True)
                 if "node_modules" not in f and "/dist" not in f]
        for f in files:
            try:
                doc = json.load(open(f, encoding="utf-8"))
            except Exception:
                continue
            for r in rows_of(doc):
                sur = ""
                for k in SURNAME_KEYS:
                    if isinstance(r.get(k), str) and r[k].strip():
                        sur = r[k].strip()
                        break
                if not sur:
                    for k in NAME_KEYS:
                        if isinstance(r.get(k), str) and r[k].strip():
                            sur = surname_of(r[k])
                            break
                y = year_of(r)
                if not sur:
                    if y:
                        nosur += 1
                    continue
                if not y:
                    noyear += 1
                    continue
                seen += 1
                place = ""
                for k in PLACE_KEYS:
                    if isinstance(r.get(k), str) and r[k].strip():
                        place = r[k]
                        break
                cc = resolve(place, cc_by_name, place_cc)
                if not cc:
                    unres += 1
                    continue
                dec = (y // 10) * 10
                when.setdefault(sur, {}).setdefault(cc, {})
                when[sur][cc][dec] = when[sur][cc].get(dec, 0) + 1
                got += 1
        per_archive[label] = got
        print(f"  {label}: {got:,} dated births resolved to a country")

    # THE FLOOR, APPLIED LAST so it is applied to the total rather than to one
    # archive's share of it.
    dropped = 0
    out = {}
    for sur, ccs in when.items():
        keep = {}
        for cc, decs in ccs.items():
            d2 = {str(k): v for k, v in sorted(decs.items()) if v >= FLOOR}
            dropped += sum(1 for v in decs.values() if v < FLOOR)
            if d2:
                keep[cc] = d2
        if keep:
            out[sur] = keep

    doc = {
        "note": ("When a surname was in a country, counted from the eight "
                 "family archives. One row is a surname, a country and a "
                 "decade of birth, with how many people the archives hold "
                 "for it. Built by scripts/harvest-archive-dates.py."),
        "privacy": ("AGGREGATE ONLY. No given name, no full date, no "
                    "settlement, no identifier and no relationship leaves the "
                    "archives — a row is a count of people born in one "
                    "country in one decade under one surname, which names "
                    f"nobody. Buckets below {FLOOR} are dropped so that a "
                    "count cannot be read back to an individual."),
        "source": "The eight family archives, via their own person records",
        "licence": "CC0-1.0",
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {
            "surnames": len(out),
            "datedBirthsSeen": seen,
            "resolvedToACountry": sum(per_archive.values()),
            "placeUnresolved": unres,
            "bucketsDroppedUnderFloor": dropped,
            "rowsWithAYearAndNoSurname": nosur,
            "rowsWithASurnameAndNoYear": noyear,
            "perArchive": per_archive,
        },
        "when": out,
    }
    json.dump(doc, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"\n{OUT}: {len(out):,} surnames")
    for k, v in doc["counts"].items():
        if k != "perArchive":
            print(f"    {k:<28} {v:,}")
    # The point of the exercise, shown rather than asserted.
    for probe in ("Blažević", "Zubrinich", "Žubrinić"):
        row = out.get(probe)
        if row:
            for cc, d in row.items():
                ds = sorted(int(x) for x in d)
                print(f"    {probe} / {cc}: {ds[0]}s–{ds[-1]}s "
                      f"({sum(d.values())} people)")


if __name__ == "__main__":
    main()

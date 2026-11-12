#!/usr/bin/env python3
"""Bring the Pazin State Archive register inventory in line with the Defranceski archive's: digitised or not, filmed or not.

WHY THIS EXISTS. scripts/import-defranceski.py lifted the Croatian shelf out of the archive ONCE (16 September). Its 1,151 Pazin
(DAPA) register entries all came across as access "onsite" ("somebody has to go, or ask somebody who can"), because the archive's
`digitised` column and its film links were not read then. The archive says 997 of the 1,151 ARE digitised, and links 142 of them
to the FamilySearch image viewer. This importer reads those facts and writes them onto the same entries, and can be run again
whenever the archive changes. It is deliberately a HAND-RUN snapshot, never a build step (the build must work on a fresh clone with
nothing beside it; see the warning in import-defranceski.py about what happened to build-surnames.py).

    python3 scripts/import-pazin-registers.py                 # report only (dry run)
    python3 scripts/import-pazin-registers.py --write         # rewrite data/places.json
    python3 scripts/import-pazin-registers.py --ref origin/main --archive "/path/to/Defranceski Family"

It reads three files of the archive at a git ref (default origin/main, so a half-edited working tree is never read):
    site/src/data/registers.json      the inventory: dapa_no, place, type, period, digitised
    site/src/data/researchmap.json    per book: `no` (the DAPA number), digitised, alsoFilmed (the archive's cross-check)
    site/src/data/parishbooks.json    the FamilySearch books it has linked, by parish

WHAT IT WRITES, and only this, on each collection of places.json whose provider is "dapa" and whose `ref` is a DAPA number in the
inventory. Every other entry, and every other key of these entries, is left as it was:

    digitised         true / false, from the inventory
    filmedElsewhere   true only when NOT digitised and the archive found a filmed book of the same kind and years from another source
    url               the FamilySearch viewer at page one of the matching book (142 entries, digitised or not) or, for the other
                      digitised ones, the archive's own registers page
    access            account        a FamilySearch book matches (images, free, an account is needed), whatever Pazin's own state
                      unsurveyed     digitised, no FamilySearch match: the archive says it is digitised; how a visitor opens the
                                     scans has not been surveyed here, so no class is claimed
                      onsite         NOT digitised and no FamilySearch match: the only case where "somebody has to go, or ask" is true
    note              one sentence saying which of those it is and what the match does and does not prove

THE MATCH RULE is the archive's, copied exactly (site/src/pages/archive.astro, `filmFor`): same parish (after its alias table), same
kind of register (births, marriages, deaths), overlapping years, nothing on a looser match. A matched book is the same parish, kind
and years, NOT proof it is the same physical book, and the note says so. This script never guesses a link.

It is idempotent: every field it writes is recomputed from the archive on each run, so running it twice on unchanged input leaves
the file byte-identical, and a later archive change reaches the Atlas by running it again.
"""
import argparse, json, os, re, subprocess, sys
from urllib.parse import quote

ARCHIVE = "/Volumes/DJ - Crucial - 4TB-SSD/Claude Projects/Family Projects/Defranceski Family"
DAPA_PAGE = "https://www.dapa.hr/maticne-knjige/"
# The archive's own tables, copied from its archive.astro; keep in step with it.
ALIAS = {"Poreč": "Poreč (Poreč)", "Vodnjan / Dignano": "Vodnjan", "Umag / Umago": "Umag",
         "Motovun / Montona": "Motovun", "Čepić": "Polje Čepić"}
KIND2 = {"MKR": "Rođeni", "MKV": "Vjenčani", "MKU": "Umrli"}


def show(archive, ref, path):
    if ref:
        out = subprocess.run(["git", "-C", archive, "show", f"{ref}:{path}"], capture_output=True, check=False)
        if out.returncode:
            sys.exit(f"cannot read {ref}:{path} in {archive}: {out.stderr.decode()[:200]}")
        return json.loads(out.stdout)
    with open(os.path.join(archive, path), encoding="utf-8") as f:
        return json.load(f)


def years(s):
    return [int(y) for y in re.findall(r"\d{4}", str(s))]


def span(s):
    y = years(s)
    return (min(y), max(y)) if y else None


def enc(s):      # JavaScript's encodeURIComponent
    return quote(s, safe="-_.!~*'()")


def film_for(r, links):
    parish = ALIAS.get(r["place"], r["place"])
    books = links.get(parish)
    kind = KIND2.get(r["type"])
    if not books or not kind:
        return None
    a = span(r["period"])
    if not a:
        return None
    for title, rec in books.items():
        if kind not in title:
            continue
        b = span(title)
        if not b:
            continue
        if a[0] <= b[1] and b[0] <= a[1]:
            return {"href": f"https://www.familysearch.org/ark:/61903/{rec['ark']}?cc=2040054&wc={enc(rec['wc'])}", "title": title}
    return None


NOTE_MATCH = ("Digitised at the Pazin archive, and a FamilySearch book of the same parish, kind of register and overlapping years "
              "opens at page one from the link (free account). That is a match on parish, kind and years, not proof it is this exact book.")
NOTE_MATCH_UNDIGITISED = ("Not digitised at the Pazin archive, but a FamilySearch book of the same parish, kind of register and overlapping years "
                          "opens at page one from the link (free account). That is a match on parish, kind and years, not proof it is this exact book.")
NOTE_DIGI = ("Digitised at the Pazin archive, according to its own catalogue. How a visitor opens the scans has not been surveyed here: "
             "the archive's registers page is the place to start.")
NOTE_ELSE = ("Not digitised at the Pazin archive, and the Defranceski archive's cross-check found a filmed book of the same parish, kind "
             "and years from another source, so the images may be reachable elsewhere. A match on kind and years, not a confirmed copy.")
NOTE_NONE = "Not digitised at the Pazin archive, and no filmed copy of the same kind and years was found elsewhere: somebody has to go, or ask."


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--archive", default=ARCHIVE)
    ap.add_argument("--ref", default="origin/main", help="git ref in the archive to read ('' = its working tree)")
    ap.add_argument("--places", default="data/places.json")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    if not os.path.isdir(a.archive):
        sys.exit("The Defranceski archive checkout is not here: " + a.archive + "\nThis is a hand-run snapshot importer.")

    reg = show(a.archive, a.ref, "site/src/data/registers.json")
    rmap = show(a.archive, a.ref, "site/src/data/researchmap.json")
    pbl = show(a.archive, a.ref, "site/src/data/parishbooks.json")
    links = pbl.get("links") or {}

    also = {}                                    # DAPA number -> the archive's alsoFilmed
    for o in rmap["places"]:
        for sh in ((o.get("sources") or {}).get("dapa") or {}).get("shelves", {}).values():
            for b in sh.get("books") or []:
                if b.get("no"):
                    also[str(b["no"])] = bool(b.get("alsoFilmed"))
    inv = {}
    for r in reg:
        if r["dapa_no"] in inv:
            sys.exit("duplicate DAPA number in the inventory: " + r["dapa_no"])
        inv[r["dapa_no"]] = r
    for no, r in inv.items():
        r["film"] = film_for(r, links)
        r["digi"] = {"yes": True, "no": False}[r["digitised"]]

    # the archive's own published counts, which this must reproduce
    n_digi = sum(r["digi"] for r in inv.values())
    n_film = sum(1 for r in inv.values() if r["film"])
    stats = rmap["stats"]
    elsewhere_listed = set(stats.get("filmedElsewhere") or [])
    elsewhere = {no for no, r in inv.items() if not r["digi"] and also.get(no)}
    if elsewhere != elsewhere_listed:
        sys.exit(f"filmed-elsewhere disagrees with the archive's own list: {len(elsewhere)} here, {len(elsewhere_listed)} there")
    if len(inv) - n_digi != stats["notDigitised"]:
        sys.exit(f"not-digitised count {len(inv) - n_digi} != the archive's {stats['notDigitised']}")

    with open(a.places, encoding="utf-8") as f:
        raw = f.read()
    data = json.loads(raw)
    seen, counts = set(), {"account": 0, "unsurveyed": 0, "onsite-else": 0, "onsite-none": 0}
    for p in data["places"]:
        for c in p.get("collections") or []:
            if c.get("provider") != "dapa" or str(c.get("ref")) not in inv:
                continue
            no = str(c["ref"])
            if no in seen:
                sys.exit("one DAPA number on two Atlas entries: " + no)
            seen.add(no)
            r = inv[no]
            # recompute every key this script owns, in one fixed order, so a rerun cannot reorder them
            for k in ("digitised", "filmedElsewhere", "url", "note"):
                c.pop(k, None)
            c["digitised"] = r["digi"]
            if no in elsewhere:
                c["filmedElsewhere"] = True
            if r["film"]:
                # a FamilySearch book matches (same parish, kind, overlapping years): images, free account, wherever Pazin stands
                c["access"], c["url"] = "account", r["film"]["href"]
                c["note"] = NOTE_MATCH if r["digi"] else NOTE_MATCH_UNDIGITISED
                counts["account"] += 1
            elif r["digi"]:
                c["access"], c["url"], c["note"] = "unsurveyed", DAPA_PAGE, NOTE_DIGI
                counts["unsurveyed"] += 1
            else:
                c["access"] = "onsite"
                c["note"] = NOTE_ELSE if no in elsewhere else NOTE_NONE
                counts["onsite-else" if no in elsewhere else "onsite-none"] += 1
    missing = sorted(set(inv) - seen, key=int)
    print(f"inventory {len(inv)} rows; digitised {n_digi}, not digitised {len(inv) - n_digi}; FamilySearch matches {n_film} "
          f"(the archive's own page says 142 on 12 Nov)")
    print(f"Atlas entries updated {len(seen)}: {counts}")
    if missing:
        print(f"NOT FOUND in places.json ({len(missing)}): {missing[:20]}")
        sys.exit(1)
    if len(seen) != len(inv):
        sys.exit("count mismatch")
    out = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ("\n" if raw.endswith("\n") else "")
    if out == raw:
        print("places.json already holds exactly this: nothing to write.")
        return
    if not a.write:
        print("dry run: places.json would change (add --write).")
        return
    with open(a.places, "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote", a.places)


if __name__ == "__main__":
    main()

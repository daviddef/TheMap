#!/usr/bin/env python3
"""Lift the HR-HDA-1448 finding-aid rows the Defranceski archive has recorded into data/hda1448-holdings.json.

HR-HDA-1448 is «Zbirka dopunskih mikrofilmova matičnih knjiga i popisa obitelji», the Croatian State Archives' collection of microfilms of
parish registers held elsewhere, and the one that reaches the twentieth century where FamilySearch stops. The Atlas lists the SEARCH of it
as a provider (hda-mk-search). This file holds what is known of its CONTENTS: only the parishes the archive has looked up in the finding
aid so far, one row per register span. It is a few parishes, not the collection. A parish that is not here has not been looked up.

A hand-run snapshot, never a build step (same rule as import-pazin-registers.py):

    python3 scripts/import-hda1448-holdings.py            # report
    python3 scripts/import-hda1448-holdings.py --write    # data/hda1448-holdings.json

Reads site/src/data/hda1448.json of the Defranceski archive at a git ref (default origin/main). Facts only: parish, kind of register,
years, who holds the original, the roll signature and topographic mark, and whether the roll is digitised. The archive's commentary is
not copied.
"""
import argparse, json, os, re, subprocess, sys

ARCHIVE = "/Volumes/DJ - Crucial - 4TB-SSD/Claude Projects/Family Projects/Defranceski Family"
KINDS = {"R": "births (rođeni)", "U": "deaths (umrli)", "V": "marriages (vjenčani)", "S": "status animarum (household census)",
         "Z": "confirmations (krizmanik)", "O": "anniversarii", "I": "index to births, marriages and deaths"}
PARISH = {"Crikvenica": "Crikvenica", "Proložac — the Imotski parish": "Proložac (Imotski)"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", default=ARCHIVE)
    ap.add_argument("--ref", default="origin/main")
    ap.add_argument("--out", default="data/hda1448-holdings.json")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    out = subprocess.run(["git", "-C", a.archive, "show", f"{a.ref}:site/src/data/hda1448.json"], capture_output=True)
    if out.returncode:
        sys.exit("cannot read hda1448.json: " + out.stderr.decode()[:200])
    src = json.loads(out.stdout)
    rows = []
    for t in src["tables"]:
        parish = PARISH.get(t["title"])
        if not parish:
            sys.exit("unknown table title (add it to PARISH): " + t["title"])
        for kind, years, holder, roll, mark, digi in t["rows"]:
            if kind not in KINDS or digi not in ("yes", "no"):
                sys.exit(f"unexpected row {kind!r} {digi!r}")
            ys = [int(y) for y in re.findall(r"\d{4}", years)]
            row = {"parish": parish, "type": kind, "years": years, "holder": holder, "roll": roll, "mark": mark, "digitised": digi == "yes"}
            if ys:
                row["from"], row["to"] = min(ys), max(ys)
            rows.append(row)
    data = {
        "note": "Register holdings of HR-HDA-1448, «Zbirka dopunskih mikrofilmova matičnih knjiga i popisa obitelji» (Hrvatski državni arhiv), "
                "for the parishes a family archive has looked up in the finding aid so far. One row is a kind of register, the years it "
                "covers, who holds the original, the roll (signatura svitka) and its topographic mark (M-number), and whether the roll is "
                "digitised. Kinds: R births, U deaths, V marriages, S status animarum, Z confirmations, O anniversarii, I index.",
        "undercount": "THIS IS TWO PARISHES, NOT THE COLLECTION. A parish missing from this file has not been looked up; it is not evidence "
                      "that the collection lacks it. Use the search at provider hda-mk-search for any other parish.",
        "source": {"collection": "Hrvatski državni arhiv, HR-HDA-1448, finding aid at arhiv.hr", "searched": "2026-09-08",
                   "searchedBy": "the Defranceski family archive, for Crikvenica and Proložac across all seven kinds of register",
                   "snapshot": "site/src/data/hda1448.json of the Defranceski archive"},
        "licence": "No licence stated — the finding aid of HR-HDA-1448 at arhiv.hr states none, and none is asserted. The facts of it (parish, kind, "
                   "years, holder, roll) are carried, not any text of the archive's or of the finding aid's.",
        "collection": {"signature": "HR-HDA-1448", "name": "Zbirka dopunskih mikrofilmova matičnih knjiga i popisa obitelji",
                       "holder": "Hrvatski državni arhiv, Zagreb"},
        "provider": "hda-mk-search",
        "counts": {"rows": len(rows), "parishes": len({r["parish"] for r in rows}),
                   "digitised": sum(r["digitised"] for r in rows)},
        "rows": rows,
    }
    text = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    cur = open(a.out, encoding="utf-8").read() if os.path.exists(a.out) else None
    print(f"{len(rows)} rows, {data['counts']['parishes']} parishes, {data['counts']['digitised']} digitised rolls")
    if cur == text:
        print("already current")
    elif a.write:
        open(a.out, "w", encoding="utf-8").write(text)
        print("wrote", a.out)
    else:
        print("dry run: file would change (add --write)")


if __name__ == "__main__":
    main()

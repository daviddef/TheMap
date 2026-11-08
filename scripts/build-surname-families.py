#!/usr/bin/env python3
"""data/surname-families.json -> site/public/surname-families.json, the catalogue's published face for pages that look a surname up in the browser.

The catalogue is written only through scripts/surname_variants.py. This keeps just what a page needs to show a family's spellings: the headline,
each form with its status, and the forms the archives decided are a different name (with the reason). No evidence text and nothing about a person:
the evidence stays in the catalogue and on /surname-families/.
"""
import json, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "surname-families.json")
OUT = os.path.join(ROOT, "site", "public", "surname-families.json")


def main():
    d = json.load(open(SRC, encoding="utf-8"))
    rows = []
    for f in d.get("families", []):
        forms = []
        seen = set()
        for m in f.get("members", []):
            k = (m["form"], m["status"])
            if k in seen:
                continue
            seen.add(k)
            forms.append([m["form"], m["status"]])
        rows.append({"id": f["id"], "name": f["name"], "forms": forms,
                     "notSame": [[n["form"], n.get("why", "")] for n in f.get("notSame", [])]})
    out = {"note": "Published face of data/surname-families.json (scripts/surname_variants.py is the only writer). Statuses: same, attested, rule, lead, case-by-case. A lead is plausible and never seen on a record.",
           "licence": d.get("licence", "CC0"), "built": datetime.date.today().isoformat(), "rows": rows}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    print(f"surname-families.json  {os.path.getsize(OUT)/1024:.1f} KB  {len(rows)} families")


if __name__ == "__main__":
    main()

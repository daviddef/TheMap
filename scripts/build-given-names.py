#!/usr/bin/env python3
"""data/given-name-families.json -> site/public/given-names.json, in the shape the Archive Kit's SayYourName component reads.

The catalogue is written only through scripts/given_name_variants.py. This is its published face, one file every family
archive can fetch (https://recordatlas.org/given-names.json) so the "Say your name" page on each site shows the same
forms, with the same evidence, and no site keeps a table of its own.

Shape (the kit's contract, plus the three things the catalogue knows that a table did not):
  rows[{canon, id, sex, forms, attested, langs:{<lang>:[{form, seen, status, note, notNominative}]}, slips[], notSame[]}]
  langs[{key, label, note}]
`seen` is the number of times an archive reports meeting the form on a record (the sum of its evidence counts). A form
with seen 0 is a lookup aid: correct in that language, never seen. `status` is the catalogue's claim, and a page must
not present a `lead` as if it had been read.
"""
import json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ["NAME_CATALOGUE"] = "given"
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import surname_variants as sv  # noqa: E402

LANGS = [
    ("latin", "Latin", "The language of the register itself: the name as the priest wrote it in the entry, in the nominative or the case the sentence needed."),
    ("italian", "Italian", "What a civil clerk in Italy or under Italian administration wrote."),
    ("venetian", "Venetian", "The Venetian of the Adriatic clerks and of the street, often a clipped form."),
    ("croatian", "Croatian", "What the family said at home, and what a Croatian-language register wrote."),
    ("german", "German", "The Austrian and German form, from the administration and from emigration papers."),
    ("hungarian", "Hungarian", "What a Hungarian-administered register or index wrote."),
    ("english", "English", "The form at arrival: what an English-language clerk, ship's list or index made of it."),
]
OUT = os.path.join(ROOT, "site", "public", "given-names.json")


def seen(m):
    return sum(e.get("n") or 0 for e in m.get("evidence", []) if e.get("kind") == "archive")


def main():
    cat = sv.load()
    known = {k for k, _, _ in LANGS}
    langs = list(LANGS)
    for f in cat["families"]:
        for m in f["members"]:
            if m.get("lang") and m["lang"] not in known:
                known.add(m["lang"])
                langs.append((m["lang"], m["lang"].capitalize(), ""))
    rows, total, att = [], 0, 0
    for f in sorted(cat["families"], key=lambda f: sv.search_key(f["name"])):
        by = {}
        for m in f["members"]:
            s = seen(m)
            note = ""
            for e in m["evidence"]:
                if e.get("kind") == "note" and "notes it as:" in (e.get("what") or ""):
                    note = e["what"].split("notes it as:")[1].strip(" .")
                    break
            row = {"form": m["form"], "seen": s, "status": m["status"], "note": note,
                   "notNominative": next((e["what"].split(" of the Latin")[0].replace("The ", "") for e in m["evidence"] if e.get("rule") == "latin-case"), "")}
            by.setdefault(m.get("lang") or "latin", []).append(row)
            total += 1
            att += 1 if s > 0 else 0
        rows.append({"canon": f["name"], "id": f["id"], "sex": f.get("sex", ""), "forms": len(f["members"]),
                     "attested": sum(1 for m in f["members"] if seen(m) > 0), "langs": by,
                     "slips": [{"form": s["form"], "why": s["why"]} for s in f.get("slips", [])],
                     "notSame": [{"form": s["form"], "why": s["why"]} for s in f.get("notSame", [])]})
    out = {"note": "Every form of a given name, by language, with whether an archive has met it on a record. "
                   "Built from data/given-name-families.json; nothing about a person is kept. "
                   "A form with seen 0 is a lookup aid, not a finding.",
           "licence": "CC0", "built": datetime.date.today().isoformat(),
           "languages": [{"key": k, "label": l, "note": n} for k, l, n in langs],
           "totalForms": total, "attested": att, "aids": total - att, "rows": rows}
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"given-names.json {os.path.getsize(OUT) / 1024:6.1f} KB   {len(rows)} names, {total} forms ({att} met on a record)")


if __name__ == "__main__":
    main()

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
# Languages beyond the seven the two founding archives work in. A researched form carries one of these keys; the label and
# the line under it are the same kind of sentence for all of them, because none of them is any one archive's route.
MORE = {
    "greek": "Greek", "hebrew": "Hebrew", "scots": "Scots", "irish": "Irish", "scottishgaelic": "Scottish Gaelic",
    "welsh": "Welsh", "cornish": "Cornish", "breton": "Breton", "french": "French", "occitan": "Occitan",
    "spanish": "Spanish", "catalan": "Catalan", "galician": "Galician", "portuguese": "Portuguese",
    "sardinian": "Sardinian", "romanian": "Romanian", "dutch": "Dutch", "frisian": "Frisian", "danish": "Danish",
    "norwegian": "Norwegian", "swedish": "Swedish", "icelandic": "Icelandic", "finnish": "Finnish", "estonian": "Estonian",
    "polish": "Polish", "czech": "Czech", "slovak": "Slovak", "slovene": "Slovene", "serbian": "Serbian",
    "bulgarian": "Bulgarian", "macedonian": "Macedonian", "russian": "Russian", "ukrainian": "Ukrainian",
    "belarusian": "Belarusian", "lithuanian": "Lithuanian", "latvian": "Latvian", "albanian": "Albanian",
    "maltese": "Maltese", "basque": "Basque", "turkish": "Turkish", "yiddish": "Yiddish",
    "manx": "Manx", "afrikaans": "Afrikaans", "faroese": "Faroese", "sicilian": "Sicilian", "corsican": "Corsican",
    "asturian": "Asturian", "luxembourgish": "Luxembourgish", "neapolitan": "Neapolitan", "lombard": "Lombard",
    "norman": "Norman", "oldnorse": "Old Norse",
}
CORE = {k for k, _, _ in LANGS}   # the languages a card is always listed for, even when it holds nothing yet
FOUNDING = len(LANGS)   # the seven the two archives work in are always shown, empty or not; the rest only when a form uses them
for _k, _l in MORE.items():
    LANGS.append((_k, _l, f"The form a {_l}-language register, index or census would show, in Latin letters."))
OUT = os.path.join(ROOT, "site", "public", "given-names.json")


def seen(m):
    return sum(e.get("n") or 0 for e in m.get("evidence", []) if e.get("kind") == "archive")


def main():
    cat = sv.load()
    used = {m.get("lang") for f in cat["families"] for m in f["members"]}
    used |= {a["lang"] for f in cat["families"] for m in f["members"] for a in m.get("also") or []}
    known = {k for k, _, _ in LANGS}
    langs = [x for i, x in enumerate(LANGS) if i < FOUNDING or x[0] in used]
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
            src = next((e["ref"] for e in m["evidence"] if e.get("kind") == "source" and str(e.get("ref", "")).startswith("http")), "")
            if src:
                row["src"] = src
            if not note:
                note = next((e["period"] for e in m["evidence"] if e.get("kind") == "source" and e.get("period")), "")
                row["note"] = note
            by.setdefault(m.get("lang") or "latin", []).append(row)
            # THE SAME SPELLING IN ANOTHER LANGUAGE. A family keeps one row per spelling, with the language it was
            # first sourced in; `also` lists the other languages that write the name that way, each with its own
            # source, and the page shows the spelling on each of those cards too. `shared` marks the copy.
            for a in m.get("also") or []:
                cp = {k: v for k, v in row.items() if k != "src"}
                cp["shared"] = True
                cp["status"] = "lead"   # each language was source-checked on its own; a homograph elsewhere is not this language's
                asrc = next((e["ref"] for e in a["evidence"] if str(e.get("ref", "")).startswith("http")), "")
                if asrc:
                    cp["src"] = asrc
                by.setdefault(a["lang"], []).append(cp)
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
           "languages": [{"key": k, "label": l, "note": n, **({"core": True} if k in CORE else {})} for k, l, n in langs],
           "totalForms": total, "attested": att, "aids": total - att, "rows": rows}
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"given-names.json {os.path.getsize(OUT) / 1024:6.1f} KB   {len(rows)} names, {total} forms ({att} met on a record)")


if __name__ == "__main__":
    main()

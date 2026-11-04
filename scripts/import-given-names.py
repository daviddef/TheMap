#!/usr/bin/env python3
"""SEED the given-name catalogue from the two family archives that kept tables of their own.

    python3 scripts/import-given-names.py            # report
    python3 scripts/import-given-names.py --write    # data/given-name-families.json

ONE-TIME. The Defranceski archive (site/src/data/givennames.json: 73 name families) and the Blažević archive
(sources/givennames.psv + site/src/data/names.json: 52) each kept a table of the forms of a name by language and a count of
the times each was met in its own records. Those tables are the evidence; this folds them into the Atlas's one catalogue
(data/given-name-families.json, written afterwards only through scripts/given_name_variants.py) so the archives' own
tables can be retired and every site reads the same one.

WHAT GOES IN, AND WHAT DOES NOT. A form, its language, how many times an archive met it on a record, and the kind of
form (diminutive, Latin case). NOTHING ABOUT A PERSON: the Defranceski slips table names the people who bore the
mis-written names, and the Blažević names.json carries person records (`oblique`); neither is read here beyond the form
and the kind of document. Forms the tree wrote with a question mark are left out: a transcriber's doubt is not a form.

STATUS. A form met on a record is `attested` (evidence: the archive, how many times). A form only in the table is a
`lead`: the table says it is the Venetian or Hungarian form of the name, which is a fact about the language, not a record.
A Latin case ending (Joannem, Mariae) also carries a `rule`: the register declines the name to suit the sentence.
Forms two families both claim go to the first and the second family is told in a note, because one form belongs to one
family. The Blažević «a DIFFERENT name that the fold treated as one» rows become `not-same`.
"""
import argparse, collections, datetime, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FP = os.environ.get("FAMILY_PROJECTS", "/Volumes/DJ - Crucial - 4TB-SSD/Claude Projects/Family Projects")
OUT = os.path.join(ROOT, "data", "given-name-families.json")
TODAY = datetime.date.today().isoformat()
sys.path.insert(0, os.path.join(ROOT, "scripts"))
os.environ["NAME_CATALOGUE"] = "given"
import surname_variants as sv  # noqa: E402

LANGS = ["latin", "italian", "venetian", "croatian", "german", "hungarian", "english"]
LANG_NOTE = {
    "latin": "the Latin of the baptismal or burial entry (nominative, and the case the sentence needed)",
    "italian": "Italian", "venetian": "the Venetian of the Fiume and Istria clerks", "croatian": "Croatian",
    "german": "German", "hungarian": "Hungarian", "english": "English",
}
KEEP_NOTES = {"short form", "diminutive", "double diminutive", "the form of arrival",
              "without the diacritic, as an index will hold it", "as one clerk wrote it", "as the clerk spelt it",
              "as an Australian or American index would hold it", "as written in an Australian index",
              "the same in every language that has it", "a man's name in Italian"}
CASES = {"accusative", "genitive", "dative or ablative", "abbreviated"}
# Slips: the kind of document and the place and period, never the person. `form` -> (canon, kind of record, where, place, period, why)
SLIPS = {
    "JVAN": ("giovanni", "a wartime forced-labour record card (Arolsen Archives, War Time Card File)", "DE", None, "1939-1945",
             "A German clerk's J for a Croatian I."),
    "KDRAVKO": ("zdravko", "a wartime forced-labour record card (Arolsen Archives, War Time Card File)", "DE", None, "1939-1945",
                "A K read off a handwritten Z."),
    "ZDRACKO": ("zdravko", "a wartime forced-labour record card (Arolsen Archives, War Time Card File)", "DE", None, "1939-1945",
                "Indexed twice from one card file, wrong both times and differently."),
    "ZORAFKO": ("zdravko", "an Australian immigration file (National Archives of Australia, series B78)", "AU", "Melbourne", "1949",
                "How Australian officialdom wrote a Yugoslav arrival's name."),
    "Zdrafko": ("zdravko", "an alien-registration file (National Archives of Australia, series A2571)", "AU", None, None,
                "A fourth spelling, in a fourth office, of a name that was elsewhere Zdravko."),
    "Roza": ("rosa", "a naturalisation list in the Commonwealth of Australia Gazette", "AU", None, "1979",
             "A list that spelt the name differently from the parish register of the place she came from."),
    "Helenả": ("elena", "the FamilySearch index of the Fiume baptisms", "HR", "Rijeka", None,
               "Not a clerk at all: an indexing artefact, a stray hook on the final a. It is why a name search can miss the entry."),
    "Vitnio": ("vittorio", "a burial register, read through the FamilySearch index", "HR", None, None,
               "Vitorio with the r read as n. A slip of reading, not an Italian form of the name."),
    "Valentio": ("valentino", "a baptismal register, read through the FamilySearch index", "HR", "Rijeka", "1757",
                 "A dropped n. The same father is Valentini, Valentinus and Valentino on other entries."),
    "Antonÿ": ("antonio", "baptisms of Rijeka (DGS film 004679931)", "HR", "Rijeka", None,
               "The ÿ is the clerk's ligature for a double i: Antonii, the genitive. A letterform, not an English or Dutch spelling."),
}


def slug(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^a-z0-9]+", "-", "".join(c for c in s if not unicodedata.combining(c))).strip("-")


def cap(s):
    """Names are written with a capital; the Blažević table keeps its canon forms lower-case."""
    return s[:1].upper() + s[1:] if s and s == s.lower() else s


def fk(s):
    return sv.form_key(s)


def read_defranceski():
    d = json.load(open(os.path.join(FP, "Defranceski Family/site/src/data/givennames.json"), encoding="utf-8"))
    seen = {fk(k): v for k, v in d["seen"].items()}
    fam = {}
    for r in d["rows"]:
        fs = []
        for l in LANGS:
            for f in [x.strip() for x in (r.get(l) or "").split(",")]:
                if f and f != "—" and "?" not in f:
                    fs.append({"form": cap(f), "lang": l, "seen": seen.get(fk(f), 0), "note": "", "case": ""})
        fam[r["canon"]] = {"forms": fs, "sex": ""}
    return fam


def read_blazevic():
    names = json.load(open(os.path.join(FP, "Blazevic Family/site/src/data/names.json"), encoding="utf-8"))
    seen, sex = {}, {}
    for r in names["rows"]:
        sex[r["canon"]] = r.get("sex") or ""
        for l, fs in r["langs"].items():
            for f in fs:
                seen[(r["canon"], fk(f["form"]))] = f.get("seen", 0)
    fam = collections.defaultdict(lambda: {"forms": [], "sex": ""})
    for line in open(os.path.join(FP, "Blazevic Family/sources/givennames.psv"), encoding="utf-8"):
        if line.startswith("#") or not line.strip():
            continue
        p = (line.rstrip("\n").split("|") + ["", "", "", ""])[:5]
        canon, form, lang, note, case = p
        if "?" in form or canon in ("argentina", "uruguay"):
            continue
        fam[canon]["sex"] = sex.get(canon, "")
        fam[canon]["forms"].append({"form": cap(form), "lang": lang, "seen": seen.get((canon, fk(form)), 0), "note": note, "case": case})
    return fam


def pair_blazevic(D, B):
    """Which Blažević family is which Defranceski family: the most forms in common (at least two), same sex where both say."""
    dk = {c: {fk(f["form"]) for f in v["forms"]} for c, v in D.items()}
    m = {}
    for c, v in B.items():
        bk = {fk(f["form"]) for f in v["forms"]}
        best = max(dk, key=lambda d: len(bk & dk[d]), default=None)
        if best and len(bk & dk[best]) >= 2:
            m[c] = best
    return m


def evidence_attested(archive, n, kind):
    return {"kind": "archive", "what": f"Met {n} time{'s' if n != 1 else ''} in the {archive} archive's own records "
            f"({kind}).", "ref": f"archive:{archive}", "n": n, "added": TODAY}


def build():
    D, B = read_defranceski(), read_blazevic()
    pair = pair_blazevic(D, B)
    fams = {}

    def fam_for(cid, head):
        if cid not in fams:
            fams[cid] = {"id": slug(cid), "name": head, "note": "", "archives": [], "sex": "", "members": [], "notSame": [], "slips": []}
        return fams[cid]
    owner = {}

    def add(fam, f, archive):
        k = fk(f["form"])
        what_kind = "parish and civil registers and the family tree" if archive == "Defranceski" else "parish registers and the family tree"
        if k in owner and owner[k] is not fam:
            # a form two name-families both claim: it stays with the first; say so there
            m = next(x for x in owner[k]["members"] if fk(x["form"]) == k)
            if f["seen"] > 0:
                m["evidence"].append(evidence_attested(archive, f["seen"], what_kind))
            m["status"] = "case-by-case" if sv.RANK[m["status"]] < sv.RANK["case-by-case"] else m["status"]
            m["evidence"].append({"kind": "note", "what": f"Also listed in the {archive} archive's table under the name {fam['name']}; "
                                  f"decide per record which name an entry means.", "ref": f"archive:{archive}", "added": TODAY})
            return
        mem = next((x for x in fam["members"] if fk(x["form"]) == k), None)
        if not mem:
            mem = {"form": f["form"], "status": "lead", "lang": f["lang"], "evidence": []}
            fam["members"].append(mem)
            owner[k] = fam
        if f["seen"] > 0:
            if sv.RANK["attested"] < sv.RANK[mem["status"]]:
                mem["status"] = "attested"
            mem["evidence"].append(evidence_attested(archive, f["seen"], what_kind))
        else:
            mem["evidence"].append({"kind": "note", "what": f"Listed in the {archive} archive's table as the {LANG_NOTE.get(f['lang'], f['lang'])} form of "
                                    f"the name; not met on a record there.", "ref": f"archive:{archive}", "added": TODAY})
        if f["case"] in CASES:
            if "rule" not in [e.get("kind") for e in mem["evidence"]]:
                mem["evidence"].append({"kind": "rule", "rule": "latin-case", "what": f"The {f['case']} of the Latin name, as a register declines it "
                                        "to suit the sentence.", "ref": f"archive:{archive}", "added": TODAY})
            if mem["status"] == "lead":
                mem["status"] = "rule"
        if f["note"] in KEEP_NOTES and f["note"] != "a man's name in Italian":
            mem["rel"] = {"short form": "short", "diminutive": "diminutive", "double diminutive": "diminutive"}.get(f["note"], mem.get("rel"))
            if mem.get("rel") is None:
                del mem["rel"]
            mem["evidence"].append({"kind": "note", "what": f"The {archive} archive notes it as: {f['note']}.", "ref": f"archive:{archive}", "added": TODAY})

    for c, v in D.items():
        fam = fam_for(c, "")
        fam["archives"] = ["defranceski"]
        # headline = the member spelled like the canon, else the canon capitalised
        head = next((f["form"] for f in v["forms"] if fk(f["form"]) == fk(c)), cap(c))
        fam["name"] = head
        for f in v["forms"]:
            add(fam, f, "Defranceski")
    for c, v in B.items():
        target = pair.get(c)
        if target:
            fam = fams[target]
            fam["sex"] = fam["sex"] or v["sex"]
        else:
            head = next((f["form"] for f in v["forms"] if fk(f["form"]) == fk(c)), cap(c))
            fam = fam_for("b-" + c, head)
            fam["id"] = slug(c)
            fam["sex"] = v["sex"]
        if "blazevic" not in fam["archives"]:
            fam["archives"].append("blazevic")
        for f in v["forms"]:
            if f["note"].startswith("a slip for"):
                fam["slips"].append({"form": f["form"], "why": "A slip for the name, noted by the Blažević archive.",
                                     "evidence": [{"kind": "archive", "what": "Met once in a record of that archive as a mis-writing of the name.",
                                                   "ref": "archive:Blažević", "added": TODAY}]})
                continue
            if f["note"].startswith("a DIFFERENT name"):
                clash = next((x for x in fam["members"] if fk(x["form"]) == fk(f["form"])), None)
                if clash:   # the other archive lists it as a form of this name: say the two disagree, per record
                    clash["status"] = "case-by-case"
                    clash["evidence"].append({"kind": "note", "what": "The Blažević archive treats it as a different name that its search fold "
                                              "had joined to this one; decide per record.", "ref": "archive:Blažević", "added": TODAY})
                    continue
                fam["notSame"].append({"form": f["form"], "why": "A different name that this archive's own search fold treated as one; kept apart here.",
                                       "evidence": [{"kind": "archive", "what": "Noted as a different name by the archive that built the fold.",
                                                     "ref": "archive:Blažević", "added": TODAY}]})
                continue
            add(fam, f, "Blažević")
    # slips of the Defranceski archive, by document kind not by person
    for form, (canon, kind, cc, place, period, why) in SLIPS.items():
        fam = fams.get(canon) or next((x for x in fams.values() if x["id"] == canon), None)
        if not fam:
            print("no family for slip", form, canon, file=sys.stderr)
            continue
        ev = {"kind": "record", "what": f"Written once, by mistake, in {kind}.", "where": [cc], "ref": "archive:Defranceski", "added": TODAY}
        if place:
            ev["place"] = place
        if period:
            ev["period"] = period
        fam["slips"].append({"form": form, "why": why, "evidence": [ev]})
    out = []
    for fam in fams.values():
        if not fam["members"]:
            print("dropped (every form is held by another family):", fam["name"], file=sys.stderr)
            continue
        if sv.form_key(fam["name"]) not in {sv.form_key(m["form"]) for m in fam["members"]} and fam["members"]:
            hit = next((m["form"] for m in fam["members"] if sv.search_key(m["form"]) == sv.search_key(fam["name"])), None)
            fam["name"] = hit or fam["members"][0]["form"]
        fam["sex"] = {"m": "m", "f": "f"}.get(fam["sex"], "")
        if not fam["sex"]:
            del fam["sex"]
        if not fam["slips"]:
            del fam["slips"]
        out.append(fam)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    fams = build()
    cat = {"name": "Given-name families", "licence": "CC0",
           "note": "A name across languages: each family is one given name and every form a register or index wrote it as. "
                   "Nothing about a person is kept here. Written only through scripts/given_name_variants.py.",
           "statuses": sv.LEGEND, "rules": sv.RULES,
           "families": fams}
    errs = sv.validate(cat)
    for e in errs[:30]:
        print("FAIL:", e)
    c = sv.counts(cat)
    print(f"{c['families']} families, {c['forms']} forms ({', '.join(f'{c[s]} {s}' for s in sv.STATUSES)}), {c['notSame']} not-same, {c['slips']} slips")
    if errs:
        sys.exit(1)
    if a.write:
        sv.save(cat, OUT)
        print("wrote", OUT)


if __name__ == "__main__":
    main()

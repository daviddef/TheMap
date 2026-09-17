#!/usr/bin/env python3
"""The surnames the eight family archives attest, snapshotted so CI can see them.

TWO BUGS MET HERE AND THE SECOND ONE HID THE FIRST.

ONE. build-surnames.py read the sibling archives through an ABSOLUTE PATH on
one Mac — /Users/daviddefranceski/Claude/Projects. GitHub Actions checks out
this repository and nothing else, so in CI that directory does not exist, the
glob matched nothing, and every archive attestation was silently dropped from
the dataset the site actually serves. It was silent because a loop over an
empty list prints nothing.

    LIVE   Lerena -> Spain, United States
    LOCAL  Lerena -> ARGENTINA, Spain, United States, URUGUAY

David asked why Lerena showed no Argentina and no Uruguay when the research is
thorough there. It was thorough. The data existed on this machine and had
never once reached the site.

The cure is the rule this project already applies to places: a cross-repo
dependency is a SNAPSHOT, committed, not a live read. This script is run by
hand when an archive has moved on, and writes data/archive-surnames.json into
the repository, where CI can see it.

TWO. Only five of the eight archives were producing anything even locally,
because the reader looked for a field literally named «surname» under a key
literally named «people», and three archives do not store it that way — the
Defranceski archive least of all. Its register carries 1,508 rows under `sp`,
which is where every De Franceschi spelling variant in Croatia lives, and the
harvester walked straight past it. That is why the family this whole project
grew out of was attested in Slovenia, by a national register, and not in
Croatia by its own archive.

So the field names are DECLARED per archive rather than guessed, and every
archive that yields nothing is reported as a failure rather than skipped.

NOTHING ABOUT A PERSON LEAVES THE ARCHIVES. This reads person records and
keeps one thing from each: the surname string. No given name, no date, no
place, no relationship, no identifier. Record Atlas is a map of where records
are, and the family layers are the one thing that cannot generalise.

    python3 scripts/harvest-archive-surnames.py
"""
import json, glob, os, re, sys, time, collections

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
PROJ = os.path.dirname(_ROOT)

# label, folder, countries the archive's research actually covers, and where
# its surnames live. A spec of (filename-glob, path-into-the-doc, field).
# «*» as the field means the list holds bare strings.
ARCHIVES = [
    ("Defranceschi", "Defranceski Family", ["HR", "IT"], [
        ("register.json", "", "sp"),        # 1,508 FamilySearch personas
        ("gologorica.json", "", "name"),    # a GEDCOM, full names
        ("roster.json", "rows", "name"),    # the worked line, full names
    ]),
    ("Falco", "Falco Family", ["IT"], [
        ("register.json", "", "surname"), ("people.json", "", "surname"),
        ("living.json", "", "surname"), ("married-in.json", "", "surname"),
    ]),
    ("Blažević", "Blazevic Family", ["HR"], [("*.json", "", "surname")]),
    ("Booyzen", "Booyzen Family", ["ZA"], [
        ("*.json", "", "surname"), ("*.json", "", "last"),
        ("dna.json", "the_autoclusters/clusters", "tree_surnames"),
        ("dna.json", "the_aunts_own_chart/detail", "tree_surnames"),
    ]),
    ("Lerena", "Lerena Family", ["AR", "UY", "ES"], [("*.json", "", "surname")]),
    ("D'Arcy", "D'arcy Family", ["GB", "IE", "AU"], [("*.json", "", "surname")]),
    ("Mazza", "Mazza Family", ["IT", "AU", "US"], [("*.json", "", "surname")]),
    ("Luwinski", "Luwinski Family", ["PL", "DE"], [
        ("register.json", "people", "last"), ("emigration.json", "rows", "last"),
        ("*.json", "", "surname"),
    ]),
]

# Particles that belong to the surname rather than to the given name, so that
# «Gioannes Maria De Franceschi» yields «De Franceschi» and not «Franceschi».
PARTICLE = {"de", "di", "da", "del", "della", "dei", "dal", "van", "von", "der",
            "den", "ter", "le", "la", "du", "des", "of", "y", "e", "af", "af."}
# A GEDCOM writes the surname between slashes; a roster does not.
SLASHED = re.compile(r"/([^/]+)/")


def surname_of(full):
    """The surname inside a free-form personal name.

    Only used for the archives that store one. It is a guess and a modest one:
    the trailing word, plus any particles immediately before it. A name it
    cannot read is dropped rather than half-read."""
    full = (full or "").strip()
    m = SLASHED.search(full)
    if m:
        return m.group(1).strip()
    full = re.sub(r"\s*\([^)]*\)", "", full)
    parts = [p for p in re.split(r"\s+", full) if p]
    if len(parts) < 2:
        return ""
    i = len(parts) - 1
    while i > 1 and parts[i - 1].lower().strip(".") in PARTICLE:
        i -= 1
    return " ".join(parts[i:])


def dig(doc, path):
    for step in [s for s in path.split("/") if s]:
        if not isinstance(doc, dict) or step not in doc:
            return None
        doc = doc[step]
    return doc


def lists_in(doc, depth=0):
    """Every list of dicts in a document, to a sane depth."""
    if depth > 4:
        return
    if isinstance(doc, list):
        if doc and isinstance(doc[0], dict):
            yield doc
        for x in doc[:200]:
            yield from lists_in(x, depth + 1)
    elif isinstance(doc, dict):
        for v in doc.values():
            yield from lists_in(v, depth + 1)


def main():
    if not os.path.isdir(PROJ):
        sys.exit(f"the sibling archives are not here: {PROJ}")

    out, report, missing = {}, [], []
    for label, folder, ccs, specs in ARCHIVES:
        base = os.path.join(PROJ, folder)
        if not os.path.isdir(base):
            missing.append((label, "folder not found"))
            continue
        names, whence = collections.Counter(), collections.Counter()
        for pattern, path, field in specs:
            for p in sorted(glob.glob(os.path.join(base, "site/src/data", pattern))):
                try:
                    doc = json.load(open(p))
                except Exception:
                    continue
                target = dig(doc, path) if path else doc
                if target is None:
                    continue
                pools = [target] if (isinstance(target, list) and target
                                     and isinstance(target[0], dict)) else list(lists_in(target))
                for pool in pools:
                    for row in pool:
                        if not isinstance(row, dict) or field not in row:
                            continue
                        v = row[field]
                        vals = v if isinstance(v, list) else [v]
                        for raw in vals:
                            if not isinstance(raw, str) or not raw.strip():
                                continue
                            # A year in a field called «last» is not a surname.
                            if raw.strip().isdigit():
                                continue
                            n = (surname_of(raw) if field == "name" else raw).strip()
                            # Booyzen's DNA clusters carry slugs, not spellings.
                            if field == "tree_surnames":
                                n = " ".join(w.capitalize() for w in n.split("-"))
                            if len(n) < 2 or len(n) > 60:
                                continue
                            names[n] += 1
                            whence[os.path.basename(p) + ":" + field] += 1
        if not names:
            missing.append((label, "no surnames found — check the field spec"))
            continue
        out[label] = {"countries": ccs, "surnames": sorted(names),
                      "from": dict(whence.most_common())}
        report.append((label, len(names), ",".join(ccs)))

    for label, n, ccs in report:
        print(f"  {label:14}{n:6} surnames -> {ccs}")
    for label, why in missing:
        print(f"  {label:14}  FAILED — {why}")

    path = "data/archive-surnames.json"
    json.dump({
        "note": ("Surnames attested by the eight family archives, and the countries "
                 "each archive's research actually covers. A SNAPSHOT, committed on "
                 "purpose: build-surnames.py used to read the sibling repositories "
                 "through an absolute path, which exists on one laptop and not in CI, "
                 "so every one of these attestations was silently missing from the "
                 "deployed dataset. Re-run scripts/harvest-archive-surnames.py when "
                 "an archive has moved on."),
        "privacy": ("Surname strings only. No given name, no date, no place, no "
                    "relationship and no identifier leaves the archives — the family "
                    "layers are the one thing that cannot generalise, and this map "
                    "is about where records are, not about who is in them."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"archives": len(out),
                   "surnames": len({n for a in out.values() for n in a["surnames"]})},
        "archives": out,
    }, open(path, "w"), ensure_ascii=False, indent=1)
    total = len({n for a in out.values() for n in a["surnames"]})
    print(f"\n{total} distinct surnames across {len(out)} archives -> {path}")
    if missing:
        sys.exit(f"{len(missing)} archive(s) yielded nothing — not writing a "
                 f"half-empty snapshot over a good one without saying so")


if __name__ == "__main__":
    main()

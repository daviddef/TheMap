#!/usr/bin/env python3
"""THE ONE PLACE A SURNAME'S SPELLINGS ARE KEPT.

Every family archive used to keep its own: Lerena a table of fourteen forms,
Defranceski a list in a skill, Blažević pairs written into names («Žubrinić /
Xubrinich»). Nothing shared them, so a session searching Trinidad for LERENA
missed SERENA for a month, and a nil said «nothing in every spelling» about a
list nobody had kept. This file is that list, for every archive, with the
evidence for each form, and it is what the name pages show.

    data/surname-families.json     the catalogue (the only thing anyone writes)
    scripts/surname_variants.py    this tool: look up, add, check, publish

WHAT A STATUS CLAIMS. Eight words, and each one is a different claim:

  same          one record or the family's own tree writes ONE person or family
                both ways. The strongest thing a spelling can have.
  attested      this archive met the form on a record of its own line.
  rule          reached by a documented mechanical substitution (a tilde the
                index folds, a clerk's ć written ch). No record needed.
  lead          plausible, never seen on a record. Search it. Never write a
                data row on it alone.
  case-by-case  sometimes this family, sometimes another's. Decide per record.
  not-same      a different name that will turn up in a search and be wrong.
                Recorded so nobody decides it again. Lives under `notSame`.

TYPOGRAPHY IS NOT STORED, IT IS DERIVED. Case, spaces, hyphens, apostrophes and
a fused or spaced particle (Defranceschi, DeFranceschi, De Franceschi, de
Franceschi) are ONE form with one identity key, form_key(). Listing them as
spellings is how a catalogue grows to ten times its meaning, and how two
sessions disagree about whether «De Franceschi» was tried when they tried
«Defranceschi».

AN ACCENT IS NOT TYPOGRAPHY. Lereña is a priest's own spelling and Lerena is
not; Žubrinić and Zubrinic are two forms with two bodies of evidence. So the
identity key keeps accents. What an INDEX does is a separate thing: it folds
them, so a search for one returns the other's records. search_key() is that,
and it is what lookup falls back to and what a nil's coverage is judged by.

NOTHING ABOUT A PERSON GOES IN. A form, a place, a period, a kind of record and
the archive that read it. No given name, no date of birth, no identifier. The
evidence says what was seen («an 1889 probate writes one man both ways»), not
who. The same rule harvest-archive-surnames.py keeps.

    python3 scripts/surname_variants.py terms Lerena           # what to search
    python3 scripts/surname_variants.py cover Lerena --tried "Lerena, Llerena"
    python3 scripts/surname_variants.py show Defranceski
    python3 scripts/surname_variants.py add --family lerena Serena --status attested \
        --kind record --what "an 1879 cathedral act" --where UY --period 1879 --ref archive:Lerena
    python3 scripts/surname_variants.py check
    python3 scripts/surname_variants.py publish           # fresh clone; ONLY the catalogue
"""
import argparse, datetime, gzip, json, os, re, subprocess, sys, tempfile, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# One tool, two catalogues. `scripts/given_name_variants.py` sets NAME_CATALOGUE=given and calls this file's main(): the
# rules (statuses, typography, "nothing about a person goes in", merge, publish) are the same for a given name and for
# a surname, and keeping them in one place is the point.
GIVEN = os.environ.get("NAME_CATALOGUE") == "given"
LABEL = "given-name-families" if GIVEN else "surname-families"
WORD = "given name" if GIVEN else "surname"
CAT = os.path.join(ROOT, "data", LABEL + ".json")
CAT_REL = "data/" + LABEL + ".json"
REPO_URL = "https://github.com/daviddef/TheMap.git"

STATUSES = ["same", "attested", "rule", "lead", "case-by-case"]
RANK = {s: i for i, s in enumerate(STATUSES)}
LEGEND = {
    "same": "One record, or the family's own tree, writes one person or family both ways.",
    "attested": "Met on a record of this family's line by the archive that read it.",
    "rule": "Reached by a documented mechanical substitution. No record needed.",
    "lead": "Plausible and never seen on a record. Search it; never write a data row on it alone.",
    "case-by-case": "Sometimes this family, sometimes another. Decide per record.",
    "not-same": "A different name that turns up in searches. Recorded so it is not decided twice.",
}
# A clerk's slip is not a spelling of the name: one hand, one document, a mistake (ZORAFKO for Zdravko, a ligature in Antonÿ,
# an index artefact). It is kept so nobody counts it as a variant and nobody searches the world for it, and the evidence
# names the kind of document and the place and period, never the person.
LEGEND["slip"] = "Written once by a clerk or an indexer by mistake. Not a spelling of the name; recorded so it is not mistaken for one."
LANG_RE = re.compile(r"^[a-z]{2,20}$")
KINDS = ["record", "index", "archive", "owner", "source", "rule", "note"]
# What each status needs underneath it. A «same» that rests on a note is a hunch.
NEEDS = {
    "same": {"record", "archive", "owner", "index"},
    "attested": {"record", "archive", "owner", "index", "source"},
    "rule": {"rule"},
    "lead": set(KINDS),
    "case-by-case": set(KINDS),
}
RULES = {
    "diacritic-fold": "The index folds the mark: a search for one returns the other's records.",
    "translit": "A documented substitution when a Slavic name crosses a Latin-alphabet border (ć written ch, š sh).",
    "latin-case": "Latin declension: the register writes the name in the case the sentence needs (Joannem, Joannis).",
    "ending": "A systematic ending change between languages (-schi / -ski, -ić / -ich).",
}
PARTICLES = ["della", "del", "de", "di", "da", "van", "von", "du", "le", "la", "des", "ten", "ter"]


# ---------------------------------------------------------------- the rule

def search_key(s):
    """What an index treats as one: lower case, accents gone, separators gone."""
    s = (s or "").translate(str.maketrans({"đ": "d", "ł": "l", "ø": "o", "ß": "ss",
                                           "æ": "ae", "œ": "oe"}))
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]", "", s)


def form_key(s):
    """What makes two forms THE SAME FORM here: case, spaces, hyphens and
    apostrophes only. Accents stay: Lereña and Lerena are different spellings."""
    s = unicodedata.normalize("NFC", s or "").lower()
    return re.sub(r"[\s'’\-]+", "", s)


fold_key = search_key


def typography_forms(form):
    """The ways ONE form is routinely typed. Returned for searching, never
    stored: they all share fold_key(form)."""
    out = [form]
    plain = unicodedata.normalize("NFKD", form)
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    if plain != form:
        out.append(plain)
    bare = re.sub(r"[\s'’\-]+", "", plain)
    if bare != plain:
        out.append(bare)
    base = re.sub(r"[\s'’\-]+", "", plain)
    low = base.lower()
    for p in PARTICLES:
        if low.startswith(p) and len(low) - len(p) >= 5:
            rest = base[len(p):]
            out += [p.capitalize() + rest.capitalize(), p.capitalize() + " " + rest.capitalize(),
                    p + " " + rest.capitalize(), p.capitalize() + rest[0].upper() + rest[1:]]
            break
    if "'" in form or "’" in form:
        out += [re.sub(r"'", "’", form), re.sub(r"['’]\s*", "", form)]
    seen, res = set(), []
    for x in out:
        if x not in seen:
            seen.add(x)
            res.append(x)
    return res


# ------------------------------------------------------------- the catalogue

def load(path=None):
    path = path or CAT
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def save(cat, path=None):
    path = path or CAT
    cat["families"].sort(key=lambda f: fold_key(f["name"]))
    for f in cat["families"]:
        f["members"].sort(key=lambda m: (RANK[m["status"]], fold_key(m["form"])))
        f.get("notSame", []).sort(key=lambda m: fold_key(m["form"]))
        if "slips" in f:
            f["slips"].sort(key=lambda m: fold_key(m["form"]))
    cat["built"] = datetime.date.today().isoformat()
    cat["counts"] = counts(cat)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(cat, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, path)


def counts(cat):
    c = {"families": len(cat["families"]), "forms": 0, "notSame": 0, "slips": 0}
    for s in STATUSES:
        c[s] = 0
    for f in cat["families"]:
        for m in f["members"]:
            c["forms"] += 1
            c[m["status"]] += 1
        c["notSame"] += len(f.get("notSame", []))
        c["slips"] += len(f.get("slips", []))
    return c


def index(cat):
    """key -> (family, member, 'member'|'notSame'). One key, one answer; check()
    refuses a catalogue where it would be two."""
    ix = {}
    for f in cat["families"]:
        for m in f["members"]:
            ix.setdefault(form_key(m["form"]), (f, m, "member"))
        for m in f.get("notSame", []):
            ix.setdefault(form_key(m["form"]), (f, m, "notSame"))
        for m in f.get("slips", []):
            ix.setdefault(form_key(m["form"]), (f, m, "slip"))
    return ix


def lookup(cat, name):
    """Exactly as typed first; then as an index would read it (accents folded)."""
    ix = index(cat)
    if form_key(name) in ix:
        return ix[form_key(name)]
    sk = search_key(name)
    for k, v in ix.items():
        if search_key(v[1]["form"]) == sk:
            return v
    return None


def family_by_id(cat, fid):
    return next((f for f in cat["families"] if f["id"] == fid), None)


# ----------------------------------------------------------------- the gate

def validate(cat, countries=None):
    errs = []
    ids, owner = set(), {}
    for f in cat.get("families", []):
        fid = f.get("id")
        if not fid or not re.fullmatch(r"[a-z0-9-]+", fid):
            errs.append(f"{LABEL}: family id {fid!r} must be lower-case letters, digits, hyphens")
        if fid in ids:
            errs.append(f"{LABEL}: family {fid} appears twice")
        ids.add(fid)
        forms = {form_key(m.get("form", "")): m for m in f.get("members", [])}
        if form_key(f.get("name", "")) not in forms:
            errs.append(f"{LABEL} {fid}: the headline name {f.get('name')!r} is not one of its members")
        seen = {}
        for m in f.get("members", []):
            form, st = m.get("form", ""), m.get("status")
            k = form_key(form)
            where = f"{LABEL} {fid}/{form}"
            if not k:
                errs.append(f"{where}: an empty form")
                continue
            if st not in STATUSES:
                errs.append(f"{where}: status {st!r} is not one of {', '.join(STATUSES)}")
                continue
            if k in seen:
                errs.append(f"{where}: is the same typography as {seen[k]!r}. Case, spaces, hyphens, apostrophes and a spaced "
                            f"particle are one form here; list it once")
            seen[k] = form
            if k in owner and owner[k] != fid:
                errs.append(f"{where}: also a member of family {owner[k]}. One form belongs to one family; "
                            f"if both are real, one of them is `case-by-case`")
            owner.setdefault(k, fid)
            if m.get("lang") and not LANG_RE.match(m["lang"]):
                errs.append(f"{where}: lang {m['lang']!r} must be lower-case letters (latin, italian, croatian...)")
            seen_also = set()
            for a in m.get("also") or []:
                al = a.get("lang") or ""
                if not LANG_RE.match(al):
                    errs.append(f"{where}: also-language {al!r} must be lower-case letters (croatian, slovene...)")
                elif al == m.get("lang"):
                    errs.append(f"{where}: also-language {al!r} is the form's own language; `also` lists the OTHER languages")
                elif al in seen_also:
                    errs.append(f"{where}: also-language {al!r} listed twice")
                seen_also.add(al)
                aev = a.get("evidence") or []
                if not aev:
                    errs.append(f"{where}: also {al!r} with no evidence. A spelling shared with another language needs its own source")
                for e in aev:
                    if not (e.get("what") or "").strip() or not str(e.get("ref") or "").startswith("http"):
                        errs.append(f"{where}: also {al!r} evidence needs `what` and an http `ref`")
            ev = m.get("evidence") or []
            if not ev:
                errs.append(f"{where}: a {st} form with no evidence. Say what was seen, and where")
            for e in ev:
                kind = e.get("kind")
                if kind not in KINDS:
                    errs.append(f"{where}: evidence kind {kind!r} is not one of {', '.join(KINDS)}")
                if not (e.get("what") or "").strip():
                    errs.append(f"{where}: evidence with no `what`")
                for cc in e.get("where") or []:
                    if countries is not None and cc not in countries:
                        errs.append(f"{where}: evidence names country {cc!r}, which is not a known code")
                if st == "rule" and kind == "rule" and e.get("rule") not in RULES:
                    errs.append(f"{where}: rule {e.get('rule')!r} is not one of {', '.join(RULES)}")
            if ev and not any(e.get("kind") in NEEDS[st] for e in ev):
                errs.append(f"{where}: `{st}` needs evidence of kind {' / '.join(sorted(NEEDS[st]))}; "
                            f"it has only {', '.join(sorted({e.get('kind') for e in ev}))}")
        for m in f.get("slips", []):
            w = f"{LABEL} {fid}/{m.get('form')} (slip)"
            if not (m.get("why") or "").strip():
                errs.append(f"{w}: a slip with no `why`")
            if not m.get("evidence"):
                errs.append(f"{w}: a slip with no evidence. Name the kind of document, the place and the period")
            if form_key(m.get("form", "")) in forms:
                errs.append(f"{w}: is also a member of the same family; it is a spelling or a slip, not both")
        for m in f.get("notSame", []):
            if not (m.get("why") or "").strip():
                errs.append(f"{LABEL} {fid}/{m.get('form')}: a not-same form with no `why`")
            if form_key(m.get("form", "")) in forms:
                errs.append(f"{LABEL} {fid}/{m.get('form')}: both a member and not-same of the same family")
    return errs


# ------------------------------------------------------------------- reading

def tiers(cat, name):
    """What to search for a name, by claim. Typography is attached to every form."""
    hit = lookup(cat, name)
    out = {"name": name, "family": None, "role": None, "tiers": {s: [] for s in STATUSES},
           "notSame": [], "slips": [], "asked": None}
    if not hit:
        return out
    f, m, role = hit
    out["family"] = f
    out["role"] = role
    out["asked"] = m
    for mm in f["members"]:
        out["tiers"][mm["status"]].append(mm)
    out["notSame"] = list(f.get("notSame", []))
    out["slips"] = list(f.get("slips", []))
    return out


def graph_leads(name, limit=25):
    if GIVEN:
        return []   # the atlas's computed links are surname clusters; a given name has none yet
    """The atlas's computed spelling links for a name: Wikidata «same as», one
    systematic substitution, a grammatical form. These are LEADS, labelled so.
    «Sounds like» is left out: it chains, and nobody has checked it."""
    leads = []
    k = fold_key(name)
    # data/surname-clusters.json is small; the corpus is 200 MB, so it is the fallback.
    try:
        cl = load(os.path.join(ROOT, "data", "surname-clusters.json"))
        for c in cl["clusters"]:
            if any(fold_key(m["n"]) == k for m in c["members"]):
                leads += [m["n"] for m in c["members"] if fold_key(m["n"]) != k]
    except (OSError, ValueError):
        pass
    for p in (os.path.join(ROOT, "site", "src", "data", "surnames.json"),):
        if leads or not os.path.exists(p):
            continue
        try:
            with open(p, encoding="utf-8") as fh:
                for r in json.load(fh).get("surnames", []):
                    if fold_key(r["n"]) == k:
                        leads += [v["n"] for v in r.get("variants", [])
                                  if v.get("how") in ("curated", "spelling", "grammar")]
                        break
        except (OSError, ValueError):
            pass
    seen, res = set(), []
    for x in leads:
        if fold_key(x) not in seen:
            seen.add(fold_key(x))
            res.append(x)
    return res[:limit]


def cmd_terms(a):
    cat = load()
    t = tiers(cat, a.name)
    if a.json:
        print(json.dumps({"name": a.name, "family": t["family"] and t["family"]["id"],
                          "role": t["role"],
                          "terms": {s: [m["form"] for m in t["tiers"][s]] for s in STATUSES},
                          "notSame": [m["form"] for m in t["notSame"]],
                          "slips": [m["form"] for m in t["slips"]]},
                         ensure_ascii=False, indent=1))
        return
    f = t["family"]
    if not f:
        print(f"{a.name}: not in the catalogue. Search it as written and its typography forms:")
        print("  " + " · ".join(typography_forms(a.name)))
    elif t["role"] == "notSame":
        print(f"{a.name}: recorded as NOT the same as the {f['name']} family — {t['asked']['why']}")
        return
    elif t["role"] == "slip":
        print(f"{a.name}: a clerk's slip for the {f['name']} family, not a spelling — {t['asked']['why'].rstrip('.')}. "
              f"Search the family's own forms instead:")
        a.name = f["name"]
        t = tiers(cat, a.name)
        f = t["family"]
        print(f"{f['name']} family ({f['id']}): {f.get('note', '')}".strip())
        for s in STATUSES:
            for m in t["tiers"][s]:
                print(f"  {m['form']}   ({s})")
        return
    else:
        print(f"{f['name']} family ({f['id']}): {f.get('note', '')}".strip())
        heads = {"same": "SEARCH — same family", "attested": "SEARCH — seen on this line's records",
                 "rule": "SEARCH — rule", "lead": "SEARCH — leads, unproven",
                 "case-by-case": "SEARCH BUT DECIDE PER RECORD"}
        for s in STATUSES:
            ms = t["tiers"][s]
            if not ms:
                continue
            print(f"\n{heads[s]}")
            for m in ms:
                ty = typography_forms(m["form"])[1:] if s != "lead" else []
                print(f"  {m['form']}" + (f"   (also typed: {', '.join(ty)})" if ty and a.typed else ""))
        if t["slips"]:
            print("\nCLERK'S SLIPS — seen once, by mistake. Do not search for them and do not count them as spellings")
            for m in t["slips"]:
                print(f"  {m['form']}: {m['why']}")
        if t["notSame"]:
            print("\nNOT THE SAME NAME — expect these in results and do not count them")
            for m in t["notSame"]:
                print(f"  {m['form']}: {m['why']}")
    if a.graph:
        have = {fold_key(m["form"]) for s in STATUSES for m in t["tiers"][s]}
        g = [x for x in graph_leads(a.name) if fold_key(x) not in have]
        if g:
            print("\nLEADS from the atlas's own spelling links (computed, not checked against a record)")
            print("  " + " · ".join(g))
    if f and t["role"] == "member":
        print("\nA nil must name the terms you actually typed. `cover` checks the list against the above.")


def cmd_cover(a):
    cat = load()
    t = tiers(cat, a.name)
    tried = {fold_key(x) for x in re.split(r"[,;|]", a.tried) if x.strip()}
    if not t["family"] or t["role"] != "member":
        asked = {fold_key(a.name)}
        miss = [] if asked <= tried else [a.name]
        print("not catalogued: " + ("covered" if not miss else f"you did not try {a.name}"))
        sys.exit(1 if miss else 0)
    need = [m for s in ("same", "attested", "rule") for m in t["tiers"][s]]
    miss = [m["form"] for m in need if fold_key(m["form"]) not in tried]
    soft = [m["form"] for s in ("lead", "case-by-case") for m in t["tiers"][s] if fold_key(m["form"]) not in tried]
    if miss:
        print("NOT COVERED — the catalogue holds these for this family and you did not try them:")
        print("  " + " · ".join(miss))
    else:
        print(f"covered: every same / attested / rule form of the {t['family']['name']} family was tried.")
    if soft:
        print("not tried (leads, optional): " + " · ".join(soft))
    sys.exit(1 if miss else 0)


def cmd_show(a):
    cat = load()
    hit = lookup(cat, a.name)
    if not hit:
        print(f"{a.name}: no family. Typography forms: {' · '.join(typography_forms(a.name))}")
        return
    f, m, role = hit
    print(json.dumps(f if a.family else m, ensure_ascii=False, indent=1))


# ------------------------------------------------------------------- writing

def today():
    return datetime.date.today().isoformat()


def evidence_from(a):
    e = {"kind": a.kind, "what": a.what}
    if a.where:
        e["where"] = [x.strip().upper() for x in a.where.split(",") if x.strip()]
    if a.place:
        e["place"] = a.place
    if a.period:
        e["period"] = a.period
    if a.ref:
        e["ref"] = a.ref
    if a.n:
        e["n"] = a.n
    if a.rule:
        e["rule"] = a.rule
    e["added"] = today()
    return e


def cmd_add(a):
    cat = load()
    fam = family_by_id(cat, a.family)
    if not fam:
        if not a.new:
            sys.exit(f"no family {a.family!r}. Families: {', '.join(f['id'] for f in cat['families'])}.\n"
                     f"To start one: add --new --headline NAME (the form the page is titled with).")
        fam = {"id": a.family, "name": a.headline or a.form, "note": a.note or "", "archives": [],
               "members": [], "notSame": []}
        cat["families"].append(fam)
    hit = index(cat).get(form_key(a.form))
    if hit and hit[0]["id"] != a.family:
        sys.exit(f"{a.form!r} is already in family {hit[0]['id']} as {hit[1].get('status') or 'not-same'}. "
                 f"One form belongs to one family. If both are real, make it case-by-case there.")
    if a.archive and a.archive not in fam["archives"]:
        fam["archives"].append(a.archive)
    ev = evidence_from(a)
    if a.status == "slip":
        row = next((m for m in fam.setdefault("slips", []) if form_key(m["form"]) == form_key(a.form)), None)
        if not row:
            row = {"form": a.form, "why": a.what, "evidence": []}
            fam["slips"].append(row)
        row.setdefault("evidence", []).append(ev)
    elif a.status == "not-same":
        row = next((m for m in fam["notSame"] if form_key(m["form"]) == form_key(a.form)), None)
        if not row:
            row = {"form": a.form, "why": a.what, "evidence": []}
            fam["notSame"].append(row)
        row["why"] = a.what
        row.setdefault("evidence", []).append(ev)
    else:
        row = next((m for m in fam["members"] if form_key(m["form"]) == form_key(a.form)), None)
        if not row:
            row = {"form": a.form, "status": a.status, "evidence": []}
            if a.lang:
                row["lang"] = a.lang
            fam["members"].append(row)
        elif RANK[a.status] < RANK[row["status"]]:
            row["status"] = a.status
        elif RANK[a.status] > RANK[row["status"]]:
            if not a.force:
                print(f"note: {a.form} is already {row['status']}, which is stronger than {a.status}; "
                      f"kept, and the evidence added. --force, saying why in --what, if a record showed it wrong.")
            else:
                row["status"] = a.status
        if not any(e.get("kind") == ev["kind"] and e.get("what") == ev["what"] for e in row["evidence"]):
            row["evidence"].append(ev)
    errs = validate(cat)
    if errs:
        sys.exit("not written:\n  " + "\n  ".join(errs[:8]))
    save(cat)
    print(f"{a.family}: {a.form} -> {a.status}. Written to {CAT_REL} (local). "
          f"`publish` sends it to the atlas; until then it is not on the site.")


def cmd_check(a):
    cat = load()
    try:
        countries = set(load(os.path.join(ROOT, "data", "countries.json"))["countries"])
    except (OSError, ValueError, KeyError, TypeError):
        countries = None
    errs = validate(cat, countries)
    for e in errs[:40]:
        print("FAIL:", e)
    c = counts(cat)
    print(f"{c['families']} families, {c['forms']} forms "
          f"({', '.join(f'{c[s]} {s}' for s in STATUSES)}), {c['notSame']} not-same, {c['slips']} slips")
    sys.exit(1 if errs else 0)


# ----------------------------------------------------------------- reporting

def archive_rows():
    p = os.path.join(ROOT, "data", "archive-surnames.json")
    return load(p)["archives"]


def known_keys(cat):
    """Every search_key the catalogue holds, members and not-same alike."""
    return {search_key(v[1]["form"]) for v in index(cat).values()}


def cmd_report(a):
    if GIVEN:
        sys.exit("report and suggest read the archives' surname harvest; there is no given-name harvest to report on.")
    cat = load()
    ix = known_keys(cat)
    arch = archive_rows()
    print("ARCHIVE SURNAMES AGAINST THE CATALOGUE (alphabetical)\n")
    for label in sorted(arch, key=fold_key):
        ms = arch[label]["mentions"]
        keys = {}
        for s in ms:
            keys.setdefault(fold_key(s), []).append(s)
        inside = sum(1 for k in keys if k in ix)
        typo = [v for v in keys.values() if len({form_key(x) for x in v}) > 1 and not any(fold_key(x) in ix for x in v)]
        print(f"{label}: {len(keys)} distinct names, {inside} in a family; "
              f"{len(typo)} typography groups not yet catalogued")
    print("\nA name page with no family still shows the atlas's computed links; this is the curated layer.")


def cmd_suggest(a):
    if GIVEN:
        sys.exit("report and suggest read the archives' surname harvest; there is no given-name harvest to report on.")
    cat = load()
    ix = known_keys(cat)
    arch = archive_rows()
    print("CANDIDATES — read each against the records before adding; nothing here is a claim\n")
    for label in sorted(arch, key=fold_key):
        ms = arch[label]["mentions"]
        keys = {}
        for s in ms:
            keys.setdefault(fold_key(s), []).append(s)
        for k, v in sorted(keys.items()):
            vs = sorted(set(v))
            if len({form_key(x) for x in vs}) > 1 and k not in ix:
                print(f"{label}: typography group  {' | '.join(vs)}")
        for s in sorted(ms, key=fold_key):
            if re.search(r"[/(]", s) and not any(fold_key(x) in ix for x in re.split(r"[/()]", s) if x.strip()):
                print(f"{label}: the archive writes these together  {s}  (x{ms[s]})")


# ------------------------------------------------------------------ publish

def merge(origin, local):
    """Union by (family id, form). Evidence only grows; a status only moves to the
    stronger of the two. Nothing is removed by publishing: a deletion is a
    deliberate edit of the file, made in a clone by hand."""
    out = json.loads(json.dumps(origin))
    fams = {f["id"]: f for f in out["families"]}
    for lf in local["families"]:
        f = fams.get(lf["id"])
        if not f:
            out["families"].append(json.loads(json.dumps(lf)))
            continue
        for k in ("note",):
            f[k] = f.get(k) or lf.get(k, "")
        f["archives"] = sorted(set(f.get("archives", [])) | set(lf.get("archives", [])))
        mem = {form_key(m["form"]): m for m in f["members"]}
        for lm in lf["members"]:
            m = mem.get(form_key(lm["form"]))
            if not m:
                f["members"].append(json.loads(json.dumps(lm)))
                continue
            if RANK[lm["status"]] < RANK[m["status"]]:
                m["status"] = lm["status"]
            have = {(e.get("kind"), e.get("what")) for e in m["evidence"]}
            m["evidence"] += [e for e in lm["evidence"] if (e.get("kind"), e.get("what")) not in have]
        sl = {form_key(m["form"]) for m in f.setdefault("slips", [])}
        for ls in lf.get("slips", []):
            if form_key(ls["form"]) not in sl:
                f["slips"].append(json.loads(json.dumps(ls)))
        ns = {form_key(m["form"]): m for m in f.setdefault("notSame", [])}
        for ln in lf.get("notSame", []):
            if form_key(ln["form"]) not in ns:
                f["notSame"].append(json.loads(json.dumps(ln)))
    return out


def sh(cmd, cwd=None, check=True):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and p.returncode:
        sys.exit(f"{' '.join(cmd)}\n{p.stderr}")
    return p


def cmd_publish(a):
    local = load()
    errs = validate(local)
    if errs:
        sys.exit("the local catalogue does not pass:\n  " + "\n  ".join(errs[:10]))
    with tempfile.TemporaryDirectory() as tmp:
        clone = os.path.join(tmp, "clone")
        sh(["git", "clone", "--quiet", "--depth", "1", REPO_URL, clone])
        origin = load(os.path.join(clone, CAT_REL))
        merged = merge(origin, local)
        errs = validate(merged)
        if errs:
            sys.exit("the merged catalogue does not pass:\n  " + "\n  ".join(errs[:10]))
        before = counts(origin)
        save(merged, os.path.join(clone, CAT_REL))
        after = counts(merged)
        if sh(["git", "diff", "--quiet", "--", CAT_REL], cwd=clone, check=False).returncode == 0:
            print("nothing to publish: the atlas already has everything in the local catalogue.")
            return
        print(f"origin: {before['forms']} forms -> {after['forms']} ({after['families']} families)")
        if a.dry_run:
            print("--dry-run: nothing pushed.")
            return
        sh(["git", "add", CAT_REL], cwd=clone)
        msg = a.message or (f"{WORD.capitalize()} variants: {after['forms']} forms in {after['families']} families "
                            f"(was {before['forms']})\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>")
        sh(["git", "commit", "--quiet", "-m", msg], cwd=clone)
        for _ in range(4):
            p = sh(["git", "push", "--quiet", "origin", "HEAD:main"], cwd=clone, check=False)
            if p.returncode == 0:
                break
            sh(["git", "pull", "--quiet", "--rebase"], cwd=clone)
        else:
            sys.exit("could not push after four attempts:\n" + p.stderr)
    save(merge(load(), merged), CAT)   # the local copy now holds what everyone added
    print("published to main. It is on the map after the next deploy, not before.")


def cmd_sync(a):
    with tempfile.TemporaryDirectory() as tmp:
        clone = os.path.join(tmp, "clone")
        sh(["git", "clone", "--quiet", "--depth", "1", REPO_URL, clone])
        origin = load(os.path.join(clone, CAT_REL))
    save(merge(origin, load()), CAT)
    c = counts(load())
    print(f"local catalogue now holds everything on main: {c['forms']} forms in {c['families']} families")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("terms", help="what to search for a surname, and what not to count")
    p.add_argument("name"); p.add_argument("--json", action="store_true")
    p.add_argument("--graph", action="store_true", help="add the atlas's computed spelling links as leads")
    p.add_argument("--typed", action="store_true", help="show the typed forms of each")
    p.set_defaults(fn=cmd_terms)
    p = sub.add_parser("cover", help="did your search list cover the family? exit 1 if not")
    p.add_argument("name"); p.add_argument("--tried", required=True)
    p.set_defaults(fn=cmd_cover)
    p = sub.add_parser("show"); p.add_argument("name"); p.add_argument("--family", action="store_true")
    p.set_defaults(fn=cmd_show)
    p = sub.add_parser("add", help="add or strengthen a form, with the evidence for it")
    p.add_argument("form")
    p.add_argument("--family", required=True)
    p.add_argument("--status", required=True, choices=STATUSES + ["not-same", "slip"])
    p.add_argument("--kind", required=True, choices=KINDS)
    p.add_argument("--what", required=True, help="what was seen. No given names, no identifiers")
    p.add_argument("--where", help="country codes, comma separated"); p.add_argument("--place")
    p.add_argument("--period"); p.add_argument("--ref", help="archive:<label>, a URL, or a document")
    p.add_argument("--n", type=int); p.add_argument("--rule", choices=list(RULES)); p.add_argument("--lang")
    p.add_argument("--new", action="store_true"); p.add_argument("--headline"); p.add_argument("--note")
    p.add_argument("--archive"); p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_add)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    sub.add_parser("report").set_defaults(fn=cmd_report)
    sub.add_parser("suggest").set_defaults(fn=cmd_suggest)
    p = sub.add_parser("publish"); p.add_argument("--dry-run", action="store_true"); p.add_argument("--message")
    p.set_defaults(fn=cmd_publish)
    sub.add_parser("sync").set_defaults(fn=cmd_sync)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()

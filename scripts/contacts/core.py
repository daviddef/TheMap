"""The shape of a contact row, what may be in one, and how a source's rows are stored. Every adapter goes through make_row(), and
scripts/check-data.py refuses a stored row that make_row() would not write, so no adapter can put into the Atlas what another may not.

A ROW IS ONE SOURCE'S STATEMENT ABOUT ONE INSTITUTION OR PLACE. Two sources about the same church stay two rows, each under its own
licence; they are joined in the browser, and in the coverage count, only where they share an exact identifier (`ids`). Nothing is matched
on a name or on nearness.

    {id, kind, name, y, x, cc, ids: ["wd:Q1", "provider:dapa"], email: [], tel: [], web: [], post, form, operator, url}

`url` is where the statement can be read. `operator` is the organisation a source says runs the place, never a person.
NOTHING ABOUT A PERSON: role mailboxes only (scripts/provider_contact_rules.py)."""
import gzip
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import provider_contact_rules as rules  # noqa: E402

STORE = os.path.join(ROOT, "data", "contacts")
KINDS = ("town-hall", "church", "diocese", "cemetery", "cemetery-manager", "archive", "library", "museum", "university", "society", "other")
REACH = ("email", "tel", "post", "form")   # what lets somebody write or ring; a website alone is counted apart
TEL = re.compile(r"\+?[0-9(][0-9 ()./\-–]{4,28}[0-9)]( ext\. ?\d+)?")
# An operator is kept only where it reads as an organisation: OpenStreetMap also records the private owner of a family burial ground by name.
ORGANISATION = re.compile(
    r"\b(council|city|town|borough|county|parish|diocese|church|trust|society|association|authority|department|municipal|municipality|shire|"
    r"university|library|archive|museum|commission|cemeter|crematori|funeral|service|company|ltd|inc|gmbh|"
    r"općina|opcina|grad\b|župa|zupa|komunaln|d\.o\.o|d\.d\.|občina|obcina|župnija|javno podjetje|"
    r"comune|parrocchia|diocesi|servizi|gemeinde|stadt|pfarre|pfarrei|kirche|friedhof|verwaltung|"
    r"ville|mairie|commune|paroisse|ayuntamiento|municipio|parroquia|prefeitura|paróquia|"
    r"gemeente|parochie|kommune|församling|menighed|gmina|parafia|urząd|obec|město|farnost|önkormányzat|plébánia|egyház|primăria|parohia)",
    re.I)


def clean_tels(values):
    out = []
    for v in values:
        for t in re.split(r"[;,]", str(v)):
            t = " ".join(t.replace(";ext=", " ext. ").split())
            if t and TEL.fullmatch(t) and sum(c.isdigit() for c in t) >= 6 and t not in out:
                out.append(t)
    return out[:2]


def clean_webs(values):
    out = []
    for v in values:
        for w in str(v).split(";"):
            w = w.strip()
            if w.lower().startswith("www."):
                w = "https://" + w
            if re.fullmatch(r"https?://[^\s<>\"'@]{3,200}\.[^\s<>\"']{2,200}", w) and len(w) <= 200 and w not in out:
                out.append(w)
    return out[:2]


def clean_post(v):
    t = " ".join(str(v or "").split())
    return t if 8 <= len(t) <= 200 and "http" not in t and "@" not in t else ""


def make_row(raw):
    """The row as it may be stored, or None where there is nothing to contact anybody with."""
    assert raw["kind"] in KINDS, raw["kind"]
    name = " ".join(str(raw.get("name") or "").split())[:160]
    operator = " ".join(str(raw.get("operator") or "").split())[:160]
    if operator and not (ORGANISATION.search(operator) and (" " in operator or "." in operator)):
        operator = ""
    row = {"id": raw["id"], "kind": raw["kind"]}
    if name:
        row["name"] = name
    if raw.get("y") is not None and raw.get("x") is not None:
        row["y"], row["x"] = round(float(raw["y"]), 5), round(float(raw["x"]), 5)
    if raw.get("cc"):
        row["cc"] = raw["cc"]
    if raw.get("ids"):
        row["ids"] = sorted(set(raw["ids"]))
    emails = rules.emails_in(raw.get("email") or [], f"{name} {operator}")[:3]
    for key, value in (("email", emails), ("tel", clean_tels(raw.get("tel") or [])), ("web", clean_webs(raw.get("web") or [])),
                       ("post", clean_post(raw.get("post"))), ("operator", operator)):
        if value:
            row[key] = value
    form = str(raw.get("form") or "")
    if form.startswith("https://") and len(form) <= 200:
        row["form"] = form
    if not any(k in row for k in REACH + ("web", "operator")):
        return None
    if raw.get("url"):
        row["url"] = raw["url"]
    return row


def sources():
    with io.open(os.path.join(STORE, "sources.json"), encoding="utf-8") as fh:
        return json.load(fh)["sources"]


def write_source(source, cc, rows, harvested, store=None):
    """data/contacts/<source>/<CC>.json.gz. The same rows give the same bytes, so a harvest that found nothing new changes nothing."""
    meta = sources()[source]
    rows = sorted(rows, key=lambda r: r["id"])
    folder = os.path.join(store or STORE, source)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{cc}.json.gz")
    if os.path.exists(path) and read_file(path)["rows"] == rows:
        return path
    doc = {"source": source, "licence": meta["licence"], "attribution": meta["attribution"], "harvested": harvested,
           "counts": {"rows": len(rows), **{k: sum(k in r for r in rows) for k in REACH + ("web", "operator")}}, "rows": rows}
    with open(path, "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as gz:
        gz.write(json.dumps(doc, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return path


def read_file(path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def stored_files(store=None):
    base = store or STORE
    for source in sorted(os.listdir(base)):
        folder = os.path.join(base, source)
        if os.path.isdir(folder):
            for f in sorted(os.listdir(folder)):
                if f.endswith(".json.gz") and not f.startswith("."):
                    yield source, os.path.join(folder, f)


def check(store=None):
    """The problems in the store, as lines; empty when it is sound."""
    problems, registry, seen = [], sources(), {}
    for key, s in registry.items():
        for need in ("title", "licence", "attribution", "url", "group", "rank"):
            if need not in s:
                problems.append(f"contacts source {key}: no {need}")
        if s.get("group") not in ("open", "odbl"):
            problems.append(f"contacts source {key}: group must be open or odbl")
        if "ODbL" in s.get("licence", "") and s.get("group") != "odbl":
            problems.append(f"contacts source {key}: share-alike data must stay in the odbl group")
    for source, path in stored_files(store):
        name = f"{source}/{os.path.basename(path)}"
        if source not in registry or not registry[source].get("stored"):
            problems.append(f"contacts {name}: no registered source stores rows here")
            continue
        doc = read_file(path)
        if doc.get("source") != source or doc.get("licence") != registry[source]["licence"]:
            problems.append(f"contacts {name}: source or licence differs from sources.json")
        for r in doc.get("rows", []):
            rid = (source, r.get("id"))
            if rid in seen:
                problems.append(f"contacts {name} {r.get('id')}: also in {seen[rid]}")
            seen[rid] = name
            if r.get("kind") not in KINDS or "y" not in r:
                problems.append(f"contacts {name} {r.get('id')}: unknown kind or no position")
            elif make_row(r) != r:
                problems.append(f"contacts {name} {r.get('id')}: holds something make_row() would not write")
    return problems

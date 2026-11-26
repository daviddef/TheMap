#!/usr/bin/env python3
"""Publish the shape of the family archives' open letters, so /my-research/ can show them under Errands.

WHY. The research view said «3 letters out» (from the marks the family sessions publish) and, a screen below, «No errands yet» (the reader's own,
kept in their browser). The letters the archives have drafted or sent are in each archive's own errands file, and nothing carried them across. This is
the first step of docs/errands-and-custody-plan-2026-11-05.md (row 103), and only that: no custody catalogue.

THE PRIVACY LINE IS THE POINT, BECAUSE THE OUTPUT IS PUBLIC. What may leave an archive is «who, what for, status», with no people's names:

  archive   which family archive, with a link to its own public errands page for the detail
  name      an institution, AS data/providers.json SPELLS IT: an entry whose «who» does not lead with a provider (by web or e-mail host, name or alias)
            is skipped and counted, because that field can name a private researcher, a member of staff or the person doing the errand
  kinds     record kinds from the fixed list below, picked by words in the entry; the words themselves are never carried
  status    one of the fixed statuses below
  sent      the month a letter went, never the day

Nothing else: no free text, no year of a record, no personal name, no address, no reference number, no fee, no note. `problems()` rejects any other field
or value, the build runs it (scripts/check-data.py) and so does `--selftest`.

    python3 scripts/publish-archive-errands.py --dry-run    # read the archives, say what would be published and what is skipped; write nothing
    python3 scripts/publish-archive-errands.py --write      # write site/public/archive-errands.json in this checkout; no git
    python3 scripts/publish-archive-errands.py --publish    # commit and push ONLY that file from a fresh clone of origin (this goes live)
    python3 scripts/publish-archive-errands.py --selftest   # check the rules on invented rows
    --no-fetch    read each archive's origin/main as last fetched
    --archives DIR    where the archive checkouts are (default: beside this repository's main checkout)

With no mode it does nothing. The archives are only read: `git fetch`, then `git show origin/main:<file>`.
"""
import json, os, re, shutil, subprocess, sys, tempfile, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = "site/public/archive-errands.json"
PROVIDERS = "data/providers.json"

# archive id, name on the page, folder beside the Atlas, the file on its origin/main, that file's shape, its own public errands page ("" = it has none).
# An archive that keeps its letters in more than one file has a line for each. LOOK AT WHAT THE ARCHIVE'S OWN errands.astro IMPORTS before adding a line:
# Luwinski keeps everything in letters.json and Booyzen its sent letters there, and a guess at «errands.json» published neither (26 November 2026).
ARCHIVES = (
    ("blazevic", "Blažević", "Blazevic Family", "site/src/data/errands.json", "rows", "https://blazevic.defranceski.com/errands/"),
    ("booyzen", "Booyzen", "Booyzen Family", "site/src/data/errands.json", "places", "https://booyzen.defranceski.com/errands/"),
    ("booyzen", "Booyzen", "Booyzen Family", "site/src/data/letters.json", "post", "https://booyzen.defranceski.com/errands/"),
    ("darcy", "D’Arcy", "D'arcy Family", "site/src/data/errands.json", "rows", "https://darcy.defranceski.com/errands/"),
    ("defranceschi", "Defranceschi", "Defranceski Family", "site/src/data/errands.json", "rows", "https://archive.defranceski.com/errands/"),
    ("falco", "Falco", "Falco Family", "site/src/data/errands.json", "doors", "https://falco.defranceski.com/errands/"),
    ("lerena", "Lerena", "Lerena Family", "data/errands.tsv", "tsv", "https://lerena.defranceski.com/errands/"),
    ("luwinski", "Luwinski", "Luwinski Family", "site/src/data/letters.json", "clock", "https://luwinski.defranceski.com/errands/"),
    ("mazza", "Mazza", "Mazza Family", "site/src/data/errands.json", "doors", "https://mazza.defranceski.com/errands/"),
)

STATUSES = ("sent", "drafted", "to do", "listed")   # open ones only; an answered or finished errand is not published
KINDS = (
    ("births and baptisms", r"birth|baptis|christen|nascit|battesim|rođen|kršten|krsten|nacimient|bautiz|geburt|tauf"),
    ("marriages", r"marriage|married|matrimon|vjenčan|vjencan|casamient|heirat|trauung|\bbanns\b"),
    ("deaths and burials", r"death|burial|buried|\bdecess|\bmorti\b|umrli|defunci|sterbe"),
    ("parish registers", r"parish register|parish book|matricul|matičn|maticn|church register|libri parrocchiali"),
    ("civil registers", r"civil regist|registration office|registry office|stato civile|registro civil"),
    ("census", r"\bcensus|status animarum|stato delle anime"),
    ("wills and estates", r"\bwills?\b(?=.{0,40}(estate|prob|testament|proved))|\bestates?\b|probate|testament|\bmooc\b|death dut"),
    ("court records", r"court (file|record|roll|case)|\binquest|consistory court|quarter sessions|\bgaol\b|police|expulsion|prosecution|tribunal"),
    ("military records", r"military|\barmy\b|regiment|\bnavy\b|naval|soldier|service record|ordnance|enrolment|pension record|war grave"),
    ("passenger and migration records", r"passenger|ship(ping)? (list|search|record)|arrival|immigra|emigra|passport|consular|naturali[sz]"),
    ("land and property records", r"\bland\b|deed|cadast|property|surrender|tithe"),
    ("newspapers", r"newspaper|gazette|\bpress\b|\banno\b"),
    ("books and manuscripts", r"library|manuscript|\bjournals?\b|publication|monograph"),
    ("photographs", r"photograph|\bphotos?\b|postcard"),
    ("graves and memorials", r"\bgraves?\b|cemeter|headstone|memorial inscription"),
)
KIND_NAMES = tuple(k for k, _ in KINDS)
MONTHS = {m: i + 1 for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"))}
# words that name a sort of institution and no place: a directory name made only of these («Archivio storico diocesano» is one town's) never matches by name
GENERIC = frozenset("the of and a de di del della la le u za archive archives archivio archivo arhiv storico historico historical history diocesano diocesan diocese "
                    "stato state national nazionale nacional library biblioteca civica public record records office registry county municipal comunale "
                    "centre center general register society museum parish".split())
# ... except these, which are one body's own short name when another of these words is beside them
NEEDS = {"the national archives": ("kew",)}
# an entry whose «who» opens with the person doing the errand, or with a wait, is a job of their own and not a letter to an institution
OWN = re.compile(r"^\W*(me|myself|waiting on)\b", re.I)
# hosts that many bodies share, so a host alone does not say which institution is meant
SHARED_HOSTS = {"gmail.com", "google.com", "facebook.com", "gov.uk", "gov.au", "gov.za", "nsw.gov.au", "qld.gov.au", "wikipedia.org", "archive.org"}


def fold(s):
    s = unicodedata.normalize("NFKD", str(s or "").translate(str.maketrans({"đ": "d", "Đ": "D", "ł": "l", "ø": "o", "ß": "ss"})))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c)).lower()).split())


def host_of(url):
    h = re.sub(r"^[a-z]+://", "", str(url or "").strip().lower()).split("/")[0].split("?")[0].split(":")[0]
    return h[4:] if h.startswith("www.") else h


class Providers:
    """Institutions of data/providers.json, found in a «who» field by host (in an address or a web address written there), name or alias."""

    def __init__(self, rows):
        names, hosts = {}, {}
        for p in rows:
            labels = [p.get("name")] + [a if isinstance(a, str) else (a or {}).get("name") for a in p.get("aliases") or []]
            for lab in labels:
                f = fold(lab)
                # one short word («Archives») would match half the world, and a name of generic words is somebody's, not everybody's
                if f and (len(f.split()) > 1 or len(f) >= 9) and (f in NEEDS or not set(f.split()) <= GENERIC):
                    names.setdefault(f, set()).add(p["name"])
            for h in [host_of(p.get("url"))] + [host_of(x) for x in p.get("hosts") or []]:
                if h and h not in SHARED_HOSTS:
                    hosts.setdefault(h, set()).add(p["name"])
        self.names = {k: next(iter(v)) for k, v in names.items() if len(v) == 1}
        self.hosts = {k: next(iter(v)) for k, v in hosts.items() if len(v) == 1}
        self.all = {p["name"] for p in rows}

    def match(self, who, contact=""):
        """The provider's own name, or "" (never a guess between two). Names are looked for in `who` only; web and e-mail hosts in `who` and `contact`.
        Only what `who` leads with counts, up to the first dash or semicolon: what follows is commentary, and naming it would send the reader to the
        body that recommended the letter, or holds a copy, and not to the one it is for."""
        who = re.split(r"\s[\u2014\u2013]\s|;", str(who or ""))[0]
        text = who + "  " + str(contact or "")
        found = []
        for m in re.finditer(r"(?:https?://|@|\b(?=www\.))([A-Za-z0-9.-]+\.[A-Za-z]{2,})", text):
            h = host_of(m.group(1))
            if h in self.hosts:
                found.append((m.start(), self.hosts[h]))
        for m in re.finditer(r"\b((?:[a-z0-9-]+\.)+(?:org|com|ie|uk|au|net|hr|it|info))\b", text.lower()):
            if host_of(m.group(1)) in self.hosts:
                found.append((m.start(), self.hosts[host_of(m.group(1))]))
        f = " " + fold(who) + " "
        hits = [(f.index(" " + k + " "), -len(k), v) for k, v in self.names.items()
                if " " + k + " " in f and all(" " + w + " " in f for w in NEEDS.get(k, ()))]
        if hits:
            return min(hits)[2]          # the first one named; of two starting there, the longer
        return min(found)[1] if found else ""


def kinds_of(text):
    t = str(text or "").lower()
    return [name for name, pat in KINDS if re.search(pat, t)]


def month_of(text):
    """«2026-09-09», «14 September 2026», «14 Sept 2026» -> "2026-09"; nothing else."""
    t = str(text or "")
    m = re.search(r"\b(20\d\d)-(0[1-9]|1[0-2])(?:-\d\d)?\b", t)
    d = re.search(r"\b\d{1,2}\s+([A-Za-z]{3})[a-z]*\.?\s+(20\d\d)\b", t)
    if d and d.group(1).lower() in MONTHS and (not m or d.start() < m.start()):
        return "%s-%02d" % (d.group(2), MONTHS[d.group(1).lower()])
    return "%s-%s" % (m.group(1), m.group(2)) if m else ""


def entries(shape, text):
    """The archive's file as rows of (who, what-for text, status or "" for a finished one, month sent, contact line). Only these leave this function."""
    out = []
    if shape == "tsv":
        lines = [l for l in text.split("\n") if l.strip() and not l.startswith("#")]
        head = lines[0].split("\t")
        for l in lines[1:]:
            r = dict(zip(head, l.split("\t")))
            was = r.get("status", "").strip()        # «waiting-on-…» is a job somebody still has to do
            st = "to do" if was.startswith("waiting-on") else {"sent": "sent", "ready": "drafted", "blocked": "to do"}.get(was, "")
            out.append((r.get("who"), r.get("what"), st, month_of(r.get("sent_on")) if st == "sent" else "", ""))
        return out
    data = json.loads(text)
    if shape == "post":         # {rows: [{to, what, d (the day it went), state}]}
        states = {"sent": "sent", "no answer": "sent", "half delivered": "sent", "drafted": "drafted", "drafted, unsent": "drafted", "not yet written": "to do"}
        for r in data.get("rows") or []:
            st = states.get(str(r.get("state") or "").lower(), "")          # answered, or a state this does not know, is not published
            out.append((r.get("to"), r.get("what"), st, month_of(r.get("d")) if st == "sent" else "", ""))
        return out
    if shape == "clock":        # {rows: letters that have gone, each with `sent` and, once replied to, `answered`; drafts: [{who, what, state}]}
        for r in data.get("rows") or []:
            st = "" if r.get("answered") else "sent" if r.get("sent") else ""
            out.append((r.get("who"), r.get("what"), st, month_of(r.get("sent")) if st else "", r.get("addr")))
        for r in data.get("drafts") or []:
            out.append((r.get("who"), r.get("what"), "" if r.get("state") else "drafted", "", ""))   # any state on a draft takes it off the list
        return out
    for r in data.get(shape) or []:
        if shape == "places":
            out.append((r.get("where"), json.dumps(r.get("asks"), ensure_ascii=False), "listed", "", r.get("addr")))
        elif shape == "doors":
            out.append((r.get("where"), json.dumps(r.get("asks"), ensure_ascii=False), "listed", "", ""))
        else:
            who = r.get("who") or r.get("where")
            what = " ".join(str(r.get(k) or "") for k in ("what", "ask") if isinstance(r.get(k), str))
            state, status, sent = str(r.get("state") or "").lower(), str(r.get("status") or "").lower(), r.get("sent")
            s = "" if sent in (None, False, True, "") else str(sent)
            if state == "answered" or r.get("reply") or re.search(r"\banswered\b|\breplied\b|^\W*done\b|\bclosed\b", s, re.I):
                st = ""
            elif state == "sent" or sent is True or s:
                st = "sent"
            elif state == "draft" or status.startswith("drafted") or r.get("draft"):
                st = "drafted"
            elif state in ("", "open"):
                st = "to do"
            else:
                st = ""                  # a state this does not know is not published
            out.append((who, what, st, month_of(s) if st == "sent" else "", ""))
    return out


def build(sources, providers):
    """sources: [(id, name, page, shape, text or None)] -> (the published object, a report per archive)."""
    by, report = {}, []
    for aid, name, page, shape, text in sources:
        rows = by.setdefault(aid, (name, page, []))[2]
        before, skipped, closed = len(rows), 0, 0
        if text is None:
            report.append({"id": aid, "published": 0, "skipped": 0, "closed": 0, "note": "no errands data file"})
            continue
        read = entries(shape, text)
        for who, what, status, month, contact in read:
            if not status:
                closed += 1
                continue
            inst = "" if OWN.match(str(who or "")) else providers.match(who, contact)
            if not inst:
                skipped += 1
                continue
            row = {"institution": inst, "kinds": kinds_of(what), "status": status}
            if month:
                row["sent"] = month
            if row not in rows:          # two asks that read the same once reduced to their shape are one line
                rows.append(row)
        added = len(rows) - before
        report.append({"id": aid, "published": added, "skipped": skipped, "closed": closed, "merged": len(read) - added - skipped - closed, "note": ""})
    archives = [{"archive": aid, "name": name, "page": page,
                 "errands": sorted(rows, key=lambda r: (STATUSES.index(r["status"]), r["institution"], r.get("sent", ""), r["kinds"]))}
                for aid, (name, page, rows) in by.items() if rows]
    return {"v": 1, "archives": archives}, report


NOTE_KEYS = ("v", "archives")


def problems(doc, providers):
    """Why a file may not be published. [] means it holds only the allowed shape."""
    bad = []
    if not isinstance(doc, dict) or set(doc) != set(NOTE_KEYS) or doc.get("v") != 1 or not isinstance(doc.get("archives"), list):
        return ["the file must be {v: 1, archives: [...]} and nothing else"]
    known = {a[0]: a for a in ARCHIVES}
    seen = set()
    for a in doc["archives"]:
        if not isinstance(a, dict) or set(a) != {"archive", "name", "page", "errands"}:
            bad.append("an archive may hold archive, name, page and errands only")
            continue
        k = known.get(a["archive"])
        if not k or a["archive"] in seen:
            bad.append("unknown or repeated archive")
            continue
        seen.add(a["archive"])
        if a["name"] != k[1] or a["page"] != k[5] or not a["page"].startswith("https://"):
            bad.append(k[0] + ": the name and page must be the fixed ones")
        if not isinstance(a["errands"], list):
            bad.append(k[0] + ": errands must be a list")
            continue
        for i, r in enumerate(a["errands"]):
            at = "%s errand %d: " % (k[0], i + 1)
            if not isinstance(r, dict) or not {"institution", "kinds", "status"} <= set(r) <= {"institution", "kinds", "status", "sent"}:
                bad.append(at + "only institution, kinds, status and sent are allowed")
                continue
            if r["institution"] not in providers.all:
                bad.append(at + "the institution is not a name in data/providers.json")
            if not isinstance(r["kinds"], list) or any(x not in KIND_NAMES for x in r["kinds"]) or len(set(r["kinds"])) != len(r["kinds"]):
                bad.append(at + "kinds must come from the fixed list")
            if r["status"] not in STATUSES:
                bad.append(at + "unknown status")
            if "sent" in r and (r["status"] != "sent" or not re.fullmatch(r"20\d\d-(0[1-9]|1[0-2])", str(r["sent"]))):
                bad.append(at + "sent is a month (YYYY-MM), on a sent letter only")
    return bad


def load_providers(root=ROOT):
    with open(os.path.join(root, PROVIDERS), encoding="utf-8") as fh:
        return Providers(json.load(fh)["providers"])


def git(repo, *args):
    return subprocess.run(["git", "-C", repo] + list(args), capture_output=True, text=True)


def archives_dir():
    """Beside the Atlas's main checkout, whichever worktree this runs from."""
    r = git(ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir")
    common = r.stdout.strip() if not r.returncode else os.path.join(ROOT, ".git")
    return os.path.dirname(os.path.dirname(common))


def read_sources(base, fetch=True):
    out, missing = [], []
    for aid, name, folder, path, shape, page in ARCHIVES:
        repo = os.path.join(base, folder)
        if not os.path.isdir(repo):
            missing.append(aid + ": no checkout")
            continue
        if fetch and git(repo, "fetch", "-q", "origin").returncode:
            missing.append(aid + ": could not fetch")
        text = None
        if path:
            r = git(repo, "show", "origin/main:" + path)
            if r.returncode:
                missing.append(aid + ": " + path + " is not on origin/main")
            else:
                text = r.stdout
        out.append((aid, name, page, shape, text))
    return out, missing


def selftest():
    P = Providers([{"name": "State Archives of Nowhere", "url": "https://www.nowhere-archive.example", "aliases": ["Drzavni arhiv u Nigdjezemskoj"]},
                   {"name": "Nowhere Parish Library", "url": "https://library.example"}, {"name": "Archives", "url": "https://a.example"}])
    assert P.match("State Archives of Nowhere, Reading Room, attention Invented Person") == "State Archives of Nowhere"
    assert P.match("Državni arhiv u Nigdježemskoj - write@nowhere-archive.example") == "State Archives of Nowhere", "alias, accents aside"
    assert P.match("An invented researcher <someone@private.example>") == ""
    assert P.match("the archives, and me") == "", "one common word is not a name"
    assert P.match("write to desk@library.example") == "Nowhere Parish Library", "by host"
    assert P.match("another-society.example/contact \u2014 recommended by the State Archives of Nowhere") == "", "commentary is not who it is for"
    assert P.match("An Invented Library, Elsewhere; and the State Archives of Nowhere") == ""
    assert P.match("Somewhere", "Box 1 · desk@library.example") == "Nowhere Parish Library", "a contact line gives its host"
    assert P.match("Somewhere", "held with the Nowhere Parish Library") == "", "but no name is read out of it"
    G = Providers([{"name": "Archivio storico diocesano", "url": "https://one.example"}, {"name": "Long Name Register of Kew Town", "url": "https://k.example", "aliases": ["The National Archives"]}])
    assert G.match("Archivio storico diocesano, Another Town") == "", "a generic name is one town's"
    assert G.match("The National Archives, Kew") == "Long Name Register of Kew Town" and G.match("the National Archives of Elsewhere") == ""
    assert kinds_of("the baptism and burial of an invented child, 1801") == ["births and baptisms", "deaths and burials"]
    assert month_of("**SENT 14 September 2026** to x") == "2026-09" and month_of("2026-11-05") == "2026-11" and month_of("1801") == ""
    rows = json.dumps({"rows": [
        {"who": "State Archives of Nowhere", "what": "Invented Person's baptism, 1801, ref 12/3, fee 40", "state": "sent", "sent": "14 Sept 2026"},
        {"who": "Invented Researcher", "what": "a marriage", "state": "draft"},
        {"who": "me, at the State Archives of Nowhere", "what": "a marriage", "state": "draft"},
        {"who": "State Archives of Nowhere", "what": "a death", "state": "answered"}]})
    tsv = "# c\nkey\twhat\twho\tstatus\tdetail\tsent_on\nk\ta census of Invented Person\tNowhere Parish Library\tready\tsecret\t-\n"
    src = [("blazevic", "Blažević", "https://e.example/errands/", "rows", rows), ("lerena", "Lerena", "https://e.example/errands/", "tsv", tsv),
           ("luwinski", "Luwinski", "", "none", None)]
    doc, rep = build(src, P)
    assert [a["archive"] for a in doc["archives"]] == ["blazevic", "lerena"]
    assert doc["archives"][0]["errands"] == [{"institution": "State Archives of Nowhere", "kinds": ["births and baptisms"], "status": "sent", "sent": "2026-09"}]
    assert (rep[0]["skipped"], rep[0]["closed"]) == (2, 1) and rep[2]["note"]
    post = json.dumps({"rows": [
        {"to": "State Archives of Nowhere", "what": "Invented Person's marriage", "d": "3 Sep 2026", "state": "no answer"},
        {"to": "Nowhere Parish Library", "what": "a census", "d": "\u2014", "state": "drafted, unsent"},
        {"to": "State Archives of Nowhere", "what": "a death", "d": "3 Sep 2026", "state": "answered in full"}]})
    clock = json.dumps({"rows": [
        {"who": "Reading room", "addr": "desk@library.example", "what": "Invented Person's baptism", "sent": "2026-09-14"},
        {"who": "State Archives of Nowhere", "what": "a death", "sent": "2026-09-14", "answered": "2026-09-20"}],
        "drafts": [{"who": "State Archives of Nowhere", "what": "a census, 1801"}, {"who": "State Archives of Nowhere", "what": "a death", "state": "superseded"}]})
    two = [("booyzen", "Booyzen", "https://e.example/errands/", "places", json.dumps({"places": [{"where": "Nowhere Parish Library", "asks": [["1", "a will and estate, probate"]]}]})),
           ("booyzen", "Booyzen", "https://e.example/errands/", "post", post), ("luwinski", "Luwinski", "https://e.example/errands/", "clock", clock)]
    d2, r2 = build(two, P)
    assert [a["archive"] for a in d2["archives"]] == ["booyzen", "luwinski"], "two files, one archive"
    assert [(e["status"], e.get("sent", "")) for e in d2["archives"][0]["errands"]] == [("sent", "2026-09"), ("drafted", ""), ("listed", "")]
    assert [(e["institution"], e["status"]) for e in d2["archives"][1]["errands"]] == [("Nowhere Parish Library", "sent"), ("State Archives of Nowhere", "drafted")]
    assert (r2[1]["closed"], r2[2]["closed"]) == (1, 2)
    assert not any(x in json.dumps(d2) for x in ("Invented", "1801", "09-14", "desk@", "Reading room"))
    flat = json.dumps(doc, ensure_ascii=False)
    for leak in ("Invented", "1801", "12/3", "40", "secret", "14 Sept"):
        assert leak not in flat, leak
    good = {"v": 1, "archives": [{"archive": a[0], "name": a[1], "page": a[5], "errands": [{"institution": "State Archives of Nowhere", "kinds": ["census"], "status": "drafted"}]}
                                 for a in ARCHIVES[:1]]}
    if ARCHIVES[0][5]:
        assert problems(good, P) == []
    for spoil in (lambda d: d.update(extra=1), lambda d: d["archives"][0].update(note="x"), lambda d: d["archives"][0].update(page="https://elsewhere.example/"),
                  lambda d: d["archives"][0]["errands"][0].update(who="x"), lambda d: d["archives"][0]["errands"][0].update(institution="Invented Person"),
                  lambda d: d["archives"][0]["errands"][0].update(kinds=["a letter about someone"]), lambda d: d["archives"][0]["errands"][0].update(status="waiting for them"),
                  lambda d: d["archives"][0]["errands"][0].update(status="sent", sent="2026-09-14")):
        d = json.loads(json.dumps(good))
        spoil(d)
        assert problems(d, P), "the gate let a spoiled file through"
    print("selftest: only institutions in the directory, fixed kinds and statuses and a month leave an archive, and the gate refuses anything else")


def main(argv):
    modes = ("--dry-run", "--write", "--publish", "--selftest")
    args = list(argv)
    base = None
    if "--archives" in args:
        i = args.index("--archives")
        base = args[i + 1]
        del args[i:i + 2]
    fetch = "--no-fetch" not in args
    args = [a for a in args if a != "--no-fetch"]
    # an unknown flag must never fall through to a publish
    if len(args) != 1 or args[0] not in modes:
        print(__doc__)
        print("Give exactly one of " + ", ".join(modes) + ". Nothing was done.")
        return 0 if args in (["-h"], ["--help"]) else 2
    mode = args[0]
    if mode == "--selftest":
        selftest()
        return 0
    providers = load_providers()
    sources, missing = read_sources(base or archives_dir(), fetch)
    doc, report = build(sources, providers)
    for r in report:
        print("%-13s published %3d  skipped (no institution matched) %3d  closed %3d  merged %3d %s" %
              (r["id"], r["published"], r["skipped"], r["closed"], r.get("merged", 0), r["note"]))
    names = sorted({e["institution"] for a in doc["archives"] for e in a["errands"]})
    print("institution names that would be published (%d):" % len(names))
    for n in names:
        print("  " + n)
    bad = problems(doc, providers)
    for b in bad:
        print("GATE  " + b)
    if missing:
        for m in missing:
            print("MISSING  " + m)
    if bad:
        return 1
    if mode == "--dry-run":
        print("--dry-run: nothing written or pushed.")
        return 0
    if missing:
        print("An archive could not be read, so nothing was written: a letter must not vanish because a checkout was missing.")
        return 1
    text = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
    if mode == "--write":
        with open(os.path.join(ROOT, PUBLIC), "w", encoding="utf-8") as fh:
            fh.write(text)
        print("wrote " + PUBLIC + " (not committed)")
        return 0
    return publish(text)


def publish(text):
    """Commit and push only the published file, from a fresh clone, so nothing half-edited here can go with it."""
    url = git(ROOT, "remote", "get-url", "origin").stdout.strip()
    tmp = tempfile.mkdtemp(prefix="ra-errands-")
    try:
        if subprocess.run(["git", "clone", "-q", "--depth", "1", url, tmp]).returncode:
            return 1
        dest = os.path.join(tmp, PUBLIC)
        if os.path.exists(dest) and open(dest, encoding="utf-8").read() == text:
            print("nothing changed")
            return 0
        with open(dest, "w", encoding="utf-8") as fh:
            fh.write(text)
        for args in (["add", PUBLIC], ["commit", "-q", "-m", "Archive errands: republish", "--", PUBLIC], ["push", "-q", "origin", "HEAD:main"]):
            r = git(tmp, *args)
            if r.returncode:
                print(r.stdout + r.stderr)
                return 1
        print("published " + PUBLIC)
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

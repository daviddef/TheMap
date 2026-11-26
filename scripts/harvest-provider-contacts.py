#!/usr/bin/env python3
"""Where to write, for the archives that answer letters rather than clicks.

WHY THIS EXISTS.

Five of Record Atlas's seven access tiers can be reached from a chair. Two
cannot: `catalogue` — «the paper is not photographed, this is a letter, not a
click» — and `onsite`, «somebody has to go, or ask somebody who can». Both told
a reader to write or to travel and then gave them a homepage and nothing else.
David: «when you talk about a "its a letter" is there any way we could add the
"known email / form / address" or institute to contact?»

WHAT IT TAKES, AND FROM WHERE. 305 of the 521 providers already carry a
Wikidata id, put there for other reasons. Wikidata holds, for institutions,
exactly the four things a letter needs — P6375 postal address, P968 email,
P1329 telephone, P281 postcode — under CC0. Measured before writing this:

    postal address   255 of 305   84%
    email            135 of 305   44%
    telephone        132 of 305   43%

NOTHING IS INVENTED AND NOTHING IS INFERRED. A provider with no Wikidata id
gets no contact block; one whose item carries no address gets no address line.
There is no «contact the national archive instead» fallback, because a reader
who writes to the wrong institution loses a month waiting for a reply that was
never going to come. An empty block is a true statement about what this atlas
knows; a plausible one is not.

ADDRESSES ARE LANGUAGE-TAGGED and Wikidata often holds several. The rule is
the local-language form first — an envelope is read by a postal worker in the
country it is going to, not by an English speaker — then English, then
whatever is there.

WHAT IS DROPPED. scripts/provider_contact_rules.py: an address that is malformed or names a person; also one that
data/provider-emails.json records as dead, and a postal «address» too short to put on an envelope. Where an item holds
several, the one already in the file is kept while Wikidata still states it; otherwise the choice is the same on every run.

    python3 scripts/harvest-provider-contacts.py                      # rewrites data/provider-contacts.json if anything changed
    python3 scripts/harvest-provider-contacts.py --summary FILE       # also writes what changed, for a person to read
    python3 scripts/harvest-provider-contacts.py --same-as FILE       # no harvest: exit 0 if FILE holds the same contacts

.github/workflows/contacts.yml runs it weekly and proposes the change on a branch; it does not publish by itself.
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_ROOT, "scripts"))
import provider_contact_rules as rules  # noqa: E402

SRC = os.path.join(_ROOT, "data/providers.json")
OWN = os.path.join(_ROOT, "data/provider-emails.json")
OUT = os.path.join(_ROOT, "data/provider-contacts.json")
ENDPOINT = "https://query.wikidata.org/sparql"
UA = "RecordAtlas/1.0 (+https://recordatlas.org)"
CHUNK = 80

# The language an envelope is actually read in, by the country the archive is
# in. Only countries this atlas has providers in; anything else falls through
# to English and then to whatever the item carries.
LANG = {
    "AT": "de", "AR": "es", "BA": "bs", "BE": "nl", "BY": "be", "CZ": "cs",
    "DE": "de", "DK": "da", "EE": "et", "ES": "es", "FI": "fi", "FR": "fr",
    "HR": "hr", "HU": "hu", "IT": "it", "LT": "lt", "LV": "lv", "NL": "nl",
    "NO": "no", "PL": "pl", "PT": "pt", "RO": "ro", "RS": "sr", "RU": "ru",
    "SE": "sv", "SI": "sl", "SK": "sk", "UA": "uk",
}

QUERY = """SELECT ?item ?post ?postLang ?email ?tel ?zip WHERE {
  VALUES ?item { %s }
  OPTIONAL { ?item wdt:P6375 ?post . BIND(LANG(?post) AS ?postLang) }
  OPTIONAL { ?item wdt:P968 ?email }
  OPTIONAL { ?item wdt:P1329 ?tel }
  OPTIONAL { ?item wdt:P281 ?zip }
}"""


def ask(qids):
    q = QUERY % " ".join("wd:" + i for i in qids)
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=120) as fh:
        return json.load(fh)["results"]["bindings"]


def tidy(v):
    return " ".join(v.replace("\n", ", ").replace(" | ", ", ").replace(";ext=", " ext. ").split())


def pick(candidates, was, fullest=False):
    """The value already in the file, as long as Wikidata still states it; otherwise one chosen the same way on every run."""
    if was is not None and tidy(was) in candidates:
        return tidy(was)
    # Fullest for an envelope («05010» beats «5010»), shortest for a number; then the better spaced; then by spelling.
    size = lambda v: sum(c.isalnum() for c in v)
    return min(candidates, key=lambda v: (-size(v) if fullest else size(v), -v.count(" "), v))


def row_for(g, providers, dead, was=None):
    """One institution's contact row from everything Wikidata returned for it. `g`: {post: {lang: set}, email, tel, zip: sets}.
    `was`: the row the file holds now."""
    was = was or {}
    ccs = [c for p in providers for c in (p.get("countries") or [])]
    want = LANG.get(ccs[0]) if ccs else None
    # «Rathaus» is a building, not somewhere a letter can be sent from abroad.
    posts = {lang: {t for t in map(tidy, vs) if len(t) >= 8} for lang, vs in g["post"].items()}
    posts = {lang: v for lang, v in posts.items() if v}
    row = {}
    for lang in ([want] if want else []) + ["en", ""] + sorted(posts):
        if lang in posts:
            row["post"] = pick(posts[lang], was.get("post"), fullest=True)
            break
    # An institution with two published addresses has two reading rooms, not a contradiction — but a letter needs one.
    words = " ".join(p.get("name", "") for p in providers)
    mails = [a for a in rules.emails_in(g["email"], words) if a.lower() not in dead]
    if mails:
        row["email"] = was["email"] if was.get("email") in mails else mails[0]
    for k in ("tel", "zip"):
        values = {t for t in map(tidy, g[k]) if t}
        if values:
            row[k] = pick(values, was.get(k))
    return row


def changes(old, new, names):
    """Lines a person can read: what the new harvest adds, drops and alters."""
    lines = []
    for title, qs in (("Added", sorted(set(new) - set(old))), ("Removed", sorted(set(old) - set(new))),
                      ("Changed", sorted(q for q in set(old) & set(new) if old[q] != new[q]))):
        lines.append(f"{title}: {len(qs)}")
        for q in qs:
            was, now = old.get(q, {}), new.get(q, {})
            parts = [f"{k}: {was.get(k, '(none)')} -> {now.get(k, '(none)')}" if title == "Changed" else f"{k}: {(now or was)[k]}"
                     for k in ("email", "tel", "post", "zip") if was.get(k) != now.get(k)]
            lines.append(f"  {q} {names.get(q, '(no provider)')} | " + " | ".join(parts))
    return "\n".join(lines) + "\n"


def harvest(qids):
    got = {}
    for i in range(0, len(qids), CHUNK):
        batch = qids[i:i + CHUNK]
        for attempt in range(3):
            try:
                rows = ask(batch)
                break
            except Exception as e:
                if attempt == 2:
                    sys.exit(f"Wikidata refused after 3 tries: {e}")
                print(f"  retrying ({e})")
                time.sleep(8)
        for r in rows:
            q = r["item"]["value"].rsplit("/", 1)[-1]
            g = got.setdefault(q, {"post": {}, "email": set(), "tel": set(), "zip": set()})
            if "post" in r:
                g["post"].setdefault(r.get("postLang", {}).get("value", ""), set()).add(r["post"]["value"])
            for k in ("email", "tel", "zip"):
                if k in r:
                    g[k].add(r[k]["value"])
        print(f"  {min(i + CHUNK, len(qids)):>4} of {len(qids)} asked")
        time.sleep(1)
    return got


def load(path, default=None):
    try:
        with io.open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        if default is None:
            raise
        return default


def main(argv=None):
    ap = argparse.ArgumentParser(description="Harvest archive contacts from Wikidata.")
    ap.add_argument("--summary", help="write what changed to this file")
    ap.add_argument("--same-as", help="exit 0 if this file holds the same contacts as the one here; harvests nothing")
    ap.add_argument("--allow-shrink", action="store_true", help="accept a harvest that loses more than a tenth of the institutions")
    args = ap.parse_args(argv)
    before = load(OUT, {})
    old = before.get("contacts", {})
    if args.same_as:
        sys.exit(0 if load(args.same_as).get("contacts") == old else 1)

    provs = load(SRC)["providers"]
    by_q = {}
    for p in provs:
        if p.get("wikidata"):
            by_q.setdefault(p["wikidata"], []).append(p)
    qids = sorted(by_q)
    print(f"{len(provs)} providers, {len(qids)} with a Wikidata id")
    dead = {e["email"].lower() for e in load(OWN, {}).get("emails", []) if e.get("state") == "dead"}
    got = harvest(qids)

    out = {}
    for q in sorted(got):
        if q in by_q:
            row = row_for(got[q], by_q[q], dead, old.get(q))
            if row:
                out[q] = row

    if len(out) < 0.9 * len(old) and not args.allow_shrink:
        sys.exit(f"{len(out)} institutions against {len(old)} before: that looks like a broken harvest, so nothing is written (--allow-shrink to accept it)")
    counts = {"providersWithAnId": len(qids), "withAnyContact": len(out),
              "withPostalAddress": sum("post" in r for r in out.values()), "withEmail": sum("email" in r for r in out.values()),
              "withTelephone": sum("tel" in r for r in out.values())}
    report = changes(old, out, {q: ps[0]["name"] for q, ps in by_q.items()})
    if args.summary:
        with io.open(args.summary, "w", encoding="utf-8") as fh:
            fh.write(report)
    print("\n".join(line for line in report.splitlines() if not line.startswith("  ")))
    if out == old and counts == before.get("counts"):
        print("nothing changed; the file is left as it is")
        return
    with io.open(OUT, "w", encoding="utf-8") as fh:
        json.dump({
            "note": ("Where to write to an archive that does not publish its "
                     "images. Keyed by the provider's Wikidata id, because that "
                     "is what providers.json already carries and several "
                     "providers can share one institution. Built by "
                     "scripts/harvest-provider-contacts.py."),
            "claim": ("ONLY WHAT WIKIDATA STATES. An institution absent from this "
                      "file is one whose item carries no usable contact details, not one "
                      "that cannot be written to — and no address here was "
                      "inferred from a parent body, a country, or a homepage. "
                      "Addresses that name a member of staff are left out."),
            "source": "Wikidata (P6375 address, P968 email, P1329 telephone, P281 postcode)",
            "licence": "CC0 1.0 (Wikidata)",
            "harvested": time.strftime("%Y-%m-%d"),
            "counts": counts,
            "contacts": out,
        }, fh, ensure_ascii=False, indent=1)
    print(f"\n{OUT}: {len(out)} institutions")
    for k, v in counts.items():
        print(f"    {k:18} {v}")


if __name__ == "__main__":
    main()

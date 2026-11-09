#!/usr/bin/env python3
"""Fold survey results into data/providers.json, with checks, without touching anything else.

Two kinds of patch file, both written by survey agents (one JSON array per batch):

  out-NN.json   one object per EXISTING unsurveyed source: {id, result, access, surveySource, surveyQuote, surveyNote, why}
  cout-NN.json  one object per COUNTRY with no named national source: {cc, result, provider{...}, existingId, ...}

    python3 scripts/apply-survey-patches.py DIR            # dry run: what would change, what is refused
    python3 scripts/apply-survey-patches.py DIR --write    # apply

THE RULES, because a wrong "free" costs a researcher an evening and costs the directory the only thing it sells:
  - only a source still `unsurveyed` is changed; nobody's earlier survey is overwritten;
  - `classified` needs a class from the legend, an http source URL, a non-empty quote and a note that says what was read;
  - `declined` and `unreachable` change the triage state and its note, never the access class;
  - `cannot-tell` changes nothing but is counted, so the queue says how many were tried;
  - a new country row needs a unique id, an http URL, a kind, a country and a `what`; its class follows the same rules;
  - an `ids` file (DIR/verified-bad.json, a list of ids) removes entries a verifier could not confirm.
The file is written exactly as it was (indent 1, ensure_ascii False, trailing newline).
"""
import glob, json, os, sys, collections

CLASSES = {"free", "account", "index", "mixed", "paid", "catalogue", "onsite"}
KINDS = {"aggregator", "national-archive", "regional-archive", "diocesan", "volunteer", "library", "national-library",
         "index", "catalogue", "statistics", "commercial"}
TODAY = "2026-11-09"


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    d = sys.argv[1]; write = "--write" in sys.argv
    doc = load("data/providers.json"); P = doc["providers"]; by = {p["id"]: p for p in P}
    bad = set()
    if os.path.exists(os.path.join(d, "verified-bad.json")):
        bad = set(load(os.path.join(d, "verified-bad.json")))
    n = collections.Counter(); refused = []

    for f in sorted(glob.glob(os.path.join(d, "out-*.json"))):
        for r in load(f):
            pid = r.get("id"); p = by.get(pid)
            if p is None: refused.append((pid, "no such source")); continue
            if pid in bad: refused.append((pid, "verifier could not confirm")); n["unconfirmed"] += 1; continue
            if p["access"] != "unsurveyed": refused.append((pid, "already surveyed")); continue
            res = r.get("result")
            if res == "classified":
                q = (r.get("surveyQuote") or "").strip(); src = (r.get("surveySource") or "").strip(); note = (r.get("surveyNote") or "").strip()
                if r.get("access") not in CLASSES: refused.append((pid, "bad class")); continue
                if not src.startswith("http") or not q or not note.startswith("Read "):
                    refused.append((pid, "missing evidence")); continue
                p["access"] = r["access"]; p["surveyedBy"] = "claude"; p["surveySource"] = src
                p["surveyQuote"] = q[:400]; p["surveyNote"] = note; p["checked"] = TODAY
                n["classified"] += 1
            elif res in ("declined", "unreachable"):
                p["triage"] = res
                why = (r.get("why") or r.get("surveyNote") or "").strip()
                if why: p["triageNote"] = ("Surveyed %s: %s" % (TODAY, why))[:600]
                n[res] += 1
            else:
                n["cannot-tell"] += 1

    for f in sorted(glob.glob(os.path.join(d, "cout-*.json"))):
        for r in load(f):
            res = r.get("result")
            if res == "found":
                x = r.get("provider") or {}
                pid = x.get("id")
                if not pid or pid in by: refused.append((pid or r.get("cc"), "new id missing or taken")); continue
                if pid in bad: refused.append((pid, "verifier could not confirm")); n["unconfirmed"] += 1; continue
                if not str(x.get("url", "")).startswith("http") or x.get("kind") not in KINDS or not x.get("countries") or not x.get("what"):
                    refused.append((pid, "incomplete new row")); continue
                row = {"id": pid, "name": x["name"], "url": x["url"], "kind": x["kind"], "access": "unsurveyed",
                       "countries": x["countries"], "what": x["what"], "deepLink": None, "checked": TODAY, "at": None,
                       "wikidata": x.get("wikidata"), "triage": "seen-in-use",
                       "triageNote": "Added by the country coverage research of %s: the national or territorial archive for a country the directory had none for." % TODAY}
                if x.get("access") in CLASSES and str(x.get("surveySource", "")).startswith("http") and x.get("surveyQuote") and str(x.get("surveyNote", "")).startswith("Read "):
                    row.update({"access": x["access"], "surveyedBy": "claude", "surveySource": x["surveySource"],
                                "surveyQuote": x["surveyQuote"][:400], "surveyNote": x["surveyNote"]})
                    n["new+classified"] += 1
                else:
                    n["new"] += 1
                P.append(row); by[pid] = row
            elif res == "exists":
                n["exists"] += 1
            else:
                n[res or "?"] += 1

    print("results:", dict(n))
    for pid, why in refused: print("  refused", pid, "-", why)
    if write:
        with open("data/providers.json", "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1); f.write("\n")
        print("written")
    else:
        print("(dry run; add --write)")


main()

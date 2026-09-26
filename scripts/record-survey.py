#!/usr/bin/env python3
"""Record an access class that a PERSON established, with the sentence proving it.

survey-providers.py deliberately refuses to write an access class: three
successive versions of its rules were wrong, and the last two were wrong in a
way that looked right. What it produces is a reading queue. This is the other
half — the way a verdict gets in once somebody has actually read the site.

It insists on the quotation. Not a summary, not a phrase from a needle list:
the words on the page that make the class true, and the URL they are on. A row
that cannot be justified in one sentence from the source has not been
established, and the field is named `surveyQuote` so that a later reader can
check it rather than trust it.

    python3 scripts/record-survey.py \
      --id ad-archives-departementales-de-seine-et-marne \
      --access free \
      --url https://archives.seine-et-marne.fr/fr/etat-civil \
      --quote "11 125 registres paroissiaux ou d'état civil sont en ligne …" \
      --write
"""
import argparse, collections, json, os, sys, time

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

CLASSES = {"free", "account", "index", "mixed", "paid", "catalogue", "onsite"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--access", required=True, choices=sorted(CLASSES))
    ap.add_argument("--url", required=True, help="the page the quotation is on")
    ap.add_argument("--quote", required=True, help="the words that make it true")
    ap.add_argument("--note", help="anything a reader of the row would want")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    if len(a.quote.strip()) < 25:
        sys.exit("the quotation is too short to establish anything — quote the "
                 "sentence, not a phrase")

    prov = json.load(open("data/providers.json"),
                     object_pairs_hook=collections.OrderedDict)
    row = next((r for r in prov["providers"] if r["id"] == a.id), None)
    if row is None:
        sys.exit(f"no provider with id {a.id!r}")

    was = row.get("access")
    print(f"{row['name']}\n  {was} -> {a.access}\n  from {a.url}\n  «{a.quote}»")
    if not a.write:
        print("  (dry run — pass --write)")
        return 0

    row["access"] = a.access
    row["checked"] = time.strftime("%Y-%m-%d")
    row["surveyedBy"] = "read by a person"
    row["surveySource"] = a.url
    row["surveyQuote"] = a.quote
    if a.note:
        row["surveyNote"] = a.note
    row.pop("triage", None)
    row.pop("triageNote", None)
    json.dump(prov, open("data/providers.json", "w"), ensure_ascii=False, indent=1)
    print("  recorded")
    return 0


if __name__ == "__main__":
    sys.exit(main())

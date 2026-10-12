#!/usr/bin/env python3
"""The errands page's data: every letter this atlas has drafted, in full.

WHY. A letter that lives only in requests/ is a draft nobody will find, and a
draft nobody finds is a question nobody asks. Four of them were sitting in this
repository unpublished — one since September. The errands page is where a draft
is published AS a draft, in full, so that whoever is going to send it can do so
without reading the whole site first, and so the state of each one is a glance
rather than an exercise.

This follows the pattern the family archives settled on, and the part worth
keeping is the same: the TEXT is read from requests/ and never retyped here, so
the page cannot drift from the file. The STATE is written below, because
«was it sent, did anyone answer» is a fact about the world that no file header
carries.

A LETTER IN requests/ THAT IS NOT LISTED BELOW IS REPORTED, so a new draft
cannot be written and quietly left off the page.

NOTHING HERE SENDS ANYTHING. Sending a letter is David's decision, always.
"""
import json, os, re, sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
REQ = "requests"
OUT = "site/src/data/errands.json"

STATES = {
    "draft":    ("Drafted, not sent", "#B04A16"),
    "sent":     ("Sent, waiting", "#7A5C00"),
    "answered": ("Answered", "#12703F"),
}

# file, state, who, what it asks for, what it would settle, links
ROWS = [
    ("narodni-archiv-cam.md", "draft",
     "Národní archiv ČR, and the Opava portal's support address",
     "CAM's PLACE authority records — the place, its former or German name, and "
     "the archive or fonds it attaches to",
     "Czechia is <b>4,987 places</b> on this map and almost none can yet say which "
     "archive holds its registers. The authority records are NATIONAL — the Opava "
     "portal's own help page says every Czech archive shares them through CAM, with "
     "PLACE as one of their classes — so one file would answer the whole country, "
     "where a portal answers one region. Porta fontium, harvested openly, reached 90 "
     "of those dots because it covers west Bohemia alone.",
     [["What is still grey", "/worklist/"], ["The sources", "/providers/"]]),

    ("san-antenati-oai.md", "draft",
     "SAN / Ministero della Cultura",
     "Whether the Antenati OAI endpoint has moved, or a bulk file exists instead",
     "Italy is the <b>largest</b> gap here — 8,547 places. The route is not blocked, "
     "it is broken: the Ministry publishes all 464,770 Antenati records as open data "
     "under CC BY 4.0, this atlas had harvested 6,000 of them, and the endpoint now "
     "times out entirely. Both datasets on dati.gov.it point at that same address, so "
     "there is no file to take instead. A bulk download would also be far lighter on "
     "their servers than nine thousand OAI requests.",
     [["What is still grey", "/worklist/"]]),

    ("riksarkivet-se-parishes.md", "draft",
     "Riksarkivet (Sweden)",
     "A list of the parishes whose church books they hold, with county and year span",
     "Sweden is <b>2,363 places</b> with nothing said about them. Their search portal's "
     "robots.txt names this crawler outright — <code>ClaudeBot: Disallow: /</code> — "
     "and that has been respected: the portal has not been read, and neither have its "
     "sibling hosts, which would be the same refusal taken by a side door. A robots.txt "
     "governs crawlers and not correspondence, so this asks a person instead.",
     [["Why it was not crawled", "/data/"]]),

    ("meertens-familienamenbank.md", "draft",
     "Meertens Instituut / CBG",
     "Whether an extract of the Nederlandse Familienamenbank may be reused",
     "The surname index draws on four national registers and about 480,000 names, and "
     "the Netherlands is a gap in it. CBS publishes no surname frequencies and the "
     "familienamenbank is plainly the authoritative Dutch source. It has not been "
     "scraped and will not be.",
     [["The surname data", "/data/"]]),
]


def main():
    on_disk = {f for f in os.listdir(REQ) if f.endswith((".md", ".txt"))}
    listed = {r[0] for r in ROWS}
    missing = sorted(on_disk - listed)
    if missing:
        print("THESE LETTERS ARE IN requests/ AND NOT ON THE PAGE:", file=sys.stderr)
        for m in missing:
            print(f"    {m}", file=sys.stderr)
        sys.exit(1)
    gone = sorted(listed - on_disk)
    if gone:
        print(f"listed but not on disk: {gone}", file=sys.stderr)
        sys.exit(1)

    rows = []
    for i, (fn, state, who, ask, why, links) in enumerate(ROWS, 1):
        raw = open(os.path.join(REQ, fn), encoding="utf-8").read()
        # The letter itself is what follows the first «---» rule; the header
        # above it is the addressing, which the page shows as its own line.
        body = raw.split("\n---\n", 1)[-1].strip()
        to = re.search(r"\*\*To:\*\*\s*(.+)", raw)
        subj = re.search(r"\*\*Subject:\*\*\s*(.+)", raw)
        title = re.sub(r"^#\s*Draft:\s*", "", raw.splitlines()[0]).strip()
        label, colour = STATES[state]
        rows.append({
            "n": i, "what": title, "who": who,
            "ref": ((to.group(1).strip() + " — " + subj.group(1).strip())
                    if to and subj else (to.group(1).strip() if to else "")),
            "why": why, "ask": ask,
            "draft": body,
            "state": state, "stateLabel": label, "colour": colour,
            "file": f"{REQ}/{fn}",
            "links": links,
        })
    doc = {
        "note": ("Letters this atlas has drafted and not sent. The text is read from "
                 "requests/ and never retyped, so the page cannot drift from the file. "
                 "Nothing here sends anything: that is David's decision, always."),
        "built": __import__("time").strftime("%Y-%m-%d"),
        "counts": {"letters": len(rows),
                   "drafted": sum(1 for r in rows if r["state"] == "draft"),
                   "sent": sum(1 for r in rows if r["state"] == "sent"),
                   "answered": sum(1 for r in rows if r["state"] == "answered")},
        "groups": [{"label": "Waiting to be sent",
                    "note": "Each one is a gap this atlas cannot close by reading.",
                    "rows": rows}],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    c = doc["counts"]
    print(f"-> {OUT}: {c['letters']} letters "
          f"({c['drafted']} drafted, {c['sent']} sent, {c['answered']} answered)")


if __name__ == "__main__":
    main()

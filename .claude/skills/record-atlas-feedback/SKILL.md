---
name: record-atlas-feedback
description: Record research back into Record Atlas — a volume searched, pages walked, a source it does not list, a place under another name. Use whenever a family-archive session finishes a search, opens a register, writes to an archive, or finds a site the atlas has no provider for.
---

# Keeping Record Atlas current

Record Atlas is the shared map at `~/Projects/Family Projects/Record Atlas`.
The family archives do the research; the atlas holds what was learned so the
next person does not repeat it. This is how work travels from one to the other.

Record the work **as you do it**, not in a sweep at the end. A search you did
not write down is a search somebody will do again.

## The one rule that matters most: record the WAYPOINT

Family sessions have been citing FamilySearch by **DGS film number**
(`/search/film/005481649`) and by **image ark** (`3:1:3QS7-899X-1HVP`). The
atlas indexes **waypoints**. Measured across 1,349 existing rows: one carried a
waypoint, and the film numbers matched the atlas **zero** times. Nearly all of
that work could not be attached to anything.

A waypoint looks like `9RK1-T3F` and appears in the URL as `wc=` or `owc=`:

    https://www.familysearch.org/ark:/61903/3:1:939V-R7SR-M8?cc=2040054&wc=9RKB-W3G%3A391644801
                                                                         ^^^^^^^^^ this

Take everything **before the first colon**. So `9RKB-W3G:391644801,391731101`
is `9RKB-W3G`.

To get one from a film-number page, use the image viewer's **catalogue/browse**
link — the browse path carries `owc=`. If you genuinely cannot find one,
write the film number into a `film` field and say so. Do **not** invent a
waypoint, and do not guess one from a similar volume.

## What to write, and where

### 1. Work you did in a volume

Append to your archive's `site/src/data/searched.json`. Include, at minimum:

```json
{
  "src": "FamilySearch — Senj births 1858-1900, walked page by page, all 174",
  "url": "https://www.familysearch.org/ark:/61903/3:1:939V-R7SR-M8?cc=2040054&wc=9RKB-W3G",
  "waypoint": "9RKB-W3G",
  "what": "Kosina marriages, the generation above Johann",
  "when": "2026-09-29",
  "outcome": "yield",
  "pages": "1-174",
  "walked": true
}
```

- `waypoint` — add it as its own field even though it is in the URL. It is
  what the atlas keys on.
- `pages` — the images you actually read, as a range: `"1-47, 60-72"`. Omit it
  rather than guessing. A page count with no range is the size of the book,
  not the part you read.
- `walked: true` — **only** if you read *every entry*, not just scanned for a
  surname. This is the difference between work that counts for every family
  and work that counts for one. Overstating it is the worst error available
  here, because it tells the next person a book is done when it is not.
- `outcome` — one of `yield`/`hit`/`found`, `nothing`/`nil`/`empty`,
  `blocked`, `pending`, `planned`.
- `when` — a real date. Not `"not yet"`, not `"—"`.

### 2. A source the atlas does not list

Check first: `python3 -c "import json;print([p['id'] for p in json.load(open('data/providers.json'))['providers'] if 'HOST' in p['url']])"`

If nothing comes back, add a row to `data/providers.json`:

```json
{
  "id": "kebab-case-id", "name": "Its own name for itself",
  "url": "https://…", "kind": "regional-archive",
  "access": "unsurveyed", "countries": ["HR"],
  "what": "What it holds and what it does not, in plain words. Say what you actually did there.",
  "deepLink": null, "checked": "2026-09-29", "at": null,
  "wikidata": "Q12630183",
  "triage": "seen-in-use",
  "triageNote": "Added from the <family> archive. Access class still needs a person."
}
```

- `kind` — `national-archive`, `regional-archive`, `diocesan`, `library`,
  `national-library`, `volunteer`, `aggregator`, `index`, `commercial`,
  `catalogue`.
- `access` — leave it `unsurveyed` unless *you* verified what an ordinary
  visitor pays. The legend is in `data/providers.json` under `access`.
  Having used a site once is not a survey.
- `wikidata` — look the institution up and add its Q-id if it has one. This is
  worth the two minutes: it is how the atlas gets the postal address, email
  and telephone for archives you have to write to.

Then run `python3 scripts/check-data.py`. It must say **"data is sound"**.

### 3. A place under a name the atlas does not know

Aliases go in the place's `names`. If the atlas has no such place at all, say
so in your session notes with coordinates and country — adding a place is a
bigger change and belongs in a Record Atlas session.

## Progress marks (what the map colours)

Progress lives in **localStorage in a browser**, not in the repo. No script can
write it. To get work onto the map, produce an import file and open
`/my-research/` → *Import a file* (it merges, it does not replace):

```json
{ "v": 2, "exported": "2026-09-29",
  "lines": { "kosina-senj": { "name": "Kosina", "where": "Senj", "made": "2026-09-29" } },
  "active": "kosina-senj",
  "marks": {
    "volume:9RKB-W3G": {
      "t": "Births (Rođeni) 1858-1900", "where": "senj",
      "href": "/TheMap/place/senj/", "total": 174,
      "walked": [[1, 174]],
      "by": { "kosina-senj": { "done": [[1, 47]], "state": "found", "since": "2026-09-29" } }
    }
  } }
```

- Mark ids: `volume:<waypoint>`, `source:<providerId>`, `collection:<url>`.
- **A line is a family.** Blažević in Senj and Kosina in Senj are different
  progress on the same shelf. Put scanning under `by[line]`; put a register you
  read entry by entry in `walked`, where every line inherits it.
- `state` — `planned`, `written`, `searched`, `found`, `exhausted`, `blocked`.

`scripts/import-research-sessions.py` in the atlas builds this from
`searched.json` automatically. Run it after you have added rows.

## Rules that are not negotiable

- **Only positive evidence.** A silent homepage, a search that returned
  nothing, a page that would not load — none of these are findings. They go in
  the session notes as "not established", never into a data row.
- **No bot-gate workarounds.** A source that blocks automated access gets
  declined and recorded as blocked. Never spoofed around.
- **Archive privacy.** Surname strings and aggregate counts only. No given
  name, no full date, no settlement, no identifier, no relationship leaves a
  family archive into the atlas. Counts below 3 are dropped.
- **Say what you did not do.** "Searched Antenati for Ovaro, 1850–1880, nothing
  found" is a finding worth as much as a hit. "Searched Antenati" is not.

## You are not the only session in this repository

Several family archives write to Record Atlas, and there is **one working
tree**. On 2026-09-29 a Vidakovic/Vrban session ran `git commit data/providers.json`
and swept up another session's ten in-progress provider additions, a deep link
and two Wikidata ids into a commit whose message said none of that. Nothing was
lost, but the history now attributes one session's work to another — and the
same command could as easily have committed somebody's half-finished edit.

So:

- **Commit only the files you changed, by name.** Never `git commit -a`, never
  `git add .`, never `git add data/`.
- **`git status` before you commit.** If files you did not touch are modified,
  another session is working. Leave them alone and say so in your reply.
- If `data/providers.json` has changes that are not yours, add your row, commit
  **only** that file, and note in your message that the file also carried
  another session's edits — better an honest line than a silent merge.

## Before you finish

    cd "~/Projects/Family Projects/Record Atlas"
    python3 scripts/check-data.py          # must print "data is sound"

If you changed anything under `site/src/`, also run `npm run build` in `site/`
— it takes about twenty minutes and it gates licences, attribution and CSS
selectors, so do not skip it and do not report success without it.

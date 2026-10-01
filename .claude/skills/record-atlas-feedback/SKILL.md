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

#### A FILM PAGE'S WAYPOINT CAN BE THE WRONG BOOK — CHECK THE YEARS

One DGS film often bundles several older films, and the film page's `wc=`
describes only its **first segment**. Take it at face value and you get a
waypoint that is well formed, confident and wrong — the worst kind of error,
because nothing downstream will question it.

This happened. A session captured `9R28-RMN` off the page for DGS `005497886`
and wrote it into six rows. Checked against the atlas's own data:

    9R28-RMN  =  Marriages 1581-1589, 1622-1623
    the frames actually read  =  1777-1784

Wrong book by two centuries. The session backed the waypoint out, kept the
film number, and recorded that the waypoint is not established — and it
explicitly did NOT write `9R28-YWT` (Marriages 1762-1858), which does cover
those years, because picking the volume whose range happens to fit is the
guess-from-a-similar-volume this page forbids. That was the right call.

**So before you write a waypoint, check that its year range contains your
frames.** You can check without leaving the machine:

```bash
cd "~/Projects/Family Projects/Record Atlas" && python3 -c "
import json,sys,gzip,os
wp=sys.argv[1]
def load(f):
    # the world file is gzipped; asking for the plain name finds nothing
    return json.load(gzip.open(f+'.gz','rt',encoding='utf-8') if os.path.exists(f+'.gz') else open(f))
for f in ('data/fs-volumes.json','data/fs-volumes-world.json'):
    for place,vols in (load(f).get('byPlace') or {}).items():
        for v in vols:
            if (v.get('waypoint') or v.get('wp') or '').split(':')[0]==wp:
                print(place, v.get('from'),'-',v.get('to'),'|',v.get('t'))
" 9R28-RMN
```

If the years do not contain your frames, the waypoint is a different segment
of the same film. Write the film number, say the waypoint is not established,
and stop there. An unresolved row is a small gap; a confidently wrong waypoint
attributes your work to a book you never opened.

## Your write is not the last step

Writing to your archive's `searched.json` puts the work where the atlas can
find it. It does **not** put it in front of David. Nothing watches your repo,
and `/my-research/` reads a store that lives in his browser and that no script
can write to.

Somebody has to run, in the Record Atlas repo:

```
python3 scripts/import-research-sessions.py
```

which reads every family archive and writes `record-atlas-research-import.json`
— and then David has to open `/my-research/` and use **Import a file**.
Importing merges rather than replaces, so running it again is safe.

**So say so when you finish.** «Recorded in the atlas» is not true yet at that
point; «recorded in searched.json — run the importer to pull it into My
research» is. A session that says the first sends him looking for work that is
not there, which has happened.

WHAT YOU DO NOT NEED TO DO is build an import file by hand. That has been done,
because the importer was broken at the time, and it should not need doing
again: the fields below are read directly now.

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
- **A waypoint scraped from a FILM-NUMBER page names only that page's default
  segment, not the frames you actually read.** A DGS film number can bundle
  several old films end to end, and the `wc=` the page defaults to describes
  only the first of them. Before writing a waypoint down, check it against
  `data/fs-volumes.json`'s `byPlace` entry for your place: if your frames fall
  outside that entry's `from`–`to` range, the waypoint is wrong, and the fix
  is never to guess the neighbouring volume that looks closer — that is the
  same "resemblance, not a match" error the atlas already refuses on its own
  side. Write the film number and say plainly that no waypoint was
  established. (Verified case: DGS 005497886's film page defaults to
  9R28-RMN, "Marriages 1581–1623" — frames 1777–1784 fall outside it, ruling
  it out cleanly. The neighbour 9R28-YWT, "Marriages 1762–1895", DOES contain
  1777–1784, which is exactly what makes it dangerous: a date range that fits
  is not a confirmed match, only a plausible one, and writing it down anyway
  is the same guess the atlas already refuses on its own side.)
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
  The importer accepts `9 Sept 2026` too, but ISO is what it stores.

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

### Non-FamilySearch work is not wasted, even with no waypoint

The waypoint rule above is about the ATLAS'S VOLUME-LEVEL DATA and it does not
apply here. A row whose `url` points at a REGISTERED PROVIDER — its host
matching the `url` field of a row in `data/providers.json` — becomes a
`source:<providerId>` mark automatically, with no waypoint needed. Two archive
sessions have independently read the importer's per-archive summary line
("N rows, M matched to an atlas volume") and concluded their non-FamilySearch
work produced nothing, because that line reports ONLY volume matches. It does
not report source marks, which are counted once in total ("source marks: N,
from M rows") and not broken out per archive. A Polish state archive, a
newspaper portal, Findmypast, Trove — none of these carry a waypoint, and all
of them mark correctly when the provider is registered and the row's `url`
matches its host. If the provider is not yet in `data/providers.json`, add it
first (§2 above); that is the actual and only reason a source mark will not
appear.

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
- **SAY WHICH FAMILY THE ROW IS FOR, in `tags`.** This is the one thing the
  skill used to leave unsaid, and it mattered: your archive folder is not a
  family. The Blažević archive holds 22 rows of Kosina research and 14 of
  Žubrinić, and with nothing to go on the importer filed all of them under
  Blažević — the exact conflation lines exist to prevent. Put the surname in
  the row's `tags` (`"tags": ["kosina", "senj", "familysearch"]`) and the work
  lands in that family's line. A tag counts as a family only when your own
  archive's person records already name it, so place and method tags are safe
  to keep alongside. With no family tag the row falls back to the archive's
  own family, which is a guess and is usually right for a single-family
  archive and wrong for yours the moment you follow a second line.
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

**Push when your commit is green.** On 2026-09-29 several sessions committed
correctly and nobody pushed — HEAD sat five commits ahead of `origin/main`
for long enough that David judged the live site, reported a shipped fix as
"still not showing, we've really regressed", and the deployed `regions.json`
really did carry none of what the fix wrote, because the commit had never
left this machine. The collision rule above protects the commit. It does not
push it. Once `check-data.py` says sound, `git push` — don't leave a green
commit for the next session to find.

## Before you finish

    cd "~/Projects/Family Projects/Record Atlas"
    python3 scripts/check-data.py          # must print "data is sound"

If you changed anything under `site/src/`, also run `npm run build` in `site/`
— it takes about twenty minutes and it gates licences, attribution and CSS
selectors, so do not skip it and do not report success without it.

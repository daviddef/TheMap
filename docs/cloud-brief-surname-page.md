# Cloud brief: the surname page — flags, one spine, and the volumes worth opening

You are working in **Record Atlas** (`github.com/daviddef/TheMap`): 943,938
surnames, 2,890,777 volumes over 15,675 places, 519 archives. The site maps
**where the paper is**, not what is inside it.

**No network needed for the work itself.** GitHub is reachable, which is all
the build requires (it pulls one release asset). Nothing here fetches a third
party.

**You own `site/src/pages/surname/[name].astro`.** Nobody else will touch it
while this runs. Do not change `site/src/lib/surname-map.js` — the map has its
own brief — and do not touch `data/surnames.json`'s shape; another session is
working on variant clustering and will collide with you if you do.

## What the page does today, and why it reads as three pages

A surname page currently says, in three places that never meet:

- **"Where it is borne, and where a record names it"** — the countries, in a table.
- **"When and where it was being born"** — decades, in a different table.
- **"Whose archive to write to"** — archives, grouped by country, further down.

Each is correct. Together they make a reader hold three lists in their head
and join them by eye. And none of them shows a flag, although this atlas draws
194 of them and publishes them in `site/public/flag-index.json`.

## Job 1 — flags, on the name page and on the hubs

`site/src/lib/flags.js` already exists and is already used by `countries.astro`,
`places/[...page].astro` and `surnames.astro`. It maps a country code to its
drawn flag, mirroring build.py's 22-name alias table, and matches **194 of 194
modern countries**. The 16 it does not match are correctly codeless: three home
nations, five vanished states, eight empires.

- Put the flag beside every country named on a surname page.
- Put the member countries' flags on each **hub card** (`RecordMap.astro`
  renders these; a hub carries `holds.ccs`). Small, in a row, no text.

**Assert:** every country block on a rendered surname page carries either a
flag or a country with no `flagFor()` match, and every flag's link resolves to
a file that exists in `dist`.

## Job 2 — one spine, one block per country

Replace the three sections with **one block per attested country**, ordered as
the page already orders them. Each block carries, in this order:

1. **flag · country name** — the name links to `/country/<cc>/`, the flag to
   that country's page in the flags atlas.
2. **how it is attested** — `register` with the count where there is one,
   `archive` where a family archive attests it, and by which. This distinction
   is load-bearing and the page already explains it: a register is a
   head-count, a record is one document naming the surname on that ground.
3. **the archives for that country** — what "Whose archive to write to" lists
   today, moved in here, with its access class.
4. **what the holdings cover** — Job 3.

Keep every caveat the current page carries; they are not decoration. In
particular: *"«Attested in Spain» means the name appears in a dataset held
here. It never means the name exists in Spain, and never that it exists
nowhere else."*

This is an arrangement change. **Do not invent new claims, drop a caveat, or
change what any sentence asserts.**

## Job 3 — which volumes are worth opening, in three states

This is the new capability and the reason for the brief.

The atlas knows which **country** a name is attested in and nothing finer — a
country entry carries `cc`, `how`, `by`, `n` and no place. The one route that
might narrow it is closed on purpose: `data/archive-surnames.json` states *"No
given name, no date, no place, no relationship and no identifier leaves the
archives."* Respect that; it is a privacy boundary, not an oversight.

But the atlas also knows **when** a name was in a country, and every volume
carries a `from` and a `to`. Intersecting the two is a real filter. Measured:

    surname / country      volumes        overlapping the attested decades
    Blazevic    Germany      3,580   ->        5     (0.1%)
    Defranceski Croatia      5,087   ->    3,223    (63%)
    Defranceski Italy    1,340,764   ->  389,035    (29%)
    Defranceski France       1,513   ->        0     (0%)

So the filter's strength depends entirely on the name, and the page must not
pretend otherwise. **Render three states:**

- **A shortlist** — when the overlap is small enough to read (pick the
  threshold and say why; a few dozen is a person's afternoon). List the actual
  volumes: title, years, and the link the atlas already builds.
- **A filter** — when it is large. Give the number, the span, the commonest
  record kinds, and the route in. "389,035 of 1,340,764 volumes overlap the
  decades this name is attested" is honest and useful; a list is not.
- **A warning** — when it is **zero**. France above is the case: attested in
  the 1970s, and not one surviving volume reaches that decade, because French
  privacy windows close recent registers. Say so. *"Attested here, and nothing
  that survives covers those years"* saves a reader a wasted week, and the page
  currently cannot tell them.

### Where the dates come from, and the sentence that must appear

`data/surname-timeline.json.gz` — 363,574 surnames, `{surname: {cc: {decade:
count}}}` — built from **Wikidata humans with a birth date and a birth place**.
Its own note: *"These are people notable enough for an encyclopaedia, not a
census… It is good evidence that the name was borne in a place at a time. It
says nothing about how common it was."*

So the page may say **"records overlapping the decades this name is attested
here"**. It may never say **"your family was here then"**. Get that wording
wrong and the feature becomes a lie with a number attached.

**Joining is not a string match.** Timeline keys are the raw Wikidata spelling
— `De Franceschi`, not `Defranceschi` — so a direct lookup silently returns
nothing, which is how this was nearly written off as unusable.
`site/src/lib/surname-timeline.js` already folds and walks variants; use
`timelineFor()` rather than reading the file yourself.

## What must not happen

1. **No claim the atlas cannot support.** The volumes overlap the decades; they
   are not known to contain the name. Every word on the page has to keep that
   distinction.
2. **Do not slow the build.** There are ~19,779 surname pages. Anything read
   per page that does not depend on the page belongs in a module read once —
   this project has made that mistake three times and each comment in
   `surname-timeline.js` records one. Report the build time before and after.
3. **Do not grow the page unboundedly.** A country with 389,035 matching
   volumes gets a number, not 389,035 list items.
4. **Keep it working without JavaScript.** These pages render server-side and
   must stay that way.

## Practical notes

- `npm run build` from `site/` is ~24 minutes; `npm run test:e2e` runs 27
  specs, six of which are axe-core accessibility checks. **Both must pass.**
  The accessibility specs are strict: a colour-contrast regression failed four
  of them earlier today and it was right to.
- `python3 ../scripts/check-data.py` and `check-built.py` from `site/` are the
  data and output gates.
- Branch off `main`, push, do not merge.

## What to hand back

The branch, and: how many surname pages gained a flag, how the three states
distribute across a sample of 500 real names (how many get a shortlist, a
filter, a warning), the build time before and after, and the wording you chose
for each state. Lead with the wording — it is the part most likely to be wrong
and the part I will want to argue with.

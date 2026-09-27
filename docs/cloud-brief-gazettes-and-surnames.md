# Cloud brief: gazettes, national registers, and surnames with a story

You are working in **Record Atlas** (`github.com/daviddef/TheMap`). It is an atlas
of *where the paper is*: 7,391 places, 8,557 collections, 519 providers, 41
regions, and 946,575 surnames, each tied to the archive that actually holds the
records. It is built with Astro, deployed to GitHub Pages, and every number on
it is meant to be defensible.

This brief is deliberately large. Do the work in the order given; each part
stands alone and is worth having on its own, so **push what you finish** rather
than holding everything for a single perfect branch.

---

## The one rule that matters most

**Only positive evidence may be written into a data row.**

An absence is not a finding. A page that did not load is not a finding. "I could
not check" is not a finding. Every row you add carries where it came from, under
what licence, and on what date — the existing data already does this and yours
must match.

Four corollaries, each learned here the hard way:

1. **A claim needs a citation you actually fetched.** A plausible URL that 404s
   is worse than no URL, because the next person will trust it.
2. **Never work around a bot gate.** 403, 429, CAPTCHA, Cloudflare interstitial,
   a `robots.txt` disallow — record it as declined, with the reason, and move on.
   Never spoof a User-Agent, never evade a block, never retry to get round one.
   Set an honest User-Agent with a contact address and honour `Crawl-delay`.
   A declined source is a legitimate, recorded result. See
   `data/frequencies/_refused.json` for how refusals are written down here.
3. **Silence is not a negative finding either.** If a national statistics office
   has no surname table, that is a finding *only* if you searched their
   catalogue and can say what you searched.
4. **Do not invent to fill a gap.** Fewer rows, all true, beats more rows with
   some wrong. Wrong data here sends a real person to the wrong archive on the
   other side of the world.

### On the sites that inspired this work

Pages like Wikipedia's surname articles, Geneanet, Forebears, WisdomLib,
ActaCroatica and Ancestry show *what a good surname page contains* — meaning,
first attestation, distribution, variants, notable bearers, migration.

**Read them for what to build, never as a source to harvest.** Ancestry,
Geneanet, Forebears and MyHeritage all restrict automated access in their terms.
Do not scrape them. Do not "check" them programmatically. Take the *shape* of
what they offer and source the facts from places that permit it:

- **Wikidata** — CC0, the single best source. Family-name items (Q101352),
  `P460` (said to be the same as), `P1533` (family name), `P2596`, etymology
  properties, and links to notable bearers.
- **Wikipedia / Wikisource / Wiktionary** — CC BY-SA 4.0, attribution required.
  Wiktionary in particular carries surname etymologies with references.
- **National statistics offices and civil registries** — see Part 2.
- **Official government gazettes** — see Part 1. Usually Crown copyright with an
  open government licence, or public domain by age.
- **Trove** (Australia) — the repo already holds a working API key in the
  GitHub secret `TROVE_API_KEY`, and `scripts/harvest-trove.py` shows the
  pattern, including the 30-day caching limit their terms impose.
- **OpenHistoricalMap / OpenStreetMap** — CC0 and ODbL respectively.

---

## How this repo works

```
data/                     source data, one file per harvest, licence-stamped
  frequencies/            national surname registers: be dk es fr hr ie it no pl si us us2000
  frequencies/_refused.json  sources tried and declined, with what was attempted
  surnames.json           946,575 surnames, built from the above
  collections.json        8,557 record collections
  providers.json          519 archives and publishers
scripts/harvest-*.py      one harvester per source; copy the nearest as a template
scripts/build.py          folds everything into the site's data
scripts/check-data.py     the data gate — must pass
scripts/check-built.py    the built-output gate — must pass
site/                     the Astro site
```

A surname record looks like this:

```json
{ "n": "Bär",
  "variants": [ {"n": "Baehr", "how": "curated"}, {"n": "Baar", "how": "sounds"} ],
  "countries": [ {"cc": "FR", "how": "register", "by": ["fr"], "n": 3163} ] }
```

`how` is always the provenance: `register` (a government counted them),
`curated` (a human decided), `sounds` (algorithmic, explicitly *not* evidence).
Anything you add must carry the same kind of honesty about where it came from.

**Before you push:** run `python3 ../scripts/check-data.py` from `site/`, and if
you touched anything the site renders, `npm run build` there too. Both gates must
pass.

**Do not touch these files** — other sessions are working in them right now:
`data/_survey-review.json`, `data/unplaced-*.json`, `data/ohm/*`.

---

## Part 0 — A real bug, fully diagnosed, as a warm-up

`data/frequencies/be.json` (Belgium, Statbel) contains **4,836 U+FFFD
replacement characters**, which have propagated into **4,066 surnames whose own
name is damaged** in `data/surnames.json` — `Abandonn<?>` for *Abandonné*,
`Abou Ya<?>la` for *Abou Yaïla*, `Aba<?>ch` for *Abaïch*. Those are live,
broken page titles.

The cause is `scripts/harvest-belgium-surnames.py` line 114:

```python
io.TextIOWrapper(f, encoding="utf-8", errors="replace")
```

Statbel does not publish that file as UTF-8. `errors="replace"` turned a loud
decoding failure into 4,066 quietly wrong names.

Fix it properly: determine the file's real encoding (try UTF-8 strict first,
then CP1252/Latin-1), **remove `errors="replace"`** so a future encoding change
fails loudly instead of silently, re-harvest, and confirm zero U+FFFD in both
`be.json` and the rebuilt `surnames.json`. Then check the other harvesters for
the same pattern — `errors="replace"` anywhere near a text decode is the smell.

---

## Part 1 — Government gazettes (the genuinely unmapped thing)

**This is the most valuable part of this brief. Do it first after Part 0.**

Official government gazettes are the most under-used genealogical source in
existence. They are not newspapers. They are the state's own record of
naturalisations, probate and estate notices, land grants and selections,
bankruptcies and insolvencies, legal name changes, military honours and
casualties, public-service appointments, deceased estates, company dissolutions,
and changes of address for the purposes of law. They name ordinary people, with
dates, and they are frequently the only surviving record of an event.

Most genealogy tools ignore them entirely. Record Atlas already has the record
kind — `record_kinds.py` carries *"Newspapers and gazettes"* — but almost
nothing filed under it.

**Build the gazette layer.** For every country and historical colony you can,
establish:

- Does an official gazette exist, or did one? Under what names, and when did the
  title change? (Colonial gazettes often continue under a new name at
  independence — trace the chain.)
- Is it digitised? By whom? Complete or partial, and what years are actually
  online versus merely catalogued?
- What is the access class: `free`, `account`, `index`, `mixed`, `paid`,
  `catalogue`, `onsite`? Use exactly these words — they are the repo's vocabulary.
- What is the licence or copyright status?
- **What genealogical content does it actually carry, and in which series?** This
  is the part nobody else has. "Naturalisations 1903–1920 appear in the weekly
  issue under 'Aliens Act'" is worth a hundred times more than "gazettes exist".
- Is there an API, an OAI-PMH endpoint, or a bulk download?

Strong starting points, all openly accessible: the **London Gazette** (and the
Edinburgh and Belfast Gazettes) with an open API going back to 1665; the
**Commonwealth of Australia Gazette** and every state gazette via **Trove**
(you have the API key); **Canada Gazette**; the **New Zealand Gazette**;
**Iris Oifigiúil** (Ireland); the **Gazette of India** and the provincial
gazettes; **Singapore eGazette**; **Hong Kong Government Gazette** (digitised
back to 1853); the **South African Government Gazette**; the
**Straits Settlements Government Gazette**; the Dutch **Staatscourant** (back to
1814, fully digitised by Delpher); the French **Journal Officiel** and the
**Bulletin des Lois**; the Austro-Hungarian **Wiener Zeitung** official section;
the **Deutscher Reichsanzeiger**.

Write `data/gazettes.json` with one entry per gazette, in the shape the existing
provider and collection files use — look at `data/providers.json` and
`data/collections.json` and match them, so `scripts/build.py` can fold your file
in without special-casing. Include for each: country, jurisdiction, title(s) and
the dates each title was in use, publisher, holding institution, digitised
range, access class, licence, URL, API/OAI endpoint if any, and an array of the
genealogical series it carries with their date ranges.

Then write `scripts/harvest-gazettes.py` following the existing harvester
pattern, so it can be re-run. Where a gazette has an API or OAI-PMH endpoint,
harvest actual volume counts and date coverage rather than describing it by
hand — **more volumes is an explicit goal**, and a gazette run is often tens of
thousands of issues.

Add a short section to `site/src/pages/about.astro` explaining what gazettes are
and why a researcher should care, in the voice of the surrounding prose. Read
several existing pages first; the writing is plain, specific, and never boastful.

---

## Part 2 — More national surname registers

`data/frequencies/` holds twelve sets: `be dk es fr hr ie it no pl si us us2000`.
That is a good start and roughly a fifth of what is obtainable.

**Read `data/frequencies/_refused.json` first.** It records six countries already
attempted — CZ, FI, HR, NL, SE, AR — with precisely what was tried for each. Do
not re-tread that ground blindly. If you do retry one, say what is different
about your approach, and if it refuses again, update its entry rather than
duplicating it.

Countries worth pursuing, most of which publish this data openly under an open
government licence: Portugal, Germany, Austria, Switzerland, Iceland, Estonia,
Latvia, Lithuania, Hungary, Slovakia, Romania, Bulgaria, Serbia, North Macedonia,
Greece, Turkey, Israel, Canada, New Zealand, Brazil, Mexico, Chile, Uruguay,
Peru, Colombia, South Africa, Japan, South Korea, the Philippines.

For each, follow the existing harvester pattern exactly: a
`scripts/harvest-<country>-surnames.py`, output to
`data/frequencies/<cc>.json`, carrying `country`, `source` (the dataset's own
title and edition), `url`, `licence`, `harvested` (ISO date), and the counts.
Where the source gives sub-national breakdown — province, municipality,
département — **keep it**. Belgium's does, and that granularity is what lets the
atlas say *which valley* a name comes from rather than which country.

Then extend `scripts/build-surnames.py` so the new registers fold in, and confirm
the `counts` block in `data/surnames.json` moves in the direction you expect.

---

## Part 3 — Surnames with a story, every claim cited

946,575 surnames currently carry variants and country counts. None carries a
story. That is the gap.

For as many surnames as you can properly evidence — **prioritise by
`withRegisterCount`, the ones with the most bearers, and by those attested in
the atlas's own collections** — build a researched record:

- **Meaning and etymology**, with the source. Patronymic, occupational,
  toponymic, descriptive, or ornamental — and *what* it derives from. Blažević
  is the patronymic of Blaž, from the Latin *Blasius*; that is a citable fact,
  not a guess.
- **First known attestation**, with date, place and source, where one exists.
- **Region of origin**, distinguished from where it is merely common now. These
  are different questions and conflating them is the commonest error in surname
  writing.
- **How it travelled**, where there is evidence — emigration, deportation,
  border change, occupational migration. Tie this to the atlas's own era data
  where it can: `data/ohm/era-ground.json` records which polity held a given
  ground in a given year, which is exactly the context a surname's movement sits
  in.
- **Cognates across languages**, distinguished from spelling variants. Kovač,
  Kovács, Kowalski, Kuznetsov, Smith, Schmidt, Ferrari and Lefèvre are the same
  *idea* in nine languages; that relationship is real and no genealogy site
  models it. This alone would be worth the exercise.
- **Notable bearers** from Wikidata, with identifiers.

Write to `data/surname-stories.json`, keyed by surname, with every claim carrying
its own `source` and `licence`. Where Wikipedia or Wiktionary is the source,
record the article and revision so the claim can be checked later.

Where you cannot evidence something, **leave the field out**. A surname with a
cited etymology and nothing else is a good record. A surname with an invented
etymology is a liability.

If the volume of well-evidenced stories justifies it, add the rendering to the
existing surname page template so they appear on the site; if you only have a
few hundred, leave them in the data and say so in your report.

---

## What to hand back

Work on a branch off `main`, push it, and do not merge. Write **`RESEARCH-REPORT.md`**
at the repo root covering:

- what you added, in numbers: gazettes mapped, volumes counted, registers
  harvested, surnames evidenced;
- every source that refused you, and how (this is as valuable as the successes,
  and belongs in `_refused.json` too);
- every judgement you were unsure about;
- what you deliberately left alone, and why;
- what you would do next with another day.

Be blunt about what did not work. An honest "the Gazette of India is digitised
but the search is server-side only and there is no bulk endpoint, so I could
record the run but not the volumes" is far more useful than a number you are not
sure of.

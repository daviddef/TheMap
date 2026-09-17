# Pick up here — paused 17 September 2026

## Running when we stopped

**Antenati, via OAI-PMH.** `scripts/harvest-antenati-oai.py` was part-way through
464,770 records. It saves every 20 pages and keeps its resumption token in
`data/antenati-registers.json`, so:

    python3 scripts/harvest-antenati-oai.py --resume

picks up exactly where it stopped. Roughly 5 hours from cold, one request every
two seconds. CC BY 4.0, published by the Ministry of Culture — this is the open
data route, NOT the portal, which 403s every identified crawler.

## The one thing to do before those registers are visible

Antenati names five to seven thousand comuni. **Italy has 204 drawn places.**
The registers will have nowhere to attach.

`data/italy-comuni.json` already holds all 7,894 ISTAT comuni with province,
region and official second name — but as a search corpus (`it/` shards), not as
markers. Promote the ones that have registers onto the shelf, exactly as
`scripts/promote-ireland.py` and the Scottish parish promotion did.

## Known, unfixed

- **D'Arcy's fallback is still generous.** Per-surname attribution is exact where
  an archive links people to places; where it does not, a name inherits the
  archive's whole country list if mentioned three times or more. Mazza and
  Luwinski still lean on that.
- **`index.json` is at 792 KB of an 800 KB budget.** The next field added will
  burst it. `q`, `i` and `n` are the three biggest and `i` is derivable from `n`
  for most places.
- **72 countries have no national source at all**, mostly small territories.
- **23 African countries have neither a collection nor an archive** — Chad, Mali,
  Niger, Senegal, Tanzania, Ghana among them.

## Waiting on David

- The AdSense slot ID. `site/src/data/site.json` has `enabled: false, slot: null`;
  the publisher ID is already live in ads.txt.
- A NARA API key — needs a named person to register.
- Trove: the reply to ticket RSref189042.
- Whether IrishGenealogy's diocese list in `data/providers.json` is right. It was
  RECORDED, not harvested — the site is behind a Cloudflare managed challenge —
  and `holdingsChecked` is null until a human confirms it.

## The volume-level work, and why it needs Chrome

FamilySearch will not serve a script: catalogue and waypoint paths answer 404 or
a challenge. The Croatian walk that gave us 4,903 volumes was done in David's own
Chrome; `scripts/ingest-fs-catalogue.py` in the Defranceski archive is the
extractor. Every further country needs the same. Suggested order by where the
research actually goes: Italy (pairs with Antenati), South Africa, Argentina,
Australia.

## Asked for on Sunday: a church-records filter

David: «many people really want to look at church records — do we know which
are which, and could we apply a filter?» We do, from three independent signals.

    FamilySearch's own `kind`      CHURCH_RECORD   177 of 3,489 collections
    Title says church/parish/etc                   633 of 3,489
    Croatian volumes, by confession Roman Catholic  4,225
                                    Orthodox          504
                                    Greek Catholic     27
                                    Jewish             21
                                    Reformed           17 · Evangelical 7
                                    — Civil             8  (NOT church)

Antenati adds a third signal: its `fondo` separates «Stato civile» from parish
series, and `parish` is already captured where the record has one.

**Do not trust `kind` alone.** Only 177 collections carry CHURCH_RECORD while
633 titles plainly say church, parish or baptism — the tag hides three-quarters
of them. Do not trust the title alone either: «Civil Registration (Church
transcripts)» is not a parish register. Use both and record WHICH fired, the
way the access and evidence tiers already do.

**Filter by CONFESSION, not by «church».** A Croatian researcher needs Roman
Catholic *or* Orthodox specifically — different parishes, different surviving
books, often different archives. «Church» as one bucket answers a question
nobody has. The confession is already on every Croatian volume as `conf`.

## Croatia's surnames — the sharpest gap, and David wants it tried again

1,165 Croatian places, 6,528 volumes, the deepest ground this map has, and not
one surname frequency. Every other measure has Croatia first and this one has
it absent.

Tried and failed, 16 and 17 September:

    podaci.dzs.hr   CKAN package_search «prezimena» — no parseable response
    podaci.dzs.hr   CKAN /api/3/action — 404
    opendata.dzs.hr — no answer at all
    data.gov.hr     CKAN package_search — ANSWERS 200 but not JSON

**Start from that last line.** data.gov.hr is the national portal and it is
alive; it simply does not serve the CKAN path used here. Find its real API
before trying anything else — do not repeat the three URLs above.

Other doors not yet knocked on:

- **DZS census tables.** The 2011 and 2021 censuses are published through
  PxWeb. Surnames are usually a separate vital-statistics series rather than a
  census table, but the PxWeb catalogue has not actually been listed and read
  the way Slovenia's was — and Slovenia's only turned up because somebody read
  4,836 table names instead of searching for the word «surname». That is the
  same move, unattempted for Croatia.
- **Ask.** The Meertens request in `requests/` is the template. DZS has a
  statistics enquiry service; a written request naming the use and the licence
  is the polite route and has not been sent.

## A habit to not repeat

Seven waiter loops accumulated over seven hours on 17 September, one running
the whole time. Each was `until grep -q "Complete!" log; do sleep; done`
started ALONGSIDE a build — so when the build was killed to start another, the
log never got its "Complete!" and the watcher spun forever, eating CPU next to
the builds it was no longer watching.

Start the wait and the build as ONE command, so killing one kills the other:

    npm run build > log 2>&1 && <verify> && <push>

not

    npm run build > log 2>&1 &
    until grep -q Complete log; do sleep; done   # orphaned the moment the build dies

## BROKEN AND UNDIAGNOSED — start here on Sunday

**The global style block in `site/src/layouts/Base.astro` is not reaching the
built CSS.** `grep -c topnav site/dist/_astro/*.css` returns 0. Every rule in
that block is missing live: the nav runs together as one word, and `.adslot`
has no height, which is likely why no ad appears even though the unit and the
consent message are both live.

TWO THEORIES TRIED, BOTH WRONG:

1. `set:html="...push({});"` — braces in a quoted Astro attribute are parsed as
   an expression. Fixed to `set:html={"..."}`. Did not restore the CSS.
2. The comment above it contained literal tag syntax in angle brackets, which
   I thought opened a style element inside the comment. Reworded. Also did not
   restore the CSS.

So the cause is still unknown. **Do not guess a third time — bisect.** Revert
Base.astro to the last commit where the nav was intact (before the favicon,
the ads block and the archives-osm import went in), confirm the rules return,
then re-apply one change at a time.

And then add the gate: assert that rules the layout declares appear in the
built CSS. Six gates exist and none of them looks at this — the build
succeeded, the data was sound, every import resolved, every inline script
parsed, and the site shipped with no navigation styling at all.

## Also asked for, not yet done

- **Collections on a country page should group by region**, not run
  regional-first then by record count. South Africa's 32 collections should sit
  under Cape, Transvaal, Natal, Free State, then the national indexes.
- **The places grid reads column-major**, so scanning across a row looks
  unsorted. It is alphabetical down each column. Make it read left to right.
- **Escape from full screen** works (Esc, or the button again) but nothing on
  screen says so. A one-line hint while full screen is on.

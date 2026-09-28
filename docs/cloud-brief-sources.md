# The source layer: gazettes, newspapers, and the countries resting on one link

Record Atlas is a map of **where the records are**. It holds 21,754 places and
2.89 million catalogued volumes — and **520 sources** to reach them with. That
second number is the weak wall of the whole project, and this brief is about
making it hold.

## What is actually there, measured on 2026-09-28

    providers in the atlas                       520
    countries with at least one                  103
    countries resting on EXACTLY ONE              68
    countries with ten or more                     5
    providers that are a GAZETTE                   1   (added this week)
    providers that mention newspapers              8

Set that against where the atlas has done its work:

    cc    places   sources   cc    places   sources
    IT     2,937       126   BE       563         2
    IE     2,144         5   ES       376         2
    US     2,087         4   BY       358         1
    GB     1,481         7   AR       207         1
    UA     1,175         5   PT       148         1
    MX     1,124         2   MD       146         1
    RU     1,065         1   CO       143         1
    CZ       801         4   GT       122         0

Italy has 126 sources for 2,937 places. **Russia has one source for 1,065
places. Guatemala has 122 places and none at all.** Mexico, the third largest
country in the atlas, has two.

That is the shape of the problem: the atlas is wide and, outside a handful of
countries, one link deep.

## Why gazettes, specifically

Until this week the atlas held **no government gazette of any country**. A
gazette is where a state prints what it is obliged to announce: naturalisations
and denizations, estate and insolvency notices, changes of name, appointments,
land grants, deceased estates. It names ordinary people, by name, with a date —
people who appear in no parish register because they were the wrong religion,
no census because they moved, and no civil register because it burned.

For emigrant families it is often the only record of the arrival end. A
Croatian who died in Cape Town in 1931 is in the *South African Government
Gazette* estate notices and, very likely, nowhere else this atlas can reach.

One is in now, verified by hand:

- `gazettes-africa` — Gazettes.Africa, free, full text, **24 African countries**
  (the list was read off the portal's own country menu, not inferred from the
  name).
**And one that could not go in.** *Portal starije hrvatske periodike*
(`dnc.nsk.hr`), the National and University Library in Zagreb's run of older
Croatian periodicals — the Croatian-language press, where ANNO gives only the
German. It is real, free, and **http only**: `https://dnc.nsk.hr` times out.
`scripts/check-data.py` requires every provider URL to be https and stops the
build, so the row was removed rather than the check weakened. That is a
decision for David, not for a brief: either the atlas admits http sources with
a visible warning on the link, or it loses a national library's newspaper
archive. Expect to meet this again — state libraries in several countries are
still http-only.

They are the shape to copy, not the extent of the job.

## The job

Raise the source layer for the countries the atlas actually covers, in this
order:

1. **The starved giants** — RU, MX, BY, AR, PT, MD, CO, GT, BE, ES. Each has
   hundreds or thousands of places and one or two links. A national archive, a
   civil-registration portal, a gazette and a newspaper archive for each of
   these is worth more than another hundred Italian comune archives.
2. **Gazettes, everywhere they exist.** Almost every state publishes one and
   many are digitised and free. The category is empty outside Africa.
3. **Newspaper archives.** Eight providers mention newspapers, and they cover
   AT, US, NL, SI, ZA, AU. Europe east of Vienna has none.
4. **Civil registration portals** where the archive itself is not the access
   route — the thing a researcher actually opens.

## The standard every row must meet

This is the part that matters more than the count.

- **Open it.** A row is added because somebody loaded the page and saw what it
  holds. Not because Wikidata lists it, not because another directory links it.
  The atlas already carries 204 unopened Wikidata rows and labels them
  *"Nobody here has opened these"* — do not add to that pile.
- **`countries` is read, not inferred.** Gazettes.Africa covers 24 countries
  because its own menu names 24. A source called "Nordic Archives" covers what
  its pages say it covers.
- **`access` is one of** `free`, `account`, `index`, `mixed`, `paid`,
  `catalogue`, `onsite`, `unsurveyed` — and it describes what it costs to see
  an **image**, not what it costs to search. An index with no images is `index`
  even when the search is free.
- **`what` says what is in it and what is not.** One or two sentences, concrete,
  with years where they are known. "Digitised parish registers 1650–1900 for the
  archdiocese, images free" beats "a genealogical resource".
- **A source that blocks you is recorded as blocked, not worked around.** If it
  refuses a script, note it in `what` and set `access` honestly. Do not spoof a
  user agent, do not route around a gate. A declined source is a finding.

## Row format

Append to `data/providers.json` → `providers[]`:

```json
{
  "id": "short-kebab-id",
  "name": "The name it calls itself",
  "url": "https://…",
  "kind": "national-archive|regional-archive|diocesan|library|aggregator|volunteer|index|commercial|statistics|catalogue",
  "countries": ["RU"],
  "access": "free",
  "what": "What it holds, what years, and what it does not hold.",
  "deepLink": null,
  "checked": "2026-09-28",
  "at": { "lat": 55.7558, "lon": 37.6173, "place": "Moscow, Russia" }
}
```

`at` is where the institution sits — the map orders a country's sources by
distance from the place being viewed, so a missing `at` sends it to the bottom
of every list. For a digital-only aggregator use the publishing body's seat.

`scripts/recheck-providers.py` and `scripts/check-links.py` already exist; run
them and fix what they report before handing back.

## What must not happen

1. **No bulk import.** A hundred unopened rows makes the atlas worse, because
   the panel presents them as checked sources beside ones that are.
2. **No coverage claimed from a name.** "Central European Archives" is not
   evidence for CZ, SK, HU and PL.
3. **No dead links.** Check before, and run the checker after.
4. **Do not touch** `site/src/components/RecordMap.astro` or anything under
   `site/src/pages/` — this is a data brief. `data/providers.json` and, if you
   add a category, a note in `docs/`.

## What to hand back

- The added rows, with a one-line note per country on what you found and what
  you looked for and could not find.
- The countries where you searched and came up empty — that is a finding, and
  it tells the next person not to repeat the search.
- The new counts: providers, countries covered, countries still on one source.
- Anything blocked, with what blocked it.

The measure of success is not how many rows were added. It is how many of the
68 one-source countries are no longer one-source, and whether every row you
added is one a researcher could open tonight and use.

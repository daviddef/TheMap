# Record Atlas — offline work for a cloud session

Repo: `daviddef/TheMap`. Everything below runs **entirely from files already in
the repository**. That is deliberate: this session has **no web access**, so
nothing here may fetch Overpass, Wikidata, FamilySearch, HRČAK or any other
site. If a task seems to need the network, stop and say so rather than
inventing a way round it.

Work in this order. Each part stands alone — report what you find even if a
later part is unfinished.

---

## 0. One build at a time (read this first)

Three "failures" in the last session were one local session running two builds
at once: the second begins with `rm -rf site/dist` and deleted chunks the first
was still writing, producing `Cannot find module '.../surname.astro.mjs'` and
phantom e2e failures. **Before starting any build, check `pgrep -f "astro
build"` returns nothing.** A red gate that is really a collision wastes more
time than the build saves.

---

## 1. Full end-to-end test of the site

```bash
pgrep -f "astro build" || true          # must be empty
rm -rf site/dist
cd site && npm run build                # data + check + astro + check:built
cd site && npm run test:e2e             # 27 Playwright specs
```

`npm run build` is `npm run data && npm run build:site`, and `build:site` is
`npm run check && astro build && npm run check:built`. So a single green run
covers: `scripts/check-data.py`, the unit tests, the Astro build of ~46,600
pages, `scripts/check-built.py`, and the e2e suite.

Playwright's browsers are already in the image cache (`chromium-1243`). **If
they are not, do not run `npx playwright install`** — it needs the network.
Report that the browsers are missing and run everything else.

**Report:** the exit code of each, and for any failure the actual error text,
not a summary. Distinguish a real failure from an artefact: if `dist` was
incomplete when the tests ran, say so.

### Then go beyond the 27

The suite is thin in places. Add specs only where you can prove a real defect,
and say plainly if you add none:

- **`/my-research/` with an empty store.** It should explain how it fills up,
  not show a blank. Then with the published `research-sessions.json` folded in,
  the switcher should list 22 families.
- **The mark controls.** On a place page and in the map panel: the `+` opens an
  editor, a range saves, the pill becomes `✓`, and it survives a reload. A
  repaint loop in the map panel made this silently impossible for weeks — 3,906
  DOM mutations in three seconds — so a spec that opens the editor and asserts
  it is **still there 1.5 seconds later** is worth having.
- **Mobile.** 375px wide: no horizontal overflow, the map is not below the fold,
  and the header does not wrap into the brand.

---

## 2. Audit for gzip path misses (high value, purely local)

**Three separate bugs this week were the same mistake**: a consumer asking for
`data/x.json` when the file had become `data/x.json.gz`. Nothing throws —
`os.path.exists` says no and the reader silently uses less data, or none.

- the cemeteries harvest
- `scripts/import-research-sessions.py`, which indexed **31,028** volumes out of
  **2,934,078** waypoints and reported the rest as "no volume could be placed"
- and the gazetteer before them

Gzipped files today:

```
data/cemeteries-osm.json.gz   data/fs-volumes-world.json.gz
data/gazetteer.json.gz        data/surname-origins.json.gz
data/surname-timeline.json.gz
```

**Find every reader of every one of them** across `scripts/`, `site/src/` and
`.github/`, and check each handles the `.gz`. `scripts/gazetteer.py` is the
pattern to follow: try `.gz`, fall back to plain, never fail silently.

**Report a table**: file, reader, handles gzip yes/no, and what is lost when
it does not. Fix the ones you are sure of; leave anything ambiguous for review
and say why.

---

## 3. The 35,208 unplaced settlement names

`data/fs-volumes-unplaced.json` holds names FamilySearch has books for that the
atlas cannot place: **822,558 volumes** against a published corpus of
2,893,805. `scripts/match-fs-volumes.py` was re-run against the current
gazetteer and most still do not match. Their shapes:

| shape | names | volumes |
|---|---|---|
| plain name | 23,369 | 497,395 |
| **non-Latin script** | 9,534 | 103,172 |
| bare admin unit (`Franklin County`) | 594 | 21,430 |
| compound (`Ile-de-Montréal, Lapraire, Chambly…`) | 499 | 5,721 |

**The non-Latin group is the tractable one.** `Тверь` is Tver; the gazetteer
folds to Latin and holds `Tver`, so the two never meet. A transliteration pass
over Cyrillic and Greek could be worth ~103,000 volumes.

**Do not change the matcher's standard of proof.** It is deliberately
"deepest first, and only inside the collection's own countries", so that
`Lewis` cannot land on the wrong Lewis. Adding transliteration must not weaken
that. **Report what each idea would gain before applying it**, and if a rule
would place a name on resemblance rather than a match, say so and leave it out
— this atlas refuses that everywhere else.

---

## 4. If there is time: the accessibility floor

`npm run build` runs an axe pass that currently reports `fail 0`. Check it
covers the pages that changed most recently — `/my-research/`, place pages, the
map — and that the new controls have accessible names: the `+`/`✓` mark pills,
the header family switcher, the map tool buttons.

---

## Rules

- **Commit only files you changed, by name.** Several sessions write to this
  tree. `git status` first, and if files you did not touch are modified, leave
  them and say so.
- **Do not invent a licence, a coordinate, or a match.** If evidence is absent,
  the finding is "we do not know", and that is a real answer here.
- Gate before pushing: `python3 scripts/check-data.py` must print `data is
  sound`, and the build and e2e must be green.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

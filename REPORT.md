# Two passes, and what each of them refused

Two independent jobs, both written so a later reader can check them rather than
trust them. New files, and nothing else touched:

- `data/survey-verdicts.json` — 115 rows: 29 access classes, each with the
  sentence that establishes it; 86 with no verdict and a reason.
- `data/unplaced-placed-2.json` — 255 of 686 stranded record groups placed,
  225,960 of 422,359 volumes; the other 431 listed with why not.

`python3 scripts/check-data.py` from `site/` ends **data is sound**. See *The
build gate* at the end: a fresh worktree has none of the generated build
artefacts, and they had to be brought in from the main checkout before the gate
could get as far as my files.

---

## Both inputs were missing, and are gitignored

`data/_survey-review.json`, `data/_unplaced-context.json` and
`data/unplaced-placed.json` are all in `.gitignore`, so this worktree did not
have any of them. They exist in the main checkout under `Record Atlas/data/`,
and I copied them in to work on (they stay ignored, so they are not in the
commit). `_unplaced-context.json` cannot be rebuilt here at all: it comes from
`data/fs-waypoints.json`, 740 MB, which the ignore file itself says is not in
the repository.

Worth knowing before the next agent starts: **this task is not runnable from a
clean clone.** If these queues are to be worked by anyone other than whoever's
laptop holds the 740 MB file, they need to travel with it.

---

# JOB 1 — 115 access verdicts

## What was done

Every undecided row's own site was opened with the project's user-agent and its
robots rules — I imported `robots_allows`, `fetch` and `text_of` straight out of
`scripts/survey-providers.py` rather than writing a second fetcher, so there is
one robots implementation and one UA in play. The home page, then up to six
links from it about registers, digitised documents, conditions of consultation
or charges: 115 sites, 419 pages.

The 33 `needs-browser` rows are JavaScript shells with no links in the HTML at
all, and none offers a sitemap (I checked; that route dead-ends). So I rendered
them with Playwright on the pattern of `scripts/render-pages.mjs` — same UA, one
page at a time, 1.2 s apart — and then followed links out of the *rendered* DOM,
which is the step `render-pages.mjs` does not take and the reason
`_rendered.json` is mostly home pages. That turned home-page-only shells into 66
readable pages and produced 14 of the 24 `free` verdicts.

Quotations were never typed by me. Each decision names a page and a distinctive
fragment; a writer script finds the fragment in the stored text and lifts the
surrounding sentence out verbatim. A fragment that is not there fails the row
and writes no verdict. Every quote is one contiguous span of one page,
whitespace collapsed and nothing else changed.

## Result

| verdict | rows |
|---|---|
| `free` | 24 |
| `onsite` | 4 |
| `mixed` | 1 |
| none | 86 |

Of the 86: 54 were read (often 5–7 pages, 20,000+ characters) and say nothing
about who may see the records; 10 are robots-disallowed; 13 answered an HTTP
error twice; 5 render essentially no text even in a real browser; 4 never
answered.

`confident` is `true` on three rows only: the two whose quoted sentence itself
rules out a login and a charge (Haute-Vienne's *librement accessibles en ligne*,
Saône-et-Loire's *accessibles gratuitement et à toute heure*) and Nice, whose
two consecutive sentences state both halves of `mixed`. Everywhere else the
quote establishes that records are online without saying whether an account is
needed, and `confident: false` is where that gap is recorded. No `onsite` row is
confident.

## Judgements I was unsure about

1. **Where I drew the line between `free` and `mixed`.** Nearly every French
   archive has some series online and the rest on paper in the reading room. If
   that counts as `mixed`, `mixed` is the answer for all of them and says
   nothing — the *salle de lecture* mistake in a new costume. So I treated **the
   digitisation frontier as not a mixed case**: Manche's registers to 1892
   online with later ones only on the premises is `free`, and so is Sarthe's
   census online to 1946 and in the room to 1968. `mixed` is kept for one row,
   Nice, where the split is by series and deliberate: Nice says outright that
   the niçois état civil is *not* on its site, by arrangement with the
   Alpes-Maritimes, while other series are. On the literal reading of the
   vocabulary instead, Manche, Sarthe, Brive and Hautes-Alpes are the rows that
   would move.

2. **Auxerre, on a newspaper.** The only sentence about anything online is *Le
   grand quotidien icaunais est en ligne pour les années 1898 à 1940*. Its
   Documents en ligne menu lists état civil and registres paroissiaux, but only
   as menu labels. I recorded `free` on the newspaper, because it does establish
   that this archive publishes scans anyone may open. It is the weakest of the
   24 and the one I would drop first.

3. **Tarbes and Thionville: digitised does not mean online.** Tarbes says its
   parish and civil registers are *numérisés et consultables en salle de
   lecture*, and *la consultation … se réalise exclusivement en salle de
   lecture*. A phrase-matcher would have read `numérisés` and written `free`.
   Thionville's registers are *consultables sur microfilms en libre accès* —
   open-shelf microfilm in the building. Both `onsite`, neither confident.

4. **The Fabrique des savoirs is a third instance of the *accès libre* trap.**
   *La consultation est libre et gratuite et se fait exclusivement sur place*:
   free of charge, and only if you are standing there. `onsite`.

5. **Poitiers I left blank, and it looks placeable.** Its pages say the
   duplicates of its registers are online — on the *Vienne departmental* site,
   not its own — and explain how to register in its reading room. Under the rule
   that a reading room proves nothing, and with nothing saying what Poitiers
   itself publishes, there is no verdict to write.

6. **Nine sites where I can see the shape of the answer but not the sentence.**
   Côte-d'Or, Marne, Aube, Indre, Hautes-Pyrénées, Alpes-de-Haute-Provence,
   Nîmes, Landerneau and Var all have an *Archives numérisées* or *État civil en
   ligne* section in their navigation, and several are certainly free in
   practice. Not one carries a sentence saying so on the pages I read. They are
   the highest-value re-reads: a person who opens the viewer and sees images
   without logging in can settle each in a minute.

7. **418 is a bot gate and I treated it as one.** Six sites answer HTTP 418 to
   our user-agent (Colombes, Meudon, Sceaux, Valence, Ariège, Tarn) and two
   answer 403 (Saint-Quentin, Landes). Retried once, politely; same answer;
   recorded; left alone. No browser was sent at those — the browser was used
   only on sites that answered 200 with a JavaScript shell, which is rendering,
   not getting around a refusal.

8. **The ten robots-disallowed rows were re-asked, not re-fetched.** The polite
   retry the brief allows was a second read of `robots.txt`; where it still
   refused, the pages themselves were never requested. Seven of the ten refuse
   `robots.txt` itself with a 403, which under the standard means disallow-all.

9. **Grenoble came back from the dead.** Recorded `http/503`; on the one retry
   it answered 200 and is now `free`. Two of the other 503s (Haguenau,
   Tourcoing) failed again.

10. **`data/survey-verdicts.json` is a bare JSON list**, exactly the shape asked
    for, which means it declares no `source` or `licence` of its own. Provenance
    is therefore only here: pages fetched 2026-09-28 with the project's own UA,
    quotations from the providers' own sites, verdicts mine.

---

# JOB 2 — 686 stranded record groups

## What was done

`data/gazetteer.json` is GeoNames cities5000 and **carries no state, province or
region at all**, so name-only matching cannot be repaired against it: there is
nothing in the file to check a state against. The authority for this pass came
from Wikidata, through the QLever endpoint `harvest-archives-wikidata.py`
already uses:

- 3,099 US counties, parishes and boroughs with their state and their **county
  seat's coordinates** (3,050 have a seat);
- 8,376 Italian comuni with their province;
- 3,407 Dutch municipalities, current and abolished, with their province — the
  abolished ones matter, because Odoorn and Havelte were municipalities during
  the 1811–1942 registration and are now parts of other communes.

Nothing is placed on a name. A US row needs its collection titles to name one
state, that state to hold exactly one county of the name, and the row's own
filing paths not to name a different state. An Italian row needs the province in
its title (*Italy, Lecce, Civil Registration*) to hold exactly one comune of
exactly that name. Coordinates are the county seat or the comune, to 4 decimals.

## Result

| | rows | volumes |
|---|---|---|
| placed | 255 | 225,960 |
| left | 431 | 196,399 |

US 120 rows / 181,296 volumes · Italy 121 / 41,370 · Netherlands 14 / 3,294.

## Two things in the existing data the next person should see

1. **Some of the 28 already-placed rows are in the wrong state.** `Etowah` sits
   at 35.3176, −82.5943 — Etowah, *North Carolina* — on a collection titled
   *Alabama, Estate Files*; Etowah County, Alabama's seat is Gadsden, 34.0101,
   −86.0104. `Turner` is at Turner, *Maine* on *South Dakota, School Records*
   (Turner County SD's seat is Parker). `King` is at King, *North Carolina* on
   *Washington, County Records* (King County WA is Seattle). All three carry the
   `why` "name, one candidate in US", which is exactly the failure mode: one
   candidate in the gazetteer is not one candidate in the country, because the
   gazetteer holds villages and the collections mean counties. I did not touch
   `data/unplaced-placed.json`; those three rows want a correction pass.

2. **The `cc` field disagrees with the catalogue on 58 rows, and `cc` is the
   field I was told to trust.** All 29 rows tagged `GE` are US county names
   whose every collection title names a US state — *Greene* with *Alabama,
   Estate Files*, *Wayne* with *Michigan, Probate Records*. Nineteen tagged `CA`
   are the same (*Middlesex* with *Massachusetts, Land Records*, *Kent* with
   *England, Kent, Manorial Documents*), and ten tagged `AU` (*Bibb*, *Baldwin*,
   *Blount* — Alabama counties). The code looks like a record of where a name
   happened to match rather than where the books are. Placing them in Georgia
   the country or in Australia would be the Perth-Scotland error again; placing
   them in the US would override the field the brief calls authoritative. So all
   58 are left, each saying that the code and the catalogue contradict each
   other. **If `cc` here is derived from a gazetteer match rather than from the
   collection, that is the bug to fix before this queue is worked again** — it
   would unlock 18,177 + 20,350 + 6,417 volumes.

## Judgements I was unsure about

1. **Two mistakes I made and caught.** *Cattolica* was about to be placed at
   Cattolica on the Adriatic, in Rimini, on the strength of its filing path,
   while its collection title says *Italy, Agrigento* — meaning Cattolica
   Eraclea in Sicily, 700 km away. The fallback to a path's province is now
   allowed only where the title names a **region** rather than a province
   (*Italy, Toscana*, which is not province-level evidence at all) or where the
   pair is a territorial transfer I can name: Caserta → Frosinone/Latina/Isernia
   (Terra di Lavoro, carved up in 1927), Napoli → Latina (Ventotene, 1934),
   Novara ↔ Verbano-Cusio-Ossola (1992). Twelve rows rest on that allowance.
   Separately, `Washington County` was being refused for the right outcome and
   the wrong reason: the state-matcher was reading the word *Washington* inside
   the row's own name in its own path and calling that evidence about where the
   row sits. It now ignores the row's own name — nine rows are called
   Washington, Wyoming, Indiana or Nevada.

2. **How much dominance a state needs, which is the judgement the whole US half
   turns on.** A flat percentage cannot tell *Pottawatomie* (Kansas 130,
   Oklahoma 122 — a coin toss wearing a 52% majority) from *Brunswick* (North
   Carolina 731, Virginia 74, where the runner-up is a different record type ten
   times smaller). So: where the name is a county in more than one state, the
   leading state must lead the next by **5 to 1**, and no row is placed unless
   one state carries three quarters of the volumes whose title names a state.
   That refused 23 rows, including *Clark*, *Knox*, *Suffolk*, *Seneca* and
   *Shelby*. It also admits *Marshall* at 18:1 (Alabama 1,064, Minnesota 58) and
   *Perry* at 21:1 — both names that repeat across a dozen states, both placed
   on title evidence alone. To be stricter, those two plus *Montgomery County*,
   *Polk County* and *Jackson County* are where to look.

3. **A dot is one place and some rows are two.** *Mecklenburg County* is 8,341
   volumes of *North Carolina, Estate Files* and 74 of *Virginia, Death
   Certificates*. It is placed at Charlotte, which is right for 99% of its books
   and wrong for 74 of them. Every `why` states the split, so the arithmetic is
   visible in the row and not only here.

4. **`Essex County` and `Washington County` were both refused by the path check,
   and both would otherwise have gone to the wrong state.** Essex's titles say
   Vermont 1,379; its paths all read *Massachusetts › Essex County › Superior
   Court at Salem*. Washington's titles say North Carolina; its paths read
   *Maine › Washington County › Court of Common Pleas at Machias*. Where title
   and path disagree, nothing settles it.

5. **158 Italian rows left, 108 of them for the same reason:** the name is not a
   comune. *San Giorgio* under Taranto is a truncation of San Giorgio Ionico;
   *Toscana* is a region filed as a place name and appears under 106 different
   paths; *Baronissi e frazioni* I did place (the suffix means "and its
   hamlets", and the dot is the comune), but *Cremona e Corpi Santi* and the
   other compound names I did not. Fuzzy-matching a truncated comune name
   against 8,000 candidates is precisely how a family's registers end up in the
   wrong province, so none was guessed.

6. **Hungary I left entirely (20 rows, 15,288 volumes), on purpose.** Every
   Hungarian row is a historical county — Vas, Somogy, Zala, Heves — and every
   collection title is the same string, *Hungary, Civil Registration,
   1895-1980*, which corroborates nothing. The filing paths do name the seats
   (*Vas › Szombathely*), so the answers are probably there; but the rule is
   corroboration from the title, and this project has already sent Somogy to
   Pécs once.

7. **Canada I left too**, and a handful are genuinely placeable: *Annapolis* and
   *Cape Breton* carry *Canada, Nova Scotia, Probate Records* and are not
   ambiguous. I did not build a Canadian authority for three rows. One CA row,
   *Supreme Court* (257 volumes, *Canada, British Columbia, Estate Files*), is
   not a place name at all and never will be; another, *Ile-de-Montréal,
   Lapraire, Chambly, Va…*, is four judicial districts in one string.

8. **A county seat is not a county.** The brief asked for the seat or the
   administrative centre, so every US coordinate is the seat from Wikidata's
   `P36` — Winston-Salem for Forsyth, not the county's middle. For rows whose
   books are spread across a county this puts the dot in the courthouse town,
   which is where the estate files actually are.

---

## The build gate

`scripts/check-data.py` reports 58 errors in a fresh worktree before anything I
did, all of the form "*imports X … that file is not there*":
`site/public/index.json`, `regions.json`, `providers.json`, `archives-osm.json`,
`cemeteries-wikidata.json`, `churches-wikidata.json`,
`site/src/data/places-full.json`, `collections-full.json`, `surnames.json` and
`data/surnames.json` are all generated and all gitignored, and `build.py` cannot
regenerate them here because `data/fs-volumes-world.json.gz` is a release asset.
I copied those ten files in from the main checkout — they are gitignored, so
`git status` shows only my two new files — and the gate then runs to the end and
prints **data is sound**, with both new files in place. I also diffed the
failure list before and after adding my files: identical.

So the honest statement is: the gate passes on this data, and it cannot pass in
any worktree that has not first been given the build's own output.

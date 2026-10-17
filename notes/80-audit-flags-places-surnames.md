# Audit of flags, places and surnames — 16 October 2026

Every number here was measured from the files in this repository on the day,
with a script, and none is estimated. Where something could not be measured it
says so at the end. The question asked: where could coverage grow, what would
make the sourcing stronger than what other sites show, and what stands between
us and "there is no question about accuracy" — the Netherlands example being the
standard to meet.

## The short version

**Strong, and worth saying so on the site:**
- Surnames carry real provenance: thirteen national statistical registers, each
  named, licensed and dated, and every country attestation says what kind of
  evidence it is.
- Coordinates and countries agree: 7,342 of 7,355 curated places. The four
  exceptions are a policy question (Crimea), not an error.
- 93% of places that hold books (1,158 of 1,247 testable) have a same-name
  gazetteer row within 25 km of their point. After today's corrections, no
  confirmed errors remain from that test.
- The grey is honest: 85% of the map says "nobody has walked this one yet".

**Weak, and these are the ones that would be quoted against us:**
1. **The flags cite nothing.** All 210 pages end with one boilerplate line,
   *"Compiled from Wikipedia, Flags of the World, and Britannica… pre-19th-century
   swatches are informed reconstructions, not official specifications."* No era
   has a source field. By its own footer this is a compilation of the three
   sources every other site uses.
2. **A third of the flag images are not flags.** Captions on 337 eras say
   "placeholder", 173 say "no flag", 83 say "reconstruction".
3. **85% of the map is grey, and the colour is in the wrong places.** Italy has
   8,703 dots and 1.7% coloured; Czechia 4,989 and 1.8%; Russia 0.1%; Brazil
   0.1%; Slovakia none of 1,297. Ireland is 95% and the Netherlands 92%.
4. **61% of surname variant links are algorithmic.** 635,942 of 1,036,465 are
   "sounds alike"; 8,292 (0.8%) were linked by a person.
5. **Only 42.5% of dots can answer "whose archive was this ground".** 41 record
   regions cover 33 countries.

## Flags — 210 countries, 1,472 eras

| measure | result |
|---|---|
| eras with a source field | **0 of 1,472** |
| pages with any outbound citation link | **0 of 210** |
| eras marked approximate ("c.") | 361 (25%) |
| eras with no numeric start / no end and not "present" | 192 / 139 |
| consecutive era pairs with a gap / an overlap | 40 / 36 of 1,089 checkable |
| eras with an id but no flag image | 8 |
| eras with no id at all | 10 |
| captions saying placeholder / no flag / reconstruction | 337 / 173 / 83 |

Gaps and overlaps are not all errors — China's Song and Yuan coexisted, Angola's
kingdoms overlapped — but nothing in the data says which are intended, so a
reader cannot tell. Croatia lists 1991–1995 before 1947–1990.

**Defects found by this audit (fixed or being fixed):**
- The Dutch Republic split into Prinsenvlag and Statenvlag left `era-flags.json`
  stale: `netherlands era-1650` has no image and the 1581 era still shows the red
  flag. `extract-era-flags.py` has to be re-run after any page edit, and nothing
  makes it.
- Flag cards named fewer crowns than their page had eras on 137 of 210 countries
  (268 eras missing). Fixed earlier today by deriving them.
- Crimea and Sevastopol are declared Ukraine while our outline puts them in
  Russia. That needs a stated policy, not a silent default.

**What would make the flags beyond question:**
1. **An evidence class on every era**, shown on the page: *attested* (a
   documented flag with a primary source), *reconstructed*, *symbolic*
   (banner, standard, emblem), or *none* (placeholder). The captions already
   half-say this; make it a field.
2. **A source on every attested era** — the legal text or decree for modern
   flags, a dated primary or catalogue source for older ones — with an archived
   copy of the page cited, so a link cannot rot.
3. **Reconcile automatically against an independent authority.** Wikidata
   carries flag images with start and end qualifiers for many countries, not all;
   diffing our dates against what it has gives a public list of disagreements.
   That list is the review queue. How complete it is has to be checked first.
4. **Mark gaps, overlaps and disputes deliberately** (`concurrent`, `disputed`,
   `interregnum`) so an unexplained one fails a gate.
5. **One source of truth.** The page, the era table, the card, the art file and
   the map's flag layer are five copies of one fact, and today's two bugs were
   copies disagreeing. Generate the rest from one record and gate that the
   counts match.

## Places

**What the 7,355 curated rows are.** 5,484 hold no collection at all: Irish
townlands (2,415), GeoNames admin areas (1,978) and Scottish parishes (870) exist
so a name can be found. The record-holding evidence is 1,468 hand-walked rows
and 624 promoted from the FamilySearch catalogue.

**What the map draws: 55,784 dots**

| class | dots | share |
|---|---|---|
| free | 3,232 | 5.8% |
| index | 3,084 | 5.5% |
| account | 2,001 | 3.6% |
| catalogue + onsite | 25 | 0.0% |
| **unsurveyed** | **47,442** | **85.0%** |

No dot is coloured mixed or paid, by design: only rank 2 or better colours a
dot, so Ancestry, MyHeritage and Findmypast coverage is not drawn at all.

**Where the grey is, ranked by size:**

| country | dots | coloured |
|---|---|---|
| Italy | 8,703 | 1.7% |
| Czechia | 4,989 | 1.8% |
| United States | 3,749 | 7.7% |
| Russia | 3,522 | 0.1% |
| Sweden | 2,378 | 0.6% |
| Mexico | 2,117 | 2.2% |
| Brazil | 2,022 | 0.1% |
| Spain | 1,837 | 0.7% |
| Ukraine | 1,679 | 0.2% |
| Slovakia | 1,297 | 0.0% |

52 countries are entirely grey (4,157 dots). 133 of the 237 listed countries have
no dot at all. The three biggest are exactly the gaps the unsent letters on
`/errands/` would close: Italy (Antenati), Czechia (CAM) and Sweden (Riksarkivet).

**Accuracy**

| test | result |
|---|---|
| declared country vs coordinates, curated places | 7,342 of 7,355 agree; 4 outliers, all policy |
| place's country vs the countries of the collections holding its books | 78 claims over 41 places failed; 36 removed, 5 historical filings kept |
| place's own names vs a same-name gazetteer row within 25 km | 1,158 of 1,247 confirmed; 86 untestable; 0 confirmed errors |
| the hand-walked bucket the audit flagged | 6 moved, 4 documented correct, 6 left (no better candidate) |

The mistakes found today shared one cause: a wrong lookup fixed a month ago whose
earlier output nothing re-checked. Both tests above are cheap and need nothing
external, so they should be gates that run on every build, not one-off audits.

**Record regions.** 41 regions point at 33 countries and cover 42.5% of dots.
The rings are approximate by design, which is fair, but overlapping rings gave
one ground two histories: 21 Prekmurje places fell in Carniola and 15 in Hungary
(fixed in this change by a Prekmurje region, calibrated against 47 settlements,
none misclassified).

**Providers.** 565, of which 120 (21%) are `unsurveyed`; 23 have no location;
44 countries have providers but none free, account or index.

**What would make the places beyond question:**
1. **An evidence tier on every dot**, shown: *hand-read* (someone opened the
   register), *catalogue-confirmed* (the collection's own title names the place),
   *inferred* (matched through a gazetteer). The data already distinguishes them;
   the reader cannot see it.
2. **Run the two accuracy tests in CI.** Add the countries-vs-collection test and
   the alt-name-vs-gazetteer test to `check-data.py`.
3. **Stable identifiers.** Attach a Wikidata and a GeoNames id to every place so
   any claim can be checked against a record outside this project.
4. **Resolve the 74 "consistent but unnamed" catalogue places and 6 unresolved
   hand-walked ones** with a person and a source, not an inference.
5. **Close coverage where it is cheapest**: the three letters, then Slovakia and
   Belarus, which are all grey and probably each have one national portal.

## Surnames — 960,005 names

**Strengths.** Thirteen registers are named with licence and harvest date (Statbel,
Danmarks Statistik, INE, DVV (Finland), INSEE, DZS, CSO, SSB, PESEL/dane.gov.pl,
SURS, two US censuses, and Italian comuni). 1,213,158 country attestations are
register-based and 488 archive-based; none is inferred. 96.6% of names attest at
least one country. Every variant and country carries a `how`.

**Weaknesses.**
- Variant links by evidence: sounds-alike 635,942 (61%), spelling 246,714,
  grammar 145,517, **curated 8,292 (0.8%)**. 75,154 names have only
  algorithmic variants. "Aa" lists Ai, Ao, Au, Ay as variants, which is noise.
- **The registers are lopsided.** Attestations: Denmark 290,156; Poland 259,445;
  France 218,979; United States 313,924; Belgium 104,060; Spain 86,177; Italy
  31,017; Slovenia 28,342; Finland 22,930; Norway 3,595; Ireland 908. Not
  present: Germany, the UK, the Netherlands, Portugal, Austria, Sweden, Czechia,
  Hungary. A name's "countries" therefore reflects which registers we hold, not
  where it occurs.
- **The snapshots differ in date**: Denmark 2020, France 1891–2000, Croatia 2011,
  the US 2000 and 2010, Belgium 2026, Ireland babies 2023–25 only. A comparison
  across countries compares different decades.
- 24,609 names (2.6%) earn a page.

**What would make the surnames beyond question:**
1. State on every name page which registers were consulted and which were not, so
   absence is never read as evidence of absence.
2. Show only evidence-backed variants by default; keep sounds-alike behind a
   clearly labelled "possible, unverified" disclosure.
3. Add the missing registers, starting with the Netherlands (the Meertens letter is
   drafted), then Sweden, Germany, Austria, Czechia, Portugal and the UK. Each
   needs a national statistics source checked first; none is assumed to exist.
4. Date every distribution, and never plot two countries from different decades on
   one scale without saying so.

## A programme that makes the question go away

1. **Evidence class and source on every claim** (flags first, then places, then
   variants), visible on the page as "how we know this".
2. **Independent reconciliation published as a dashboard**: disagreements with
   Wikidata, GeoNames and the national registers, so accuracy is demonstrated, not
   asserted.
3. **Every accuracy test a build gate.** The two gates added today (runtime
   fetches must exist, flag crowns derive from eras) each closed one class of
   error after a person found it. The stale art file is a third class nothing
   yet checks.
4. **Named external review.** The four letters already open this for four
   institutions; add a vexillological society for flags and one genealogical
   society per region, credited on the pages they reviewed.
5. **Archived citations and versioned releases.** A snapshot of every cited page,
   and a dated dataset release with a changelog, so "Record Atlas, 2026-10" is a
   stable thing to cite.

## Ranked by value for effort

| # | action | effort | why |
|---|---|---|---|
| 1 | era evidence class + source field, flags | medium | removes the largest "no better than Wikipedia" exposure |
| 2 | send the Czech, Italian and Swedish letters | low (yours) | up to 16,070 grey dots become answerable (Czech letter already sent) |
| 3 | countries-vs-collection and alt-name gates in CI | low | would have caught every place error found |
| 4 | one source for flag era data; gate that counts match | medium | kills the whole drift class |
| 5 | hide sounds-alike variants behind a disclosure | low | removes 61% of the weakest content from first view |
| 6 | add Netherlands, Sweden, Germany surname registers | medium | fixes the lopsidedness |
| 7 | Wikidata/GeoNames ids on every place | medium | makes claims checkable from outside |
| 8 | Crimea/Sevastopol/Melilla policy | low | one stated rule |

## What this audit did not do

- It did not check any flag's colours against an official specification; there is
  no ground truth in the repository to check them against.
- It did not verify historical dates era by era. It measured their structure
  (gaps, overlaps, missing fields), not their truth.
- It did not compare against other sites. Statements about what other sites show
  are general knowledge, not measurements, and should be checked before being
  published.
- Surname meanings and origins are not in the dataset, so none were audited.
- The 86 untestable places have no gazetteer row to test against.

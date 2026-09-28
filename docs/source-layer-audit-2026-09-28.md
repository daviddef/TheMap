# The source layer: audit and research plan (no network available)

Per `docs/cloud-brief-sources.md`'s own egress check: this session confirmed
(again — the same restriction blocked the earlier gazettes-and-surnames
brief) that it has no outbound access beyond GitHub/npm-class hosts. Every
candidate archive, gazette and newspaper site tested 403s at the proxy
before the request leaves the machine. `scripts/recheck-providers.py` and
`scripts/check-links.py` need the same access and would fail identically.

**No rows added to `data/providers.json`.** A row means somebody opened it,
and nobody did, this session. What follows is the audit and the research
plan the brief asks for instead.

## Headline finding: the real problem is bigger than "68 one-source countries"

Structurally, `data/providers.json` is clean — no duplicate ids, no bad
`access` values, no unparseable `checked` dates, no `http://` URLs, no
duplicate URLs or names. `check-data.py`'s own provider checks would pass
today. **The real weakness is elsewhere, and it's worse than the raw count
suggests:**

- **316 of 520 rows (60.8%) are `access: "unsurveyed"`.** 240 of those 316
  carry the same tell in `what`: "Harvested from Wikidata and not yet
  opened" (a further 305 rows carry a `wikidata` id field even where the
  prose doesn't say so). This is the same population the site's own
  "Nobody here has opened these" notices refer to elsewhere (e.g.
  `coverage.astro`, `place/[id].astro`) — I could not confirm whether the
  brief's own cited figure of 204 refers to this exact count or a related
  one measured differently or earlier; either way, 316 is what's in the
  file today. Two of these unsurveyed rows are Mexico's *entire* source
  list (see below): a country the brief's own table shows as "2 sources"
  in fact has zero opened ones.
- **Three of the ten starved giants' "one source" is a neighbouring
  country's archive, not their own — correctly labelled, but worth stating
  plainly:**
  - **RU**'s one row is `bundesarchiv` — the *German* Federal Archives,
    tagged `[DE, PL, RU, LT]` for "Prussian provincial administration...
    ground that is no longer German." That is real and useful for the
    ground the Prussian empire once held (Kaliningrad's old East Prussia,
    parts of the Baltic march) and says nothing about Moscow, the Volga, or
    Siberia. Russia's own paper is not represented at all.
  - **BY**'s one row is `szukajwarchiwach` — *Poland's* state archive
    portal, tagged `[PL, UA, BY, LT]` for "ground now in Ukraine, Belarus
    and Lithuania" that was once Polish. Real for the old Kresy Wschodnie
    (western Belarus, pre-1939 Polish administration), silent on Minsk and
    everything east of the old Riga line.
  - **MD**'s one row is `arhivele-ro` — the *Romanian* national archive,
    tagged `[RO, MD]` for "Bukovinan and Transylvanian registers for the
    years those provinces were Romanian." Real for interwar Bessarabia,
    silent on Transnistria and the Soviet-era administrative record.

  These three rows are correctly described and worth keeping — the
  project's own instinct to attach ground to the filing system that
  actually held it is right. But a researcher reading "Russia: 1 source"
  and clicking through finds nothing about Russia itself. The research
  plan below treats RU, BY and MD as **effectively zero-source**, not
  one-source.
- **`at` is missing on 12 rows — every one of them a major global
  aggregator**: `ancestry`, `archive-org`, `billiongraves`, `familysearch`,
  `findagrave`, `findmypast`, `geneanet`, `geni`, `myheritage`, `wikitree`,
  plus `archieven-nl` (which is NOT global — a real Dutch national portal
  missing a seat for no evident reason, worth a look). Per the brief's own
  row format note, a missing `at` sends a row "to the bottom of every
  list" — so eleven of the most useful sources in the whole atlas are
  ranked last in every country they're attached to. This is a real,
  low-effort fix once someone with network access can confirm each body's
  seat (Lehi, UT for Ancestry; Salt Lake City for FamilySearch; Or Yehuda,
  Israel for MyHeritage and Geni; San Francisco for Internet Archive, etc.)
  — named here rather than guessed into the data, since a wrong coordinate
  is worse than a missing one for exactly the reason this project keeps
  giving.
- **One pair of rows shares an identical `countries` list and is worth a
  second look, not necessarily a fix**: `hungaricana` and `mnl` (Magyar
  Nemzeti Levéltár) both carry exactly `[HU, RO, SK, RS, HR, UA]`. Hungary's
  National Archives and its own Hungaricana aggregator plausibly do cover
  the same historic-Hungarian ground — this may be correct rather than
  copied — but an identical six-country list on two different institutions
  is exactly the pattern the brief asks to distrust by default. Worth an
  independent read of both when there's network, not assumed fine because
  the other one says so.
- An id/name mismatch sweep (string-similarity heuristic) flagged 30 rows;
  reading them, all 30 are legitimate institutional acronyms (`agad`,
  `banq`, `nara`, `proni`, `yadvashem`, etc.) — **zero real errors**, noted
  so the next session doesn't re-run the same check expecting to find
  something.

## Per-country snapshot for the ten starved giants

| cc | places | sources (raw) | sources (real, after the neighbour-archive correction) |
|---|---:|---:|---|
| RU | 1,065 | 1 | **0** — the one row is Germany's archive |
| MX | 1,124 | 2 | **0 opened** — both rows are `unsurveyed` |
| BY | 358 | 1 | **0** — the one row is Poland's archive |
| AR | 207 | 1 | 1 (opened, `catalogue`) |
| PT | 148 | 1 | 1 (opened, `free`) |
| MD | 146 | 1 | **0** — the one row is Romania's archive |
| CO | 143 | 1 | **0 opened** — the row is `unsurveyed` |
| GT | 122 | 0 | 0 |
| BE | 563 | 2 | 2 (one `account`, one `mixed`) |
| ES | 376 | 2 | 2 (one `free`, one `mixed`) |

Six of the ten (RU, MX, BY, MD, CO, GT) have **no opened source of their
own ground at all** today, not "one" — worse than the brief's own table
shows, because that table counts rows, not verified rows.

## Research plan — candidate sources, every one unverified

Named from general knowledge of national archives and genealogy
infrastructure, **not fetched, not confirmed, not to be added as rows
without opening each one.** Confidence noted per candidate; URLs may be
stale or wrong — check before trusting, exactly as the brief asks.

### Russia (RU) — effectively 0 real sources, 1,065 places
- **РГАДА / RGADA** (Russian State Archive of Ancient Acts) —
  candidate `rgada.ru`. Holds pre-1917 fond collections; some are
  photographed and searchable online. *Medium confidence on the URL,
  low confidence on current access model.*
- **FamilySearch's Russian collections** are already reachable via the
  existing `familysearch` row (`*`), so not a new row — but worth noting
  Russia is one of the countries where FamilySearch's own coverage (mostly
  pre-1918 Orthodox church books for a subset of provinces) may be the
  single best actual answer to "where do I look for Russia," and nothing
  on the page currently says so under RU specifically.
- **Official gazette**: the Russian Empire's own gazette tradition
  (*Собрание узаконений и распоряжений правительства*) is real and
  historically rich, but I have low confidence any single modern portal
  digitises and serves the historical run for free — worth checking the
  Russian State Library's digital collections rather than assuming a
  government portal exists.
- **Searched for and not found (from memory, to be confirmed)**: a
  free, open, nationwide Russian civil-registration index equivalent to
  Poland's or France's — I am not aware one exists in digitised, openly
  searchable form; ZAGS (civil registration) records are generally closed
  and held regionally. Worth confirming this absence rather than assuming
  it, next time there's network.

### Mexico (MX) — 0 opened, 1,124 places
- **Open the two rows already there first**: `agn-mx` (Archivo General de
  la Nación) and `registro-civil-mx` (Mi Registro Civil) are both sitting
  unsurveyed. This is cheaper than finding new sources and should come
  before anything else for Mexico.
- **Hemeroteca Nacional Digital de México** (UNAM) — candidate
  `hndm.unam.mx`. A well-known, large digitised historical newspaper
  archive. *High confidence the institution and its digitisation project
  exist; medium confidence on the exact current domain.*
- **Diario Oficial de la Federación** (the federal gazette) — candidate
  `dof.gob.mx`. Historical archive reportedly reaches back into the 19th
  century. *Medium confidence.*
- Mexican civil registration is administered per-state, so there is
  probably no single national portal beyond `registro-civil-mx`
  (already listed, unopened) — worth confirming rather than searching
  further for a national one that likely does not exist.

### Belarus (BY) — effectively 0 real sources, 358 places
- **National Historical Archive of Belarus** (Нацыянальны гістарычны
  архіў Беларусі) — candidate `narb.by`, *low confidence on domain*.
- **radzima.org** — a long-running, community-run Belarusian genealogy
  and local-history portal. *Medium confidence it still exists and is
  relevant; volunteer-run sites are the most likely to have moved or
  closed.*
- **Searched for and not found (from memory)**: an official Belarusian
  gazette with open historical digitisation. Belarus's state publication
  infrastructure (`pravo.by`) appears, from general knowledge, to be
  current legislation only — worth confirming its absence, not assuming.

### Argentina (AR) — 1 real source, 207 places
- **Boletín Oficial de la República Argentina** (the national gazette) —
  candidate `boletinoficial.gob.ar`. Naturalisations and appointments are
  exactly the gazette content this brief wants. *Medium-high confidence
  the institution and portal exist; access model unconfirmed.*
- **CEMLA** (Centro de Estudios Migratorios Latinoamericanos) — well known
  in genealogy circles for digitised Buenos Aires port immigration/
  passenger records. Candidate `cemla.com`. *Medium confidence it's still
  operating and free — this project has had mixed results before with
  CEMLA-adjacent sites.*

### Portugal (PT) — 1 real source, 148 places
- **Diário da República** (the national gazette) — candidate `dre.pt`.
  *High confidence the institution exists and has deep historical
  digitisation; access model unconfirmed.*
- **Hemeroteca Municipal de Lisboa** — candidate
  `hemerotecadigital.cm-lisboa.pt`. Well-known digitised Portuguese
  newspaper archive. *Medium-high confidence.*

### Moldova (MD) — effectively 0 real sources, 146 places
- **Arhiva Națională a Republicii Moldova** (Moldova's own national
  archive, distinct from Romania's) — candidate `arhiva.gov.md` or a
  similarly-named government domain. *Low confidence on the exact URL —
  Moldovan government domains change often.*
- **Monitorul Oficial al Republicii Moldova** (the modern gazette) —
  candidate `monitorul.md`. Likely current-legislation only; historical
  digitisation depth unconfirmed.

### Colombia (CO) — 0 opened, 143 places
- **Open the existing row first**: `na-co-general-archive-of-the-nation-of-colombia`
  is `unsurveyed`.
- **Diario Oficial** (via Imprenta Nacional de Colombia) — candidate
  `imprenta.gov.co`. *Medium confidence.*
- **Biblioteca Nacional de Colombia**'s digitised newspaper holdings —
  exact portal name unconfirmed; worth checking whether it has a
  standalone hemeroteca digital comparable to Spain's or Mexico's.

### Guatemala (GT) — 0 sources, 122 places
- **Archivo General de Centro América (AGCA)** — Guatemala's national
  archive, historically significant for the whole former Captaincy General
  of Guatemala (colonial-era Central America), not just modern Guatemala.
  Candidate `agca.gob.gt`. *Medium confidence on domain, high confidence
  the institution and its importance are real — this is probably the
  single best candidate in this entire list for a "starved giant with
  zero sources."*
- **Diario de Centro América** (Guatemala's official gazette, published
  by the Tipografía Nacional) — worth checking for historical
  digitisation. *Low-medium confidence.*

### Belgium (BE) — 2 real sources, 563 places
- **Moniteur belge / Belgisch Staatsblad** (the national gazette) —
  candidate `ejustice.just.fgov.be`. *High confidence*: this is a
  well-known, free, full-text-searchable digitised archive back to 1831 —
  naturalisations, name changes, exactly the content class this brief
  names first. This is likely the single strongest, fastest win in the
  whole list.
- **Belgicapress** (KBR / Royal Library of Belgium's digitised newspaper
  archive) — candidate `belgicapress.be`. *Medium-high confidence.*

### Spain (ES) — 2 real sources, 376 places
- **Boletín Oficial del Estado / historical Gaceta de Madrid** — candidate
  `boe.es`. *High confidence*: BOE's digitised historical archive
  (the Gaceta de Madrid run) reaches back to 1661 and is free and
  full-text. This is arguably the best single gazette candidate across
  every country on this list, given the depth of the historical run.
- **Hemeroteca Digital, Biblioteca Nacional de España** — candidate
  `hemerotecadigital.bne.es`. *High confidence*: a large, well-known,
  free digitised Spanish newspaper archive.

## What this plan deliberately does not do

It does not add a single row to `data/providers.json`, per the brief and
per this session's own standard for this project: a row is a claim that
somebody opened a page and saw what it holds, and nobody did that here.
Every URL above is a lead, not a source, and every one needs the same
treatment `bundesarchiv`/`szukajwarchiwach`/`arhivele-ro` already got:
opened, read for what it actually covers (not inferred from its name),
and — if it turns out to gate or block, recorded as declined rather than
routed around.

## Counts, unchanged

- Providers: 520 (no rows added)
- Countries with at least one: 104 (this audit's own count; the brief's
  table says 103 — a one-country difference likely reflects the data
  moving in the day between the brief being written and this audit
  running, not a discrepancy in method)
- Countries resting on exactly one: 68 (matches the brief exactly) — and,
  per the neighbour-archive finding above, at least 3 of those 68 (RU, BY,
  MD) are better described as resting on zero sources of their own ground.

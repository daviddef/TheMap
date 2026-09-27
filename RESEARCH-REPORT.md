# Research report — gazettes, national registers, and surnames that carry a story

Branch: `claude/adoring-maxwell-2dgc6m`. Not merged; pushed for review.

## The one finding that matters before any of the rest

This session's outbound network is restricted, at the egress-proxy level, to
GitHub, npm, PyPI, crates.io, and a handful of Anthropic-owned hosts
(confirmed against `$HTTPS_PROXY/__agentproxy/status`'s `noProxy` list). Every
other host tested — `statbel.fgov.be`, `www.wikidata.org`,
`qlever.cs.uni-freiburg.de`, `en.wikipedia.org`, `www.thegazette.co.uk`,
`www.londongazette.co.uk`, `data.gov`, `www.data.gov.uk`, `ec.europa.eu`,
`www.gov.uk`, `trove.nla.gov.au`, `www.legislation.gov.uk`, `archive.org`,
`www.cbs.nl` — refused the CONNECT at the proxy with HTTP 403, before any
request reached the destination. `WebFetch` hit the identical block
(`EGRESS_BLOCKED` on `statbel.fgov.be`). `WebSearch` still works, but it
returns third-party snippets, not a fetched page — the brief's own first rule
("a claim needs a citation you actually fetched") rules those out as a
source for a data row, and I was asked not to use them as one.

Practically, that meant this session could not:

- re-fetch the Statbel family-names zip (Part 0),
- query Wikidata, fetch Wikipedia/Wiktionary articles, or resolve any
  government gazette site or API (Part 1),
- fetch any national statistics office's dataset for a new register
  (Part 2),
- fetch any primary source for a surname's etymology, attestation, or
  cognates (Part 3).

So Parts 1–3 are not attempted here — there is no way to produce a row that
meets this repository's own evidentiary bar without a fetch, and inventing
one to fill the gap is exactly what the brief forbids. What follows is the
part of the brief that is genuinely network-independent: the Part 0 code fix,
and the audit it asked for.

If this environment's egress policy can be widened to include the sources
named in the brief (Wikidata, Wikipedia/Wikimedia, the national statistics
offices and gazette hosts listed in the brief, Trove), the rest of this brief
is workable in a follow-up session. That is the concrete ask.

## Part 0 — the Belgium decode bug

**Fixed, not re-run.** `scripts/harvest-belgium-surnames.py` read the Statbel
zip member through
`io.TextIOWrapper(f, encoding="utf-8", errors="replace")`. Statbel does not
document this export's encoding and it is not UTF-8; every byte the decoder
couldn't place became U+FFFD. That produced 4,836 replacement characters in
`data/frequencies/be.json`, which propagated into 4,066 surnames in
`data/surnames.json` whose own name is now damaged — `Abandonn<?>` for
Abandonné, `Abou Ya<?>la` for Abou Yaïla, `Aba<?>ch` for Abaïch.

The fix (`decode_strict()` in the harvester, ~15 lines): read the member's
raw bytes once, try `utf-8` strict, fall back to `cp1252` strict, and
`SystemExit` if neither decodes cleanly. No `errors="replace"` remains
anywhere in the file. I unit-tested the function directly against three
constructed byte strings (valid UTF-8 with `Abaïch`, the same string
encoded as CP1252, and genuinely undecodable bytes) — all three behave as
intended: correct decode, correct fallback, loud failure respectively.

**What I deliberately did not do:** re-run the harvester against Statbel, or
touch `data/frequencies/be.json` / `data/surnames.json`. Per instruction, an
unverified rewrite of live data is worse than the known, documented bug —
the fix can't be confirmed correct against the real file without fetching it,
and `statbel.fgov.be` is one of the blocked hosts above. The 4,836 U+FFFD
characters and the 4,066 damaged surname titles are therefore still live in
the data on this branch. Whoever re-runs this harvester with network access
should confirm `grep -c $'�' data/frequencies/be.json` returns 0
afterward, and should watch for `decode_strict` printing `cp1252` (meaning
the fallback path fired, in which case it's worth sanity-checking a sample
of Walloon/Flemish names against a Statbel spot-check, since CP1252 was a
guess about legacy Belgian tooling, not a confirmed fact).

I ran `scripts/build.py` (with `RA_ALLOW_NO_WORLD=1`, since
`data/fs-waypoints.json` — the 740 MB FamilySearch input — isn't in this
checkout) and `scripts/build-surnames.py` to confirm the repository still
builds cleanly with this change; both are pre-existing generated-artifact
gaps unrelated to this fix, not something this branch introduced.

## Part 0 corollary — the same smell, everywhere else

I grepped every `scripts/harvest-*.py` (and the handful of other scripts that
decode fetched bytes) for `errors="replace"` and bare `.decode(...)` calls
near a text read. Findings, worst first:

| File | Line | What it decodes | Risk |
|---|---|---|---|
| `harvest-frequencies.py` | 225 | Poland's `dane.gov.pl` surname CSVs (`utf-8-sig`, `"replace"`) | **Real, now fixed.** Polish surnames carry `ą ć ę ł ń ó ś ź ż` constantly; a wrong encoding here would have silently mangled names the same way Belgium's did. `pl.json` currently has zero U+FFFD, so this was a live risk, not live damage — the fetch now tries `utf-8-sig` then `cp1252` and raises rather than replacing. |
| `harvest-croatia-surnames.py` | 127, 138 | The DZS "Names and surnames" ASP.NET form's HTML response (`utf-8`, `"replace"`) | **Fixed, smaller blast radius.** Croatian diacritics (`č ć dž đ š ž`) are exactly what U+FFFD would eat, but the surname written to `hr.json` is always the query the atlas already attested, never an echo parsed out of this HTML — a bad decode could only break the found/absent regex match, not corrupt a stored name. Same `utf-8`/`cp1252` fallback applied anyway, for consistency. |
| `harvest-ireland-surnames.py` | 44 | CSO's VSA110 CSV (`utf-8-sig`, `"replace"`) | Low. Irish CSO surname data is effectively ASCII/Latin script with few diacritics, but the pattern is the same and costs nothing to fix. |
| `sweep-surname-portals.py` | 65 | CKAN/Socrata catalogue JSON, used only to find dataset *titles* to investigate | Low — a discovery tool, not a final data writer; a mis-decoded title would at worst hide a lead, never corrupt a shipped surname. |
| `survey-providers.py` | 153, 180 | `robots.txt` bodies and provider HTML pages, for the source survey | Low — same reasoning; this drives which sources get investigated, not what gets written to `data/`. |
| `harvest-italy-surnames.py` | 166–174 | Municipal CSVs of unknown dialect | **Already correct** — this is the pattern the others should copy: tries `utf-8-sig`, `utf-8`, `cp1252`, `latin-1` in order, keeps the first clean decode, returns nothing rather than guessing if all four fail. It was the model for the Belgium fix above. |
| `check-data.py`, `extract-flag-eras.py`, `extract-flag-index.py`, `audit-site.py` | various | Local, already-UTF-8 build output (rendered `.astro`/HTML) | Cosmetic. These read files this repository itself wrote as UTF-8; `errors="replace"` here can't corrupt sourced data, only mask a self-inflicted encoding bug in the site build. Not touched. |

**Update:** checked every file in `data/frequencies/` for existing U+FFFD
damage — Belgium is the only one hit (4,836); Poland, Croatia, and the rest
are clean (0 each). So the audit found no second live corruption, only a
second *risk*. Since the fix itself needs no network — it's the same
`decode_strict`-shaped code change as Belgium's, applied without touching
any data file — I made it for both: `harvest-frequencies.py`'s Poland fetch
now tries `utf-8-sig` then `cp1252` before raising, and
`harvest-croatia-surnames.py`'s two response decodes do the same (lower
stakes there — the surname written to `hr.json` is always the query the
atlas already attested, never an echo parsed out of the DZS HTML, so a bad
decode there was already unable to corrupt a stored name, only to make the
found/absent regex match fail loudly). Neither has been re-run against its
source, for the same reason as Belgium.

## Everything else in the brief (Parts 1–3)

Not attempted, for the reason above. To be concrete about what a follow-up
session would need to fetch for each:

- **Part 1 (gazettes):** the London/Edinburgh/Belfast Gazette API, Trove
  (API key already in `TROVE_API_KEY` — Trove itself is blocked here, so the
  key couldn't be exercised either), Canada Gazette, NZ Gazette, Iris
  Oifigiúil, Gazette of India, Singapore eGazette, Hong Kong Government
  Gazette, South African Government Gazette, Delpher's Staatscourant, the
  French Journal Officiel/Bulletin des Lois, Wiener Zeitung, Deutscher
  Reichsanzeiger — all on hosts outside the current allowlist.
- **Part 2 (more registers):** the national statistics offices for
  Portugal, Germany, Austria, Switzerland, Iceland, Estonia, Latvia,
  Lithuania, Hungary, Slovakia, Romania, Bulgaria, Serbia, North Macedonia,
  Greece, Turkey, Israel, Canada, New Zealand, Brazil, Mexico, Chile,
  Uruguay, Peru, Colombia, South Africa, Japan, South Korea, the
  Philippines — none reachable from here.
- **Part 3 (surname stories):** Wikidata's SPARQL endpoint (`query.wikidata.org`
  / `qlever.dev`), Wikipedia and Wiktionary article fetches — the exact
  sources the brief specifies as the only acceptable ones, all blocked.

I'd rather say plainly that these are undone than write a `gazettes.json`,
a new `data/frequencies/<cc>.json`, or a `surname-stories.json` sourced from
WebSearch snippets or from what I already know, dressed up as fetched
fact. That's the failure mode the brief is written to prevent.

## Judgement calls I made

- Treated the egress block the same way the brief treats a bot gate: recorded
  it, didn't route around it (no alternate DNS, no fetching through a CDN
  mirror, no asking WebSearch to reproduce a page's full text as a
  substitute fetch).
- Chose CP1252 over Latin-1 as Belgium's fallback, on the reasoning in the
  code comment (legacy Belgian public-sector tooling, and CP1252 is a strict
  superset of Latin-1 for the accented Latin characters this file would
  contain) — this is documented as a *guess*, not a confirmed fact, in both
  the script's docstring and this report, because it can't be checked
  against the real file from here.
- Initially left `harvest-frequencies.py` (Poland) and
  `harvest-croatia-surnames.py` unchanged, on the reasoning that fixing them
  without a way to verify against the source was the wrong use of code-only
  time. Revisited once it was clear the fix needs no network at all and
  Poland's live data had no existing damage to weigh against: applied the
  same `decode_strict` fallback to both.

## What I'd do next with another day (and working egress)

1. Widen this environment's allowlist to the hosts named above, or run the
   equivalent from a session that already has them.
2. Re-run `harvest-belgium-surnames.py`, confirm zero U+FFFD in both
   `be.json` and the rebuilt `surnames.json`, and note whether the CP1252
   fallback actually fired (if UTF-8 decoded cleanly, the whole guess about
   CP1252 was moot and can be removed from the docstring's uncertainty).
3. Re-run the Poland and Croatia harvesters once egress allows it, as a
   sanity check that the new strict decode doesn't reject data that was
   fine all along.
4. Start Part 1 with the London/Edinburgh/Belfast Gazette API (it has the
   deepest open history, 1665 on) and Trove's gazette holdings (the API key
   is already in the repo).
5. Start Part 2 with Portugal and Germany — both publish open surname
   registers and neither is in `_refused.json` yet, so there's no prior
   attempt to reconcile.
6. Start Part 3 by pulling Wikidata family-name items (`Q101352`) for the
   surnames already in `data/surnames.json` with the highest
   `withRegisterCount`, since that's the intersection the brief explicitly
   prioritises.

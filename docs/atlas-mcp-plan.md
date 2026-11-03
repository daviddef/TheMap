# Plan: a Record Atlas MCP server

Status: **plan only. Nothing is built.** Written 2 November 2026; numbers below were measured on this machine that day. Updated 3 November: the stale importer text in the `record-atlas-feedback` skill has since been fixed (see section 7, decision 5). This copy lives in the Atlas's `docs/`; a matching copy sits with the estate design guide in the private `claude-skills` repo, so keep the two in step.

## 1. What it is for

A session working on a family archive currently finds things in the Atlas by opening JSON files and applying the rules in the `record-atlas-feedback` skill by hand. The server would let any Claude Code session (any developer's) do the same through named tools:

- **Find:** a place by any name, who held it in a given year, who filed those years, what access costs, which volumes exist, what has already been searched, and which surname spellings to try.
- **Write back:** record a search, propose a new provider, propose a place alias, each checked against the Atlas's own rules before anything is written.

The skill stays as the *policy* (what to record and why). The server becomes the *mechanism*, so a wrong waypoint or an over-claimed "walked" is refused instead of relying on a session remembering.

## 2. What exists today (verified)

| Fact | Detail |
|---|---|
| Reading is already half an API | The Atlas publishes static JSON at recordatlas.org (`context.json` with 60 regions and 211 countries, `a/<place>.json` for about 2,800 places, `era-flags.json`, flag sets). |
| Source data | `data/providers.json` (567), `regions.json` (60 regions, 347 eras), `places.json` (7,355), `fs-volumes.json`, `surname-clusters.json`, gazetteer (`gazetteer.json.gz`). |
| Load cost | `places.json` 0.06 s, `providers.json` 0.01 s, `regions.json` under 0.01 s, **gazetteer 3.5 s** (so load it lazily). |
| The data gate | `scripts/check-data.py` takes **67 s** and prints "data is sound". It is the arbiter; the server must not re-implement it. |
| Deploys are expensive | A push touching `data/` or `scripts/` starts a build of about 24 minutes, queued and never cancelled. `paths-ignore` covers only docs, `.claude/`, `*.md` and similar. |
| Research reaches the map without a manual import | `scripts/publish-research-sessions.py` rebuilds `site/public/research-sessions.json` from every archive's `searched.json` and pushes **only those two files from a fresh temporary clone**, so it never touches the shared working tree. `/my-research/` folds that file in. |
| The skill was out of date on this | `record-atlas-feedback/SKILL.md` told sessions to run the importer and have David "Import a file". That was true before 13 October and is not now. **Fixed on 3 November** (skills repo 5935be6; this repo's copy synced in 3bb8855). Phase 4 still has to rewrite the skill to call the tools. |
| Privacy rule | Nothing leaves an archive into the Atlas except surname strings and aggregate counts (counts below 3 dropped). The publisher enforces it. |
| No MCP SDK installed | Python `mcp` is not installed here (`ModuleNotFoundError`); no Node SDK in the Atlas site. Installability is unverified. |

## 3. Design principles

1. **Read tools are safe and free; write tools propose.** A write returns a diff and does nothing until told to apply (`dry_run` defaults to true).
2. **Never write into the shared working tree.** The Atlas has one checkout that several sessions edit. Atlas-side writes use the publisher's pattern: a fresh temporary clone of `origin`, a branch, only the files that tool owns.
3. **Never push to `main` from a tool.** Atlas data changes go out as a branch and a pull request that David reviews. Pushing to `main` costs a 24-minute deploy and cannot be taken back.
4. **No guessing.** Ambiguous matches come back as candidates with `ambiguous: true`. There is no fuzzy fallback and no "closest volume". This is the Atlas's own matcher rule.
5. **The existing gates are the final word.** Tools validate early for speed, then run `check-data.py` on the result.
6. **Every answer carries its provenance:** the Atlas git commit, whether the tree is dirty, and `context.json`'s generated date. A stale checkout must be visible.
7. **Local and private.** A stdio server run by the user's own Claude Code. No network service, no secrets, GitHub access through the user's own `gh` login.

## 4. The tools

### Read (phases 1 and 2)

| Tool | Inputs | Returns | Reads |
|---|---|---|---|
| `atlas_find_place` | name, optional country, limit | Candidates: id, name, country, which alias matched and its kind (alt, older, official), region, collection count, `ambiguous` flag | `places.json` names, `exonyms.json`; gazetteer only on request |
| `atlas_place` | place id | Names, admin divisions, collections (provider, title, years, access), region, era chain, whether anyone has surveyed or searched it | `places.json`, `regions.json`, research sessions |
| `atlas_eras` | place or region id, year or span | The era(s) covering the span (half-open: `from <= year < to`), regime, polity, `filedUnder` resolved to provider names and access, the era's note, approx and contested flags, era id, **handovers flagged** | `regions.json`, `providers.json` |
| `atlas_providers` | id, country, access class or text | Provider rows with access class and last-checked date | `providers.json` |
| `atlas_volumes` | place id | FamilySearch and Antenati volumes: waypoint, title, years | `fs-volumes.json`, Antenati lists |
| `atlas_check_waypoint` | waypoint, first and last year read | Whether the volume's title years contain the frames. Returns "outside" or "inside", plus other volumes that *contain* the years, labelled **plausible, not confirmed** | `fs-volumes.json` |
| `atlas_surname` | surname | Variant cluster members and link kinds, countries attested, what the cluster rule does not guarantee | `surname-clusters.json` |
| `atlas_searched` | place, waypoint, surname or archive | What has been searched, with outcome and whether *walked*; "not surveyed" kept distinct from "searched, nothing" | archives' `searched.json`, `research-sessions.json` |
| `atlas_plan_mission` | name, place, year span | The mission brief from section 8 of the guide: names to try, era chain, handovers, providers and access, volumes, what is already done, a suggested first instrument | All of the above, composed |
| `atlas_context` | none | Contract version, checksum, counts, provenance | `context.json` |

### Write (phase 3), all propose-first

| Tool | What it does | Target | Checks before applying |
|---|---|---|---|
| `atlas_record_search` | Adds a row to an archive's `searched.json` | The **archive's** working tree only; the archive session commits, by name, as today | Waypoint format; title years contain the frames; `walked` only with a `pages` range; outcome in the allowed set; real `when` (ISO); a family tag; privacy fields absent |
| `atlas_propose_provider` | Adds a provider | Branch and pull request on the Atlas, from a fresh clone | Kebab-case id; host not already registered; `access` defaults to `unsurveyed`; kind in the allowed set; Wikidata id optional; `check-data.py` passes |
| `atlas_propose_alias` | Adds a name to an existing place | Branch and pull request | Source required; the alias is not already another place's name (otherwise flagged ambiguous, not written); the place exists |
| `atlas_check_data` | Runs `check-data.py` | Local | Returns the verdict and failing rows |
| `atlas_publish_sessions` | Runs the existing publisher | Atlas `main` (two files), so **needs explicit confirmation** and says that a deploy follows | Dry run first |

Not a tool, on purpose: adding a whole new place. The skill says that belongs in an Atlas session.

## 5. Architecture

- **Language: Python.** It matches `scripts/`, can reuse `gazetteer.py`, `geo.py` and the kit's `eralib.py`, and is what the gates are written in. The official `mcp` package's FastMCP is the likely base.
- **Location: `Record Atlas/mcp/`**, versioned with the data it validates. A change under `mcp/` must be added to `paths-ignore` in `deploy.yml`, or every tool edit starts a 24-minute deploy.
- **Finding the data:** an `ATLAS_ROOT` environment variable, else the folder the server sits in. Archives are found through `ARCHIVES_ROOT` (default: the Atlas's parent folder), so it works with David's folder layout and a second developer's `~/Projects/Family Projects`.
- **Registration:** a project `.mcp.json` in the Atlas repo for sessions opened there, and a user-level registration written by `claude-skills/install.sh` for sessions in the archives.
- **Data modes:** *local* (reads the checkout; full data, includes the gazetteer) now; *remote read* (the published JSON at recordatlas.org, for someone without a checkout) later.
- **Testing:** golden cases from real data, plus a planted-fault test per rule, in the same style as the kit's gates.
  - `Pisino` finds `pazin`.
  - Central Istria in 1930 gives Italy, Provincia dell'Istria (1918–1943), filed under dapa and familysearch.
  - A span of 1910–1925 reports the 1918 handover.
  - `9R28-RMN` against frames 1777–1784 is "outside"; the neighbour that fits is labelled plausible, never chosen.
  - A row with `walked: true` and no `pages` is refused.
  - A provider whose host is already registered is refused.
  - A row carrying a given name or a full date for a person is refused.

## 6. Phases

| Phase | Scope | Exit test | Rough size |
|---|---|---|---|
| 0. Spike | Choose language and location; install the SDK; confirm `.mcp.json` and user-level registration work in Claude Code; measure load times in the real server | A "hello" tool answers from a session in an archive and in the Atlas | about half a day |
| 1. Read core | `find_place`, `place`, `eras`, `providers`, `volumes`, `check_waypoint`, `context`, with provenance | Golden tests pass; one real mission is run using only the tools | about 2 sessions |
| 2. Research-aware reads | `surname`, `searched`, `plan_mission` | `plan_mission` reproduces the hand-written brief for three test missions | about 2 sessions |
| 3. Writes | The five write tools, branch-and-PR flow, planted-fault tests | Every planted fault refused; a dry-run PR opened on a scratch branch and discarded | about 3 sessions |
| 4. Rollout | `install.sh` registration; rewrite `record-atlas-feedback` to call the tools and **remove the stale importer text**; `deploy.yml` `paths-ignore`; a guide section; a CI job for the server's tests | A second developer installs it from the guide on a clean machine | about 1 session |
| 5. Optional | Remote read-only mode or a Cloudflare Worker, if outside contributors appear | n/a | decide later |

"Sessions" are working sessions with Claude doing most of the typing, an estimate and not a commitment.

## 7. Decisions for you

1. **Language and home.** Recommend Python in `Record Atlas/mcp/`, with `mcp/**` added to the deploy's ignore list.
2. **Write model.** Recommend branch and pull request for anything in the Atlas, working-tree-only for an archive's own `searched.json`, and no tool ever pushing to `main` except the existing publisher after explicit confirmation.
3. **Who reviews Atlas data pull requests.** Recommend you, as with the rest of `main`.
4. **Remote read mode.** Recommend after phase 3, not before.
5. **Skill clean-up now or in phase 4.** Done on 3 November: the importer instructions were fixed in the skills repo and synced here, so sessions no longer tell David to "Import a file".

## 8. Risks and how the plan answers them

| Risk | Answer |
|---|---|
| The shared Atlas checkout is dirty, or someone else is mid-edit | Writes use a fresh clone; reads report `dirty: true` |
| The local checkout is behind the live site | Every answer states the commit and the contract date |
| Validators drift from `check-data.py` | Validate early, but always finish with the real gate |
| The tempting fuzzy match | Not provided. Candidates only, flagged ambiguous |
| Sessions ignore the tools and edit JSON by hand | The skill still states the rules; the gates still run on every build |
| Memory and start-up cost | Gazetteer loaded only when a tool asks for it; the rest loads in under 0.1 s |
| A new dependency | One package, in the Atlas's `mcp/` folder only; nothing added to the site build |
| Privacy | Tools refuse given names, full dates and identifiers; the publisher stays the final privacy filter |

## 9. What this plan does not do

It does not build anything, touch the Atlas repository, change `deploy.yml` or edit the skills. It does not send the pull requests or the invitations. It does not replace the skill: the skill explains *why*, the server enforces *what*.

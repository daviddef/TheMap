# Who to contact: the plan

*26 November 2026. David: «I want every institute source church cemetery or cemetery manager etc done. I want us to be a source that people consistently [consult as] complete. So I am keen on you doing more than just wiki. So plan it well and on Sunday when we have more tokens we can kick something larger off. Let's get the framework done and make sure we are showing this data when we have it all.»*

Sunday is **29 November**. This file is the brief for that session.

## 1. The goal, stated so it can be checked

For every record-keeper the Atlas lists, a reader sees **a way to reach it that a named source states**: an e-mail, telephone, postal address or form. Where none exists, the page says so. Kinds: town halls and register offices, parishes and places of worship, dioceses, burial grounds, cemetery managers, archives, libraries, museums and memorials, universities and research institutes, societies and volunteers.

«Complete» is measured, per kind and country, on `/contacts/` (built from the same rows the pages show). Nobody can reach 100%: many burial grounds have no mailbox of their own. For those the answer is *who manages it*, and that has to come from a source too; failing that, the office covering the spot is suggested and labelled as a suggestion (decision 3).

## 2. Where we stand

Measured by `scripts/contacts/build.py` on 26 November, with the refreshed Wikidata contacts and **one** country (Croatia) from OpenStreetMap:

| Kind | Known | Can be written to or rung | Website only |
|---|---:|---:|---:|
| Town halls | 401 | 400 | 1 |
| Parishes and places of worship | 108,164 | 70 | 58 |
| Dioceses and church archives | 61 | 8 | 0 |
| Burial grounds | 150,629 | 31 | 6 |
| Archives | 11,918 | 823 | 0 |
| Libraries | 10,634 | 161 | 16 |
| Museums and memorials | 240 | 134 | 54 |
| Universities | 122 | 94 | 26 |
| Societies and volunteers | 187 | 0 | 0 |

Caveats: parishes, burial grounds and libraries are listed only inside the 41 record regions; town halls, museums and universities have no list of our own, so «known» is only what a contact source named.

One Croatian query, about a minute: **993 rows, 455 with e-mail, 602 with telephone, 732 with a postal address**, including 401 town halls and cemetery companies named as operators (Ukop, Komunalac, Groblja Jastrebarsko).

## 3. The framework (built)

| Piece | What it does |
|---|---|
| `data/contacts/sources.json` | the register of sources: licence, attribution, group (`open` or share-alike `odbl`), rank |
| `data/contacts/<source>/<CC>.json.gz` | one file per source per country, so parallel work never collides; deterministic bytes |
| `scripts/contacts/core.py` | the one row shape and the one cleaning rule; `check()` is run by `check-data.py` |
| `scripts/contacts/harvest_osm.py` | adapter 1: Overpass, a country at a time |
| `scripts/contacts/build.py` | one-degree squares under `public/contacts/`, licences kept apart; `coverage.json` |
| `public/js/contacts-near.js` | «Who to contact near here» on every place page, and the contact in a map dot's panel |
| `data/contact-areas/<source>/<CC>.json.gz` | boundaries, each with the office to suggest inside it; `scripts/contacts/areas.py`, checked by `check-data.py` |
| `scripts/contacts/harvest_osm_areas.py` | municipality and diocese boundaries from Overpass; a country is added to `LEVELS` once its municipality level has been looked at |
| `/contacts/` | how complete it is, by kind, with the sources and countries done |

A row is one source's statement about one institution. Rows are joined only on exact identifiers (OSM id, Wikidata number, provider id), never on name or nearness.

**To add a source:** register it with a licence read on its own page; write `harvest_<id>.py` that returns rows through `core.make_row` and writes with `core.write_source`; add a fixture test; add a line to `/data/` if its licence is new.

## 4. Sources, in the order to take them

Licences marked *check* have **not** been read. Nothing is harvested from a source until its licence and robots rules have been read on its own pages and written into the register.

| Wave | Source | Gives | How | Licence | Model tokens |
|---|---|---|---|---|---|
| 1 | OpenStreetMap, all countries | churches, cemeteries and operators, town halls, archives, libraries, museums | Overpass per country for small ones; country extracts (Geofabrik) filtered in a GitHub Action for large ones | ODbL 1.0 | only to write the extract adapter |
| 1 | Wikidata, every entity we list (not just providers) | e-mail, phone, address, website, operator | batched SPARQL over the ~170,000 ids | CC0 | none once written |
| 2 | France: annuaire de l'administration | every mairie and departmental archive | open-data download | *check* (published as Licence Ouverte) | one adapter |
| 2 | Italy: IndicePA; ICCU library register; BeWeB for church archives | every comune; libraries; diocesan archives | downloads / pages | *check* | one adapter each |
| 2 | Germany: ISIL register (DNB) | archives and libraries | download / API | *check* | one adapter |
| 2 | Spain, Netherlands, Austria, Czechia, Poland, Slovenia, Croatia, Hungary, Slovakia, UK, Ireland, US, Australia, South Africa, Uruguay, Argentina, Brazil: national open registers of public bodies, archives, libraries | town halls and register offices, archives | one researcher agent per country: find the register, read its licence, write the adapter or report that there is none | *check* | the main spend |
| 2 | Archives Portal Europe institution list; other national ISIL lists | archives | API / download | *check* | one adapter |
| 3 | Church bodies' own parish directories (dioceses, synods, eparchies, Jewish community registers) | parish contacts | one adapter per directory, countries from our stories first | per site | medium |
| 3 | The institution's own website, where we hold a URL and no contact | role mailbox, phone, form | identified crawler, robots.txt obeyed (`sweep-crawl-policy.py` already records who refuses) | facts from the institution | none to run; approved 26 November (decision 1) |
| 4 | Readers and our own letters | corrections, replies | `provider-emails.json`; a «report a wrong contact» link | ours | none |

**Not used:** Google Maps or Places (its terms bar storing results), FamilySearch (our standing rules), Find a Grave and BillionGraves (to be linked, not harvested), any site that blocks automated readers or names our crawler in robots.txt, and anything reached by getting round a bot check.

## 5. Rules that hold whatever the volume

1. Organisations only. Role mailboxes; no named person, no priest's or caretaker's own address; an operator only where it reads as an organisation.
2. Every value carries its source and a link; unchecked is labelled unchecked.
3. Share-alike data never mixes with the rest in a file.
4. A dead address (recorded in `provider-emails.json`) is never published, whichever source repeats it.
5. A partial or failed harvest writes nothing.
6. Absence is not evidence: «no contact held yet», never «none exists».

## 6. Sunday's run

**Order.** (a) Wave 1 scripts, which cost no model tokens and give most of the numbers: add the extract adapter and the Wikidata-by-id adapter, run both in GitHub Actions; then boundaries (`harvest_osm_areas.py`) for each country harvested, after reading which level is its municipality. (b) Then the researcher agents for wave 2, one per country, each owning one adapter file and one data folder, so none can collide; countries in the family stories first (Croatia, Italy, Slovenia, Austria, Hungary, the UK, Ireland, Australia, South Africa, Uruguay), then France, Germany, Spain, the US, Poland, Czechia. Also on Sunday: build the reader of institutions' own contact pages (decision 1) as its own adapter, source `site`, ranked after the registers; try it on one country and read the rows before running it wider. (c) A second, independent agent checks each adapter: licence text quoted, 20 random rows opened against the source, no personal data. (d) Merge, rebuild, read `/contacts/`, record what was refused.

**Each agent's brief:** the row shape (`core.make_row`), the rules above, one country, deliver `harvest_<id>.py`, its fixture test, the register entry, and a report of sources refused and why. No agent pushes to main.

**Budget.** Roughly 17 countries × (one builder + one checker). Stop after the first three, read what they cost and yielded, then release the rest.

**Size to watch.** Croatia's boundaries are one gzip file in git and one small file an area in the built site; a world of municipalities is a few hundred thousand files, so count them before releasing every country. Worldwide OSM could be several hundred thousand rows. Store files go in git as gzip while the folder stays under about 50 MB; beyond that move them to a release asset like the volumes file. The browser's squares are split at 80 KB.

**Before merging anything:** `node --test test/*.test.js`, `check-data.py`, and a slice build for page weight (place pages have about 1% headroom under their budget).

## 7. Afterwards: keeping it true

Weekly: re-run every scripted adapter in `contacts.yml`, which proposes changes on a branch for a person to read. Monthly: check a sample of addresses and websites still answer. Letters sent from the family archives record replies and bounces back into `provider-emails.json`. This is also the first half of the «who holds the records» catalogue in `errands-and-custody-plan-2026-11-05.md`: the same ids can carry what each holder holds and how to ask.

## 8. Decisions (David, 26 November)

1. **A script may read institutions' own contact pages: yes.** Robots.txt obeyed, our crawler identified, role mailboxes only, nothing reached round a bot check or a block, and every such value labelled «read by script from its own site». This replaces, for contacts, the 5 November line against scraping a contact page without a person reading it. *Not built yet:* it is Sunday's work.
2. **Free-mail addresses: keep them**, where the institution publishes one as its own and the mailbox names the institution, never a person. *Built:* `names_institution` in `scripts/provider_contact_rules.py` wants every part of the mailbox name to be an office word, a word of the institution's name or address, or «sv» and its like, with at least one office word and one word of its own. On Croatia it keeps 29 of 37 Gmail addresses; the rest name a person or cannot be told apart. A country in a new language needs its office words added.
3. **Suggest the covering town hall or diocese where there is no contact: yes**, labelled as a suggestion and never as the ground's or parish's own address. *Built:* «covering» means inside a boundary a source draws, never «nearest». A burial ground gets the town hall; a parish gets the diocese, and nothing where no diocese boundary with a contact is mapped.

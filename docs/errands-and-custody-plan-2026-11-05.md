# A «who holds the records» catalogue and a shared errands module

*Raised by David Defranceski from the Defranceski archive, 5 November 2026. Plan only: nothing here is built, nothing has been sent. The work is tracked on the Atlas work list as rows 100–107 (`site/src/data/worklist.json`).*

## The request, in David's words

> Considering an extension. Look at extending this to bring errands from individual sites to a far more scalable atlas, where research sessions can write to and read from the atlas. The atlas knows who holds records and can address the errands. And means other users of recordatlas can leverage an errands module with substance? Thoughts? Plan and worklist for this if you think it's a good one.

It followed an earlier question, prompted by a reply from the Franciscan friary at Trsat (the parish holds only post-war registers; everything older is at the State Archives in Rijeka), and by the fact that Google's AI overview «knew» it: how to build a knowledge base of **who holds the records**, with links and emails.

## Thoughts (the answer was yes, with three guardrails)

Errands are the same job in every archive: a gap that reading cannot close, a holder who can, a letter, a wait. Each archive keeps its own `errands.json`, so the same holder is written to by several archives that never learn from each other's replies; the Atlas already receives research sessions and will know who holds what. The errand is the third piece, and the one that turns the catalogue from a reference into a service.

1. **The letter stays where the person is; the Atlas holds the shape of the ask** (holder, register, kind of ask, state, outcome, dates, evidence). No given name, no full date, no relationship, no identifier, nobody living: the line the Atlas already draws.
2. **Nothing sends from the Atlas**, and the module must not become a way to mass-mail archives that answer by hand. It shows what has already been asked and answered before it offers a draft, and **bundles every open ask for one holder into one letter**.
3. **Institutional contacts only**, from the holder's own page or reply: no named staff, no personal address, no scraping, no address inferred from a parent body.

Not a server and not accounts: recordatlas.org is static and `my-research` is local to a browser, which is the right default for other users. Sessions write through a script that publishes only its own file from a fresh clone, as `publish-research-sessions.py` does. A visitor's «tell the Atlas the answer» is a later, reviewed pull request, never a live database.

## The two plans, as work-list rows

### Row 100. Record Atlas: a «who holds the records» catalogue — custody by parish, record kind and period, with how to ask (design agreed 5 November 2026)

*State: next. Owner: Claude, in a Record Atlas session; David to approve the design.*

**The question that started it, 5 November 2026:** the Franciscan friary at Trsat replied that the parish of St George holds registers only from after the Second World War and that everything older is at the State Archives in Rijeka; Google's AI overview said much the same, unsourced. *We should not have needed Google, and we should not have needed to ask.* This archive's own answer, the 1946 and 1949 rule about where Croatian registers went, already sits in the Atlas (`hda883-holdings.json`), but it is a paragraph, not a lookup.

**What the Atlas has today, and what it lacks.** `providers.json` has 569 institutions, and **one** of them carries a `holdings` list (IrishGenealogy.ie). `provider-contacts.json` has 143 emails, all from Wikidata, none from a reply or an official page. `fs-volumes.json` says which register is on FamilySearch and where, which is the *copy*; nothing says who holds the *original*, who holds a duplicate, who will answer, in what language, or what they need before they will look (DARI's first answer to us, on 5 November, was that the request lacked the applicant's postal address).

**The design, in the pattern of the surname and place catalogues.**

| piece | what it is |
|---|---|
| `data/record-custody.json` in the Atlas, written only through `scripts/record_custody.py` | one row per **place or parish, faith, record kind, years, holder, role**; the role is *original*, *duplicate*, *civil-registry copy*, *microfilm*, *images* or *index*; `at PLACE YEAR KIND` prints who holds it and in what order to ask; `add` takes the evidence; `check`; `publish` once |
| a **status** on every row, as for spellings | *verified* (the holder's own reply or catalogue), *catalogue* (an official finding aid), *rule* (a law or a decree, applied to a whole jurisdiction), *lead* (a secondary source, **never a finding**: an AI overview, a forum, a tree). **A «not held» is allowed only on the holder's own statement**, the same rule as a nil |
| **observed contacts**, beside the Wikidata ones | an email, form, postal address and language that *worked*, with the date it was seen, what the holder asked for (applicant's address, a fee, the signature of a register) and how long the answer took; one row per holder, not per letter |
| the **outcome of every letter** written back as evidence | a reply turns a lead into *verified* (the friary's reply is the first row), and a nil into a dated answer; nothing about a person goes in, only the institution, the register and the period, as in the name catalogues |
| three **surfaces** | the place panel («Who holds the registers»), a provider page («what they hold, how to ask, what they need first»), and the errands page, whose addressee, language and required fields come from the catalogue instead of from the last letter |

**Phases.** (0) schema, tool, checker and a user-level skill `record-custody`, like `surname-variants`; (1) seed it from this archive's own letters and reads (Trsat, Bakar, Draga, Ledenice, Bribir, Kraljevica, Senj, Pula, the Pazin and Rijeka State Archives) and from the Croatian 1946/1949 rule; (2) the other jurisdictions where one of the family archives has a line (Italy, Slovenia, Austria, Hungary, Uruguay, South Africa), **country rule first, parishes after**; (3) the three surfaces; (4) outcomes written back from `errands.json` and `searched.json`. **Not** in the plan: a scrape of anyone's AI answer, a scrape of an archive's contact page without a human reading it, and any address inferred from a parent body or a homepage (the rule `provider-contacts.json` already keeps).

### Row 101. Seed the custody catalogue from what this archive already knows — Trsat and the Rijeka State Archives first

*State: next. Owner: this archive.*

**The first rows of the custody catalogue are already in this archive's mail and logs.** *Trsat parish registers:* the friary says the parish holds only post-war books and the earlier ones are at the Rijeka State Archives (doc, reply of 5 November 2026); the Trsat deaths of 1803–1815 are on no FamilySearch film (1737–1803 and from November 1815 are), so *who holds that one book* is the open row, and DARI was asked on 4 November and, after it wanted a postal address, again on 5 November. *Bakar, Draga, Ledenice, Bribir, Kraljevica:* every volume read here has a waypoint, so the **images** row is known; the **originals** row is not, and is the first thing a letter to DARI should ask. *Pazin:* the family's own copy of the Pazin films (DAPA) and the Pazin State Archives. *The 1946/1949 rule* (registers with entries from 1860 to the civil registry offices, up to 1860 to the archives) is a **rule** row for every Croatian parish at once, with the quotation from Milić 2017 that the Atlas already holds.

**To do, in this archive and then in Record Atlas:** list every holder this archive has written to or been answered by (`errands.json`, `searched.json`, the `requests/` letters), with date, language and what they asked for; write them as rows in the Atlas once the tool exists; until then keep them in the searched row of the letter, not in a new table here (a second copy is how the spellings list drifted).

### Row 102. A `record-custody` skill: ask the catalogue who to write to before any errand, letter or «not on film» nil

*State: blocked. Owner: Claude, once the Atlas tool exists.*

**A skill, as there is for names:** `record-custody`, to be run **before any errand, letter or email to an archive** and **before any nil of the form «not on film»**. `at PLACE YEAR KIND` says who holds the original, the duplicate and the images, in the order to ask, with the language, the address or form, and what they need first (the postal address DARI wanted, a fee, a signature). `add` records every reply as evidence; a letter is not finished until its answer is a row. It reads the Atlas, as the surname and place skills do, and keeps no table in an archive.

**Why a nil needs it.** The Trsat death book of 1803–1815 was written down here as «not on the films» on the strength of the film list alone; the question «who holds it» was first asked by email on 4 November and answered on 5 November by a friary and a registry office, not by FamilySearch. A nil about a register is a nil about where it is, and that is what this catalogue is for. **Blocked on** the Atlas tool (the row above): write the skill's text now, ship it when `record_custody.py` exists.

### Row 103. Record Atlas errands: one shared module, so any archive or visitor sees who holds the book, what they need and what others were told — decide the data model and the privacy line

*State: next. Owner: David, to approve the design (then a Record Atlas session).*

**Why this is worth doing, and where it is not.** The errands are already the same job in every archive: a gap that reading cannot close, a holder who can, a letter, a wait. They are kept in each archive's own `errands.json` (40 here, 27 unsent; the Atlas keeps four of its own), so **the same holder is written to by several archives who never learn from each other's replies**: the postal address DARI wanted on 5 November is a fact every later letter to Rijeka should already carry. The Atlas already receives research sessions and already will know who holds what (rows 100–102); the errand is the missing third thing, and it is the one that turns the catalogue from a reference into a service: a researcher at any archive, or any visitor to recordatlas.org, sees **who holds the book, what they need, in what language, what others asked, and what they answered**.

**What may and may not leave an archive.** The line already drawn for the Atlas (surname strings and counts, no given name, no full date, no relationship, no identifier, nobody living) holds, and it decides the design: **the letter stays where the person is; the Atlas holds the shape of the ask.** A shape is *holder · register (place, faith, kind, years) · what is asked (does it exist, where is it, a transcript, a scan, permission to publish) · state · outcome · dates · evidence link*. The person's name, the reason and the draft stay in the archive that drafted the letter. Letters are generated **in the archive**, from a template and a holder profile pulled from the Atlas; the Atlas never holds a draft with a person in it.

**Three guardrails, which are the reasons I would say yes and not just «go».** (1) **Nothing sends from the Atlas**, as today: sending is a person's decision, and a shared module must not become a way to mass-mail archives that answer by hand (DARI's office answered ours within a day, and one person reads it). (2) **Answered once, published for everyone:** the module should show «three researchers asked DARI for the Trsat 1803–1815 deaths; reply of 5 November: …» *before* it offers to draft a fourth letter, and should **bundle every open ask for one holder into one letter**; that is the load-reducing reason an archive would not mind it. (3) **Institutional contacts only**, from the holder's own page or reply; no named staff, no personal address, no scraping.

**What it is not.** Not a server and not accounts: recordatlas.org is static and `my-research` is local to a browser, which is the right default for other users (their errands stay in their browser or an exported file; the Atlas's JSON is what they read). Writing back is for sessions, through a script that publishes only the published file from a fresh clone, as `publish-research-sessions.py` does. A visitor's «tell the Atlas the answer» is a later, optional, reviewed step (a form that opens a pull request), never a live database.

**Order of work, one row each below.** (1) the data model and the privacy line, agreed by David; (2) the Atlas errand catalogue and the sync script, after the custody tool; (3) bundled letter packs and templates by language, with the holder's required fields as a checklist; (4) the public module on recordatlas.org, local-first; (5) outcomes written back, with turnaround and fee statistics and the skill that ties it together.

### Row 104. Errand catalogue in the Atlas: asks as shapes (holder, register, kind of ask, state, outcome), written by sessions, read by every archive — after the custody tool

*State: blocked. Owner: Claude, in Record Atlas, after row 283.*

**Models:** `scripts/surname_variants.py` and `scripts/publish-research-sessions.py`. A new `data/errand-asks.json`, written only through `scripts/errand_asks.py` (`add`, `state`, `outcome`, `open --holder DARI`, `check`, `publish`), published from a fresh clone and touching only that file. **Migration:** this archive's 40 errands and the Atlas's own four, **shape only**: the reader of `errands.json` here sees `who`, `ref` and `ask`, and the Atlas gets the holder id, the register and the kind of ask; `why`, `draft` and `key` stay. A check refuses a given name, a full date of a person, an identifier or a living person in any field, as the name catalogues' checks do. **Dedupe by holder + register + ask**, so a second archive's identical ask joins the first instead of repeating it.

### Row 105. Holder-bundled letter packs and templates by language, with each holder's required fields as a checklist

*State: blocked. Owner: Claude, after the errand catalogue.*

**One letter per holder, not one per gap:** `errand_asks.py pack DARI` lists every open ask for Rijeka (the Klenovica and Ledenice marriages, the Trsat deaths of 1803–1815, the originals behind every Bakar, Draga and Kraljevica volume read here) with the holder's profile: contact, language, form or email, fee, **what they need before they look** (DARI: the applicant's postal address with postcode), and the quotation of the last reply. Templates for Croatian, Italian, German, Slovenian and English; the draft is written **in the archive**, with the person's details, and checked against the holder's checklist before David sends it. Nothing sends from the Atlas.

### Row 106. A public errands module on recordatlas.org: local-first, no accounts, reading the custody and errand catalogues

*State: blocked. Owner: Claude, in Record Atlas, after the letter packs.*

**Same pattern as `my-research`:** the visitor's errands live in their browser or in an exported file, and the page reads the Atlas's published JSON for the holder, the profile, the templates and the **answers others have had**. Before it offers a draft it says what has already been asked and answered. A «tell the Atlas the answer» button, if it comes, opens a reviewed pull request with the **shape only**; it is never a live write. The page must say plainly that the archives it names answer by hand, and link their own page first.

### Row 107. Close the loop: outcomes written back, turnaround and fee statistics per holder, and a skill (`record-errands`) that every session runs after sending or hearing back

*State: blocked. Owner: Claude, after the module.*

**An errand is not finished until its answer is a row.** The outcome codes (*found*, *not held*, *redirected to another holder*, *fee*, *refused*, *no reply after N days*) turn a custody *lead* into *verified* (the Trsat friary's redirect to Rijeka is the first example) and a «not on film» nil into a dated answer from the holder. The Atlas shows, per holder, how many asks, how many answered and how long it took, so a researcher can choose the channel that works. The skill is the same shape as `surname-variants` and `record-custody`: read first, write with evidence, publish once, say whether it is added locally, published or live.


# Plan: "Reading the record", a visual, searchable guide to interpreting old registers

Status: **the first piece is built (the term finder and the date decoder at `/read/`); everything else here is plan.** Written 6 November 2026. Worklist rows 116-123 track it.

## 1. The gap

A researcher who finds the right register still has to read it. The guides that exist were read for this plan (four web pages, a one-page Belgian Latin handout, and a walkthrough of a Hungarian birth register). What each does well, and where all of them stop:

| Guide | Good at | Where it stops |
|---|---|---|
| The one-page Latin handout (Belgium) | Fill-in-the-blank formulae for baptism, marriage and death; word lists beside a real specimen; handwriting letter-by-letter on one record; "irregular record" boxes (twins, delayed marriage) | One priest's hand, one country, one era; a printed sheet, so no search, no "show me this word wherever it turns up" |
| Findmypast's Latin guide | Friendly start; name variants (Willelmus, Patricus) | One flat glossary, one sample image, nothing on abbreviations or hands |
| Genealogical Studies (Italian) | Case endings explained with names | Only four cases, a few words, four months; no whole entry read; ends in a course advert |
| The Catholic Gene | One real entry translated, then a glossary | No grammar, so no reason why endings change; no dates, no handwriting |
| Italian Roots Project | Argues records follow fixed formats; a letter-key habit; decode one whole act first | Repeats itself; no annotated entry; thin on Latin |
| A column-by-column walkthrough of one Hungarian village's birth register | Walks the *columns* of one tabular register and then specific entries | One village, text only, "keep a record open beside this" is left to the reader |

The pattern is the same everywhere: long, linear, not searchable, with the picture and the explanation in different places. A researcher with a register open wants the opposite: point at the thing on the page and be told what it is, what it can and cannot tell them, and what else it might look like in another parish or century.

## 2. What we would build (the reader's view)

A new section, `/read/`, with five tools that share one data set.

1. **The annotated page.** A drawn layout of a register page (a column table like a Hungarian birth register, or a prose entry like the Belgian baptism). Tap any field or word: a panel says what it is, the words usually written there, what it does *not* tell you, and how it varies by country and period. A switch changes the layout: Latin prose baptism, Hungarian tabular birth register, Napoleonic printed civil act, and so on. The layouts are our own drawings, so they are free of anyone's image rights and can be made accessible text.
2. **Read this line.** The sentence formula as slots (date, was baptised, child, legitimate son of, father, and, mother, godparents were…). The reader types or picks the words they see; each word is shown with its case, why the ending is what it is ("Corneliam" is the object of "baptised", so the name is Cornelia), and its dictionary form. This reuses the Latin case forms already in the given-name catalogue, so a name found in a register links to its `/name/` page and to every language form.
3. **The term finder.** One search box over every term: Latin, Italian, German, Hungarian, abbreviations and endings. It is tolerant the way registers are: `7bris`, `septembris` and `Sept.` find one card; `Joannem` finds Joannes. Filters by event (birth, marriage, death), by field (father, godparent, residence), by language and by period. Each card carries the word, its forms, abbreviations, an example, and any trap.
4. **The date decoder.** Type `die 30 7bris 1671`, `undecimo februarii 1746`, `an IX, 3 vendémiaire`; get the date, with the working shown. Roman numerals, ordinals, feast-day dating, the French Republican calendar, the Julian-to-Gregorian change by place (the Atlas's dated place data already knows which regime held a place in which year).
5. **The trap list.** The misreadings that cost researchers real time, each short, each with its evidence: `uxoris` read as "ignoris"; `infans` is a child, not a baby; `natum` means the birth day differs from the baptism day; `n.n.` means the mother's surname was not written, so do not take it from the godparents; `subconditione` means a conditional rebaptism; a delayed marriage because of consanguinity. Beside each: "what this does not say".

Plus **practice**: short entries to read, with the answer hidden until asked. Entries are invented or taken from open-licence sources, never a real family from our research.

And **links out and in**: a volume page whose register is Latin tabular 1770-1850 offers "How to read this register". A `/name/` page links the Latin forms to the line-reader. The volume-sweep method links here for "how to read what you are looking at".

## 3. What it learns from us

This is what no existing guide has: it is fed by what the research sessions meet.

- **Our own lessons, labelled as ours.** Each card and trap has a `basis`: `public` (a guide, a dictionary, an archive's own help page) or `ours` (met in a session). The page shows which. "Met in our work: in a Senj volume the mother's surname is missing for years at a stretch" is a different kind of claim from a dictionary entry and the reader is told so.
- **A lesson row, no people.** Sessions already write `searched.json` rows. A new, optional lesson row says: layout, language, place, period, what was misleading, what resolved it, and the evidence (a volume waypoint and image range, link-only). It never holds a person's name, date or identifier. It goes through the same gate as every catalogue: only positive evidence, a source shown, no nil written as a finding.
- **Harvest first, then keep it flowing.** A one-off pass reads the eight family archives' session notes for recurring patterns (stripped of names), and proposes lessons for review. After that, the `record-atlas-feedback` skill gains a short section so a session records a lesson as it meets it, the same way it records a variant.
- **Through the API plan.** When the read API and MCP server exist (`docs/atlas-mcp-plan.md`), `propose_reading_lesson` is one more proposal tool. David approves; nothing is written without that.

## 4. Data and scaling

Three data files, written and checked the way `name-stories.json` and the name catalogues are, so adding a country is adding rows, not code.

- `data/record-layouts.json`: one row per layout. Axes: record type (baptism, marriage, burial, civil birth…), language, country or region, period, form (prose, tabular, printed). Fields in order, each with: label, words written there, meaning, what it does not tell you, variants, sources.
- `data/record-terms.json`: one row per term. Forms, abbreviations, language, meaning, part of speech, example, event and field tags, trap ids, sources.
- `data/record-traps.json`: one row per trap, with the plain statement, why it matters, what to do instead, `basis`, sources.

The data gate (`scripts/check-data.py`) is extended to refuse: a claim with no source; a quotation over 15 words; a row of `basis: ours` with no evidence pointer; any given name, surname or date of birth inside a lesson (heuristic check against the surname and given-name catalogues); an example not marked `invented` or `open-licence`; a term whose stem is already in another row (duplicates drift).

Growth is by the same three axes: **record type, language, country/period.** Order of build: Latin church registers (Belgium, Hungary, Italy, Croatia, Germany, Poland), then civil registration (Napoleonic, Austro-Hungarian), then Dutch, French, Spanish and Portuguese, German (Kurrent), Swedish.

## 5. Copyright and credit

The existing guides are copyrighted, and so are their pictures. The plan:

- **Facts are free; presentation is not.** A word's meaning is a fact, and the Atlas states it in its own words from several independent sources plus open dictionaries (Wiktionary is CC BY-SA, attributed). We do not copy a guide's wording, its table layout, its selection of words, or its images.
- **Every card shows its sources.** A reader who wants the long version is sent to the original, by link.
- **Our pictures are our own.** The annotated page is drawn by us. Photographs of handwriting come from open-licence sources (national archives that publish under an open licence, Wikimedia Commons) with the licence shown. Register frames from FamilySearch stay link-only, as everywhere else; the page links to the image instead of reproducing it.
- **Ask where it is cheap to ask.** The Belgium handout is a useful starting point. The plan is to ask where it is cheap to ask, for permission to cite, link, and where the author agrees reuse a worked example. Until then it is a source we point to, nothing more.

## 6. Phases (each one is a worklist row)

| Row | Piece | Why in this order |
|---|---|---|
| 116 | Schema, gate rules and the first 150 terms (Latin church registers) | Everything else reads from it; sources decided up front |
| 117 | Term finder and date decoder (no images) | Pure text and arithmetic: tested, searchable, useful alone, and shippable in days |
| 118 | The annotated page with three layouts: Latin prose baptism, Hungarian tabular births, a printed civil act | The visual centre; drawn by us, accessible as text |
| 119 | Traps list and the "read this line" tool | Needs the term data; joins into the given-name catalogue |
| 120 | The learning loop: harvest from the eight archives, lesson row, skill section, links from volume and name pages | Needs real content to link to |
| 121 | Practice entries and open-licence handwriting gallery | Needs images with a clear licence |
| 122 | More languages and countries, one per pass | Scaling, after the model is proven |
| 123 | Whether to ask any guide's author for permission to cite or reuse a worked example (the Belgium handout is credited with its address) | Nothing is built on an author's text, so nothing waits |

## 6b. Asking Claude: paste a line or a photo (planned, not built)

A reader could paste a line of a register, or a snapshot of it, and get a translation that leans on the cards above.

- **Order of work:** (1) a "Copy as a prompt" button that builds the pasted text and the matching cards into a prompt for the reader's own AI, with no server and no cost; (2) a Worker on our Cloudflare account that sends pasted text to Claude with our cards as the first source, holding the API key as a secret, behind a bot check and a spend cap; (3) a "where the Atlas can help" panel; (4) photos; (5) a usage allowance tied to the reader's six-word identity (no registration); bring-your-own-key stays an option.
- **Cards first.** The finder picks the cards a pasted word matches; they go to the model as its first source. Each word in the answer is tagged "from our card" or "the model's own knowledge", doubtful readings are flagged, and the model is told never to guess a mother's surname or a missing parent. The answer is shown as a draft to check against the cards.
- **Photos in two steps.** The model transcribes the image into editable text with doubtful words marked, the reader corrects it, and only then does the translation run. Clear print and tidy 19th-century hands read well; older hands are hit and miss, so a hidden misreading must never turn into a confident translation. The browser shrinks the picture and strips its hidden data first, and nothing is stored.
- **Where the Atlas can help.** Our own code, not the model, looks up what was read: dated place names and the volumes held there, name pages and every language form, the surnames catalogue, the date decoder, the traps that apply, and leads clearly labelled as leads (godparents and witnesses are the likeliest relatives to look for next). The model only labels the roles.
- **Cost and use.** Our key is the default, capped. A reader gets a few free tries a day behind a bot check; making the six words that also keep their research online (one click, no email) lifts the allowance. The words give a separate AI identity (its own id and token, so the AI service cannot find or open anyone's saved research), and a counter per identity keeps the daily and monthly use. Because anyone can make new words, the per-person caps are soft: the hard limits are a monthly spend cap set with the AI provider, a site-wide daily budget, the bot check, a per-address limit, and a small allowance for new identities that grows with age and use. Bring-your-own-key is a later option for people who want no cap.
- **Privacy.** This is the one place where typed text leaves the browser (to our server and to the AI provider), so it has its own plain notice, a line asking readers not to paste details of living people, and no logging of the text or image. The allowance counter is tied only to the six words and holds a count, nothing else; deleting your online copy deletes it too.

## 7. Decided, and still open

Decided: the section lives at `/read/`; examples are invented or open-licence, never a real family; nothing about a person goes in; `ours` lessons are labelled as ours; the Atlas is the one home for the data, and family archives keep no glossary of their own (the same rule as variants).

Still open, and not blocking anything: which country comes second after Latin church registers (the order above is the working guess), and whether to ask any guide's author for permission to cite or reuse a worked example.

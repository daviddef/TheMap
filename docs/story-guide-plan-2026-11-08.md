# "Tell us who you're looking for": a guided, animated first-hour plan (proposal, 8 Nov 2026)

Status: **a proposal, nothing built.** For David to react to. Written from what is already in the repository.

## The idea in one line

A newcomer says one sentence — *"I want to find out about my great-grandfather Ivan, from Gračišće, who came to Hamilton, Ohio, from Istria. All I have is one photo."* — and the Atlas turns it into an animated story of his journey and a short, ordered plan of what to do first, each step tied to real places, years and sources the Atlas already holds.

## Why it fits

The Atlas is a very good reference and a poor front door. "Start here" offers three ways in (a place, a surname, a place plus years); all three assume the visitor already knows what to look for. A beginner knows a story, not a gazetteer. The one thing nobody else does — who held the ground in the year of the record — is exactly what a beginner gets wrong, and the journey animation is the natural place to show it.

## What already exists (so this is mostly assembly)

| Need | Already in the repository |
|---|---|
| Read a photo or document into places, years, names | the Ask panel on /read/ and the AI worker (`workers/ai`, kinds `transcribe`, `document`, case file) |
| A journey map, story, people, "where to look", names | `site/public/js/case-atlas.js` (the Journey / Story / People / Where to look / Names / Documents tabs) |
| Who held each place in each year | the "who held this ground" component and `data/region-*`, `history-*` data |
| Registers, collections and providers per place and year | `data/places.json`, `collections.json`, `fs-volumes*.json`, `providers.json` |
| Every spelling of a surname, given name and place in the year | the three name catalogues (`name-variants` skill, `/your-name/`) |
| A playback of places through time | the history theatre module (`/history/`) |
| A place to keep the plan | My research, with planned marks and the Fix list tab |
| A printable summary | `handover.js` |

## What is new

1. **A front door**: a fill-in-the-blanks sentence (relationship, name if known, from, to, roughly when, what you hold), not a form. Places autocomplete from the gazetteer including old names; a photo or document is optional and, if given, pre-fills the blanks through the existing reading.
2. **The animation**: the line draws itself from origin to destination with a year scrubber; at each step a caption says who held the ground then ("in 1902 this village was Austria-Hungary; his birth is filed under Italy after 1920"). Respect `prefers-reduced-motion`; a still version of the same story is the fallback.
3. **The plan**: five to eight steps in order. Each step has *why*, *where* (links into the Atlas and its sources), *what to type* (the surname, given-name and place forms for that year), and *what not to conclude*.
4. **Save to My research**: the plan becomes a family line with planned marks, so progress is ticked off in the tool the person already uses; plus the printable handover.

## How the plan is made: rules first, AI second

Two layers, so it works without the AI and cannot invent sources:

- **Rules** build the skeleton from the facts: if there is an origin place and a year, the steps are the registers the Atlas holds for that place and years (baptism or birth, marriage, burial), then the arrival side (port records, naturalisation, census) for the destination country, then family sources (relatives, letters, church). The order follows a standard method (start with the newest record, work backwards).
- **The AI** (Sonnet, one call per plan) only does what rules cannot: it reads the photo or sentence, picks the likeliest record type, orders and words the steps for this person, and explains each in plain language. It is handed the candidate sources and may choose only among them. It cannot add a link. Everything it writes is shown as a lead, not a finding, consistent with the rest of the site.
- If the AI allowance is spent, the rule-built plan still appears.

## Guardrails

- Nothing is sent until a button is pressed, as on /read/. The sentence and any picture go to the AI service only then; nothing is kept on the server; the plan is kept in the browser.
- "Please do not enter details of people who may be alive" stays, and the plan never asks for a living person's details.
- The arrival side is only as good as the catalogue for the destination country. The source gap report (`docs/source-gap-report.md`) says where that is thin; the plan says so honestly ("the Atlas holds little for this country; here is where to look") rather than padding.
- The animation uses a handful of points, never the full marker layers, because the home page's memory budget is a known limit.

## Phases

| Phase | What | Size | Needs AI? |
|---|---|---|---|
| 0. Spike | Front-door sentence, journey line with year scrubber and "who held the ground" captions, rule-built plan, no saving | about a week | no |
| 1. AI | Reading a photo into the blanks, AI wording and ordering of the plan, the "choose only from these sources" check and its tests | about a week | yes |
| 2. Keep it | Save to My research as planned marks, printable handover, share link without personal data | a few days | no |
| 3. Polish | Reduced-motion, mobile, translations hook (`i18n.js`), browser tests, a short usability check with two newcomers | a few days | no |

## Measuring whether it works

- A newcomer reaches a concrete first step (a named register and years) in under two minutes.
- At least half of those who see a plan save it.
- No plan contains a link that is not in the Atlas data (a test).
- The AI cost per plan stays within the existing daily allowance.

## Decisions for David

1. **Name and place.** "Tell us who you're looking for", on its own page and in the main menu, or a first tab on Start here?
2. **Scope of the first release.** Origin side only (where the Atlas is strongest: Europe) with a light destination guide, or both from the start?
3. **Allowance.** One plan per visitor per day on the existing limits, or a separate smaller allowance?
4. **Where the line is drawn on the animation.** A true route is not knowable; the plan says "dashed line: places in date order, not the route taken", as /read/ does today. Agree?

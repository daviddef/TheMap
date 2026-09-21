# Letter to the Meertens Instituut — the Nederlandse Familienamenbank

**Status: a draft for David to send. Nothing here has been sent.**
Written 21 September 2026. Work list row 12.

## Why this letter exists

The Netherlands is one of eight countries on the surnames page with no
surname register behind it. It is the only one of the eight whose data
plainly exists, is maintained, and is reachable — the Meertens Instituut's
*Nederlandse Familienamenbank* holds the distribution of Dutch surnames
against the 1947 census and later material. It is published for research
rather than as open data, so the answer is a letter and not a download.

The other seven refusals are recorded in `data/frequencies/_refused.json`
with what was tried. Three are dead ends in the data itself — Belgium
publishes first names only, Czechia's page has gone, Sweden has retired its
name tables. Finland's holder gates crawlers, and this atlas does not climb
bot gates. The Netherlands is the one where asking is the correct move.

## Where to send it

Meertens Instituut (KNAW), Amsterdam — via the contact address on
`meertens.knaw.nl`. Address it to the Familienamenbank maintainers.

## The letter

> **Subject: Permission to reuse Familienamenbank surname distributions in an open genealogical atlas**
>
> Dear colleagues,
>
> I maintain Record Atlas (recordatlas.org / daviddef.github.io/TheMap), a
> free, non-commercial, open-data map of genealogical *sources*. It answers
> one question: for a given place, which archives and collections hold
> records covering it, and what can a researcher actually reach today. It
> grew out of eight family archives of my own and is published under CC0,
> with every source credited and dated.
>
> One part of the atlas shows, for a surname, the countries where it is
> borne today, the spellings it also takes, and when and where it is
> recorded over time. For that first part I use national surname registers
> where a country publishes one. For the Netherlands I have not found an
> openly licensed equivalent, and the Nederlandse Familienamenbank is
> plainly the authoritative source.
>
> I am writing to ask whether it would be possible to reuse the
> Familienamenbank's surname distribution data — at the level of a surname,
> a count or a frequency band, and a region — in this atlas, and if so on
> what terms.
>
> To be specific about what I would and would not do:
>
> * I would use counts or frequency bands per surname and region. I do not
>   need, and would not want, anything about individuals.
> * The Meertens Instituut would be credited on every page that uses the
>   data, and in the dataset's own source list, with a link and the date the
>   data was taken.
> * I would honour whatever licence you set, including a non-commercial
>   condition or a requirement that the data not be redistributed in bulk —
>   in that case the atlas would query or display rather than republish.
> * I am happy to cap what is shown, to link back for the detail, or to
>   work from an extract you prefer to supply rather than harvesting
>   anything myself.
> * If reuse is not possible, a simple statement of that is genuinely
>   useful to me. The atlas records why each country is missing, and
>   "the holder does not licence this for reuse" is a better and more
>   honest answer for a reader than silence.
>
> The site carries advertising to cover hosting. If that makes the use
> commercial in your terms, please say so and I will either remove the
> advertising from the pages concerned or not use the data.
>
> I would be glad to answer any questions, and to show you the surname
> pages as they currently stand before anything is added.
>
> With thanks for your time,
>
> David Defranceski
> david.defranceski@gmail.com
> https://daviddef.github.io/TheMap/

## When a reply comes

* **Yes, with terms** — record the terms in `data/frequencies/nl.json`
  alongside the other registers, add the credit line, and move work list
  row 12 to done.
* **No** — move the Netherlands entry in `data/frequencies/_refused.json`
  from "research database, not open data" to a refusal with a date and the
  reason given, which is stronger evidence than the inference now recorded.
* **No reply after a month** — note the date the letter went, and leave the
  refusal as it stands. A letter that went unanswered is worth writing down.

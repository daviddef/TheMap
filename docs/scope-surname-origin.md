# Showing a surname's origin: scope

David, looking at the map panel for Lerena beside a Google result for Taylor:
*"why would we not be showing the proper origin of the surname?"*

## The short answer: we are, on one page out of two

`data/surname-context.json` already holds it — 99,560 surnames harvested from
Wikidata, CC0, every row carrying the id that said it:

    surnames in the atlas                943,938
    with Wikidata context                 99,560   (10.5%)
      of which a KIND of surname          13,013
      of which a NAMED-AFTER               2,329
      of which a language of the name     64,684
      of which a Wikipedia article        54,003

For Taylor that is: `lang: English`, `kind: occupational surname`,
**`after: tailor`**, an article, and `Q15080511`. Which is the same derivation
the search engines give, without the Quora thread.

**`site/src/pages/surname/[name].astro` renders all of it** (lines 191–225),
with the caveat that matters — *"the language of the name … is not where a
family is from. A Polish surname can be borne by people whose forebears never
saw Poland, and often is."*

**`site/src/components/RecordMap.astro` renders none of it.** The map panel is
where a reader lands first and it is the half that looks like it refuses to
answer. That is the whole gap.

## Why it was not simply an oversight

The panel is client-side and `surname-context.json` is **13 MB**. The page can
read it at build time; the panel cannot fetch it. So the fix is not "call
contextFor() in the component" — that is why it was left out.

## The approach

The map already fetches surname shards from `public/s/<key>.json` — three
letters at a time, and it is how the panel knows anything about a name at all.
Merge the context into those rows at build time:

```json
{ "n": "Taylor", "variants": […], "countries": […],
  "ctx": { "lang": ["English"], "kind": ["occupational surname"],
           "after": ["tailor"], "wiki": "https://…", "q": "Q15080511" } }
```

- **No new file, no new request.** The panel already has the row in hand.
- **Cost:** ~10% of rows gain a small object. The shards are already sharded
  precisely so no reader loads more than they asked for.
- **Where:** `scripts/build-surnames.py` writes the shards; the merge belongs
  there, reading `data/surname-context.json` exactly as the page's
  `surname-context.js` does. One source, two consumers.

Then `renderSurnames()` gains a block that mirrors the page: language, kind,
named-after, the article link, and the Wikidata id as the citation.

## What it must not become

The reason this was refused in the first place is sound, and the panel's
existing copy says it better than I would:

> Search anywhere else and you will be told an ORIGIN — that it is Latin, or
> Italian, or means «joyful». That is etymology, it is usually unsourced, and
> it is a different question from the one this map answers.

Look at what a search engine returns for Taylor: a real derivation from
Anglo-Norman *taillour*, real early bearers — *and*, with equal visual weight,
"most users on Quora agree" and "opinions on Facebook groups are mixed". The
refusal was aimed at that, and it was right.

So the rule for this block:

1. **Only what a named source says.** Wikidata's own fields, with the id shown.
   Nothing computed, nothing inferred, nothing from a model.
2. **Never in the atlas's voice.** "Wikidata says" or the field label and the
   citation — not "Taylor means a cutter of cloth".
3. **The caveat travels with it.** The language of a name is not where a family
   is from, and the page's wording for that is already right.
4. **Silence stays honest.** Lerena is not in the Wikidata set, and its card
   already says so and points at the strongest thing the atlas does know — that
   **Llerena, Spain (pop. 5,716)** is a place spelled the same way. A surname
   matching a real place is habitational evidence; folk etymology is not.
   That sentence — *"This is as close to an origin as this map will go"* —
   should stay for the 89.5% with no context.

## What this does not fix

Coverage. 10.5% is what Wikidata has about the names this atlas holds, and no
amount of UI work changes it. Raising it means either a licensed dictionary —
the Oxford *Dictionary of Family Names in Britain and Ireland* is the standard
and is **not** openly licensed — or Wiktionary, which is CC BY-SA and would
need attribution handled properly. That is a separate decision, and a
licensing one before it is a technical one.

## Decisions for David

1. **Do it?** The build change plus the panel block is small — the data, the
   caveat wording and the page layout all exist to copy.
2. **Wiktionary as a second source?** CC BY-SA 3.0, far wider coverage than
   Wikidata's structured fields, and share-alike attribution the /data/ page
   would have to carry. Worth it, but it is a licence decision.
3. **Anything else?** The habitational match is arguably the strongest origin
   signal the atlas has and is currently one line at the foot of a card. It
   could be its own statement.

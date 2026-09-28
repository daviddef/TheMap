# Cloud brief: one name, many spellings — and 355,315 attestations nobody sees

You are working in **Record Atlas** (`github.com/daviddef/TheMap`), which maps
where genealogical records are held: 943,938 surnames, 2,890,777 volumes, 519
archives.

**This task needs no network at all.** Every input is committed; the one file
that is gitignored is the output you will regenerate. A previous cloud session
was given a brief that was 95% fetching and could do almost none of it, because
this environment's egress is limited to GitHub/npm/PyPI. Nothing here fetches.

## The finding

A surname page shows the countries that surname is attested in. It does not
pool the attestation of its own variant spellings, even when it names them on
the same page.

**Defranceski** is the case that found it. The page says, under "The same name,
spelt two ways": *Defranceschi*. It then lists **10 countries**. Defranceschi's
own record carries countries Defranceski's does not. Pool the two — one link,
already displayed — and it is **19 countries**: Austria, Switzerland, Czechia,
Spain, France, Hong Kong, Poland, Puerto Rico and Russia all appear.

Measured across the whole dataset, joining ONLY evidence-grade links:

    names in the graph                      940,738
    clusters                                757,508
    names in a cluster larger than one      304,942
    largest cluster                             946 names

    surnames that would gain countries      148,825   (15.8% of all names)
    country-attestations not currently shown 355,315

Some pages show **zero** countries while their cluster has nine — `Abbel`,
`Albercht`. A page saying "attested nowhere" is one hop from real attestation.

## The rule that governs everything here

`data/surnames.json` gives every variant a `how`:

    sounds     622,625    an algorithm's guess
    spelling   243,910    one systematic substitution, both spellings attested
    grammar    145,517    an inflected form of the same name
    curated      8,248    a human decided, from documents

The dataset's own words for `sounds` are: *"An algorithm's guess. Useful for
casting a net, and not evidence."*

**Never follow a `sounds` link, and never chain one.** Doing so is how this
brief's first draft claimed 24 countries for Defranceski: seven guesses
chained end to end, presented as evidence. The honest figure from evidence
links is 19. If you find yourself merging on `sounds`, stop.

## The job

### 1. Build the clusters
Union-find over `spelling`, `grammar` and `curated` links only. Links in the
file are one-way; walk both directions. Write
`data/surname-clusters.json`: cluster id -> member names, plus for each the
pooled country set with the evidence kind that justifies each country.

### 2. Judge where a cluster stops being one name — THIS IS THE REAL WORK
The largest cluster is **946 names**. That is almost certainly not one family
of spellings; it is a chain of individually-defensible pairs, each a small step,
adding up to a merge nobody would defend end to end. `grammar` links are the
likeliest culprit (Slavic declensions: *Kowalski / Kowalska / Kowalskiego*
are one name; follow far enough and you may arrive somewhere else).

Sample clusters at each size — 2, 3, 5, 10, 25, 100, 946 — and read them.
Decide, with reasons, where a cluster stops being one name. Candidate rules to
test and report on, not to assume:

- a hop limit from the seed name;
- `grammar` only within one language, `spelling` across languages;
- a cluster diameter cap (longest path), which catches chains that a size cap
  misses;
- no rule at all, if the data turns out to be cleaner than it looks.

For each rule report: clusters affected, how the 148,825 and 355,315 figures
move, and the three worst merges it still permits.

### 3. Show your working
`docs/variant-clusters.md`: the size distribution, the samples you read, the
rule you chose, why, and the merges you are least comfortable with.

## What must not happen

**A wrong merge tells somebody their family is attested in a country it never
was.** That is worse than showing too little, because a reader cannot tell a
pooled claim from a direct one unless the page says which is which. So:

1. **Every pooled country keeps its provenance** — which member name carries
   it, by what evidence. The page has to be able to say "attested in Poland as
   *Defranceschi*" rather than implying the register held *Defranceski*.
2. **Fewer, defensible merges beat more.** Where a cluster is doubtful, split
   it and say so in the report.
3. **No `sounds`. Not once, not transitively, not "just to cast a net".**
4. Do not edit the surname page rendering. This task produces the data and the
   judgement; wiring it into the page comes after the rule is agreed.

## Practical notes

- `python3 scripts/build-surnames.py` from `site/` regenerates
  `data/surnames.json` (156MB, gitignored) from committed inputs:
  `archive-surnames.json`, `gazetteer.json`, `italy-comuni.json`,
  `wikidata-variants.json`, and `data/frequencies/*.json`.
- Run `python3 ../scripts/check-data.py` from `site/` before pushing. In a
  fresh worktree it reports pre-existing errors about generated artefacts that
  are not in the repository; diff the failure list before and after your change
  and confirm it is unchanged, rather than assuming.
- Work on a branch off `main`, push it, do not merge. Commit
  `data/surname-clusters.json` and `docs/variant-clusters.md` only.

## What to hand back

The branch, and a report that leads with the rule you chose and the number it
produces. If the honest answer is "the data will not support pooling beyond
two-name clusters", that is a perfectly good result and worth more than a large
number nobody can defend.

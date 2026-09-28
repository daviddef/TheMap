# Cloud brief: the variant graph has no notion of identity

You are working in **Record Atlas** (`github.com/daviddef/TheMap`): 943,938
surnames, 2,890,777 volumes, 519 archives, mapping where records are held.

**No network needed.** Every input is committed; the only gitignored file is
the output you regenerate. This is computation and judgement, nothing else.

## The problem, measured across every name

A surname page lists the countries that surname is attested in. It does not
pool the attestation of its variant spellings — not even the ones it prints on
the same page under "The same name, spelt two ways".

    943,938  surnames
    378,669  have at least one variant link

    countries hidden at hop 1:  571,699   affecting 217,505 names
                       hop 2:   331,019             140,166
                       hop 3:   183,046             101,503
                       hop 4:   107,009              70,856
                       hop 5:    70,370              51,691

    total attestations sitting beyond hop 0: 1,263,143

**It never converges, and that is the finding.** Every extra hop keeps
yielding countries. That does not mean walking further is valuable — it means
the graph has no natural boundary. Of roughly 1,020,300 links, **622,625 are
`sounds`**: an algorithmic phonetic match. Phonetic skeletons chain freely;
the dataset itself contains `Bär → Br → Ber → Bir → Bor → Bur`. Follow far
enough and every name is a variant of every other.

So the question is NOT "how many hops". It is that **the graph has no notion
of identity**, and 1,263,143 attestations are stranded behind that absence.

## Two ways to get this wrong — both already made, on this data

Writing this brief, two rules were proposed and both were wrong:

1. **"Follow the graph transitively."** Produced a confident 24-country figure
   for one name by chaining seven `sounds` guesses end to end. Each link was
   plausible; the seventh was nonsense.
2. **"One hop only; hop 2 adds nothing."** True for the name it was checked
   against, false for the dataset: across 20,000 sampled names hop 2 yields
   **59%** as much as hop 1.

Both came from reasoning about one family instead of sampling the corpus. Do
not repeat that. Every rule you propose gets measured across the whole set.

## The job

### 1. Characterise the graph
Build it from `data/surnames.json`, links both directions, keeping each link's
`how` (`sounds` 622,625 · `spelling` 243,910 · `grammar` 145,517 · `curated`
8,248). Report: degree distribution, connected-component sizes under each
combination of link kinds, and how component size explodes as `sounds` is
admitted. Where is the knee?

### 2. Find a real identity signal — this is the actual work
Hops are a proxy for identity and a bad one. The corpus carries signals that
might be better, and `data/surname-context.json` holds 99,560 Wikidata-linked
surnames with `lang` (64,684), `kind` (13,013) and `after` — "named after" —
on only 2,329. Candidates to test, none to assume:

- **language agreement** — two spellings sharing an attested language
- **shared root** — both derived from the same base name, where `after` says so
- **bounded edit distance** as well as phonetic equality, so `Bär`/`Bur` fails
  where `Defranceschi`/`De Franceschi` passes
- **co-attestation** — variants appearing in the same countries corroborate
  each other; variants sharing no country at all are weaker
- **link kind composition** — a path of one `spelling` plus one `sounds` may be
  sound where two `sounds` are not

For each rule report: components affected, how the 1,263,143 figure moves, and
**the three worst merges it still permits**, named.

### 3. Judge it
Sample components at every size and read them. A human has to be able to look
at a merged set and agree it is one name. Say where you stopped and why.

## What must not happen

**A wrong merge tells somebody their family is attested in a country it never
was.** A reader cannot tell a pooled claim from a direct one unless the data
carries the difference. So:

1. **Every pooled country keeps its provenance** — which member name carries
   it, under which link kind, at what distance. The page must be able to say
   "attested in Poland as *Defranceschi*", never imply the register held the
   name the reader typed.
2. **Fewer, defensible merges beat more.** "The data supports pooling only
   where language agrees" is a good outcome. A large number nobody can defend
   is not.
3. **`sounds` is not worthless and is not evidence.** It is a lead. It may
   qualify a merge in company with another signal; it must not carry one alone,
   and it must never chain.

## Practical notes

- `python3 scripts/build-surnames.py` from `site/` regenerates
  `data/surnames.json` (156 MB, gitignored) from committed inputs:
  `archive-surnames.json`, `gazetteer.json`, `italy-comuni.json`,
  `wikidata-variants.json` and all thirteen `data/frequencies/*.json`.
- `python3 ../scripts/check-data.py` from `site/` before pushing. A fresh
  worktree reports pre-existing errors about generated artefacts that are not
  in the repository — diff the failure list before and after your change and
  confirm it is unchanged, rather than assuming.
- Do not edit the surname page. This produces the data and the rule; wiring it
  in comes after the rule is agreed.
- Branch off `main`, push, do not merge. Commit
  `data/surname-clusters.json` and `docs/variant-clusters.md` only.

## What to hand back

The rule, the number it produces, and the worst thing it still lets through.
Lead with whichever of those is most likely to change the decision.

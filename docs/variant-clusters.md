# Variant clusters: a rule for pooling attestations across spellings

Lead: **the rule pools 3,877 names into 1,799 clusters and surfaces 3,639
attestations that were sitting one spelling away — 0.29% of the raw
1,263,143 figure the brief measured. That's a small, deliberate fraction of
what a looser rule would move, because every looser rule tested let through
a specific, named, indefensible merge; this one didn't, in every check this
document describes.** The worst thing it still lets through is named in
"Where this stops" below, and it's a real one — a Czech/Slovak diminutive of
*Martin* pooled with the Spanish patronymic *Martinez*, because both derive
from the same root independently rather than from each other.

Everything below is measured against the current build (`943,938` surnames,
`1,020,300` directed variant links: `sounds` 622,625 · `spelling` 243,910 ·
`grammar` 145,517 · `curated` 8,248 — these match the brief's own figures
exactly, confirming the corpus hasn't moved under this work).

## Part 1 — characterising the graph

### Degree

370,105 names (39%) carry at least one variant link; 573,833 carry none.
Degree falls off fast — 199,077 names have exactly one link — with a long
thin tail out to a handful of hubs (`Hein`, `Martin`, `Miller`, `Berger`,
each with 30–45 links, mostly `sounds`).

### Component sizes, and where the knee actually is

The brief frames the knee as a question about how much `sounds` to admit.
It isn't. **Every one of the four link kinds explodes under full transitive
closure, on its own, with no `sounds` involved at all:**

| edges admitted | components with >1 member | largest component |
|---|---:|---:|
| `curated` alone | 1,081 | **263** |
| `grammar` alone | 64,033 | 6 |
| `spelling` alone | 74,931 | **84** |
| `sounds` alone | 5,307 | **892** |
| `grammar` + `spelling` | 116,645 | **146** |
| `spelling` + `grammar` + `curated` | 115,990 | **944** |
| everything (incl. `sounds`) | 95,238 | **80,275** |

The 263-member `curated`-only component is Wikidata's `P460` ("said to be
the same as") linking Chinese, Japanese and Korean surname romanizations
across dialects — `Cao`, `Gao`, `Kōno`, `Taka`, `Takashi`, `Koo`, `Ko` all
land in one blob, because Wikidata records that 高 is read `Gao` in Mandarin
and `Kō`/`Taka` in Japanese, which is a fact about **the character**, not a
claim that two families share a name. Treated as a same-family edge and
walked transitively, it produces exactly the brief's own failure mode
(*"Follow the graph transitively… the seventh was nonsense"*) — but from
the tier the brief calls the strongest one, not from `sounds`. The
146/944-member `spelling`+`grammar` components are the same disease from a
different source: chains of single-letter systematic alternations
(`s`/`z`, `c`/`k`, `ch`/`h`, …) composing across a whole neighbourhood of
short names — `Cacha`, `Hasa`, `Chaza`, `Bassa` end up in one 146-member
component with nothing connecting most pairs but three or four intermediate
strangers.

**So "how much `sounds` to admit" was the wrong question from the start.**
The real one is: at what point does *any* kind of pairwise link stop being
safe to chain. And the answer, for `sounds` at least, is sharp enough to
call a cliff:

| sounds edges kept | components with >1 member | largest |
|---|---:|---:|
| edit distance 0 only | 3,418 | 3 |
| edit distance ≤ 1 | 7,601 | **765** |
| edit distance ≤ 2 | 5,317 | 892 |
| edit distance ≤ 3 (the build's own cap) | 5,307 | 892 |

Distance 0 here means the two spellings are identical once folded and
separator-stripped (`Aarø`/`Aarø` differing only in how a byte sequence was
encoded, `Abou-Ali`/`Abouali` differing only in a hyphen) — genuinely the
same string, not a variant of it. The instant a real edit is allowed
(distance 1: one substitution, insertion or deletion — 313,154 of the
383,729 `sounds` edges, 82% of them), the graph jumps from a largest
component of 3 to one of 765. There is no gentler slope to walk down; the
knee is between "no edit" and "one edit," which is another way of saying
`sounds`, an edit-distance measure by construction, has no safe non-zero
setting once you let it compose with itself. The brief's own example
(`Bär → Br → Ber → Bir → Bor → Bur`) is a chain of six such 1-edit steps.

## Part 2 — testing the candidate signals

Each candidate was measured, not assumed, against how it moves component
structure and specifically against pairs already known to be right
(`Defranceschi`/`Defranceski`) or already found to be wrong.

### Language agreement (`surname-context.json`'s `lang`) — rejected

Coverage is thin to begin with: of the 183,766 edit-distance-approved
`spelling`/`grammar`/`curated` edges, only 5,111 (2.8%) have `lang` recorded
on both endpoints. Where it exists, it **disagrees 37% of the time** —
and reading the disagreements shows why it can't be used as a gate:
`Abramovich` (Russian) / `Abramovych` (Ukrainian), `Adamowicz` (Polish) /
`Adamovich` (Russian, Belarusian, Hungarian), `Acevedo` (Spanish) /
`Azevedo` (Portuguese). These are exactly the cross-border spelling variants
the whole exercise exists to find. Requiring language agreement would have
rejected the flagship case this atlas is built on
(`Defranceschi` is tagged differently from `Defranceski` in every source
that distinguishes Italian from Croatian/Slovene orthography) along with
most of the genuinely good merges found below. **Language disagreement is
the normal signature of a real variant pair here, not evidence against
one.** Not used.

### Shared root (`after`) — kept as a bonus, never a gate

Only 181 of the 183,766 candidate edges (0.1%) have `after` on both ends,
and where they do it agrees 93% of the time (168/181) — a good precision,
useless coverage. It is carried through into the output as an annotation
where it exists (not implemented as a gate, since it would gate almost
nothing) rather than dropped.

### Bounded edit distance — necessary, not sufficient

A flat cap (distance ≤ 2, say) is not enough on its own: `Wang`, `Zhang`,
`Kang`, `Ong`, `Hong` all land within 2 edits of each other and of nothing
in common except length and a nasal-final Chinese-syllable shape — they are
different surnames. The fix that helps is **scaling the cap to the shorter
name's length** (`max(1, min(3, len // 4))`, the same formula the build
script's own `near()` already uses for `sounds`, applied here to every
kind) — and separately, **refusing any pair shorter than 5 characters once
separators are stripped**, because at that length a bounded edit distance
stops being informative: `Cook`/`Zook` are one substitution apart and are
not the same family; `China`/`Hina` likewise. Both refinements are load-
bearing; distance alone is not.

### Co-attestation — the sharpest, and the trickiest, of the five

The brief's instinct is right — variants sharing a country corroborate each
other — but the naive version is gameable. `Cook` (attested in BE, DK, ES,
FR, PL, US — six of this atlas's largest, most complete national registers)
and `Zook` (attested only in the US) share exactly the one country every
plausible English-looking name will hit by base rate. `Hasan` (10
countries) and `Hazan` (6) overlap on BE/DK/ES/FR/PL/US in full — again,
the six largest registers, and nothing else. Requiring *any* shared country
lets both through; requiring co-attestation **outside the six near-complete
registers** (`BE`, `DK`, `FR`, `PL`, `US`, `ES` — each tens to hundreds of
thousands of names, essentially a full national count) unless the
attestation there is `archive` tier (a named family study, precise
regardless of the register's size) correctly rejects both, while keeping
`Defranceschi`/`Defranceski` (they share `AU`, `HR`, `IT`, `US` — `AU`,
`HR` and `IT` all outside the saturated six). This "meaningful
co-attestation" test is the single biggest lever in the whole rule: dropping
it (or defining it as "any shared country") is what let three of the worst
merges below through.

### Link-kind composition — `curated` had to be demoted

The brief's own tiering calls `curated` the strongest evidence — a human
looked at two spellings and said they were the same family. On this
corpus's specific `curated` source (Wikidata's `P460`), that trust doesn't
hold at the kind level: it produces the 263-member CJK-romanization blob
above, and even after every other filter in this rule (bounded, scaled edit
distance; length ≥ 5) a purely `curated`-seeded edge set still links `Dang`
→ `Tang` → `Tong`, `Deng` → `Teng`, `Song` → `Sung` — a chain that puts
`Dang` and `Song` three hops apart under nothing but Wikidata pairs, with no
`spelling` or `grammar` edge anywhere on the path. **`curated` cannot seed a
merge here.** It is demoted to what `sounds` already was in the brief's own
framing: a decoration that can sit alongside a `spelling`/`grammar` edge
(and in the shipped data, 281 of the 1,799 final clusters do carry a
`curated` edge alongside a verified one) but never establishes one on its
own. Only `spelling` (a listed, deterministic orthographic substitution)
and `grammar` (a documented grammatical pairing, e.g. Polish gendered forms)
seed a pooling edge in the final rule.

## Part 3 — judging it

Components were read at every size the final rule produces (2 through 9,
which is all of them — one 10-member component was the only one over the
cap, and is excluded). Below size 6, sampling was broad and random; size 6
and up, every surviving component was read, since there are few enough to
(61 at size ≥6, all read). A second, automated pass cross-checked every
final cluster against `surname-context.json`'s `lang` field, flagging 62 of
1,799 clusters (3.4%) where two members' recorded languages don't overlap
at all, for manual reading rather than as an automatic rejection (per the
finding above that language *disagreement* is usually the correct signature
of a real variant, not a red flag).

### Where earlier, looser rules stopped being defensible

Testing didn't start at the final rule. Two intermediate rules were built,
measured, and abandoned, and the reason each was dropped is itself part of
the evidence for the final one:

**Rule A** — `spelling`/`grammar`/`curated`, scaled edit distance, *any*
shared country, components ≤ 9 — pooled 195,460 names into 84,548 clusters
(133,630 attestations surfaced, 10.6% of the raw figure). Reading it found:

1. **`Chasan`/`Chassan`/`Chazan`/`Hasan`/`Hassan`/`Hazan`/`Khazan`/`Ḥazzan`**
   (8 members) — a direct `spelling` edge (`s`↔`z`, cap 1) links `Hasan`,
   one of the commonest personal names in the Muslim world, straight to
   `Hazan`/`Chazan`, a Hebrew occupational surname (a synagogue cantor).
   The co-attestation that let it through was the six-country base-rate
   overlap described above.
2. **`Cook`/`Coke`/`Zook`** and neighbours — English occupational "cook"
   merged with `Zook`, a documented Americanisation of the Swiss-German
   Mennonite surname `Zug`, on a single edit and a shared `US` register row.
3. **`China`/`Chini`/`Chinna`/…/`Hina`/`Hini`/`Hinna`** (8 members) — no
   defensible shared origin, connected only by short-string coincidence and
   the same base-rate co-attestation problem.

**Rule B** — Rule A plus "meaningful" co-attestation (excluding the six
saturated registers), `curated` still allowed to seed — pooled 6,458 names
into 2,732 clusters. This correctly rejected all three of the above. But
with `curated` still able to seed on its own, the CJK-romanization chain
(`Dang`/`Tang`/`Tong`/`Deng`/`Teng`/`Song`/`Sung`, 8 members, `Dang` and
`Song` 3 hops apart) survived, and a `Backe`/`Baese`/`Base`/`Bazell`-style
9-member component (edit-distance-bounded but not by kind, mixing several
unrelated short Germanic-looking names) was still visible at larger sizes.
Demoting `curated` (the final rule) removed both.

### The final rule, read in full

- **1,799 clusters, 3,877 names, 3,639 attestations surfaced** (hop 1:
  3,139 · hop 2: 397 · hop 3: 103 — pooling is capped at 3 hops inside a
  cluster even though the cluster itself may be smaller, because a chain of
  individually-verified edges can still walk further than any one edge
  should carry; dropping the cap only added 12 more attestations, so it
  cost almost nothing).
- Every component at size 6 and above (61 of them) was read in full. All
  are internally consistent — overwhelmingly South Slavic patronymic
  clusters (`Kaiser`/`Kajzer`/`Kajser`, `Cucic`/`Cukic`/`Kučič`/`Sukič`/
  `Susic`/`Suzić`/`Sučić`/`Zukic`/`Žužić`) built on the same `c`/`k`/`s`/`z`
  consonant alternation the build script's own `spelling` tier already
  documents for exactly this reason.

**Where this stops, and the worst thing that survives.** The automated
language-mismatch sweep's most defensible flag, after reading its 62 hits,
is **`Martinec`/`Martinek`/`Martines`/`Martinez`** (4 members): `Martinec`
and `Martinek` are Czech/Slovak diminutives of *Martin*; `Martinez` is the
Spanish patronymic of the same root, formed independently, centuries and a
continent apart, by an entirely different word-formation process (a
patronymic suffix, not a diminutive one). They pass every structural
filter — bounded scaled edit distance, length ≥ 5, co-attestation outside
the saturated six — because both really do derive from *Martin*, just not
from each other. This is the shape of error the rule cannot rule out:
two names that share an ultimate root without sharing a lineage. It is a
smaller, more specific failure than anything Rules A or B let through, and
it is named here rather than left for a reader to find.

**Most of what the final rule "gets wrong" is recall, not precision.** It
is heavily concentrated in South Slavic surnames, because Slovenia (30,412
names) and Croatia's lookup (143 names) are the only sizeable registers
outside the six saturated ones, so co-attestation only has room to be
meaningful where one of those is involved. A real pair like `Boehm`/`Böhme`
(German) that happens to be attested only in the saturated six would be
correctly *rejected* by this rule for lack of any non-saturated country to
corroborate on — not because it's wrong, but because this rule has no way
to tell it apart from `Cook`/`Zook` without one. Widening that requires
either more small, precise (ideally `archive`-tier) sources, not a looser
edit-distance or co-attestation threshold — loosening either of those is
exactly what Rules A and B tried, and exactly what let the named merges
above through.

## What the output file carries

`data/surname-clusters.json` — **not wired into the site.** One entry per
cluster; each member lists its own direct countries (`own`) and every
country reachable from another member of the same verified cluster
(`pooled`), each pooled row carrying:

- `cc` — the country
- `via` — which other member actually carries that attestation
- `how` — that member's own evidence tier for it (`register` or `archive`)
- `hops` — distance within *this verified cluster* (never the raw variant
  graph — a number here of 2 or 3 means two or three individually-checked
  edges, not an unverified leap)
- `link` — the edge kind(s) on each hop of that path

A surname page consuming this can say "attested in Poland as *Defranceschi*"
and mean it, and never has to say "attested in Poland" in a way a reader
would mistake for a claim about the name they typed.

## Practical notes

- Built from the current `data/surnames.json` (regenerated via
  `python3 scripts/build-surnames.py` from `site/`; counts above match the
  brief's own figures exactly, so nothing in the base data moved under this
  work).
- `python3 ../scripts/check-data.py` from `site/` passes (`data is sound`)
  with `data/surname-clusters.json` present; the file is not yet referenced
  by anything the gate or the build checks, by design — wiring it into the
  surname page is a separate, later step per the brief.
- The analysis scripts that produced this file were written and run outside
  the repository (this task's instructions ask for the data and the write-up
  only) and are not committed; the method is fully described above so it can
  be reproduced.

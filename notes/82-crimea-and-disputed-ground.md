# Crimea, Sevastopol, Melilla, Carriacou — a policy for you to choose, 16 October 2026

**Nothing in the data has changed. This is a decision for David.**

Four places are filed under a country other than the one the outline puts them in
(`data/country-overrides.json`, each with a written reason): Crimea and Sevastopol
(filed Ukraine, outline says Russia), Melilla (filed Spain, outline draws Morocco's
shore through it) and Carriacou (filed Grenada, outline groups it with the
Grenadines). The overrides already state the reason, and it is the same reason each
time: **this atlas is about where the paper is, and the paper was catalogued under
those filings.** What is missing is one sentence on the site that says so.

## The rule I would propose (recommended)

> A place is filed under the country whose archives hold its historical registers,
> and the map says so when that differs from who controls the ground today. This is
> a statement about records, not about sovereignty.

Why this one: it is already what the four overrides do; it can be applied to every
future case without a new argument; and it matches the audit's finding that the
data's job is to tell a researcher whom to write to.

## Alternatives

1. **Follow the outline (de facto control).** Crimea becomes Russia. Simple, but the
   historical registers are catalogued and digitised under Ukrainian archives, so a
   researcher would be sent to the wrong door.
2. **Show both.** A place carries `filedUnder` and `controlledBy`. More honest, more
   work: it needs a field, a legend line, and a decision for each future case.
3. **Say nothing.** The current state. The overrides are correct and invisible.

## What I need from you

Choose 1, 2, 3, or the recommended rule. If the rule, I will add the sentence to the
About page and to the legend, and a gate that every override carries a `why` (it
already does).

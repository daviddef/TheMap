# Following the audit of 16 October 2026 — what was done, what was found, what is left

This follows `notes/80-audit-flags-places-surnames.md`. Every figure was measured by a
script on the day. Where something was not done, it says so.

## Done

**1. Evidence on flag eras (recommendation 1) — the Netherlands, as the model.**
`data/flag-evidence.json` holds, per era: a class (attested, symbolic, none, reconstructed,
or unreviewed), the sources that were read and the date they were read, what they establish,
and what could not be confirmed. The page shows it under each era. Of 12 Dutch eras, 6 are
attested, 1 is an emblem, 2 have no flag, 3 are marked not yet checked. `check-data.py`
fails an «attested» label with no primary or reference source (or two publishers), an
undeclared or unused source, or an era the page does not have; `check-built.py` fails if the
file and the built page disagree on the number of panels.
Reading the page against its sources removed: the 1937 decree credited with fixing a shade
it does not name; a Sea Beggars flag Wikipedia calls uncertain; a «ban in 1943» nobody could
source; the VOC/New Amsterdam claim; a Batavian «canton» (it was the navy's Maiden emblem);
and the Frisii that Tacitus does not name. **One conflict is left standing on purpose:** the
Royal House says the 1937 decree used the vermilion/cobalt wording and Flags of the World
dates that to 1958. Both are recorded.
**Not done:** the other 209 pages. The Netherlands is the model, not the finished set.

**2. Two accuracy tests are now build gates (recommendation 3).** A place's country must be
backed by the collections that hold its books or by a same-name gazetteer row within 25 km;
a settlement's coordinates must have a same-name gazetteer row within 25 km in its own
country, or be pinned or audited. Runtime is about 15 seconds.
Running the first test as a gate found what the audit had missed, because the old gate asks
the outline and the outline is what chose the country: **33 border-region places were filed
under the wrong country**, among them Jasenovac, Metković and Davor, listed as Bosnia and
Herzegovina, and Tovarnik, listed as Serbia, while every one of their registers is in
«Croatia, Church Books». They are corrected (32 to Croatia, Hodoš to Slovenia), each with its
reason in `data/country-overrides.json`. Three coordinates were wrong too: Hum (Buzet) was
in Slovenia, Stari Grad (Hvar) was in the north of Croatia, and Torino (the Diocese of Turin)
was in Abruzzo. Seven places carry a note beginning «Audited» saying exactly what was and
was not confirmed. **Kamensko (Karlovac)** is the one left wrong on purpose: the point is a
Kamensko in Dalmatia, there are two candidates in Karlovac county, and nothing says which.

**3. Flag seams (recommendation 4).** `data/flag-seams.json` lists all 84 places where one
era does not meet the next (a year of difference does not count). 31 overlaps are marked
concurrent, from the polity names; 53 gaps are marked unreviewed. A new seam fails the
build. 10 eras have no id and 7 have no image; both lists are frozen, so a new one fails.
A date-parsing defect surfaced on the way: «3 – 13 August 1903» was read as the year 3.
**Not done:** the 53 gaps are not reviewed. Several look like real coverage holes (China's page has no
era dated between 206 BCE and 618 CE), but an era whose dates are written as centuries
carries no year and is not counted, so each gap needs a person to look.

**4. Sounds-alike surname variants (recommendation 5)** are closed behind a labelled
disclosure («N possible variants, unverified»). They are not deleted.

**5. Outside ids (recommendation 7), as a pilot.** `data/place-ids.json` attaches a Wikidata
item and a GeoNames id to 451 places in Croatia, Slovenia and Bosnia, matched on name and
country within 5 km, from Wikidata's own GeoNames statements. 428 of 1,166 Croatian
settlement places matched; the rest did not, and none was forced. Place pages show the ids.
Italy was not done (the single query timed out); the United States was not tried.

**6. Evidence tier on every place page (places, recommendation 1).** A line states how the
place is on the map, from the data's own `via` field.

**7. Surname registers (recommendation 6): researched, not added.** See
`notes/81-surname-registers-survey.md`. None of the Netherlands, Sweden, Czechia or
Germany offers an open bulk file that a search could find.

**8. Crimea and disputed ground (recommendation 8): drafted, not decided.** See
`notes/82-crimea-and-disputed-ground.md`. This is David's choice.

## Still open, and why

- The 53 unreviewed flag gaps and the 3 unchecked Dutch eras.
- The 209 other flag pages have no evidence panel.
- Czech, Italian, Swedish and Dutch letters: only the Czech one is sent. Sending is David's.
- 74 catalogue places that are consistent but unnamed, and Kamensko.
- Italy and the United States for outside ids.

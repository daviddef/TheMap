# Prekmurje as a record region (draft)

Why: `build.py` assigns every place to the first region ring that contains it. Prekmurje fell into `carniola` (a four-point rectangle) or `hungary`, so Tišina and Grad showed Carniola's 1813–1918 table (Austria) for ground that was in the Kingdom of Hungary until 1918. The new region sits **before** `hungary` and `carniola` in `regions.json`, because the first ring wins.

## The ring (22 points, `data/regions.json`)

Drawn from the gazetteer, not from memory. The north and east edges are the midpoint between the northernmost/easternmost Slovenian village and the nearest Austrian or Hungarian one, per 0.04° strip. The south edge follows the Mura between settlements known to be on each side. The west edge was widened after the first pass cut off villages that carry Hungarian-form names (Murski Petrovci/Murapetroc, Sodišinci/Biroszek, Gederovci/Kohida, Petanjci/Szechenykut, Korovci/Karolyfa, Fikšinci/Kismariahavas, Ocinje/Gedoudvar): a Hungarian name in the gazetteer marks the Hungarian side of the old frontier.

Tested against the gazetteer's own coordinates:

| test | result |
|---|---|
| 35 named anchors (21 Prekmurje towns in, 13 neighbours out, Grad in) | 0 failures |
| Slovenian places inside | 172 |
| Austrian / Hungarian places inside | **1**: Zelting (AT), about 100 m from the frontier, below the precision the ring claims (`precision` in regions.json) |
| Slovenian places north of the Mura left outside | 28, all in the Radenci / Gornja Radgona / Kocjan cluster (Styrian side) |

Borderline and unresolved: **Šratovci and Mele** (no Hungarian name, left outside); **Veržej** is about 1 km from the edge.

## The eras and where each field comes from

| era | filedUnder | basis |
|---|---|---|
| 1000–1526 Kingdom of Hungary | none | note copied from the `hungary` region ("Before registers.") |
| 1526–1699 | none | no claim made; the Hungary region's Ottoman "hole" note is **not** copied, since it is about the centre of the kingdom |
| 1699–1867 | mnl, hungaricana, familysearch | **inherited** from `hungary` for the same regime. Not checked that these cover Prekmurje specifically |
| 1867–1918 | mnl, hungaricana, familysearch | same; note is the `hungary` region's civil-registration sentence (1 October 1895) plus FamilySearch collection 1985107 "Slovenia, Prekmurje and Međimurje, Civil Registers, 1895-1918" (in `data/collections.json`) |
| 1918–1941 | ars-si, sira, dlib-si | copied from `carniola`'s Slovenia-wide providers; note points to the `hungary` region's Trianon note |
| 1941–1945 Annexed by Hungary | mnl, ars-si | **inferred**: `carniola` says the 1941 partition included Hungary; that this was Prekmurje is general history, not stated in the repo |
| 1945–1991, 1991–2026 | as `carniola` | Slovenia-wide providers and notes copied verbatim |

Things to check before merging:
- **1918 vs 1920.** The era break is 1918 like the neighbouring regions; the transfer was formalised at Trianon in 1920 (the `hungary` region says so).
- **Inherited `filedUnder`** (1699–1918) should be confirmed against what the Hungarian archives actually hold for Vas and Zala counties.
- **Međimurje is not covered.** The same FamilySearch collection includes it, but it is in Croatia, was Zala county, and still falls in `hungary`.
- `countries` is `SI, AT, HU` because that is what the repo's rule (ring vertices, edge midpoints, centre) yields; it makes the coverage page count this region for AT and HU.

## Effect on existing places

36 rows in `places.json` change region: 21 from `carniola` and 15 from `hungary`, all Prekmurje towns and municipalities (Murska Sobota, Lendava, Beltinci, Turnišče, Tišina, Grad, Hodoš and their municipalities). Nothing else moves.

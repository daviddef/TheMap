# Places whose country disagrees with their FamilySearch collections

Run 13 October 2026, offline. For each row of `data/places.json` carrying FamilySearch volumes, the `cc=` in each volume URL was joined to `data/collections.json` and its `countries`. A place is listed when its own `country` is **not among** those countries.

**1,219 places carry FamilySearch volumes; 69 disagree (5.7%). 52 are within 25 km of the collection's country, 17 are further (`senja` among them, now fixed).** 25 km is the same tolerance `check-data.py` and `promote-collection-places.py` already use for "the outline is coarse, or it is a border town".

`data/fs-volumes-promote.json` could not be tested the same way: its 48,429 rows carry no volumes (keys: id, name, country, lat, lon, from, why). The volume-to-place join lives in `fs-volumes-world.json.gz`, a `harvest-data` release asset not present in this checkout. It holds no `<settlement>, Sv. X` row either.

All `<settlement>, <parish>` rows in places.json (12): Dramalj, Jakuševec, Karlovac, Kašt, Odra, Orehovec, **Senja**, Skitača, Varaždin, Zagreb, Čvrstec, Žabno. Only Senja is wrong; the other 11 are filed HR and none disagrees with its collections. So the genitive misreading is **one row**, not a pattern in this file.

## 17 beyond 25 km — look at these

| km from collection country | id | name | filed as | collections' country |
|---|---|---|---|---|
| 242 | krug | Krug | AT | HR ×1 |
| 242 | grad | Grad | HR | SI ×10 |
| 195 | svjakovsiljevica | Sv. Jakov-Šiljevica | RS | HR ×5 |
| 120 | senja | Senja, Sv. Juraj | RS | HR ×6 |
| 104 | klasnic | Klasnić | RS | HR ×1 |
| 88 | zemun | Zemun, Serbia | RS | HR ×2 |
| 71 | suhodol | Suhodol | BA | HR ×1 |
| 68 | tisina | Tišina | HR | SI ×4 |
| 64 | starapazova | Stara Pazova, Serbia | RS | HR ×1 |
| 61 | staribar | Stari Bar, Montenegro | ME | HR ×1 |
| 53 | zankovic | Zanković | ME | HR ×14 |
| 46 | zlosela | Zlosela | BA | HR ×1 |
| 39 | subotica | Subotica | HR | SI ×12 |
| 36 | meljani | Meljani | BA | HR ×1 |
| 29 | turnisce | Turnišče | HR | SI ×14 |
| 29 | bale | Bale | ME | HR ×8 |
| 26 | svetamarija | Sveta Marija | HR | SI ×11 |

`senja` was the worst of these before the fix (120 km) and is now HR, inside `kvarner`. The rest are not changed: some are probably the same kind of fault (a namesake matched across a border: Grad, Krug, Klasnić, Sv. Jakov-Šiljevica, Bale, Subotica, Tišina), others are real places that held Croatian books across a historic frontier (Zemun, Stara Pazova, Stari Bar). Telling them apart needs the Defranceski archive's source geocode, not this repo.

## 52 within 25 km — mostly border towns

These are the expected noise: Bosnian-side villages on the Sava whose books are Croatian, Istrian towns filed under Italy, Međimurje/Prekmurje parishes. Not expected to be wrong. Listed for completeness.

| km | id | name | filed as | collections' country |
|---|---|---|---|---|
| 24 | brtonigla | Brtonigla | HR | IT ×2 |
| 21 | trst | Trst | IT | HR ×1 |
| 20 | buje | Buje | HR | IT ×2 |
| 16 | svetijurajutrnju | Sveti Juraj u Trnju | HR | SI ×7 |
| 15 | hodosan | Hodošan | HR | SI ×1 |
| 14 | piran | Piran | SI | IT ×5 |
| 11 | rogolji | Rogolji | BA | HR ×1 |
| 10 | domasinec | Domašinec | HR | SI ×1 |
| 9 | okruglivrh | Okrugli Vrh | HR | SI ×5 |
| 9 | gardinovec | Gardinovec | HR | SI ×5 |
| 8 | ziskovec | Žiškovec | HR | SI ×1 |
| 8 | gornjihrascan | Gornji Hrašćan | HR | SI ×3 |
| 7 | izola | Izola | SI | IT ×11 |
| 6 | strmica | Strmica | BA | HR ×2 |
| 6 | slavonskikobas | Slavonski Kobaš | BA | HR ×2 |
| 6 | nebljusi | Nebljusi | BA | HR ×1 |
| 6 | kobas | Kobaš | BA | HR ×4 |
| 5 | vratisinec | Vratišinec | HR | SI ×8 |
| 5 | kamensko | Kamensko (Karlovac) | BA | HR ×10 |
| 4 | vinjani | Vinjani | BA | HR ×2 |
| 4 | vid | Vid (Metković) | BA | HR ×3 |
| 4 | gradin | Gradin | SI | HR ×2 |
| 3 | zdala | Ždala | HU | HR ×3 |
| 3 | topolo | Topolo | BA | HR ×1 |
| 3 | svetimartinnamuri | Sveti Martin na Muri | HR | SI ×7 |
| 3 | staragradiska | Stara Gradiška | BA | HR ×5 |
| 3 | plemenitas | Plemenitaš | SI | HR ×1 |
| 3 | orah | Orah | BA | HR ×1 |
| 3 | dubocac | Dubočac | BA | HR ×1 |
| 3 | cabar | Čabar | SI | HR ×4 |
| 3 | borojevici | Borojevići | BA | HR ×1 |
| 2 | turke | Turke | SI | HR ×4 |
| 2 | tovarnik | Tovarnik | RS | HR ×13 |
| 2 | ricice | Ričice (Imotski) | BA | HR ×1 |
| 2 | prislin | Prišlin | SI | HR ×3 |
| 2 | podravskamoslavina | Podravska Moslavina | HU | HR ×2 |
| 2 | metkovic | Metković | BA | HR ×5 |
| 2 | mackovac | Mačkovac | BA | HR ×2 |
| 2 | klakar | Klakar | BA | HR ×3 |
| 2 | hodos | Hodoš | HU | SI ×1 |
| 2 | gola | Gola | HU | HR ×6 |
| 1 | svilaj | Svilaj | BA | HR ×4 |
| 1 | stravca | Stravča | BA | HR ×2 |
| 1 | sot | Sot, Serbia | RS | HR ×1 |
| 1 | rajevoselo | Rajevo Selo | BA | HR ×4 |
| 1 | racinovci | Račinovci | BA | HR ×4 |
| 1 | jasenovac | Jasenovac | BA | HR ×4 |
| 1 | hum | Hum (Buzet) | SI | HR ×5 |
| 1 | dubica | Dubica | BA | HR ×3 |
| 1 | davor | Davor | BA | HR ×8 |
| 0 | sumece | Šumeće | BA | HR ×2 |
| 0 | osredci | Osredci | BA | HR ×1 |

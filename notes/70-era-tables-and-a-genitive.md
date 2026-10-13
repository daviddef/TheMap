# Three faults behind two blank panels

Written 13 October 2026 for a cloud session. **Everything here is local work —
no web access is needed or wanted.** The gazetteer, the regions file and the
waypoints all answer on disk. Do not harvest anything.

David found these in two screenshots: the Senj place page, and Senja, Sv. Juraj.
Each panel looked like one bug and is three.

---

## 1. `filedUnder` prints raw provider ids

**What he saw.** The Senj era panel reads

> 1991–2026 · dari

**What `dari` is.** `Državni arhiv u Rijeci` — the state archive in Rijeka, a
real provider, correctly filed against the Kvarner's eras. It is the archive you
would actually write to for Senj. The panel is printing its id.

**Where.** `site/src/components/RecordMap.astro`, in the band builder:

```js
var filed = (e.filedUnder || []).length
  ? (e.filedUnder || []).map(esc).join(" · ")
```

`e.filedUnder` is a list of provider ids from `data/regions.json`. Nothing maps
them to names. The 1469–1809 era is worse — it shows `dari · arhinet ·
familysearch`, three ids in a row.

**The constraint that shapes the fix.** `RecordMap.astro` has no provider
lookup. `providers.json` is fetched client-side in exactly one place,
`site/src/pages/my-research.astro:431`, and adding a second runtime fetch to the
map for a label is the wrong trade.

**Preferred fix.** Resolve at build time. `scripts/build.py` already reads
`data/regions.json` and `data/providers.json` in the same run; have it write the
names alongside the ids so the client renders what it is given. Keep the ids —
something else may key on them — and add names rather than replacing.

**Check it with:** Senj's 1469–1809 era should read three archive names, and its
1991–2026 era should read `Državni arhiv u Rijeci`.

---

## 2. `senja` is a Croatian parish filed in Serbia, because a genitive was read
   as a nominative

**This is the real one.** It explains the whole second screenshot.

`data/places.json` holds:

```json
{ "id": "senja", "name": "Senja, Sv. Juraj",
  "lat": 44.52, "lon": 20.59528, "country": "RS", "denoms": ["rc"] }
```

That point is in Serbia, south-east of Belgrade, near Despotovac.

**It is wrong, and the records say so.** All six of its volumes come from
FamilySearch collection `2040054`, which is titled **`Croatia, Church Books,
1516-1994`** and carries `cc: ["HR"]`. They are Roman Catholic registers
beginning in **1695**. That ground was Ottoman until 1718. A Catholic parish
keeping registers there in 1695 did not exist.

**Why it happened.** The waypoint name is literally `Senja, Sv. Juraj`, and
`Senja` is not a place — it is the **genitive of Senj**. The string means
*Sv. Juraj, of Senj*: the parish of St George belonging to Senj, on the Croatian
coast. It was read as a nominative place name and matched to Senja in Serbia,
which does exist.

**The right answer is already on disk.** The gazetteer holds

```
Sveti Juraj   HR   44.9283, 14.9219   pop 542   — 6.9 km from Senj
```

**Why both panels broke.** With `country: RS` and a Serbian point, the place
falls outside all 41 record regions, so the «whose ground this was» table has
nothing and prints *Not yet mapped*. The era table it does show — 1166 … 2006,
Republic of Serbia — is the country-level fallback. Correct for Serbia, wrong
for this parish. Fix the country and the point and it falls inside **kvarner**,
which already carries a full era table and names `dari` as its archive.

**Then audit for siblings, which is the larger half of this task.** Croatian
waypoints take the form `<settlement-genitive>, <parish>` and any of them can be
misread the same way. In the same collection: `Ludbreg, Sv. Juraj u Trnju` is
nominative and fine; `Senja, Sv. Juraj` was not. Sweep `data/places.json` and
`data/fs-volumes-promote.json` for rows whose country disagrees with the country
of the collections they hold — that test is cheap, needs nothing external, and
is what would have caught this one. Report what it finds before changing rows.

**Do not** fix this by special-casing the string `Senja`. The fault is the
reading rule, and the audit is how you find out how much it cost.

---

## 3. One era in five carries no note

Measured across `data/regions.json`:

> **47 of 230 eras in 41 regions have no note — 20%.**

Worst: `dalmatia` 6 of 10 blank, `imotski` 5 of 7, `istria-south` 4 of 9,
`kvarner` 4 of 8, `moravia` 4 of 6, `cape` 4 of 6.

This is why Senj's 1991–2026 panel says *No note recorded for this era.* It is a
**data gap, not a bug** — the renderer is doing the right thing and saying so
plainly.

**Scope this carefully.** Writing 47 historical notes is editorial work, and
this atlas's standing rule is that only positive evidence goes into a data row.
Do not invent them. The useful cloud-session output is the list — which era in
which region, with its years and polity — ordered so David can see what is worth
writing and what can stay quiet. If any note is drafted, it must be checkable
against something already in the repo, and say what.

---

## Order of work

1. **§2 first** — it is wrong data on a public page, and the fix is one row.
2. **§2's audit** — the sweep for country disagreements. The number matters more
   than the one row.
3. **§1** — a display fix, contained.
4. **§3** — the list only, unless David asks for prose.

## What done looks like

- `senja` resolves inside `kvarner`, with its era table and `Državni arhiv u
  Rijeci` named.
- A reported count of other places whose country disagrees with their
  collections, whether or not any are changed.
- Senj's era panel names archives instead of ids.
- A list of the 47 blank eras.
- `npm run check` clean, and the full build green before anything is pushed.

## Two things that will bite

- **The release asset.** If anything regenerates `fs-volumes-world.json.gz`,
  it must be uploaded to the `harvest-data` release immediately before the push,
  not before the build — an early upload makes the repo un-deployable for every
  other session. See the memory note of the same name.
- **`providers.json` is shared.** Other sessions edit it live. Read and write in
  one process and check the diff.

# Contributing

The data is plain JSON in `data/`, small and hand-editable. There is no build step you need
to understand and no database.

## Before you send anything

```sh
python3 scripts/check-data.py
```

It fails loudly and names the file and the row. The deploy runs the same check, so nothing
lands that does not pass it.

## The three files

### `data/providers.json` — who holds records

```json
{ "id": "antenati",
  "name": "Antenati",
  "url": "https://antenati.cultura.gov.it/",
  "kind": "national-archive",
  "access": "free",
  "countries": ["IT"],
  "what": "One or two sentences. What ground, what years, what kind of record.",
  "deepLink": "https://antenati.cultura.gov.it/ark:/{ark}",
  "checked": "2026-09-16" }
```

**`access` describes the ordinary visitor, not the best case.** FamilySearch is `account`,
not `free`, because its images need a login and some are locked to a Family History Centre.
Getting this wrong is worse than leaving the provider out — somebody plans an evening
around it.

| | |
|---|---|
| `free` | images, no account |
| `account` | images, free, but you must register |
| `index` | an index only, no images |
| `mixed` | partly free, partly paid |
| `paid` | behind a paywall |
| `catalogue` | a catalogue entry only; the paper is not photographed |
| `onsite` | on paper, in the building |

### `data/regions.json` — whose archive a piece of ground was

The most valuable file here, and the hardest to fill. An era needs `filedUnder` — the
providers that actually hold the records of those years:

```json
{ "from": 1918, "to": 1943, "regime": "italy",
  "polity": "Italy — Provincia dell'Istria",
  "filedUnder": ["dapa", "familysearch"],
  "note": "THE TRAP. Records of these years are filed under ITALY, not Croatia." }
```

A `note` beginning `THE TRAP` is rendered in red on the site. Use it for a period whose
records are filed somewhere nobody would think to look — that is what this map is for.

### `data/places.json` — places and their volumes

```json
{ "id": "gracisce", "name": "Gračišće", "country": "HR",
  "lat": 45.28, "lon": 14.02, "region": "istria-central",
  "names": [{ "n": "Gallignana", "kind": "older" }],
  "collections": [
    { "provider": "familysearch", "title": "Births 1757-1888",
      "kinds": ["b"], "from": 1757, "to": 1888,
      "access": "account", "url": "https://www.familysearch.org/ark:/61903/…" }
  ] }
```

`names` is what makes the find box work across centuries — every form a place has been
written in belongs here.

## Rules the gate enforces

- Every provider carries a `checked` date in `YYYY-MM-DD`, and an https url.
- Every `provider` and `filedUnder` reference resolves to a real provider id.
- `free`, `account` and `paid` collections **must** carry a `url`. If you cannot link to it,
  it is `catalogue` or `onsite`.
- A place's coordinates must fall inside the country it claims. Where a real border is
  closer than the outline can resolve, add a **reasoned** entry to
  `data/country-overrides.json` — an override with no `why` is rejected.

## Style

Prose in the data files is read aloud on the site. Write plainly, say what is true, and say
what is not known rather than rounding it up.

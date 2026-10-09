#!/usr/bin/env python3
"""Finnish surnames, from the Digi- ja väestötietovirasto's own open data.

WHY THIS FILE EXISTS NOW AND NOT IN SEPTEMBER.

data/frequencies/_refused.json recorded Finland as obtainable-but-gated, and
its working was sound: Statistics Finland holds no names and never did — they
belong to the DVV — and the DVV's own page sends anyone wanting the DATA to
avoindata.fi, which answered «403 to every request» and «403 to an identified
crawler». The verdict was «a working lookup for humans; the file is behind the
gate», and this project does not climb gates.

Retested 9 October: it answers 200. The portal MOVED — avoindata.fi now
redirects to avoindata.suomi.fi — and a redirect the old harvester did not
follow is indistinguishable from a refusal if you only look at the status
code. Nobody changed their mind about crawlers; the address changed. That is
worth remembering the next time a source is written off: recheck the ones
recorded as refused, because «they said no» and «we asked the wrong host» read
identically in a log.

WHAT IS PUBLISHED. «Väestötietojärjestelmän suomalaisten nimiaineistot» — the
name lists of the Population Information System — as two spreadsheets, under
CC BY 4.0, dated 2026-08-04. The surname sheet is a counted register: 23,265
names from Korhonen's 21,144 down to the privacy floor.

AND THE PRIVACY FLOOR IS THE THING TO SAY OUT LOUD. The DVV's own cover sheet
reads «Sellaisia sukunimiä joiden nimenhaltijoita on alle 20, ei esitetä
tietosuojasyistä» — surnames with fewer than twenty bearers are not shown.
So this file is complete ABOVE TWENTY and silent below it, and a Finnish
surname missing from it is far more likely to be rare than absent. The count
covers living Finnish citizens with a valid name, resident in Finland or
abroad, which means it reaches the emigration this atlas exists to follow.

NO OPENPYXL. An .xlsx is a zip of XML and the standard library opens both,
so this adds no dependency to a project that has kept its Python to the
stdlib everywhere else.
"""
import json, os, re, time, urllib.request, xml.etree.ElementTree as ET, zipfile

UA = "RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap)"
PKG = ("https://avoindata.suomi.fi/data/api/3/action/package_show"
       "?id=57282ad6-3ab1-48fb-983a-8aba5ff8d29a")
OUT = "data/frequencies/fi.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        b = r.read()
    return b if binary else json.loads(b)


def sheet_rows(zf, part, shared):
    """Every row of a worksheet as a list of cell strings."""
    root = ET.fromstring(zf.read(part))
    for row in root.findall(".//m:sheetData/m:row", NS):
        out = []
        for c in row.findall("m:c", NS):
            v = c.find("m:v", NS)
            if v is None or v.text is None:
                out.append("")
            elif c.get("t") == "s":
                out.append(shared[int(v.text)])
            else:
                out.append(v.text)
        yield out


def main():
    pkg = get(PKG)["result"]
    # THE RESOURCE IS FOUND BY NAME, NOT BY POSITION. The package holds the
    # forenames too, and they are the first resource today. A dated filename
    # also means the URL changes every release, so the id is the only stable
    # handle and the title is the only way to tell the two sheets apart.
    res = next((r for r in pkg["resources"]
                if "sukunimi" in (r.get("name", "") + r.get("url", "")).lower()), None)
    if not res:
        raise SystemExit("the package no longer carries a surname sheet — "
                         "look at " + PKG)
    print(f"source: {res['name']} ({pkg['license_title']})")
    blob = get(res["url"], binary=True)
    path = os.path.join("/tmp", "fi-sukunimi.xlsx")
    open(path, "wb").write(blob)

    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(
                    "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))
        rows, skipped = [], 0
        for i, cells in enumerate(sheet_rows(z, "xl/worksheets/sheet1.xml", shared)):
            if i == 0:
                continue                       # Sukunimi | Yhteensä
            if len(cells) < 2 or not cells[0].strip():
                skipped += 1
                continue
            try:
                c = int(float(cells[1]))
            except ValueError:
                skipped += 1
                continue
            rows.append({"n": cells[0].strip(), "c": c})

    people = sum(r["c"] for r in rows)
    out = {
        "country": "FI",
        "source": (f"Väestötietojärjestelmän suomalaisten nimiaineistot — "
                   f"{res['name']} (Digi- ja väestötietovirasto)"),
        "url": "https://avoindata.suomi.fi/data/fi/dataset/"
               "vaestotietojarjestelman-suomalaisten-nimiaineistot",
        "licence": "CC BY 4.0 (Digi- ja väestötietovirasto)",
        "counted": True,
        "note": ("Surnames in the Population Information System, counted. The "
                 "figure is living Finnish citizens holding the name, resident "
                 "in Finland OR ABROAD, which is why it reaches the emigration "
                 "this atlas follows. COMPLETE ABOVE TWENTY AND SILENT BELOW "
                 "IT: the DVV withholds any surname with fewer than twenty "
                 "bearers for privacy — «Sellaisia sukunimiä joiden "
                 "nimenhaltijoita on alle 20, ei esitetä tietosuojasyistä» — "
                 "so a Finnish name absent here is far likelier to be rare "
                 "than unknown, and absence must not be read as evidence. "
                 "Recorded as refused in September, when avoindata.fi answered "
                 "403; the portal had moved to avoindata.suomi.fi and a "
                 "redirect nobody followed reads exactly like a refusal."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(rows), "people": people,
                   "floor": 20, "skipped": skipped},
        "surnames": rows,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{OUT}: {len(rows):,} Finnish surnames, {people:,} bearers")
    print("  commonest:", ", ".join(f"{r['n']} {r['c']:,}" for r in rows[:6]))
    print(f"  rarest kept: {rows[-1]['n']} {rows[-1]['c']} (floor is 20)")


if __name__ == "__main__":
    main()

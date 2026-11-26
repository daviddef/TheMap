#!/usr/bin/env python3
"""The ten most common surnames of every Croatian town and municipality, 2021 census (DZS).

WHAT THE TABLE IS. Table 7 of DZS's «Population by towns/municipalities» workbook: for the country, each county, each town and
municipality and each district of Zagreb, ten surnames in rank order. NO COUNTS are published, so a rank is all there is: «5th in
Donja Motičina» says nothing about how many people that is, and a name missing from every list is not a name missing from Croatia
(the table's own note: aggregates under ten are confidential). The file asks that the source be stated; every page that shows it does.

WHY IT IS NOT IN data/frequencies/. Those files say which surnames a country holds and are merged into the surname corpus; the weekly
harvest-croatia-surnames.py would then take every name here as a new question to put to DZS's one-name lookup, thousands of them.
This is a table about places, kept as one: data/hr-surname-towns.json.

WHERE EACH AREA IS. The workbook gives names, not positions. A town or municipality takes the position of Wikidata's item of that name
in that county (CC0), and is left without one when Wikidata does not settle it: a position is only used to say how far an area is from
a story's place. (A first cut matched names in the gazetteer within reach of the county and put Lovinac, Crnac and Dubrava on
namesakes in the next county.)

    python3 scripts/harvest-croatia-surname-towns.py                 # download the workbook and rebuild
    python3 scripts/harvest-croatia-surname-towns.py WORKBOOK.xlsx   # from a copy already downloaded
"""
import collections, io, json, math, os, re, sys, time, unicodedata, urllib.parse, urllib.request, zipfile
import xml.etree.ElementTree as ET

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

URL = "https://podaci.dzs.hr/media/td3jvrbu/popis_2021-stanovnistvo_po_gradovima_opcinama.xlsx"
UA = "RecordAtlas/1.0 (+https://recordatlas.org; a map of genealogical sources)"
OUT = "data/hr-surname-towns.json"
SHEET = "7."
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

# The counties as the workbook writes them, which is also Wikidata's Croatian label without «županija».
COUNTY = {"Zagrebačka", "Krapinsko-zagorska", "Sisačko-moslavačka", "Karlovačka", "Varaždinska", "Koprivničko-križevačka",
          "Bjelovarsko-bilogorska", "Primorsko-goranska", "Ličko-senjska", "Virovitičko-podravska", "Požeško-slavonska",
          "Brodsko-posavska", "Zadarska", "Osječko-baranjska", "Šibensko-kninska", "Vukovarsko-srijemska", "Splitsko-dalmatinska",
          "Istarska", "Dubrovačko-neretvanska", "Međimurska", "Grad Zagreb"}


def sheet_rows(blob, name):
    """Every row of one sheet as a list of cell strings, empty cells left out."""
    z = zipfile.ZipFile(io.BytesIO(blob))
    shared = ["".join(t.text or "" for t in si.iter("{%s}t" % NS["m"]))
              for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)]
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    for s in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
        if s.get("name") == name:
            target = rels[s.get(RID)].lstrip("/")
            break
    else:
        sys.exit(f"the workbook has no sheet {name!r}: DZS has rearranged it; read it before trusting anything")
    root = ET.fromstring(z.read(target if target.startswith("xl/") else "xl/" + target))
    for row in root.iter("{%s}row" % NS["m"]):
        out = []
        for c in row.findall("m:c", NS):
            v = c.find("m:v", NS)
            if c.get("t") == "s" and v is not None:
                text = shared[int(v.text)]
            elif c.get("t") == "inlineStr":
                text = "".join(t.text or "" for t in c.iter("{%s}t" % NS["m"]))
            else:
                text = v.text if v is not None else ""
            text = " ".join((text or "").split())
            if text:
                out.append(text)
        yield out


def parse(rows):
    """[{kind, county, countyEn, name, names[10]}] from the sheet's rows; stops loudly on a row it cannot read."""
    rows = list(rows)
    if not any("NAJČEŠĆA PREZIMENA" in " ".join(r) and "2021" in " ".join(r) for r in rows[:5]):
        sys.exit("sheet 7 is not headed «NAJČEŠĆA PREZIMENA ... 2021»: DZS has changed it")
    areas = []
    for r in rows:
        if len(r) < 12 or r[-10] == "1" or r[0].startswith("1)"):
            continue
        head, names = r[:-10], r[-10:]
        if len(head) == 2 and head[0] == "Republika Hrvatska":
            areas.append({"kind": "country", "county": "", "countyEn": "", "name": "Croatia", "names": names})
        elif len(head) == 2:
            areas.append({"kind": "county", "county": head[0], "countyEn": head[1], "name": head[1], "names": names})
        elif len(head) == 5 and head[3] in ("Town", "Municipality", "District"):
            areas.append({"kind": head[3].lower(), "county": head[0], "countyEn": head[2], "name": head[4], "names": names})
        else:
            sys.exit(f"a row this script does not understand: {r}")
    kinds = {k: sum(a["kind"] == k for a in areas) for k in ("country", "county", "town", "municipality", "district")}
    # «Zagreb» is how the workbook writes Zagreb COUNTY, beside the «City of Zagreb»: said in full, so neither is taken for the other.
    for a in areas:
        if a["countyEn"] == "Zagreb":
            a["countyEn"] = "Zagreb County"
            if a["kind"] == "county":
                a["name"] = "Zagreb County"
    # Croatia's own arithmetic: one country, 20 counties and the City of Zagreb (listed as a county or not), 127+ towns, 428 municipalities.
    if kinds["country"] != 1 or kinds["county"] < 20 or kinds["town"] + kinds["municipality"] < 550:
        sys.exit(f"too few areas read, so the sheet was not read whole: {kinds}")
    # «z» is a withheld place in the list: the area has fewer than ten names carried by ten or more people. It is no surname, and it
    # only ever ends a list; anywhere else it would mean the ranks after it cannot be trusted.
    for a in areas:
        while a["names"] and a["names"][-1] == "z":
            a["names"] = a["names"][:-1]
    bad = [n for a in areas for n in a["names"] if re.search(r"\d", n) or len(n) < 2]
    if bad:
        sys.exit(f"cells that are not surnames: {bad[:10]}")
    return areas


def km(a, b, c, d):
    r = math.pi / 180
    x = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def fold(s):
    s = unicodedata.normalize("NFKD", s.replace("đ", "d").replace("Đ", "D"))
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).replace("–", "-").casefold().split())


def wikidata_positions():
    """{folded name: [(county as the workbook writes it or None, lat, lon, item)]} for Croatia's municipalities and towns (CC0)."""
    q = """SELECT ?m ?hr ?coord ?up WHERE {
      VALUES ?cls { wd:Q57058 wd:Q15105893 }
      ?m wdt:P31 ?cls ; wdt:P625 ?coord ; rdfs:label ?hr . FILTER(LANG(?hr) = "hr")
      OPTIONAL { ?m wdt:P131 ?u . ?u rdfs:label ?up FILTER(LANG(?up) = "hr") }
    }"""
    req = urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}),
                                 headers={"User-Agent": UA})
    rows = json.load(urllib.request.urlopen(req, timeout=180))["results"]["bindings"]
    out = {}
    for r in rows:
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r["coord"]["value"])
        if not m:
            continue
        county = r.get("up", {}).get("value", "")
        county = county[:-len(" županija")] if county.endswith(" županija") else None
        name = re.sub(r"\s*\(.*?\)$", "", r["hr"]["value"])
        row = (county if county in COUNTY else None, float(m.group(2)), float(m.group(1)), r["m"]["value"].rsplit("/", 1)[-1])
        if row not in out.setdefault(fold(name), []):
            out[fold(name)].append(row)
    if len(out) < 500:
        sys.exit(f"Wikidata answered with only {len(out)} Croatian municipalities and towns; not rebuilding on that")
    return out


def position(areas, where):
    """Each town and municipality placed by Wikidata's item of that name IN THAT COUNTY; a name Wikidata gives no county for is taken
    only when it is the one item of that name and no other area shares it. Unsure is left without a position."""
    atlas = [p for p in json.load(open("data/places.json", encoding="utf-8"))["places"] if p.get("country") == "HR"]
    local = [a for a in areas if a["kind"] in ("town", "municipality")]
    shared = collections.Counter(fold(a["name"]) for a in local)
    lost = []
    for a in local:
        # «Buje - Buie», «Kaštelir-Labinci – Castelliere-S. Domenica»: the Croatian name stands first
        tries = [fold(a["name"]), fold(re.split(r"\s+[-–/]\s+", a["name"])[0])]
        hit = None
        for t in tries:
            cands = where.get(t, [])
            here = [c for c in cands if c[0] == a["county"]]
            if not here and len(cands) == 1 and cands[0][0] is None and shared[t] < 2:
                here = cands
            if here and max(km(here[0][1], here[0][2], c[1], c[2]) for c in here) <= 5:
                hit = here[0]
                break
        if not hit:
            lost.append(f"{a['name']} ({a['countyEn']})")
            continue
        a["lat"], a["lon"], a["wd"] = round(hit[1], 4), round(hit[2], 4), hit[3]
        same = [p for p in atlas if fold(p["name"].split(" (")[0]) in tries and km(a["lat"], a["lon"], p["lat"], p["lon"]) <= 6]
        if same:
            a["place"] = min(same, key=lambda p: km(a["lat"], a["lon"], p["lat"], p["lon"]))["id"]
    return lost


def main(argv):
    if argv:
        blob = open(argv[0], "rb").read()
    else:
        blob = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": UA}), timeout=300).read()
    areas = parse(sheet_rows(blob, SHEET))
    lost = position(areas, wikidata_positions())
    out = {
        "country": "HR",
        "year": 2021,
        "source": "Croatian Bureau of Statistics (DZS), Census 2021: most frequent surnames by towns and municipalities",
        "url": URL,
        "licence": "No licence stated (the file asks users to state the source: Croatian Bureau of Statistics, DZS)",
        "note": ("The ten most common surnames of each area, in rank order. No counts are published, so a rank is not a number of "
                 "people, and a surname in no list is not a surname absent from the area. Positions are Wikidata's (CC0), for the "
                 "town or municipality of that name in that county, added here to measure distance."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"areas": len(areas), "surnames": len({n for a in areas for n in a["names"]}),
                   "placed": sum("lat" in a for a in areas), "unplaced": len(lost)},
        "areas": areas,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        # one area to a line, so a change in a later census reads as a change
        head = json.dumps({k: v for k, v in out.items() if k != "areas"}, ensure_ascii=False, indent=1)[:-2]
        fh.write(head + ',\n "areas": [\n' + ",\n".join("  " + json.dumps(a, ensure_ascii=False) for a in areas) + "\n ]\n}\n")
    print(f"{OUT}: {out['counts']}")
    if lost:
        print("no position:", "; ".join(lost))


if __name__ == "__main__":
    main(sys.argv[1:])

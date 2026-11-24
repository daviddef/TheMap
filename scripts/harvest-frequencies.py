#!/usr/bin/env python3
"""National surname frequency lists — the part that carries counts by country.

The Wikidata harvest gave variants and almost no geography: 6,151 surnames and
1,542 of them with a country. What actually says «this name is found in Poland»
is a government publishing its own register, and several do.

TWO DOORS, AND ONLY ONE OF THEM OPEN. The United States publishes 162,253
surnames with counts, public domain — and www2.census.gov rejects curl whatever
headers it is handed, because the firewall fingerprints the client rather than
the request. Its documented API serves the identical data and wants a free key.
Waiting for the key was the right call and it took a day; the file was never
worth going round a firewall for.

THE KEY IS NOT IN THIS REPOSITORY and must never be. It is read from
CENSUS_API_KEY, or from ~/.config/record-atlas/census.key, both of which are
outside a public git tree.

POLAND IS A BETTER FIRST COUNTRY THAN IT LOOKS. The PESEL register list runs to
400,753 surnames, it INCLUDES THE DEAD (dataset 568, «z uwzględnieniem osób
zmarłych»), which is the difference between a phone book and a genealogical
source, and its male and female forms — Kowalski and Kowalska — are the same
surname under Polish grammar. That last is a variant link nobody has to curate.

    python3 scripts/harvest-frequencies.py --country pl
"""
import argparse, csv, io, json, os, re, sys, time, urllib.parse, urllib.request
import textsource            # strict decoding; see scripts/textsource.py

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
UA = ("RecordAtlasSurnames/1.0 (+https://github.com/daviddef/TheMap; "
      "open government frequency lists)")
CACHE = "/tmp/record-atlas-freq"

def pxweb_year_rows(url, dim, years):
    """The same PxWeb table for several years in ONE POST, as
    {year: [(label, count), ...]} with zero and empty cells left out.

    json-stat2 is a flat array in dimension order, so with more than one year
    the label index has to be worked out from the sizes, not read off in
    sequence as pxweb_rows() could when the only dimension left was the name."""
    body = json.dumps({"query": [{"code": "Tid",
                                  "selection": {"filter": "item", "values": list(years)}}],
                       "response": {"format": "json-stat2"}}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "User-Agent": UA, "Content-Type": "application/json"})
    p = os.path.join(CACHE, f"pxweb-{dim}-{'-'.join(years)}.json")
    os.makedirs(CACHE, exist_ok=True)
    if os.path.exists(p):
        d = json.load(open(p))
    else:
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.loads(r.read().decode())
        json.dump(d, open(p, "w"))
        time.sleep(1)
    ids, sizes = d["id"], d["size"]
    cats = {k: d["dimension"][k]["category"] for k in ids}
    # Every dimension other than the name and the year must have exactly one
    # category, or a flat index would silently mix measures.
    for k in ids:
        if k not in (dim, "Tid") and len(cats[k]["index"]) != 1:
            raise SystemExit(f"PxWeb table has a second varying dimension, {k}")
    names = [cats[dim]["label"][k] for k in cats[dim]["index"]]
    yrs = list(cats["Tid"]["index"])
    stride = {}
    acc = 1
    for k, n in zip(reversed(ids), reversed(sizes)):
        stride[k] = acc
        acc *= n
    out = {y: [] for y in yrs}
    for yi, y in enumerate(yrs):
        for ni, name in enumerate(names):
            v = d["value"][ni * stride[dim] + yi * stride["Tid"]]
            if v:
                out[y].append((name, int(v)))
    return out


def pxweb_rows(url, dim, year, lang):
    """One year of a PxWeb table, which every Nordic statistics agency serves
    and which is the most civilised bulk interface in this whole project: one
    POST, one JSON-stat document, no key and no paging."""
    return pxweb_year_rows(url, dim, [year])[year]


def xls_rows(name, url):
    """Spain publishes its surname frequencies as a 2011-vintage binary .xls,
    which needs xlrd — the one third-party build dependency in this project.
    Every other source here is JSON or CSV."""
    try:
        import xlrd
    except ImportError:
        sys.exit("Spain's file is a binary .xls and needs xlrd: pip install --user xlrd")
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        req = urllib.request.Request(url, headers={"User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"})
        with urllib.request.urlopen(req, timeout=300) as r:
            open(p, "wb").write(r.read())
        time.sleep(1)
    out = []
    book = xlrd.open_workbook(p, on_demand=True)
    for si in range(book.nsheets):
        sh = book.sheet_by_index(si)
        for row in range(sh.nrows):
            v = [sh.cell_value(row, c) for c in range(min(5, sh.ncols))]
            if len(v) < 5 or not isinstance(v[1], str) or not v[1].strip():
                continue
            # INE SUPPRESSES SMALL CELLS AND WRITES «..» IN THEM, and the
            # second sheet — 58,856 of the rarer surnames — is full of them.
            # Throwing on that discarded the whole row and cost Spain three
            # quarters of its names. A suppressed «both positions» count is
            # suppressed precisely because it is tiny, so treating it as zero
            # over-counts by a handful of people on a rare name, which is a
            # far smaller error than dropping the name entirely.
            def num(x):
                try:
                    return float(x)
                except (TypeError, ValueError):
                    return 0.0
            first, second, both = num(v[2]), num(v[3]), num(v[4])
            if first <= 0 and second <= 0:
                continue
            n = int(first + second - both)
            if n > 0:
                out.append((v[1].strip(), n))
    return out


def xlsx_sheet_rows(path, sheet):
    """Rows of one worksheet of an .xlsx, as lists of (column letters, value).

    Standard library only: an .xlsx is a zip of XML, and the ONS surname
    workbook is an 80 MB sheet that is better streamed than loaded. Spain's
    old binary .xls is the only thing in this project that needs xlrd, and
    this keeps it the only one."""
    import zipfile
    import xml.etree.ElementTree as ET
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    rel = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    z = zipfile.ZipFile(path)
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rid = next(s.get(rel + "id") for s in wb.iter(ns + "sheet")
               if s.get("name") == sheet)
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in rels if r.get("Id") == rid)
    target = target.lstrip("/")
    target = target if target.startswith("xl/") else "xl/" + target
    shared = [("".join(t.text or "" for t in si.iter(ns + "t")))
              for si in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    for _, el in ET.iterparse(z.open(target)):
        if el.tag != ns + "row":
            continue
        row = []
        for c in el:
            v = c.find(ns + "v")
            if v is None or v.text is None:
                continue
            val = shared[int(v.text)] if c.get("t") == "s" else v.text
            row.append((re.match(r"[A-Z]+", c.get("r")).group(), val))
        el.clear()
        yield row


def col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


ONS_FILE = ("https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/"
            "birthsdeathsandmarriages/livebirths/adhocs/"
            "3674babysurnamesbirthsregisteredineachyearenglandandwales1996to2025/"
            "surnames1996to2025.xlsx")


def ons_births():
    """ONS «Baby surnames, births registered in each year, England and Wales,
    1996 to 2025» (user-requested data 3674): {surname: births summed over the
    years in which ONS published it}, and the list of years.

    Table 1 is thirty blocks side by side, each Rank | Surname | <year> | gap.
    A block's year sits in its header row; its surname is the column to the
    left of it. A cell ONS redacted (a count of 2 or less) is simply absent,
    so a name is never credited with a figure the publisher withheld."""
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, "gb-ons-surnames-1996-2025.xlsx")
    if not os.path.exists(p):
        req = urllib.request.Request(ONS_FILE, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as r:
            open(p, "wb").write(r.read())
        time.sleep(1)
    blocks = None                    # [(surname column, count column, year)]
    totals, years = {}, set()
    for row in xlsx_sheet_rows(p, "Table 1"):
        cells = dict(row)
        if blocks is None:
            hdr = [(c, v) for c, v in row if re.fullmatch(r"(19|20)\d\d", v)]
            if len(hdr) < 10:
                continue
            blocks = []
            for c, y in hdr:
                i = col_index(c) - 1
                name_col = ""
                while i:
                    i, r = divmod(i - 1, 26)
                    name_col = chr(65 + r) + name_col
                blocks.append((name_col, c, y))
                years.add(y)
            continue
        for name_col, cnt_col, y in blocks:
            nm, v = cells.get(name_col), cells.get(cnt_col)
            if not nm or v is None or not re.fullmatch(r"\d+", v.strip()):
                continue
            totals[nm.strip()] = totals.get(nm.strip(), 0) + int(v)
    return totals, sorted(years)


def census_key():
    k = os.environ.get("CENSUS_API_KEY")
    if k:
        return k.strip()
    p = os.path.expanduser("~/.config/record-atlas/census.key")
    if os.path.exists(p):
        return open(p).read().strip()
    sys.exit("No Census API key. Put it in CENSUS_API_KEY or "
             "~/.config/record-atlas/census.key — never in this repository.")


def census_rows(year="2010"):
    """All 162,253 surnames, a block of ranks at a time.

    The API takes a rank range, which is a far better paging handle than an
    offset: each request is independent and costs the same as the last, which
    is exactly what Wikidata's query service could not offer."""
    key, out, step = census_key(), [], 10000
    lo = 1
    while True:
        hi = lo + step - 1
        url = (f"https://api.census.gov/data/{year}/surname?"
               + urllib.parse.urlencode({"get": "NAME,COUNT,RANK",
                                         "RANK": f"{lo}:{hi}", "key": key}))
        body = fetch(url, f"us{year}-{lo}.json")
        # Past the last rank the API answers with an empty body rather than an
        # empty array, which is not JSON and is not an error either.
        if not (body or "").strip():
            print(f"  ranks {lo}-{hi}: past the end", flush=True)
            break
        rows = json.loads(body)
        head, rows = rows[0], rows[1:]
        i_name, i_count = head.index("NAME"), head.index("COUNT")
        for r in rows:
            n = re.sub(r"[^\d]", "", r[i_count] or "")
            if r[i_name] and n:
                out.append((r[i_name].strip(), int(n)))
        print(f"  ranks {lo}-{hi}: {len(out)} surnames", flush=True)
        # STOP ON EMPTY, NOT ON SHORT. Ranks are not dense — surnames with
        # equal counts share a rank — so a block of ten thousand ranks returns
        # rather fewer than ten thousand rows. Treating that as the end
        # stopped this at 60,044 of the published 162,253.
        if not rows:
            break
        lo = hi + 1
        if lo > 200000:                      # published total is 162,253
            break
    return out


SOURCES = {
    "no": {
        "country": "NO",
        "name": "Etternavn brukt av 200 personer eller flere (SSB tabell 12891)",
        "url": "https://www.ssb.no/statbank/table/12891",
        "licence": "CC BY 4.0 (Statistisk sentralbyrå). SSB: «Vi benytter lisensen Creative "
                   "Commons Navngivelse 4.0 Internasjonal (CC BY 4.0)», and its API pages say "
                   "the APIs use the same licence. https://www.ssb.no/diverse/lisens",
        "licenceUrl": "https://www.ssb.no/diverse/lisens",
        "licenceChecked": "2026-11-24",
        "attribution": "Source: Statistisk sentralbyrå (SSB), table 12891, CC BY 4.0. "
                       "Names borne by fewer than 200 people in 2025 are withheld by SSB.",
        "note": "Statistics Norway publishes only surnames borne by 200 or more people, "
                "so this is the common half of Norwegian names and not the tail. It is the "
                "whole of what SSB publishes: table 12891 is the only surname table in "
                "SSB's StatBank, and its 2025 column is what `c` holds. A name that stood at "
                "200 or more in some year from 2018 to 2024 and has since fallen below the "
                "line is kept with `y`, the last year it was published, and NO count: it is "
                "evidence that the name is borne in Norway, not of how many bear it now.",
        "rows": lambda: pxweb_rows(
            "https://data.ssb.no/api/v0/no/table/12891", "Etternavn", "2025", "no"),
        "earlier": lambda: pxweb_year_rows(
            "https://data.ssb.no/api/v0/no/table/12891", "Etternavn",
            [str(y) for y in range(2018, 2026)]),
    },
    "es": {
        "country": "ES",
        "name": "Frecuencia de apellidos, Censos de población (INE)",
        "url": "https://www.ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254736177009",
        "licence": "Spanish open government data (INE)",
        "note": "Spaniards carry two surnames, paternal then maternal, and INE counts each "
                "position separately. The figure here is people bearing the name in EITHER "
                "position, which is first + second - both. Where INE suppressed the "
                "«both positions» figure as too small — it writes «..» — it is counted "
                "as zero, which over-states a rare name by a few people. Current to "
                "1 January 2025.",
        "xls": ("apellidos_frecuencia.xls",
                "https://www.ine.es/daco/daco42/nombyapel/apellidos_frecuencia.xls"),
    },
    "us2000": {
        "country": "US",
        "name": "Frequently Occurring Surnames from the 2000 Census",
        "url": "https://www.census.gov/topics/population/genealogy/data/2000_surnames.html",
        "licence": "Public domain (work of the United States Government)",
        "note": "The 2000 file, alongside the 2010 one. A decade apart matters more for "
                "genealogy than it sounds: a surname borne by a hundred people in 2000 and "
                "ninety-nine in 2010 drops out of the later list entirely, and those "
                "vanishing names are exactly the ones a researcher is chasing.",
        "rows": lambda: census_rows("2000"),
    },
    "us": {
        "country": "US",
        "name": "Frequently Occurring Surnames from the 2010 Census",
        "url": "https://www.census.gov/topics/population/genealogy/data/2010_surnames.html",
        "licence": "Public domain (work of the United States Government)",
        "note": "Every surname reported 100 or more times in the 2010 Census, with its "
                "national count. Fetched through the documented Census API — the bulk "
                "file behind it is served only to a browser. Counts are of the LIVING "
                "population in 2010, not of everyone who ever bore the name.",
        "rows": census_rows,
    },
    "gb": {
        "country": "GB",
        "name": "Baby surnames, births registered in each year, England and Wales, 1996 to 2025 (ONS user-requested data 3674)",
        "url": "https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/adhocs/3674babysurnamesbirthsregisteredineachyearenglandandwales1996to2025",
        "licence": "Open Government Licence v3.0 (Office for National Statistics). The ONS page says "
                   "«All content is available under the Open Government Licence v3.0», and the "
                   "workbook asks for «Source: Office for National Statistics licensed under the "
                   "Open Government Licence.» https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
        "licenceUrl": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
        "licenceChecked": "2026-11-24",
        "attribution": "Source: Office for National Statistics licensed under the Open Government Licence v3.0.",
        "basis": "births",
        "counted": False,
        "note": "BIRTHS, NOT PEOPLE, AND ENGLAND AND WALES, NOT THE UNITED KINGDOM. ONS counts "
                "babies whose births were registered in England and Wales in each year from 1996 "
                "to 2025; `b` is that count summed over the thirty years, so SMITH at 179,781 is "
                "that many children over thirty years and not that many Smiths alive, and must "
                "never be added up into a population. Scotland (National Records of Scotland) "
                "and Northern Ireland (NISRA) are not in it, and the atlas files it under GB "
                "only because it has no code for England and Wales alone. ONS redacts any "
                "surname-year of two births or fewer, so a name that never reached three in "
                "one year is absent from the file, and its absence means nothing; the sums of "
                "rare names are low for the same reason. Spellings are exactly as registered, "
                "in capitals, with no grouping of variants. Names whose letters ONS's file "
                "had already lost, O?BRIEN for O'Brien, are left out rather than guessed at.",
        "births": True,
    },
    "pl": {
        "country": "PL",
        "name": "Nazwiska występujące w rejestrze PESEL (z uwzględnieniem osób zmarłych)",
        "url": "https://dane.gov.pl/pl/dataset/568",
        "licence": "Polish open government data (dane.gov.pl)",
        "note": "The Polish national register, INCLUDING THE DECEASED, which is what "
                "makes it a genealogical source rather than a directory. Male and "
                "female forms are listed separately because Polish inflects them; "
                "they are linked here as variants of one name.",
        "files": [
            ("m", "https://api.dane.gov.pl/media/resources/20180215/Nazwiska-mskie-w-Polsce.csv"),
            ("f", "https://api.dane.gov.pl/media/resources/20180215/Nazwiska-eskie-w-Polsce.csv"),
        ],
    },
}


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        return open(p, encoding="utf-8-sig").read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        body = textsource.decode(r.read(), ("utf-8-sig", "cp1252"),
                                 what=url)[0]
    open(p, "w", encoding="utf-8").write(body)
    time.sleep(1)
    return body


# Polish inflects a surname for the bearer's sex, and the pairs are regular.
# Kowalski/Kowalska is one family name in two grammatical dresses, and a
# researcher holding a woman's death certificate needs to find the man's.
PL_PAIRS = [("SKI", "SKA"), ("CKI", "CKA"), ("DZKI", "DZKA"),
            ("SKI", "SKI"), ("Y", "A")]


def pl_masculine(name):
    """The masculine form of a feminine Polish surname, where there is one."""
    for m, f in PL_PAIRS:
        if f != m and name.endswith(f):
            return name[: -len(f)] + m
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", default="pl")
    a = ap.parse_args()

    src = SOURCES[a.country]
    if src.get("births"):
        return write_births(a.country, src)
    counts, gendered = {}, {}
    if src.get("rows"):
        for name, n in src["rows"]():
            counts[name] = counts.get(name, 0) + n
    if src.get("xls"):
        for name, n in xls_rows(*src["xls"]):
            counts[name] = max(counts.get(name, 0), n)
    for tag, url in src.get("files", []):
        body = fetch(url, f"{a.country}-{tag}.csv")
        rd = csv.reader(io.StringIO(body))
        next(rd, None)                                   # header
        for row in rd:
            if len(row) < 2 or not row[0].strip():
                continue
            name = row[0].strip()
            n = re.sub(r"[^\d]", "", row[1])             # "92 867" -> 92867
            if not n:
                continue
            counts[name] = counts.get(name, 0) + int(n)
            if tag == "f":
                m = pl_masculine(name)
                if m:
                    gendered[name] = m

    rows = [{"n": k, "c": v} for k, v in
            sorted(counts.items(), key=lambda kv: -kv[1])]
    earlier = {}
    if src.get("earlier"):
        # Names a table published in an earlier year and no longer does. No
        # count: the figure belongs to a year that is not the file's year.
        last = {}
        for y, yr_rows in sorted(src["earlier"]().items()):
            for name, _ in yr_rows:
                last[name] = y
        earlier = {n: y for n, y in last.items() if n not in counts}
        rows += [{"n": n, "y": earlier[n]} for n in sorted(earlier)]
    out = {
        "country": src["country"],
        "source": src["name"],
        "url": src["url"],
        "licence": src["licence"],
        **{k: src[k] for k in ("licenceUrl", "licenceChecked", "attribution")
           if k in src},
        "note": src["note"],
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(rows),
                   "people": sum(counts.values()),
                   "genderedPairs": len(gendered),
                   **({"current": len(counts), "earlierOnly": len(earlier)}
                      if src.get("earlier") else {})},
        "surnames": rows,
        "gendered": gendered,
    }
    p = f"data/frequencies/{a.country}.json"
    json.dump(out, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows)} surnames ({len(counts)} counted), {sum(counts.values()):,} people -> {p}")
    print(f"  {len(gendered)} feminine forms paired to a masculine one")
    print(f"  {os.path.getsize(p)/1024/1024:.1f} MB")
    for r in out["surnames"][:6]:
        print(f"    {r['c']:>8,}  {r['n']}")


def write_births(cc, src):
    """A register of BIRTHS (see the `gb` entry): rows carry `b`, never `c`, and
    the file says `counted: false`, so build-surnames.py attests the name in
    the country without a head-count and nothing can sum it into a population."""
    totals, years = ons_births()
    # A «?» is where ONS's own file had already lost a letter (O?BRIEN). It is
    # not a spelling anybody registered, and guessing the letter is inference.
    lost = sorted(n for n in totals if "?" in n)
    for n in lost:
        del totals[n]
    out = {
        "country": src["country"],
        "source": src["name"],
        "url": src["url"],
        "licence": src["licence"],
        "licenceUrl": src["licenceUrl"],
        "licenceChecked": src["licenceChecked"],
        "attribution": src["attribution"],
        "basis": src["basis"],
        "counted": src["counted"],
        "note": src["note"],
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(totals), "people": None,
                   "births": sum(totals.values()),
                   "years": [years[0], years[-1]],
                   "unreadable": len(lost)},
        "surnames": [{"n": k, "b": v} for k, v in
                     sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))],
    }
    p = f"data/frequencies/{cc}.json"
    json.dump(out, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(totals)} surnames, {sum(totals.values()):,} births "
          f"{years[0]}-{years[-1]}; {len(lost)} unreadable left out -> {p}")
    print(f"  {os.path.getsize(p)/1024/1024:.1f} MB")
    for r in out["surnames"][:6]:
        print(f"    {r['b']:>8,}  {r['n']}")


if __name__ == "__main__":
    main()

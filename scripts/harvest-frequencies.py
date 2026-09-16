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

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
UA = ("RecordAtlasSurnames/1.0 (+https://github.com/daviddef/TheMap; "
      "open government frequency lists)")
CACHE = "/tmp/record-atlas-freq"

def pxweb_rows(url, dim, year, lang):
    """A PxWeb table, which every Nordic statistics agency serves and which is
    the most civilised bulk interface in this whole project: one POST, one
    JSON-stat document, no key and no paging."""
    body = json.dumps({"query": [{"code": "Tid",
                                  "selection": {"filter": "item", "values": [year]}}],
                       "response": {"format": "json-stat2"}}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "User-Agent": UA, "Content-Type": "application/json"})
    p = os.path.join(CACHE, f"pxweb-{dim}-{year}.json")
    os.makedirs(CACHE, exist_ok=True)
    if os.path.exists(p):
        d = json.load(open(p))
    else:
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.loads(r.read().decode())
        json.dump(d, open(p, "w"))
        time.sleep(1)
    cat = d["dimension"][dim]["category"]
    lab, idx = cat["label"], cat["index"]
    return [(lab[k], int(v)) for k, v in zip(idx, d["value"]) if v]


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


def census_key():
    k = os.environ.get("CENSUS_API_KEY")
    if k:
        return k.strip()
    p = os.path.expanduser("~/.config/record-atlas/census.key")
    if os.path.exists(p):
        return open(p).read().strip()
    sys.exit("No Census API key. Put it in CENSUS_API_KEY or "
             "~/.config/record-atlas/census.key — never in this repository.")


def census_rows():
    """All 162,253 surnames, a block of ranks at a time.

    The API takes a rank range, which is a far better paging handle than an
    offset: each request is independent and costs the same as the last, which
    is exactly what Wikidata's query service could not offer."""
    key, out, step = census_key(), [], 10000
    lo = 1
    while True:
        hi = lo + step - 1
        url = ("https://api.census.gov/data/2010/surname?"
               + urllib.parse.urlencode({"get": "NAME,COUNT,RANK",
                                         "RANK": f"{lo}:{hi}", "key": key}))
        body = fetch(url, f"us-{lo}.json")
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
        "licence": "Norwegian open government data (SSB), CC BY 4.0",
        "note": "Statistics Norway publishes only surnames borne by 200 or more people, "
                "so this is the common half of Norwegian names and not the tail.",
        "rows": lambda: pxweb_rows(
            "https://data.ssb.no/api/v0/no/table/12891", "Etternavn", "2025", "no"),
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
        body = r.read().decode("utf-8-sig", "replace")
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

    out = {
        "country": src["country"],
        "source": src["name"],
        "url": src["url"],
        "licence": src["licence"],
        "note": src["note"],
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(counts),
                   "people": sum(counts.values()),
                   "genderedPairs": len(gendered)},
        "surnames": [{"n": k, "c": v} for k, v in
                     sorted(counts.items(), key=lambda kv: -kv[1])],
        "gendered": gendered,
    }
    p = f"data/frequencies/{a.country}.json"
    json.dump(out, open(p, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(counts)} surnames, {sum(counts.values()):,} people -> {p}")
    print(f"  {len(gendered)} feminine forms paired to a masculine one")
    print(f"  {os.path.getsize(p)/1024/1024:.1f} MB")
    for r in out["surnames"][:6]:
        print(f"    {r['c']:>8,}  {r['n']}")


if __name__ == "__main__":
    main()

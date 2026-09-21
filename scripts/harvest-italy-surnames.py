#!/usr/bin/env python3
"""Italian surname frequency, from the comuni that publish it themselves.

Italy was the weakest entry in data/frequencies/_refused.json — verdict
«not found», which means only that somebody looked and did not find, and
is the one kind of refusal worth retrying. ISTAT publishes no national
surname table and probably never will. But Italian municipalities publish
their own residents' surnames as open data, and the national catalogue
indexes them:

    dati.gov.it, q=cognomi  ->  95 datasets
    «Cognomi residenti», «Cognomi più diffusi», per-comune rankings

One of them, Barcellona Pozzo di Gotto, is 2,402 rows of

    "Anno","Cognome","Occorrenze"
    "2025","ABBATE","236"

which is exactly the grain this atlas wants, and arguably a better grain
than a national count: a genealogist does not want to know that Rossi is
common in Italy, they want to know which comune a name sits in. That is
the whole thesis of the map applied to surnames.

So this is not the Spanish or Polish case of one authoritative national
file. It is many small municipal files of varying shape, and the script
is written accordingly: it reads the column headers rather than assuming
them, it records which comune each count came from, and it keeps the
per-comune breakdown alongside the national total because the breakdown
is the part with something to say.

    python3 scripts/harvest-italy-surnames.py
"""
import collections, csv, io, json, os, re, sys, time
import urllib.parse, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "data/frequencies/it.json"
# Each comune is cached as it is read. The first run of this script spent
# fourteen minutes stalled on one municipality's own web server with 87 of
# 93 datasets held only in memory, where killing it would have thrown all
# of them away. A long job that cannot be interrupted is a job you do twice.
CACHE = "data/.italy-surnames-scan.json"
# urllib's timeout is per socket operation, not for the whole transfer, so a
# server trickling bytes holds the connection open indefinitely. A surname
# list for one comune is tens of kilobytes; nothing here is 20 MB.
MAX_BYTES = 20 * 1024 * 1024
CKAN = "https://dati.gov.it/opendata/api/3/action/package_search"
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "surname frequency; contact david.defranceski@gmail.com)")

# Header names seen across the municipal files. Read, not assumed.
NAME_COL = re.compile(r"^(cognome|cognomi|descrizione|denominazione)$", re.I)
COUNT_COL = re.compile(r"^(occorrenze|numero|num|frequenza|conteggio|quantita|"
                       r"quantità|totale|residenti|n_residenti|valore|count)$", re.I)
YEAR_COL = re.compile(r"^(anno|year)$", re.I)

# A title has to be about surnames, not merely mention one. «Eletti nel 2023
# al Consiglio regionale» matches "cognome" because it lists councillors.
IS_SURNAME_SET = re.compile(r"\bcognom[ei]\b", re.I)
NOT_A_SURNAME_SET = re.compile(
    r"eletti|consiglio|tesi di laurea|insegnamenti|pubblicazioni|incarichi|"
    r"dipendenti|docenti|albo|nomin|curricul", re.I)


def fetch(url, timeout=60, tries=3):
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                # A DEADLINE FOR THE WHOLE TRANSFER, not just for each socket
                # operation. One comune's own web server trickles bytes
                # forever: urllib's timeout never fires because data keeps
                # arriving, and r.read() blocks until it decides to stop.
                # This has now stalled the harvest twice, once for fourteen
                # minutes and once for seven.
                deadline = time.monotonic() + timeout
                buf = bytearray()
                while len(buf) < MAX_BYTES:
                    if time.monotonic() > deadline:
                        return None
                    chunk = r.read(65536)
                    if not chunk:
                        break
                    buf += chunk
                return bytes(buf)
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
        except Exception:
            pass
        if a < tries - 1:
            time.sleep(4 * (a + 1))
    return None


def catalogue():
    """Every dataset in the national catalogue that is a surname list."""
    out, start = [], 0
    while True:
        u = CKAN + "?" + urllib.parse.urlencode({"q": "cognomi", "rows": 50,
                                                 "start": start})
        b = fetch(u)
        if not b:
            break
        try:
            res = json.loads(b)["result"]
        except Exception:
            break
        rows = res.get("results", [])
        if not rows:
            break
        for r in rows:
            t = r.get("title") or ""
            if IS_SURNAME_SET.search(t) and not NOT_A_SURNAME_SET.search(t):
                out.append(r)
        start += len(rows)
        if start >= res.get("count", 0):
            break
        time.sleep(0.5)
    return out


def read_csv(blob):
    """(surname, count) pairs from a municipal CSV of unknown dialect."""
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = blob.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        return [], None
    sample = text[:4000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except Exception:
        dialect = csv.excel
        dialect.delimiter = ";" if sample.count(";") > sample.count(",") else ","
    # A municipal CSV arrived with NUL bytes in it, which csv refuses
    # outright: "line contains NUL". Strip them rather than lose the comune.
    text = text.replace("\x00", "")
    rdr = csv.reader(io.StringIO(text), dialect)
    try:
        head = next(rdr)
    except StopIteration:
        return [], None
    head = [h.strip().strip('"').lower() for h in head]
    ni = next((i for i, h in enumerate(head) if NAME_COL.match(h)), None)
    ci = next((i for i, h in enumerate(head) if COUNT_COL.match(h)), None)
    yi = next((i for i, h in enumerate(head) if YEAR_COL.match(h)), None)
    if ni is None or ci is None:
        return [], None
    pairs, year = [], None
    for row in rdr:
        if len(row) <= max(ni, ci):
            continue
        n = row[ni].strip().strip('"')
        c = row[ci].strip().strip('"').replace(".", "").replace(" ", "")
        if not n or not c.isdigit():
            continue
        # A surname, not a sentence, and not a single initial.
        if len(n) < 2 or len(n) > 60 or any(ch.isdigit() for ch in n):
            continue
        pairs.append((n.upper(), int(c)))
        if yi is not None and year is None and len(row) > yi:
            y = row[yi].strip().strip('"')
            if y.isdigit() and 1900 < int(y) < 2100:
                year = int(y)
    return pairs, year


def main():
    sets = catalogue()
    print(f"{len(sets)} surname datasets in the national catalogue\n", flush=True)
    total = collections.Counter()
    by_comune, sources, skipped = {}, [], []
    cache = {}
    if os.path.exists(CACHE):
        try:
            cache = json.load(open(CACHE))
            print(f"resuming: {len(cache)} comuni already read\n")
        except Exception:
            cache = {}
    for i, ds in enumerate(sets, 1):
        org = ((ds.get("organization") or {}).get("title")
               or ds.get("author") or "?")
        title = ds.get("title") or "?"
        # Newest CSV in the dataset.
        csvs = [r for r in (ds.get("resources") or [])
                if (r.get("format") or "").upper() == "CSV" and r.get("url")]
        if not csvs:
            skipped.append((org, title, "no CSV"))
            continue
        csvs.sort(key=lambda r: str(r.get("url")), reverse=True)
        if org in cache:
            c = cache[org]
            pairs, year = [tuple(x) for x in c["pairs"]], c.get("year")
            for n, cnt in pairs:
                total[n] += cnt
            by_comune[org] = {"names": len(pairs),
                              "people": sum(x for _, x in pairs),
                              "year": year, "dataset": c["title"], "url": c["url"]}
            sources.append({"comune": org, "title": c["title"],
                            "licence": c["licence"], "url": c["url"], "year": year})
            print(f"  [{i}/{len(sets)}] {org[:38]:40s} cached", flush=True)
            continue
        blob = fetch(csvs[0]["url"], timeout=90)
        if not blob:
            skipped.append((org, title, "could not fetch"))
            continue
        try:
            pairs, year = read_csv(blob)
        except Exception as e:
            # 93 comuni, 93 chances for one malformed file to end the run.
            skipped.append((org, title, f"unreadable: {type(e).__name__}"))
            continue
        if not pairs:
            skipped.append((org, title, "no surname/count columns"))
            continue
        for n, c in pairs:
            total[n] += c
        by_comune[org] = {"names": len(pairs),
                          "people": sum(c for _, c in pairs),
                          "year": year,
                          "dataset": title,
                          "url": csvs[0]["url"]}
        sources.append({"comune": org, "title": title,
                        "licence": ds.get("license_title") or "not stated",
                        "url": csvs[0]["url"], "year": year})
        print(f"  [{i}/{len(sets)}] {org[:38]:40s} {len(pairs):6,} surnames"
              f"  {sum(c for _, c in pairs):8,} people"
              f"  {year or '—'}", flush=True)
        cache[org] = {"pairs": pairs, "year": year, "title": title,
                      "url": csvs[0]["url"],
                      "licence": ds.get("license_title") or "not stated"}
        tmp = CACHE + ".tmp"
        json.dump(cache, open(tmp, "w"), ensure_ascii=False)
        os.replace(tmp, CACHE)
        time.sleep(0.4)

    rows = [{"n": n, "c": c} for n, c in total.most_common()]
    doc = {
        "country": "IT",
        "source": ("Italian comuni publishing their residents' surnames as "
                   "open data, indexed by the national catalogue dati.gov.it."),
        "url": "https://dati.gov.it/opendata/api/3/action/package_search?q=cognomi",
        "licence": ("Per dataset — recorded in `sources` below. Italian public "
                    "sector open data is generally CC-BY 4.0 or IODL 2.0; where "
                    "a publisher stated nothing, this says so rather than "
                    "assuming."),
        "note": ("NOT A NATIONAL REGISTER, AND THE DIFFERENCE MATTERS. ISTAT "
                 "publishes no surname table. This is the sum of the comuni "
                 "that publish their own, so it counts the residents of those "
                 "comuni and nobody else — it is evidence that a name is borne "
                 "in Italy and roughly where, never how common it is in Italy. "
                 "The per-comune breakdown is kept because for genealogy it is "
                 "the more useful half: which town a name sits in is the "
                 "question, and a national total is not the answer to it."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(rows),
                   "people": sum(total.values()),
                   "comuni": len(by_comune),
                   "datasets_skipped": len(skipped)},
        "surnames": rows,
        "gendered": {},
        "byComune": by_comune,
        "sources": sources,
        "skipped": [{"comune": o, "dataset": t, "why": w} for o, t, w in skipped],
    }
    tmp = OUT + ".tmp"
    json.dump(doc, open(tmp, "w"), ensure_ascii=False)
    os.replace(tmp, OUT)
    print(f"\n{len(rows):,} distinct surnames from {len(by_comune)} comuni, "
          f"{sum(total.values()):,} people -> {OUT}")
    if skipped:
        print(f"{len(skipped)} datasets skipped:")
        for o, t, w in skipped[:10]:
            print(f"   {o[:34]:36s} {w}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""National surname frequency lists — the part that carries counts by country.

The Wikidata harvest gave variants and almost no geography: 6,151 surnames and
1,542 of them with a country. What actually says «this name is found in Poland»
is a government publishing its own register, and several do.

WHY THESE AND NOT THE OBVIOUS ONE. The United States publishes 162,253 surnames
with counts, public domain, and its front door is shut to anything that is not
a browser: www2.census.gov rejects curl whatever headers it is given, because
the firewall fingerprints the client rather than the request. The documented
Census API serves the same data and wants a free key, which is a human signing
up. So the US waits on a key rather than being scraped around, and Poland —
which publishes through an open data API with no key at all — goes first.

POLAND IS A BETTER FIRST COUNTRY THAN IT LOOKS. The PESEL register list runs to
400,753 surnames, it INCLUDES THE DEAD (dataset 568, «z uwzględnieniem osób
zmarłych»), which is the difference between a phone book and a genealogical
source, and its male and female forms — Kowalski and Kowalska — are the same
surname under Polish grammar. That last is a variant link nobody has to curate.

    python3 scripts/harvest-frequencies.py --country pl
"""
import argparse, csv, io, json, os, re, sys, time, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
UA = ("RecordAtlasSurnames/1.0 (+https://github.com/daviddef/TheMap; "
      "open government frequency lists)")
CACHE = "/tmp/record-atlas-freq"

SOURCES = {
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
    for tag, url in src["files"]:
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

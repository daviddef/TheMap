#!/usr/bin/env python3
"""Slovenia's family names, from a register that was listed but never asked.

data/frequencies/_refused.json records Denmark, Finland, Sweden and the
Netherlands as walls. Slovenia was never on the list, because the search that
found the others looked for a folder called «names» and SURS does not have one
— its family names are split across FOUR tables by initial letter, A–F, G–L,
M–R and S–Ž, which no keyword search for «surname» finds and which a catalogue
listing of 4,836 tables buries. They were found by reading the catalogue.

SURS publishes only names borne by five or more people, so this is the
attested half of Slovenian naming and not the tail — the same shape of
limitation as Norway's 200-person floor, and worth stating in the same way.

Slovenia matters here out of proportion to its size: this map now stands on
367 Slovenian places, the second-largest body of ground after Croatia, because
Carniola was drawn as a record region this afternoon.

    python3 scripts/harvest-si-names.py

SOURCE. SURS (Statistical Office of the Republic of Slovenia), tables
05X1015S–05X1018S, CC BY 4.0.
"""
import json, os, time, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

API = "https://pxweb.stat.si/SiStatData/api/v1/en/Data/"
TABLES = ["05X1015S.px", "05X1016S.px", "05X1017S.px", "05X1018S.px"]
UA = "RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap)"


def get(url, body=None):
    req = urllib.request.Request(
        url, data=json.dumps(body).encode() if body else None,
        headers={"User-Agent": UA, "Accept": "application/json",
                 **({"Content-Type": "application/json"} if body else {})})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def main():
    names, year = {}, None
    for t in TABLES:
        meta = get(API + t)
        var = {v["code"]: v for v in meta["variables"]}
        years = var["LETO"]["values"]
        year = years[-1]
        q = {"query": [
            {"code": "PRIIMEK", "selection": {"filter": "all", "values": ["*"]}},
            {"code": "MERITVE", "selection": {"filter": "item", "values": ["1"]}},
            {"code": "LETO", "selection": {"filter": "item", "values": [year]}},
        ], "response": {"format": "json-stat2"}}
        # MERITVE has two members, Number and Rank, and which is «1» is the
        # table's own business rather than a guess — read the labels.
        num = next((v for v, txt in zip(var["MERITVE"]["values"],
                                        var["MERITVE"]["valueTexts"])
                    if txt.lower().startswith("number")), None)
        if num is None:
            raise SystemExit(f"{t}: no «Number» measure among "
                             f"{var['MERITVE']['valueTexts']}")
        q["query"][1]["selection"]["values"] = [num]

        d = get(API + t, q)
        labels = d["dimension"]["PRIIMEK"]["category"]["label"]
        order = sorted(d["dimension"]["PRIIMEK"]["category"]["index"].items(),
                       key=lambda kv: kv[1])
        vals = d["value"]
        got = 0
        for (code, i) in order:
            v = vals[i] if i < len(vals) else None
            if v:
                names[labels[code]] = int(v)
                got += 1
        print(f"  {t}  {got:5} names  (total {len(names)})", flush=True)

    rows = [{"n": n, "c": c} for n, c in sorted(names.items(), key=lambda kv: -kv[1])]
    out = "data/frequencies/si.json"
    json.dump({
        "country": "SI",
        "source": f"Family names, Slovenia, {year} (SURS tables 05X1015S–05X1018S)",
        "url": "https://pxweb.stat.si/SiStat/en/Podrocja/Index/100/prebivalstvo",
        "licence": "CC BY 4.0 (SURS)",
        "note": ("Names borne by five or more people on 1 January "
                 f"{year}; SURS suppresses the rest. Published in four tables "
                 "split by initial letter, which is why a catalogue search for "
                 "«surname» does not find them."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(rows),
                   "people": sum(r["c"] for r in rows),
                   "genderedPairs": 0},
        "surnames": rows,
    }, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"\n{len(rows):,} surnames, {sum(r['c'] for r in rows):,} people -> {out}")
    for r in rows[:8]:
        print(f"  {r['n']:16}{r['c']:>8,}")


if __name__ == "__main__":
    main()

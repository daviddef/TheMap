#!/usr/bin/env python3
"""Italy's comuni, with the other name each one answers to.

ANTENATI IS FILED BY PROVINCE and this atlas had Italy's 20 regions and its
provinces from GeoNames and nothing below them. The comune is the unit an
Italian civil register is actually kept in — the stato civile begins in 1806 in
the north and 1809 in the south, and it is the comune that keeps it.

THE COLUMN THAT MAKES THIS WORTH DOING is «Denominazione altra lingua». Italy
records, officially, the other language a comune answers to: Bolzano is Bozen,
Aosta is Aoste, Sterzing is Vipiteno, and a strip of comuni around Trieste and
Gorizia carry Slovene names. That is the same problem this atlas was built for
— the name changed — inside a country nobody thinks of as having changed.

It also carries the HISTORIC province code, which matters because provinces
have been created, merged and abolished repeatedly, and an archive is filed
under the province of its day rather than the province of now.

    curl -O https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx
    python3 scripts/harvest-italy-comuni.py --src Elenco-comuni-italiani.xlsx

SOURCE. Istat, «Codici statistici delle unità amministrative territoriali»,
CC BY 3.0 IT — attribution only, compatible with everything else here.
"""
import argparse, json, os, re, time, zipfile
import xml.etree.ElementTree as ET

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def sheet_rows(path):
    """Read the first worksheet of an xlsx without a third-party library."""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        shared = ["".join(t.text or "" for t in si.iter(NS + "t"))
                  for si in root.findall(NS + "si")]
    names = sorted(n for n in z.namelist()
                   if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    root = ET.fromstring(z.read(names[0]))
    for row in root.iter(NS + "row"):
        out = {}
        for c in row.findall(NS + "c"):
            ref = c.get("r") or ""
            col = re.match(r"([A-Z]+)", ref)
            v = c.find(NS + "v")
            if v is None or not col:
                continue
            val = v.text or ""
            if c.get("t") == "s":
                try:
                    val = shared[int(val)]
                except (ValueError, IndexError):
                    val = ""
            out[col.group(1)] = val.strip()
        if out:
            yield out


def letters_to_index(s):
    n = 0
    for ch in s:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="Elenco-comuni-italiani.xlsx")
    a = ap.parse_args()

    rows = list(sheet_rows(a.src))
    # The header is wherever «Denominazione in italiano» appears; Istat has
    # moved it between editions and hard-coding a row number is how a harvest
    # silently reads the wrong column next year.
    head_i = next(i for i, r in enumerate(rows)
                  if any(v.startswith("Denominazione in italiano") for v in r.values()))
    header = {}
    for col, v in rows[head_i].items():
        header[re.sub(r"\s+", " ", v).strip()] = col

    def col(*wanted):
        for w in wanted:
            for k, c in header.items():
                if k.lower().startswith(w.lower()):
                    return c
        return None

    C_NAME = col("Denominazione in italiano")
    C_ALT = col("Denominazione altra lingua")
    C_REG = col("Denominazione Regione")
    C_PROV = col("Denominazione dell'Unità territoriale sovracomunale",
                 "Denominazione dell")
    C_CODE = col("Codice Comune formato alfanumerico")
    C_HIST = col("Codice Provincia (Storico)")
    C_CAR = col("Sigla automobilistica")
    if not (C_NAME and C_REG):
        raise SystemExit(f"columns moved; found {sorted(header)[:8]}")

    out, bilingual = [], 0
    for r in rows[head_i + 1:]:
        name = r.get(C_NAME, "").strip()
        if not name or name.lower().startswith("denominazione"):
            continue
        rec = {"n": name, "reg": r.get(C_REG, "").strip(),
               "prov": (r.get(C_PROV, "") or "").strip(),
               "code": r.get(C_CODE, "").strip()}
        alt = (r.get(C_ALT, "") or "").strip() if C_ALT else ""
        # Istat writes a bilingual comune as «Bolzano/Bozen» in one column and
        # the other name alone in another. Both forms appear; keep whichever
        # differs from the Italian.
        forms = [x.strip() for x in re.split(r"\s*/\s*", alt) if x.strip()]
        forms = [x for x in forms if x.lower() != name.lower()]
        if forms:
            rec["a"] = forms
            bilingual += 1
        if C_HIST and r.get(C_HIST):
            rec["histProv"] = r[C_HIST].strip()
        if C_CAR and r.get(C_CAR):
            rec["plate"] = r[C_CAR].strip()
        out.append({k: v for k, v in rec.items() if v})

    path = "data/italy-comuni.json"
    json.dump({
        "source": "Istat, Codici statistici delle unità amministrative territoriali",
        "url": "https://www.istat.it/it/archivio/6789",
        "licence": "CC BY 3.0 IT",
        "note": ("Every Italian comune — the unit the stato civile is kept in, from "
                 "1806 in the north and 1809 in the south — with its region, its "
                 "province, and the HISTORIC province code, which is what an archive "
                 "is filed under rather than the province of today. Comuni carrying "
                 "an official second name keep it: Bolzano is Bozen, Aosta is Aoste, "
                 "and a strip around Trieste and Gorizia is Slovene."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"comuni": len(out), "withOtherName": bilingual,
                   "regions": len({c["reg"] for c in out if c.get("reg")}),
                   "provinces": len({c["prov"] for c in out if c.get("prov")})},
        "comuni": out,
    }, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out):,} comuni · {bilingual} with an official other name · "
          f"{len({c['prov'] for c in out if c.get('prov')})} provinces -> {path}")
    for c in [x for x in out if x.get("a")][:8]:
        print(f"  {c['n']:24} also {', '.join(c['a'])[:40]:42} {c.get('prov','')}")


if __name__ == "__main__":
    main()

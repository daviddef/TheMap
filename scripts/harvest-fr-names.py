#!/usr/bin/env python3
"""France's surnames, and the decade each one was being born in.

WHAT MAKES THIS ONE DIFFERENT FROM THE OTHER FIVE. Every other national
register in data/frequencies/ answers one question: how many people carry this
name now. INSEE's «Fichier des noms» answers a better one. It counts births by
SURNAME AND DECADE, from 1891 to 2000, from the état civil — so a name is not a
single number but a curve, and the curve is genealogical evidence.

    ABADIE     1891-1900: 812   …   1991-2000: 604      old and steady
    ABDELKADER 1891-1900:   0   …   1991-2000: 1,004    arrived after 1960

A name that starts at zero and climbs is an immigration signal with a date on
it. A name that falls to nothing is a name that died out or left, and the
decade it stopped tells you which records to stop searching. Nothing else in
this dataset carries a date at all.

WHAT IT IS NOT. It counts BIRTHS REGISTERED IN FRANCE, not people alive. A
family that emigrated in 1900 stops appearing, and that is the point rather
than a defect. INSEE suppresses names borne by fewer than 20 births across the
whole 110 years, which is the usual privacy floor and which removes the long
tail — 218,983 names survive it.

    curl -o noms.zip https://www.insee.fr/fr/statistiques/fichier/3536630/noms2008nat_txt.zip
    python3 scripts/harvest-fr-names.py --src noms2008nat_txt.txt

SOURCE. INSEE, Fichier des noms de famille 1891–2000, Licence Ouverte /
Open Licence (Etalab) — compatible with everything else here.
"""
import argparse, json, os, time

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="noms2008nat_txt.txt from INSEE")
    a = ap.parse_args()

    rows, people, dated, suppressed = [], 0, 0, 0
    with open(a.src, encoding="latin-1") as fh:
        head = fh.readline().rstrip("\n").split("\t")
        decades = [h.strip("_").replace("_", "–") for h in head[1:]]
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) < 2:
                continue
            name = f[0].strip()
            # INSEE files the whole suppressed tail as one final row, «AUTRES
            # NOMS» — 5,474,016 births belonging to every name too rare to
            # publish. It is a real and useful number and it is not a surname.
            # Left in, it sorted to the top of the list and this file would
            # have shipped claiming the commonest name in France is «Autres».
            if not name or name.startswith("AUTRES"):
                suppressed = sum(int(x or 0) for x in f[1:] if x.strip().isdigit())
                continue
            try:
                by = [int(x or 0) for x in f[1:]]
            except ValueError:
                continue
            n = sum(by)
            if not n:
                continue
            people += n
            rec = {"n": name.title(), "c": n}
            # The curve, only where it says something. A name flat across all
            # eleven decades is described perfectly well by its total, and
            # shipping eleven numbers for it would be 200,000 rows of noise.
            first = next((i for i, v in enumerate(by) if v), None)
            last = len(by) - 1 - next((i for i, v in enumerate(reversed(by)) if v), 0)
            if first is not None and (first > 0 or last < len(by) - 1):
                rec["from"] = decades[first]
                rec["to"] = decades[last]
                dated += 1
            rec["by"] = by
            rows.append(rec)

    rows.sort(key=lambda r: -r["c"])
    out = "data/frequencies/fr.json"
    json.dump({
        "country": "FR",
        "source": "Fichier des noms de famille 1891–2000 (INSEE, fichier national)",
        "url": "https://www.insee.fr/fr/statistiques/3536630",
        "licence": "Licence Ouverte / Open Licence (Etalab)",
        "note": ("Births registered in France by surname and decade of birth, 1891–2000. "
                 "A count of BIRTHS, not of living people: a family that emigrated in 1900 "
                 "stops appearing here, which is information rather than a defect. INSEE "
                 "suppresses names with fewer than 20 births across the whole period."),
        "harvested": time.strftime("%Y-%m-%d"),
        "decades": decades,
        "counts": {"surnames": len(rows), "people": people,
                   "withDateRange": dated, "genderedPairs": 0,
                   # What this file does NOT name, stated rather than implied.
                   "birthsUnderSuppressionFloor": suppressed},
        "surnames": rows,
    }, open(out, "w"), ensure_ascii=False, separators=(",", ":"))

    print(f"{len(rows):,} surnames, {people:,} births 1891–2000 -> {out}")
    print(f"{suppressed:,} further births belong to names INSEE suppresses as too "
          f"rare to publish — recorded as a number, not as a name")
    print(f"{dated:,} do not span the whole period — a name that starts or stops "
          f"is a name with a date on it")
    for r in rows[:8]:
        print(f"  {r['n']:18}{r['c']:>9,}")
    late = [r for r in rows if r.get("from") and r["from"].startswith("1971")][:6]
    if late:
        print("\nNames whose first French birth is 1971 or later — the immigration signal:")
        for r in late:
            print(f"  {r['n']:18}{r['c']:>9,}   {r['from']} → {r['to']}")


if __name__ == "__main__":
    main()

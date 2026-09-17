#!/usr/bin/env python3
"""Estonia's kihelkonnad — the parishes its church records are filed by.

WHY ESTONIA NEEDS ITS OWN ENTRY. The Baltic governorates are a record region on
this map and the ground under them was, until 1866, administered by MANOR
rather than by parish: a peasant was registered to a mõis, and the revision
lists that name whole households are arranged that way. Church records are
arranged by KIHELKOND, the parish, which is a different map of the same ground.
An Estonian line therefore has two filing systems over it at once, and knowing
which one a record came out of is most of the work.

The National Archives publishes registers of both — manors, and the rural
municipalities of 1866–1917 — as search forms. This takes nothing from the
results: it takes the forms' own dropdowns, which ARE the controlled vocabulary
of historical Estonian counties and parishes, written down by the archive that
files by them. That is a list of names, and a list of names is what this atlas
needed.

    python3 scripts/harvest-estonia-parishes.py

SOURCE. Rahvusarhiiv (National Archives of Estonia), the county and parish
vocabularies of its manor and municipality registers.
"""
import html, json, os, re, subprocess, time

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
UA = "RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap)"
PAGES = {"mois": "http://www.ra.ee/apps/andmed/index.php/site/mois",
         "vald": "http://www.ra.ee/apps/andmed/index.php/site/vald"}


def get(url):
    time.sleep(2)
    r = subprocess.run(["curl", "-sS", "-L", "--max-time", "60", "-A", UA, url],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def options(doc, near):
    """The <option> values of the select whose label is `near`."""
    i = doc.find(near)
    if i < 0:
        return []
    m = re.search(r"<select[^>]*>(.*?)</select>", doc[i:i + 40000], re.S | re.I)
    if not m:
        return []
    out = []
    for o in re.findall(r"<option[^>]*>(.*?)</option>", m.group(1), re.S | re.I):
        v = html.unescape(re.sub(r"<[^>]+>", "", o)).strip()
        if v and v not in ("-", "—") and v not in out:
            out.append(v)
    return out


def main():
    counties, parishes, src = [], [], {}
    for key, url in PAGES.items():
        doc = get(url)
        if not doc:
            print(f"  {key}: no answer")
            continue
        c = options(doc, "Maakond")
        p = options(doc, "Kihelkond")
        src[key] = {"counties": len(c), "parishes": len(p)}
        for x in c:
            if x not in counties:
                counties.append(x)
        for x in p:
            if x not in parishes:
                parishes.append(x)
        print(f"  {key}: {len(c)} counties, {len(p)} parishes")

    if not parishes:
        raise SystemExit("nothing came back — not writing an empty file")

    path = "data/estonia-parishes.json"
    json.dump({
        "source": "Rahvusarhiiv — the county and parish vocabularies of the manor "
                  "and rural-municipality registers",
        "url": "http://www.ra.ee/apps/andmed/",
        "note": ("Estonian church records are filed by KIHELKOND, the parish. Before "
                 "1866 the civil administration filed by MANOR instead, and the "
                 "revision lists that name a whole household at once are arranged "
                 "that way — so an Estonian line has two filing systems laid over it "
                 "and the first question about any record is which one it came out "
                 "of. These are the archive's own names for both. NAMES ONLY: no "
                 "coordinates, because the archive publishes none, and inventing "
                 "them would be worse than leaving the list flat."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"counties": len(counties), "parishes": len(parishes),
                   "perRegister": src},
        "counties": sorted(counties),
        "parishes": sorted(parishes),
    }, open(path, "w"), ensure_ascii=False, indent=1)
    print(f"\n{len(counties)} counties, {len(parishes)} parishes -> {path}")
    print("  " + " · ".join(counties[:12]))
    print("  " + " · ".join(sorted(parishes)[:14]) + " …")


if __name__ == "__main__":
    main()

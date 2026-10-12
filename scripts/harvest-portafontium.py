#!/usr/bin/env python3
"""Porta fontium's parish registers of western Bohemia, as coverage claims.

WHY THIS ONE. Czechia is the second largest block of grey ground on this map —
4,987 dots — and an earlier pass in this project concluded it was shut. That
was three portals, and the three happened to be the three that refuse.
eBadatelna's own home page lists every Czech regional portal, and asked
properly SEVEN OF TEN answer. Porta fontium is the best of them: a
Bavarian-Czech joint project with a plain Drupal robots.txt, free scans, and
its registers arranged by church and then by parish.

WHAT IT HOLDS. «Sbírka matrik západních Čech» — the register collection of
western Bohemia, in nine confessional and civil collections: Roman Catholic
1539-1949, Evangelical 1581-1949, Czechoslovak, Czech Brethren, Unity of the
Brethren, Greek Catholic, Orthodox, the district civil registers 1869-1949,
and the German Standesämter. The years are the collection's own, printed on
its index.

WHAT IS TAKEN. The parish names and which collection each belongs to, by
paging the index — fourteen pages for the Roman Catholic set and fewer for the
rest, something like two dozen requests in total. Not one register page is
fetched and not one image is touched: a claim that an archive holds a parish's
books says nothing about the books.

NO RECORD COUNTS. The index does not print them. The collection's own year
span is carried instead, which is a fact about the collection and is labelled
as that rather than as a span for each parish inside it.
"""
import json, os, re, subprocess, time, unicodedata
from html import unescape

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

HOST = "http://www.portafontium.eu"
INDEX = HOST + "/contents/register/"
UA = ("RecordAtlasBot/1.0 (+https://recordatlas.org; "
      "a genealogy atlas recording which ground this collection covers)")
OUT = "data/coverage-claims-portafontium.json"
PAUSE = 1.0                      # a volunteer-funded portal; no hurry
MAX_PAGES = 40

# «Abertamy - římskokatolická» is a parish and a confession. The place is the
# part before the dash; keeping the whole string would stop it ever meeting a
# dot on this map.
SUFFIX = re.compile(r"\s*[-–]\s*(?:řím|evan|česko|staro|řec|prav|jedn|izrael|"
                    r"matrik|okres|civil)[^-–]*$", re.I)


def get(url):
    """Fetched with curl, and the reason is the server's certificate.

    portafontium.eu sends its LEAF certificate and no intermediate — openssl
    says «Verify return code: 21 (unable to verify the first certificate)» —
    so Python's urllib cannot build a chain to a root it trusts and refuses
    the connection. Browsers and curl paper over it by fetching the missing
    issuer themselves.

    The temptation is to switch verification off, and that is the wrong
    trade: it would make every request on this endpoint unauthenticated to
    save one line. curl verifies properly AND completes the chain, so the
    connection stays checked and the archive's broken chain stays its own
    problem rather than becoming this atlas's security hole.
    """
    r = subprocess.run(["curl", "-sL", "--max-time", "60", "-A", UA, url],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"curl exit {r.returncode}")
    return r.stdout


def _slug(s):
    """«Církev římskokatolická» -> «cirkev-rimskokatolicka», as the site spells it."""
    t = unicodedata.normalize("NFKD", s.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def collections():
    """Every register collection, from the index's LINKS and from its TEXT.

    THE LINKS ALONE ARE NOT THE LIST, which cost the largest collection in the
    first run of this script. «Církev římskokatolická (1539-1949)» — the Roman
    Catholic registers of western Bohemia, fourteen pages of parishes — is
    PRINTED on the index and is not linked from it; the string
    «rimskokatolicka» does not occur in that page's HTML at all. Harvesting
    only what the index links to therefore returned eighty parishes and
    reported success, with the four hundred that matter silently missing.

    So the names are read from the text as well, slugged the way the site
    spells them, and any that resolve are kept. A guessed path that 404s costs
    one request and is dropped.
    """
    h = get(INDEX)
    out = {}
    for path, label in re.findall(
            r'href="(/contents/register/[a-z\-]+/[a-z0-9\-]+)"[^>]*>\s*([^<]{2,60})', h):
        lab = " ".join(unescape(label).split())
        if lab and "?" not in path:
            out.setdefault(path, lab)
    linked = {p.rsplit("/", 1)[-1] for p in out}
    text = " ".join(unescape(re.sub(r"<[^>]+>", " ", h)).split())
    for lab in re.findall(r"((?:C\u00edrkev|Okresn\u00ed|Standes)[^()]{3,46}?)\s*\(\d{4}", text):
        lab = " ".join(lab.split())
        sl = _slug(lab)
        if sl in linked:
            continue
        guess = f"/contents/register/soap-pn/{sl}"
        try:
            probe = get(HOST + guess)
        except Exception:                                    # noqa: BLE001
            continue
        if f'href="{guess}/' in probe:
            out[guess] = lab
            print(f"  (not linked on the index, found by name: {lab})", flush=True)
        time.sleep(PAUSE)
    # The years each collection prints on the index, e.g. «(1539-1949)».
    text = " ".join(unescape(re.sub(r"<[^>]+>", " ", h)).split())
    years = {}
    for lab, a, b in re.findall(r"([A-ZÁ-Ž][^()]{3,46}?)\s*\((\d{4})\s*[-–]\s*(\d{4})\)", text):
        years[" ".join(lab.split())] = (int(a), int(b))
    return out, years


def parishes(path):
    """Every parish in one collection, by paging its index."""
    found, page = {}, 0
    while page < MAX_PAGES:
        url = f"{HOST}{path}" + (f"?page={page}" if page else "")
        try:
            h = get(url)
        except Exception as e:                               # noqa: BLE001
            print(f"      page {page}: {str(e)[:40]}")
            break
        rows = re.findall(rf'href="({re.escape(path)}/[a-z0-9\-]+)"[^>]*>\s*([^<]{{2,70}})', h)
        new = 0
        for href, label in rows:
            lab = " ".join(unescape(label).split())
            if not lab:
                continue
            short = SUFFIX.sub("", lab).strip(" -–")
            if short and short not in found:
                found[short] = {"full": lab, "href": href}
                new += 1
        time.sleep(PAUSE)
        if new == 0 or "následující" not in h and "next" not in h.lower():
            break
        page += 1
    return found


def main():
    cols, years = collections()
    print(f"{len(cols)} register collections", flush=True)
    claims, total = [], 0
    for path, label in sorted(cols.items()):
        p = parishes(path)
        if not p:
            print(f"  {label[:44]:<46} nothing")
            continue
        total += len(p)
        span = next((v for k, v in years.items() if k.lower().startswith(label.lower()[:14])), None)
        claims.append({
            "id": "pf-" + path.rsplit("/", 1)[-1],
            "provider": "porta-fontium",
            "title": f"Sbírka matrik západních Čech — {label}",
            "url": HOST + path,
            # THE COLLECTION'S SPAN, NOT EACH PARISH'S. The index prints one
            # pair of years for the whole collection and nothing per parish;
            # copying it onto every parish inside would be inventing a fact.
            "from": span[0] if span else None,
            "to": span[1] if span else None,
            "collectionSpanNotParishSpan": bool(span),
            "records": 0, "images": 0,
            "kind": "CHURCH_RECORD" if "čirkev" in path or "cirkev" in path else "VITAL",
            "countries": ["CZ"],
            "filedUnder": [],
            "crosses": [],
            "places": [{"name": v["full"], "short": k, "type": "PARISH",
                        "lat": None, "lon": None}
                       for k, v in sorted(p.items())],
        })
        print(f"  {label[:44]:<46} {len(p):>4} parishes", flush=True)

    doc = {
        "source": "Porta fontium, the Bavarian-Czech network of digital historical sources",
        "endpoint": INDEX,
        "licence": ("No licence stated — parish names and the collection each "
                    "belongs to, read from the portal's own index. These are facts "
                    "about what the archive holds, not the records themselves. No "
                    "register page is fetched and no image is touched."),
        "harvested": time.strftime("%Y-%m-%d"),
        "note": ("One claim per register collection, carrying the parishes in it. "
                 "`from`/`to` are the COLLECTION's years as its index prints them, "
                 "not each parish's — `collectionSpanNotParishSpan` says so on "
                 "every row that has them. `records: 0` means NOT PUBLISHED: the "
                 "index prints no counts."),
        "counts": {"collections": len(claims), "parishes": total, "records": 0,
                   "recordsNote": "zero means not published, not none"},
        "collections": claims,
    }
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n-> {OUT}: {len(claims)} collections, {total:,} parishes")


if __name__ == "__main__":
    main()

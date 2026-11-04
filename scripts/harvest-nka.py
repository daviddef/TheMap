#!/usr/bin/env python3
"""Greenland's church ledgers, as coverage claims.

Nunatta Allagaateqarfia, the Greenland National Archives (Grønlands Nationalmuseum & Arkiv), has put the church ledgers
(kirkebøger) of 18 parishes online, free, as scans embedded in a viewer. The English page
https://en.nka.gl/archive/using-the-archive/family-history-research/online-church-ledgers/ lists the parishes and links
to the Danish site, where each parish page lists its volumes by years and each volume page lists the ledger types
(births, confirmations, marriages, deaths, arrival and departure lists) as scans.

robots.txt on both hosts disallows only /fileadmin/templates/, /uploads/, /typo3/ and /typo3_src/, none of which is read.
One request per page, 1 s apart, identified as RecordAtlasBot. Nothing is downloaded but the text of the pages: no scan
is fetched, and a claim that the archive shows a ledger says nothing about who may copy it.

WHAT IS TAKEN: parish, sub-parish (Noorliit under Nuuk), the years each volume covers, the record types the volume page
labels, and the page's address. A volume listed with no link is NOT online and is recorded as `offline`, not dropped.
WHAT IS NOT: record counts, which the pages do not give.

Writes data/coverage-claims-nka.json (picked up by build.py with the other coverage-claims*.json) and a `promote` list
of the parishes' places with coordinates, because the Atlas surveyed no Greenland place before this.
"""
import html, json, os, re, sys, time, urllib.parse, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
UA = "RecordAtlasBot/1.0 (+https://recordatlas.org; a genealogy atlas recording which ground this collection covers)"
LIST = "https://en.nka.gl/archive/using-the-archive/family-history-research/online-church-ledgers/"
OUT = "data/coverage-claims-nka.json"
PROVIDER = "na-gl-greenland-national-museum"
PAUSE = 1.0

# Where each parish is. Coordinates are read from Wikipedia's geo data (coordinates for the town named); see COORD_SOURCE.
COORD_TITLES = {
    "Upernavik": "Upernavik", "Uummannaq": "Uummannaq", "Appat": "Appat", "Qeqertarsuaq": "Qeqertarsuaq",
    "Ilulissat": "Ilulissat", "Ilimanaq": "Ilimanaq", "Qasigiannguit": "Qasigiannguit", "Aasiaat": "Aasiaat",
    "Sisimiut": "Sisimiut", "Maniitsoq": "Maniitsoq", "Nuuk": "Nuuk", "Qeqertarsuatsiaat": "Qeqertarsuatsiaat",
    "Paamiut": "Paamiut", "Qaqortoq": "Qaqortoq", "Alluitsoq": "Alluitsoq", "Nanortalik": "Nanortalik",
    "Narsaq": "Narsaq", "Ammassalik": "Tasiilaq",
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def text(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def years(label):
    ys = [int(x) for x in re.findall(r"\b(1[6-9]\d\d|20\d\d)\b", label)]
    return (min(ys), max(ys)) if ys else (None, None)


def coords():
    out = {}
    for k, title in COORD_TITLES.items():
        u = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "query", "prop": "coordinates", "titles": title, "format": "json", "redirects": 1})
        d = json.loads(get(u))
        for pg in d["query"]["pages"].values():
            c = (pg.get("coordinates") or [None])[0]
            if c:
                out[k] = (round(c["lat"], 4), round(c["lon"], 4), pg.get("title"))
        time.sleep(0.5)
    return out


def main():
    idx = get(LIST)
    parishes = re.findall(r'<a href="(https://da\.nka\.gl/arkivet/brug-arkivet/slaegtsforskning/kirkeboeger/[^"/]+/)"[^>]*>([^<]+)</a>', idx)
    seen, plist = set(), []
    for u, n in parishes:
        if u not in seen:
            seen.add(u); plist.append((u, html.unescape(n).strip()))
    print(len(plist), "parishes")
    xy = coords()
    claims, promote, offline = [], {}, []
    for u, pname in plist:
        time.sleep(PAUSE)
        h = get(u)
        i = h.find("<h1>", h.find('id="field_0"'))     # the page's own heading, not the menu's "Kirkebøger"
        body = h[i:h.find("<!--TYPO3SEARCH_end-->", i)]
        head = text(re.search(r"<h1>(.*?)</h1>", body, re.S).group(1))
        sub = head
        paras = re.findall(r"<p>(.*?)</p>", body, re.S)
        for p in paras:
            strong = re.fullmatch(r"\s*<strong>(.*?)</strong>\s*", p, re.S)
            if strong:
                sub = text(strong.group(1)); continue
            a = re.search(r'<a href="([^"]+)"[^>]*>(.*?)</a>', p, re.S)
            label = text(a.group(2) if a else p)
            if not label or not re.search(r"\d{4}", label):
                continue
            lo, hi = years(label)
            first = re.split(r"[/(]", pname)[0].strip()
            key = next((k for k in COORD_TITLES if first.startswith(k)), None)
            if not a:
                offline.append({"parish": pname, "sub": sub, "years": label})
                continue
            vurl = html.unescape(a.group(1))
            time.sleep(PAUSE)
            vh = get(vurl)
            vi = vh.find("<h1>", vh.find('id="field_0"'))
            vb = vh[vi:vh.find("<!--TYPO3SEARCH_end-->", vi)]
            kinds = [text(m) for m in re.findall(r"<p>([^<]{2,60})</p>\s*(?:<div[^>]*issuuembed|<iframe)", vb)]
            # one label reads «1881-19011 vol. III»; the volume's own address says 1881-1909, so the
            # years come from there when a label has a run of digits that is not a year
            if re.search(r"\d{5}", label):
                m = re.search(r"/(\d{4})-(\d{4})", vurl)
                if m:
                    label = re.sub(r"\d{5}", m.group(2), label)
                    lo, hi = years(label)
            title = f"Church ledgers, {pname}" + ("" if sub == head else f" ({sub})") + f", {label}"
            pl = {"name": f"{pname} parish, Greenland", "short": first, "type": "PARISH", "lat": None, "lon": None}
            if key and key in xy:
                pl["lat"], pl["lon"] = xy[key][0], xy[key][1]
                promote[first] = {"id": "gl-" + re.sub(r"[^a-z0-9]+", "-", first.lower()).strip("-"), "name": first, "lat": xy[key][0], "lon": xy[key][1], "country": "GL"}
            claims.append({
                "id": "nka-" + re.sub(r"[^a-z0-9]+", "-", (pname + "-" + sub + "-" + label).lower()).strip("-"),
                "provider": PROVIDER, "title": title, "url": vurl, "from": lo, "to": hi,
                "records": 0, "images": 0, "kind": "CHURCH_RECORD", "countries": ["GL"],
                "filedUnder": [pname], "crosses": [], "places": [pl], "ledgers": kinds,
            })
            print(f"  {pname}: {label} ({len(kinds)} ledgers)")
    json.dump({
        "source": "Greenland National Museum and Archives (Nunatta Allagaateqarfia), church ledgers online",
        "endpoint": LIST, "licence": "No licence stated — parish names, years and ledger types read from the archive's public pages. These are facts about what the archive shows, not the ledgers themselves. No scan is fetched and no image is touched.",
        "harvested": time.strftime("%Y-%m-%d"),
        "note": "One claim per parish volume, with the years the page gives and the ledger types it labels (births, confirmations, marriages, deaths, arrival and departure lists). Years are the label's first and last year; the page gives no counts. Volumes the parish page lists without a link are not online and are in `offline`. The pages say the ledgers run to about 1930, that only Moravian ledgers go back to 1733, and that south of Sisimiut they generally start about 1825 because of the loss of the ship Hans Hedtoft.",
        "counts": {"claims": len(claims), "GL": len(claims)},
        "collections": claims, "offline": offline, "promote": list(promote.values()),
        "coordinates": "Wikipedia geo coordinates for the town of each parish name (en.wikipedia.org API, read " + time.strftime("%Y-%m-%d") + ")",
    }, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(OUT, "a").write("\n")
    print(len(claims), "claims;", len(offline), "volumes not online;", len(promote), "places")


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Antenati's registers — which comune, which book, which years.

WHAT THIS MAP HAS SAID ABOUT ITALY is that 119 Archivi di Stato exist and
roughly where they are. What a researcher needs is the next line down: THIS
comune, THESE registers, THESE years, in THAT archive.

THE OBVIOUS ROUTE IS CLOSED AND THE RIGHT ONE WAS OPEN ALL ALONG.
antenati.cultura.gov.it answers 403 to anything that identifies itself as a
crawler — site-wide, not merely on the sitemap — while its own robots.txt says
«Disallow:», which permits everything. That contradiction is not an invitation
to spoof a browser, so this does not.

It did not need to. The Ministry of Culture publishes the whole of Antenati as
OPEN DATA on dati.gov.it, CC BY 4.0, through an OAI-PMH endpoint — a protocol
whose entire purpose is bulk harvesting by machines, with resumption tokens and
a polite cadence built into its design. 464,770 records. The door was never
locked; this project had been knocking on the wrong one.

WHAT A RECORD LOOKS LIKE, and why the title is the prize:

    Archivio di stato di Ascoli Piceno - Stato civile napoleonico -
      Ascoli Piceno - Matrimoni, indice - 1808 - 5 -
    start=1808-01-01 ;end=1808-12-31

Archive, fondo, COMUNE, record type, year. The records are one per IMAGE, so
half a million of them collapse into the far smaller number that matters: the
volumes. This groups them.

    python3 scripts/harvest-antenati-oai.py [--resume]

It saves as it goes and can be stopped and restarted; OAI's resumption token is
kept in the output file. One request every two seconds, because a public
endpoint with no rate-limit header is a courtesy, not an invitation.

SOURCE. Ministero della Cultura / SAN, set pico_m-ANTENATI, CC BY 4.0.
"""
import argparse, json, os, re, subprocess, sys, time, collections

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
OAI = "http://www.san.beniculturali.it/oaicat/OAIHandler"
UA = "RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap)"
OUT = "data/antenati-registers.json"
PAUSE = 2.0

# A POSITIONAL SPLIT, NOT A REGEX. The first cut used a non-greedy pattern and
# tore «Castel di Lama» into «Castel», and «Ascoli Piceno» into «Ascoli» —
# because a comune's name contains the same separator the fields do. The titles
# are perfectly regular and the fields are positional:
#
#   Archivio di stato di Ascoli Piceno - Stato civile napoleonico -
#   Ascoli Piceno - Matrimoni, indice - 1808 - 5 - - Comune di Ascoli Piceno
#     [0] archive   [1] fondo   [2] comune   [3] what   [4] year   [5] part
#
# and the last field repeats the comune as «Comune di X», which is a free
# check on the third.
SEP = re.compile(r"\s+-\s+")


def parse_title(title):
    """Archive, fondo, comune, parish, register type, years.

    Three things about these titles had to be learnt the hard way. The comune
    and its PARISH live together in field 2 as a slug —
    «Colonna-(Chiesa-cattolica.-Parrocchia-di-San-Martino-in-Colonna)» — and not
    in the tail, which is where the first cut looked. Field 4 is often a RANGE,
    «1740-1861», so a pattern that insisted on one year silently dropped every
    register that spans more than one, which is most of the interesting ones.
    And the tail, «- Comune di Ascoli (Archivio di stato di Ascoli Piceno)», is
    LESS reliable than field 2: it abbreviates Ascoli Piceno to Ascoli. It is
    ignored."""
    f = [x.strip() for x in SEP.split(title)]
    if len(f) < 5:
        return None

    # Field 4: a year, or a span of them.
    ys = re.findall(r"(1[5-9]\d\d|20[0-2]\d)", f[4] or "")
    if not ys:
        return None
    y_from, y_to = int(ys[0]), int(ys[-1])

    # Field 2: the comune, and the parish inside the brackets if there is one.
    raw = (f[2] or "").replace("-", " ").strip()
    pm = re.match(r"^(.*?)\s*\((.+?)\)\s*$", raw)
    comune, parish = (pm.group(1).strip(), pm.group(2).strip()) if pm else (raw, "")
    if not comune or not f[0]:
        return None

    out = {"arch": f[0], "fondo": f[1], "comune": comune,
           "what": f[3], "from": y_from, "to": y_to}
    if parish:
        out["parish"] = re.sub(r"\s*\.\s*", ". ", parish).strip()
    return out


def ask(params):
    url = OAI + "?" + params
    for attempt in range(4):
        r = subprocess.run(["curl", "-sS", "-L", "--max-time", "180", "-A", UA, url],
                           capture_output=True, text=True)
        if r.returncode == 0 and "<OAI-PMH" in r.stdout:
            return r.stdout
        time.sleep(5 * (attempt + 1))
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--max-pages", type=int, default=100000)
    a = ap.parse_args()

    vols, token, pages, seen = {}, None, 0, 0
    if a.resume and os.path.exists(OUT):
        old = json.load(open(OUT))
        vols = {k: v for k, v in old.get("volumes", {}).items()}
        token = old.get("resumptionToken")
        seen = old.get("counts", {}).get("images", 0)
        print(f"resuming: {len(vols):,} volumes, {seen:,} images already seen")

    while pages < a.max_pages:
        if token:
            body = ask("verb=ListRecords&resumptionToken=" + token)
        else:
            body = ask("verb=ListRecords&metadataPrefix=pico&set=pico_m-ANTENATI")
        pages += 1
        if not body:
            print("  no answer — stopping and keeping what is here", flush=True)
            break
        err = re.search(r"<error[^>]*>([^<]*)", body)
        if err:
            print(f"  OAI says: {err.group(1)}", flush=True)
            token = None
            break

        for rec in re.findall(r"<record>(.*?)</record>", body, re.S):
            seen += 1
            t = re.search(r"<dc:title[^>]*>(.*?)</dc:title>", rec, re.S)
            if not t:
                continue
            title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", t.group(1))).strip()
            g = parse_title(title)
            if not g:
                continue
            # One key per BOOK, not per image: «Matrimoni, indice - 1808» in
            # Ascoli Piceno is one volume however many pages it has.
            key = "|".join((g["arch"], g["fondo"], g["comune"],
                            g.get("parish", ""), g["what"],
                            str(g["from"]), str(g["to"])))
            v = vols.get(key)
            if v is None:
                vols[key] = dict(g, images=1)
            else:
                v["images"] += 1

        nt = re.search(r'<resumptionToken[^>]*>([^<]*)</resumptionToken>', body)
        token = (nt.group(1).strip() or None) if nt else None
        size = re.search(r'completeListSize="(\d+)"', body)

        last = (not token) or pages >= a.max_pages
        if pages % 20 == 0 or last:
            json.dump({
                "source": "Ministero della Cultura / SAN, OAI-PMH set pico_m-ANTENATI",
                "url": "https://www.dati.gov.it/opendata/dataset?q=antenati",
                "endpoint": OAI,
                "licence": "CC BY 4.0",
                "note": ("Antenati's registers, grouped from one record per IMAGE "
                         "into one row per VOLUME: which archive, which fondo, "
                         "which comune, what kind of register, which year. "
                         "UNCHECKED — these are the catalogue's own titles."),
                "why": ("antenati.cultura.gov.it answers 403 to any identified "
                        "crawler while its robots.txt permits everything. Rather "
                        "than spoof a browser, this uses the open data the Ministry "
                        "publishes for exactly this purpose."),
                "harvested": time.strftime("%Y-%m-%d"),
                "resumptionToken": token,
                "counts": {"volumes": len(vols), "images": seen,
                           "completeListSize": int(size.group(1)) if size else None,
                           "pages": pages},
                "volumes": vols,
            }, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
            print(f"  page {pages:5}  {seen:>7,} images  {len(vols):>6,} volumes"
                  + (f"  of {int(size.group(1)):,}" if size else ""), flush=True)
        if last:
            break
        time.sleep(PAUSE)

    byc = collections.Counter(v["comune"] for v in vols.values())
    print(f"\n{len(vols):,} volumes across {len(byc):,} comuni, from {seen:,} images")
    print("  " + " · ".join(f"{k}:{n}" for k, n in byc.most_common(8)))
    print(f"\n-> {OUT}" + ("  (more to come; run again with --resume)" if token else ""))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Add evidence entries to data/flag-evidence.json for each country's present-day flag era.

Reads data/flag-adoption.json (what Flags of the World and Wikipedia say about when the
current flag was adopted) and compares the YEAR with the year our present-day era starts.

  - Both sources give our year      -> class `attested`, two publishers.
  - Only one, or neither, gives it  -> class `unreviewed`, with both sources and the
                                       disagreement written in `open`. That is the queue.
  - A source is silent              -> it is not cited.

A hand-written entry is never overwritten. Only the START YEAR of the current flag is
checked; the design and the swatch colours are not compared with any specification, and
every entry made here says so.

    python3 scripts/build-flag-evidence.py            # write
    python3 scripts/build-flag-evidence.py --report   # print the disagreements, write nothing
"""
import glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
YEAR = re.compile(r"\b(1[0-9]{3}|20[0-2][0-9])\b")
DATE = re.compile(r"(\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|[A-Z][a-z]+\s+\d{4}|\d{4})")


MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]


def nice(v):
    """«{{start date and age|1967|02|27}}» is wikitext, not a date a reader can read."""
    m = re.search(r"\{\{\s*(?:start date|start-date|sdate)[^|}]*\|\s*(\d{4})(?:\|\s*(\d{1,2}))?(?:\|\s*(\d{1,2}))?", v, re.I)
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        if mo and 1 <= int(mo) <= 12:
            return (f"{int(d)} " if d else "") + f"{MONTHS[int(mo) - 1]} {y}"
        return y
    v = re.sub(r"<[^>]+>", " ", v)
    v = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"\{\{[^}]*\}\}", lambda x: (YEAR.search(x.group(0)) or [""])[0] if YEAR.search(x.group(0)) else "", v)
    return re.sub(r"\s+", " ", v).strip(" ;,")[:80]


def years(s):
    return [int(y) for y in YEAR.findall(s or "")]


def wp_years(w):
    if not w.get("found") or not w.get("fields"):
        return None, ""
    v = w["fields"][0]["value"]
    # {{start date and age|1990|12|21}} and the like: the year is the first number.
    ys = years(v)
    return (ys or None), v


def fotw_years(f):
    if not f.get("found") or not f.get("lines"):
        return None, ""
    first = f["lines"][0]
    ys = years(first)
    allys = sorted({y for l in f["lines"][:3] for y in years(l)})
    m = DATE.search(first[max(0, first.lower().find("adopt")):] or first)
    return (allys or None), (m.group(1) if m else (str(ys[0]) if ys else ""))


ENTRY = re.compile(r'<div class="entry"[^>]*?id="([^"]+)"[^>]*>(.*?)(?=<div class="entry"|</div>\s*</div>\s*<!--|\Z)', re.S)
CAPTION = re.compile(r'<div class="flag-caption">(.*?)</div>', re.S)


def placeholders(pages):
    """Eras whose OWN caption says the image is a placeholder.

    A third of the flag images on this atlas are not flags, and the caption under each says so in
    small type. The audit counted 337. This gives the reader the same fact in the label, in the
    same words as the caption, and claims nothing more: whether a flag, banner or standard
    existed in the period was not checked, which is why the class is `placeholder` and not `none`.
    """
    n = 0
    for f in sorted(glob.glob("site/src/flags-pages/*-flags.html")):
        slug = os.path.splitext(os.path.basename(f))[0]
        txt = open(f, encoding="utf-8", errors="replace").read()
        for eid, body in ENTRY.findall(txt):
            m = CAPTION.search(body)
            if not m:
                continue
            cap = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
            if not re.search(r"placeholder", cap, re.I) or eid in pages.get(slug, {}):
                continue
            pages.setdefault(slug, {})[eid] = {
                "class": "placeholder", "sources": [],
                "says": f"This page's own caption calls the image a placeholder: \u00ab{cap[:140]}\u00bb.",
                "open": "Whether a flag, banner or standard existed in this period was not checked. The colour shown is not evidence of one."}
            n += 1
    return n


# THE DATES ALONE ARE NOT ENOUGH, AND THE FIRST RUN PROVED IT. Of 22 eras whose Wikipedia article
# matched on both years, four were the wrong flag: Northern Rhodesia matched «Flag of Southern
# Rhodesia», Soviet Georgia matched «Flag of the Soviet Union», Libya's 1951 kingdom matched the
# country's flag article, and the 1946 Yugoslav era was already done by hand. A person read the 22
# and these are the ones whose article is plainly the same polity as the era.
CHECKED_BY_HAND = {
    "cambodia-flags|era-1970", "cambodia-flags|era-1975", "costa-rica-flags|era-1823",
    "ecuador-flags|era-1822", "honduras-flags|era-1823", "iraq-flags|era-1963",
    "latvia-flags|era-1561-1", "latvia-flags|era-1953", "montenegro-flags|era-1992",
    "nicaragua-flags|era-1823", "nigeria-flags|era-1914", "panama-flags|era-1821",
    "russia-flags|era-1922", "serbia-flags|era-1992", "syria-flags|era-1958",
    "uk-flags|era-1707", "ukraine-flags|era-1949",
}


def historical(pages, srcs):
    """Entries for historical eras from data/flag-historical.json (scripts/harvest-flag-historical.py).

    An era whose Wikipedia article matches on BOTH dates and whose linked Flags of the World page
    carries the end year and has the start year in a sentence about adopting is `attested`: two
    publishers, dates agreeing from each. An era matching on Wikipedia alone is `unreviewed`, with
    the article cited, because one compiled source is not enough. Nothing else is written.
    """
    try:
        doc = json.load(open("data/flag-historical.json", encoding="utf-8"))
    except OSError:
        return {"attested": 0, "wikipedia_only": 0}
    day = doc.get("harvested")
    n = {"attested": 0, "wikipedia_only": 0}
    for key, r in doc.get("eras", {}).items():
        m = r.get("match")
        if not m or key not in CHECKED_BY_HAND:
            continue
        slug, eid = key.split("|")
        if eid in pages.get(slug, {}):
            continue
        wid = "wp-" + re.sub(r"[^a-z0-9]+", "-", m["title"].lower()).strip("-")
        srcs[wid] = {"title": m["title"], "publisher": "Wikipedia", "url": m["url"], "kind": "compiled",
                     "checked": day, "note": "Read from the infobox `Adoption` and `Relinquished` fields in the page's wikitext."}
        good = [x for x in r.get("fotw", []) if x.get("has_to") and x.get("from_in_adopting_sentence")]
        said = (f"Wikipedia's \u00ab{m['title']}\u00bb gives adoption in {', '.join(map(str, m['adoption'][:2]))} and "
                f"relinquishment in {', '.join(map(str, m['relinquished'][:2]))}, within a year of this era's "
                f"{r['from']} and {r['to']}.")
        use = [wid]
        if good:
            f = good[0]
            f["url"] = f["url"].replace("http://", "https://")
            fid = "fotw-" + re.sub(r"[^a-z0-9]+", "-", f["url"].split("/flags/")[-1].lower()).strip("-")
            srcs[fid] = {"title": "Flags of the World page linked from that article", "publisher": "Flags of the World (CRW Flags)",
                         "url": f["url"], "kind": "compiled", "checked": day,
                         "note": "Reached through the Wikipedia article's own link; matched on the years in its text."}
            use.append(fid)
            cls = "attested"
            said += (f" The Flags of the World page that article links also carries {r['to']}, and has {r['from']} "
                     "next to a word about adopting.")
            opn = ("Only the dates were compared. The Flags of the World page was matched on the two years appearing in its "
                   "text and on one of them sitting beside the word adopt, introduce, establish or the like; it was not read "
                   "for what it says about this flag. The design and the swatch colours were not checked against a specification.")
            n["attested"] += 1
        else:
            cls = "unreviewed"
            opn = ("Wikipedia is the only source whose dates were compared; no linked Flags of the World page confirmed them. "
                   "The design and the swatch colours were not checked against a specification.")
            n["wikipedia_only"] += 1
        pages.setdefault(slug, {})[eid] = {"class": cls, "sources": use, "says": said, "open": opn}
    return n


def main():
    report = "--report" in sys.argv
    ad = json.load(open("data/flag-adoption.json", encoding="utf-8"))
    day = ad.get("harvested")
    ev = json.load(open("data/flag-evidence.json", encoding="utf-8"))
    eras = json.load(open("data/flag-eras.json", encoding="utf-8"))["eras"]
    fm = json.load(open("site/public/flag-map.json"))["slug"]
    fi = {c["url"].split("/")[-1].replace(".html", ""): c["name"]
          for c in json.load(open("data/flag-index.json"))["countries"]}
    pages = ev.setdefault("pages", {})
    srcs = ev.setdefault("sources", {})
    stats = {"attested": 0, "unreviewed": 0, "skipped": 0, "kept": 0}
    bad = []
    for slug, cc in sorted(fm.items()):
        pres = [e for e in eras if e["slug"] == slug and e.get("present") and e.get("id")]
        if not pres:
            stats["skipped"] += 1
            continue
        e = max(pres, key=lambda x: x.get("from") or 0)
        mine = e.get("from")
        if e["id"] in pages.get(slug, {}):
            stats["kept"] += 1
            continue
        rec = ad["countries"].get(cc) or {}
        wy, wv = wp_years(rec.get("wikipedia") or {})
        fy, fdate = fotw_years(rec.get("fotw") or {})
        name = fi.get(slug, slug)
        use = []
        if wy:
            srcs[f"wp-flag-{cc.lower()}"] = {
                "title": (rec["wikipedia"].get("title") or f"Flag of {name}"), "publisher": "Wikipedia",
                "url": rec["wikipedia"]["url"], "kind": "compiled", "checked": day,
                "note": "Read from the infobox `Adoption` field in the page's wikitext."}
            use.append(f"wp-flag-{cc.lower()}")
        if fy:
            srcs[f"fotw-{cc.lower()}"] = {
                "title": name, "publisher": "Flags of the World (CRW Flags)",
                "url": rec["fotw"]["url"], "kind": "compiled", "checked": day,
                "note": "Read from the page's own «adopted» line."}
            use.append(f"fotw-{cc.lower()}")
        # THE TWO SOURCES MUST AGREE WITH EACH OTHER ON A YEAR, AND THAT YEAR MUST NOT BE
        # AFTER THE ERA BEGINS. An era that starts in 1981 at independence under a flag adopted in
        # 1967 is fine: the flag was in use when it began. An era that starts in 1990 under a flag
        # both sources say was adopted in 1995 is not, and goes to the queue.
        # THE LAST YEAR IN THE INFOBOX FIELD, because the field lists the flag's earlier forms first
        # («1879 (first adoption), 1990») and the CURRENT flag is the newest of them.
        common = sorted(({wy[-1]} if wy else set()) & set(fy or []))
        okyear = [y for y in common if y <= (mine or 0)]
        w_ok = f_ok = bool(okyear)
        Y = okyear[-1] if okyear else None
        parts = []
        if wy:
            parts.append(f"Wikipedia's infobox gives the adoption as {nice(wv)}")
        if fy:
            parts.append(f"Flags of the World dates it {fdate or fy[0]}")
        scope = "Only the year the current flag was adopted was compared; the design and the swatch colours were not checked against a specification."
        if w_ok and f_ok:
            cls = "attested"
            if Y == mine:
                says = f"Both sources give {mine}, the year this page starts the current flag. " + "; ".join(parts) + "."
            else:
                says = (f"Both sources date the current flag to {Y}, before this era begins in {mine}, "
                        f"so the flag was already in use at the start. " + "; ".join(parts) + ".")
            opn = scope
        else:
            cls = "unreviewed"
            if not use:
                says = ""
                opn = f"Neither source gave an adoption date to compare with {mine}. {scope}"
            else:
                says = "; ".join(parts) + "."
                if common:
                    opn = (f"Both sources give {common[-1]} for the current flag, which is after {mine}, the year this "
                           f"page starts the era. Either the era begins under an earlier flag or one of the dates is wrong. {scope}")
                else:
                    opn = (f"The two sources do not agree on a year with each other, or one is silent, so {mine}, the "
                           f"year this page starts the current flag, could not be confirmed. {scope}")
            bad.append((slug, e["id"], mine, wy and wy[:2], fy))
        stats[cls] += 1
        if not report:
            ent = {"class": cls, "sources": use}
            if says:
                ent["says"] = says
            ent["open"] = opn
            pages.setdefault(slug, {})[e["id"]] = ent
    if not report:
        stats["placeholder"] = placeholders(pages)
        stats["historical"] = historical(pages, srcs)
    print(stats)
    if report:
        for b in bad:
            print(b)
        return
    # drop sources nothing cites
    used = {s for p in pages.values() for e in p.values() for s in e.get("sources", [])}
    for k in [k for k in srcs if k not in used]:
        del srcs[k]
    json.dump(ev, open("data/flag-evidence.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open("data/flag-evidence.json", "a").write("\n")


if __name__ == "__main__":
    main()

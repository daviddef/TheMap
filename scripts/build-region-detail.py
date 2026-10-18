#!/usr/bin/env python3
"""Write data/region-detail.json for the pilot region (Calabria): who ruled it each year, and what
language its records were kept in.  Hand-run; the content below is transcribed from fetched pages and
every row names the page it came from. Wikidata ids are resolved by a search and accepted only when
the person's life covers the reign's start (a unique hit), else left null.

WHY A PILOT. The family sites asked for a language of administration per era (clerks' language follows
the ruler) and a ruler per year. Neither could be answered from data the atlas held: one ruler per flag
era, the first of the era. This is what the answer looks like for one region, so its shape and its gaps
can be judged before 38 more are written.

WHAT IT REFUSES. A language is recorded only where a fetched page states it, and the page's own
vagueness is kept: «Latin and Italian were used for written communication» is not narrowed to a date.
Where a page is silent (the language of the Napoleonic civil registers, of the Greek-rite parishes) the
row says it is not covered, rather than leaving the reader to assume.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "region-detail.json")
WP_NAP = "https://en.wikipedia.org/wiki/List_of_monarchs_of_Naples"
WP_SIC = "https://en.wikipedia.org/wiki/List_of_Sicilian_monarchs"
WP_2S = "https://en.wikipedia.org/wiki/Kingdom_of_the_Two_Sicilies"
WP_KN = "https://en.wikipedia.org/wiki/Kingdom_of_Naples"
WP_KI = "https://en.wikipedia.org/wiki/Kingdom_of_Italy"
IT_REG = "https://it.wikipedia.org/wiki/Registro_parrocchiale"
IT_SC = "https://it.wikipedia.org/wiki/Stato_civile"
WD = "https://www.wikidata.org"

# (name as the page gives it, title/polity, from, to, source, note)  dates as the page gives them
R = []
def r(name, polity, a, b, src, note=""): R.append(dict(name=name, polity=polity, **{"from": a, "to": b}, source=src, note=note))

for n, a, b in [("Henry VI (Henry I of Sicily)", "1194", "1197"), ("Constance I", "1194", "1198"), ("Frederick II", "1198", "1250"),
                ("Conrad I", "1250", "1254"), ("Conrad II (Conradin)", "1254", "1258"), ("Manfred", "1258", "1266"),
                ("Charles I of Anjou", "1266", "1282")]:
    r(n, "Kingdom of Sicily (island and mainland south)", a, b, WP_SIC, "Reign years as the page gives them; Frederick II is listed as joint rule with Constance.")
for n, a, b in [("Charles I", "1282-03-30", "1285-01-07"), ("Charles II, the Lame", "1285-01-07", "1309-05-05"), ("Robert, the Wise", "1309-05-05", "1343-01-20"),
       ("Joanna I", "1343-01-20", "1382-05-12"), ("Louis I, jure uxoris", "1348-08-18", "1362-05-26"), ("Charles III, the Short", "1382-05-12", "1386-02-24"),
       ("Ladislaus, the Magnanimous", "1386-02-24", "1390"), ("Ladislaus (second reign)", "1399", "1414-08-06"), ("Joanna II", "1414-08-06", "1435-02-02"),
       ("René, the Good", "1435-02-02", "1442-06-02"), ("Alfonso I, the Magnanimous", "1442-06-02", "1458-06-27"), ("Ferdinand I", "1458-06-27", "1494-01-25"),
       ("Alfonso II", "1494-01-25", "1495-01-23"), ("Ferdinand II", "1495-01-23", "1496-09-07"), ("Frederick", "1496-09-07", "1501-08-01"),
       ("Louis III (French)", "1501-08-02", "1504-01-31"), ("Ferdinand III (Spanish)", "1504-01-31", "1516-01-23"), ("Joanna III", "1516-01-23", "1555-04-12"),
       ("Charles IV (Habsburg)", "1516-03-14", "1554-07-25"), ("Philip I (listed as Philip II of Spain)", "1554-07-25", "1598-09-13"),
       ("Philip II (listed as Philip III of Spain)", "1598-09-13", "1621-03-31"), ("Philip III (listed as Philip IV of Spain)", "1621-03-31", "1647"),
       ("Henry of Guise, Doge", "1647-10-22", "1648-04-05"), ("Philip III (Spain, 1648-65)", "1648", "1665-09-17"),
       ("Charles V (listed as Charles II of Spain)", "1665-09-17", "1700-11-01"), ("Philip IV (linked to Philip V of Spain)", "1700-11-01", "1713-04-11"),
       ("Charles VI", "1713-04-11", "1734"), ("Charles VII, later Charles III of Spain", "1734-06-02", "1759-10-06"),
       ("Ferdinand IV (first reign)", "1759-10-06", "1799-01-23"), ("Ferdinand IV (second reign)", "1799-06-13", "1806-03-30"),
       ("Joseph I (Joseph Bonaparte)", "1806-03-30", "1808-07-08"), ("Joachim-Napoleon (Murat)", "1808-08-01", "1815-05-22"),
       ("Ferdinand IV (third reign)", "1815-05-22", "1816-12-08")]:
    r(n, "Kingdom of Naples", a, b, WP_NAP, "As listed on the page: several Spanish kings carry Neapolitan regnal numbers that differ from their Spanish ones; the page's dates for Charles IV overlap Joanna III's.")
r("Jean Etienne Championnet (dictator)", "Parthenopean Republic", "1799-01-21", "1799-02-24", WP_NAP, "Military dictator; Calabria's own allegiance in these months is not covered here.")
r("Etienne Macdonald (dictator)", "Parthenopean Republic", "1799-02-24", "1799-06-03", WP_NAP, "Military dictator.")
for n, a, b in [("Ferdinand I", "1816-12-12", "1825-01-04"), ("Francis I", "1825-01-04", "1830-11-08"), ("Ferdinand II", "1830-11-08", "1859-05-22"), ("Francis II", "1859-05-22", "1861-03-20")]:
    r(n, "Kingdom of the Two Sicilies", a, b, WP_2S, "Dates from the page's monarch table. Garibaldi's men landed in Calabria on 19 August 1860 and Reggio fell on 21 August (Wikipedia, Expedition of the Thousand), so the Bourbon reign here ended in fact months before 20 March 1861." if n == "Francis II" else "Dates from the page's monarch table.")
for n, a, b, q in [("Victor Emmanuel II", "1861-03-17", "1878-01-09", "Q168691"), ("Umberto I", "1878-01-09", "1900-07-29", "Q153688"),
                   ("Victor Emmanuel III", "1900-07-29", "1946-05-09", "Q150642"), ("Umberto II", "1946-05-09", "1946-06-18", "Q187149")]:
    r(n, "Kingdom of Italy", a, b, WD + "/wiki/Q172579", "From the head-of-state statements on the Kingdom of Italy's Wikidata item. Calabria passed to Victor Emmanuel II's authority in autumn 1860, before the kingdom was proclaimed on 17 March 1861.")
    R[-1]["q"] = q

# the Italian Republic's presidents, from the harvested Wikidata statements (scripts/harvest-leaders.py)
LD = json.load(open(os.path.join(ROOT, "data", "leaders.json"), encoding="utf-8"))["countries"]["IT"]["holders"]
seen = set()
for h in LD:
    if h["start"] >= "1946-06-13" and (h["q"], h["start"]) not in seen:
        seen.add((h["q"], h["start"]))
        r(h["name"], "Italian Republic", h["start"], h["end"], WD + "/wiki/" + h["q"],
          "Head of state per Wikidata; the first rows are acting or provisional holders.")
        R[-1]["q"] = h["q"]

UA = "RecordAtlas/1.0 (https://recordatlas.org; david.defranceski@gmail.com)"
API = "https://www.wikidata.org/w/api.php"


def api(params):
    url = API + "?" + urllib.parse.urlencode(params | {"format": "json", "origin": "*"})
    for i in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60))
        except Exception:
            time.sleep(3)
    return {}


def year(s):
    m = re.match(r"-?\d{3,4}", s or "")
    return int(m.group()) if m else None


def resolve(row):
    """A Wikidata id only for a unique human whose life covers the start of the reign."""
    if row.get("q"):
        return
    base = re.sub(r"\s*\(.*?\)|,.*$", "", row["name"]).strip()
    y = year(row["from"])
    hits = api({"action": "wbsearchentities", "search": base, "language": "en", "limit": 8, "type": "item"}).get("search", [])
    ids = [h["id"] for h in hits]
    if not ids or y is None:
        return
    ents = api({"action": "wbgetentities", "ids": "|".join(ids), "props": "claims|labels|descriptions", "languages": "en"}).get("entities", {})
    ok = []
    for i, e in ents.items():
        cl = e.get("claims", {})
        inst = [c["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for c in cl.get("P31", [])]
        if "Q5" not in inst:
            continue
        def yr(c):
            try:
                return int(c["mainsnak"]["datavalue"]["value"]["time"][:5].replace("+", ""))
            except Exception:
                return None
        b = yr(cl["P569"][0]) if cl.get("P569") else None
        d = yr(cl["P570"][0]) if cl.get("P570") else None
        desc = (e.get("descriptions", {}).get("en", {}) or {}).get("value", "")
        if b is not None and b <= y + 1 and (d is None or y <= d) and re.search(r"king|queen|emperor|duke|count|regent|ruler|monarch|doge|sovereign|prince", desc, re.I):
            ok.append(i)
    if len(ok) == 1:
        row["q"] = ok[0]
        row["qLabel"] = ents[ok[0]]["labels"]["en"]["value"]


LANG = [
    {"kind": "church-registers", "languages": ["la"], "from": 1563, "to": None, "polity": "(all)",
     "says": "Parish registers of baptisms and marriages became compulsory in 1563 and of deaths in 1614; entries were mainly written in Latin to standard formulas, and Latin stayed in use in some dioceses into the twentieth century.",
     "notCovered": "The language of the Greek-rite and Arbereshe (Albanian-rite) parishes of Calabria is not stated by this source; the page notes Italian marginal notes. The page does not name the Council of Trent as the 1563 source.",
     "source": IT_REG},
    {"kind": "administration", "languages": ["it", "la"], "from": None, "to": 1816, "polity": "Kingdom of Naples",
     "says": "Wikipedia says the official language was Italian, used for bureaucracy, education and formal communications, and that Latin and Italian were used for written communication; it gives no dates and does not describe changes across the Angevin, Aragonese, Spanish, Habsburg, Bourbon or Napoleonic periods.",
     "notCovered": "Spanish and Catalan are not mentioned; no change of language is dated.", "source": WP_KN},
    {"kind": "administration", "languages": ["it"], "from": 1816, "to": 1861, "polity": "Kingdom of the Two Sicilies",
     "says": "Wikipedia gives Italian as the official language, with Sicilian and Neapolitan as common languages.",
     "notCovered": "The page says nothing about the language of administration or law specifically.", "source": WP_2S},
    {"kind": "administration", "languages": ["it"], "from": 1861, "to": None, "polity": "Kingdom of Italy and the Republic",
     "says": "Wikipedia's infobox lists Italian as the Kingdom of Italy's official language.",
     "notCovered": "No statement on administration, courts or schools, or on Greek and Albanian minorities.", "source": WP_KI},
    {"kind": "civil-registers", "languages": None, "from": 1806, "to": None, "polity": "(all)",
     "says": "Italian Wikipedia says civil registers separate from the parish ones were set up in the Comuni of the Regno Italico in 1806-1810, that the Kingdom of the Two Sicilies kept a lay civil registry after the Restoration (no date), and that the Kingdom of Italy's decree of 15 November 1865 made the mayor the civil registrar.",
     "notCovered": "The language the civil registers were written in (Italian, French, Latin) is not stated, and the page gives neither the 1809 start in the Kingdom of Naples nor the 1820 structure.", "source": IT_SC},
    {"kind": "spoken", "languages": ["nap", "grc", "sq"], "from": None, "to": 1861, "polity": "Kingdom of the Two Sicilies",
     "says": "Wikipedia says the Neapolitan and Calabrian dialects predominated on the mainland, Greek speakers lived in Calabria and Puglia and Albanian speakers in Calabria and Sicily.",
     "notCovered": "No dates for any of these.", "source": WP_KN},
]


def main():
    for row in R:
        resolve(row)
        time.sleep(0.2)
    doc = {
        "note": ("A pilot of two things the family sites asked for: a ruler for every year, and the language a region's records "
                 "were kept in. One region (calabria) so far. Rulers are transcribed from the pages named in each row; a ruler "
                 "overlaps the next where the page's dates do, and the reign a page gives is the legal one, not who held "
                 "Calabria in fact (see `note`). Languages are recorded only where a fetched page states them, with what it "
                 "does not cover. Built by scripts/build-region-detail.py."),
        "regions": {"calabria": {"rulers": R, "language": LANG}},
    }
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    got = sum(1 for x in R if x.get("q"))
    print(f"{len(R)} rulers ({got} with a Wikidata id), {len(LANG)} language rows")


if __name__ == "__main__":
    main()

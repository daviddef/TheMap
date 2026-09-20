#!/usr/bin/env python3
"""Put the harvested volumes onto places this map already knows.

scripts/harvest-fs-waypoints.py brings back books with the path that led to
them — ["Betanzos", "Betanzos"] labelled ["City or Municipality", "Parish"].
A book is only useful here once it sits on a dot, so this joins that path to
the atlas's own places.

DEEPEST FIRST, AND ONLY INSIDE THE COLLECTION'S OWN COUNTRIES. A parish is a
better answer than the municipality containing it, and "Betanzos" must not
be allowed to match a Betanzos somewhere else in the world. Every candidate
is tried against the folded name and every former name a place answers to,
which is the whole point of the gazetteer: a book filed under Gallignana
belongs on Gračišće.

WHAT DOES NOT MATCH IS REPORTED, NOT DISCARDED QUIETLY. The names that fail
are the map's next places — they are real settlements FamilySearch has books
for and this atlas has never heard of — so they are written out in
descending order of how many books are waiting on them.

    python3 scripts/match-fs-volumes.py
"""
import collections, gzip, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SRC = "data/fs-waypoints.json"
# GZIPPED, BECAUSE THIS OUTGROWS GITHUB OTHERWISE. At 171 collections of
# 3,504 the matched volumes were already 13.4 MB and heading for roughly
# 275 MB; GitHub warns at 50 MB and refuses at 100. JSON of this shape
# compresses about sixteen to one, so gzip keeps the whole harvest well
# inside the limit and CI can still read it.
OUT = "data/fs-volumes-world.json.gz"
GAPS = "data/fs-volumes-unplaced.json"
PROMOTE = "data/fs-volumes-promote.json"


def dump(obj, path):
    if path.endswith(".gz"):
        with gzip.open(path, "wt", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
    else:
        json.dump(obj, open(path, "w"), ensure_ascii=False, indent=1)


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


# NOT EVERY LEVEL OF THE TREE IS A PLACE, and treating them all as one is a
# way to put books in the wrong country. Croatia's tree opens on RELIGION —
# Civil, Evangelical, Greek Catholic, Jewish, Military, Orthodox, Roman
# Catholic — and other collections branch on record type or on an archive.
# Matching "Military" or "Index" against a gazetteer of 45,985 settlements
# will eventually hit something, and the hit will be nonsense.
#
# So levels are read by their LABEL, which FamilySearch supplies. Anything
# named here is never treated as a place; everything else may be.
NOT_A_PLACE = re.compile(
    r"religion|denomination|record type|event|type and years|volume|film|"
    r"language|collection|series|archive|repository|source|category|"
    # GROUP AND RANGE ARE FILING BUCKETS, NOT GROUND. A level labelled
    # "Group" holds "Group 1, Group 2"; one labelled "Range" holds
    # "Aabol - Bakic", which is an alphabetical span of surnames in an
    # index. Between them 11,956 volumes were being offered to a gazetteer
    # of 45,985 settlements, where "Aabol" or "Bice" will eventually hit
    # something and the hit will be nonsense.
    r"^group$|^range$|^box$|^reel$|^item$|^bundle$|^batch$|^part$", re.I)

# The same labels tell us the CONFESSION for free, which is the one thing the
# browser walk had that this was assumed not to: "Roman Catholic" beside a
# book, not inferred from its title.
IS_RELIGION = re.compile(r"religion|denomination", re.I)

# A LEVEL THAT IS AN ADMINISTRATIVE AREA MAY VOUCH FOR A COUNTRY BUT MUST NOT
# BE THE ANSWER.
#
# "Pola › Materada (Frazione di Umago) › Beata Vergine della Neve" is a book
# from Materada, a frazione of Umag in Croatia. Neither Materada nor the
# church resolved, so the matcher fell back to the province — and "Pola" is
# an alternate name of Polla in Campania, 600km away and conveniently in the
# same country as the collection. Four books landed there, confidently.
#
# A province is not where a register was kept. It is useful for deciding
# WHICH country a path is talking about and useless for deciding which town,
# so it votes and never wins. Where the settlement levels resolve to nothing,
# the honest answer is that the place is unknown.
IS_AREA = re.compile(r"province|state|region|county|district|department|"
                     r"prefecture|governorate|oblast|canton|diocese|deanery|"
                     r"archdiocese|country", re.I)


def bare(s):
    """«Albanasi (Zadar)» -> «Albanasi». The bracket disambiguates for a
       human and gets in the way of a join."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", s or "").strip()


# Church-dedication prefixes that are never the place. "Sv. Stošija" is a
# patron saint, not a settlement.
ABBREV = {"sv", "st", "ss", "sta", "sto", "san", "sankt", "hl"}


def readings(name, label=None):
    """Every reading of one waypoint name, most specific first.

    FamilySearch names a parish by its church inside its town — "Zadar, Sv.
    Stošija", "Split, Sv. Dujma" — and those were the two commonest names
    this matcher could not place, 59 and 40 books apiece. The town is on the
    shelf; only the dedication was in the way. So the whole name is tried
    first, because a parish is the better answer when we hold it, and the
    segments only after that.
    """
    # A LABEL NAMING TWO LEVELS MEANS THE VALUE HOLDS TWO PLACES.
    # Benin files under "Commune - Arrondissement", whose values read
    # "Sakété - Yoko" — the commune and the arrondissement inside it. The
    # dash is only splittable when the LABEL says so: "Aabol - Bakic" under
    # a "Range" label is an alphabetical span and splitting it would offer
    # "Aabol" to the gazetteer as a town.
    extra = []
    if label and " - " in label and " - " in (name or ""):
        extra = [x.strip() for x in name.split(" - ")]
    out, seen = [], set()
    for cand in extra + [name, bare(name)] + \
                [x.strip() for x in re.split(r"\s*,\s*", name or "")] + \
                [bare(x.strip()) for x in re.split(r"\s*,\s*", name or "")]:
        c = (cand or "").strip()
        # "Sv." must not be offered as a place name; Pag, Krk and Rab must.
        # The first cut used a length test for this and threw away three real
        # Croatian towns — 109 books between them — to exclude one
        # abbreviation. Test for the abbreviation instead.
        if c.endswith(".") or c.lower().rstrip(".") in ABBREV:
            continue
        if len(c) >= 3 and c.lower() not in seen:
            seen.add(c.lower())
            out.append(c)
    return out


def main():
    if not os.path.exists(SRC):
        sys.exit(f"{SRC} is not there — run harvest-fs-waypoints.py first.")
    wp = json.load(open(SRC))
    places = json.load(open("data/places.json"))["places"]

    # THE COUNTRIES COME FROM collections.json, NOT FROM THE WAYPOINT FILE.
    #
    # The harvester stamps each collection's countries into its output at the
    # moment it walks it. That is a derived value with a long life: when the
    # ISO lookup was later corrected, 30 collections gained a country they
    # had never had — Isle of Man, Benin, Micronesia, Lesotho, the Cook
    # Islands — but their waypoint rows still carried the empty list from
    # before. A collection with no country cannot be scoped, so every one of
    # their books stayed unplaceable, and it looked like a matching problem
    # rather than a stale copy.
    #
    # So the live list wins and the stamped value is only a fallback.
    live_cc = {}
    try:
        import re as _re
        for c in json.load(open("data/collections.json"))["collections"]:
            m = _re.search(r"/collection/(\d+)", c.get("url") or "")
            if m:
                live_cc[m.group(1)] = c.get("countries") or []
    except FileNotFoundError:
        pass

    # (country, folded name) -> places. Scoped by country from the start,
    # because an unscoped index of 7,391 places puts Santa Maria in nine
    # countries and the first one wins, silently and wrongly.
    idx = collections.defaultdict(list)
    for p in places:
        cc = p.get("country")
        if not cc:
            continue
        forms = {p["name"]}
        for n in p.get("names", []):
            v = n.get("n", "")
            forms.add(v)
            # Names arrive hierarchical — "A Coruña, Galicia, Spain" — and a
            # waypoint says only "A Coruña", so index the leading segment too.
            if "," in v:
                forms.add(v.split(",")[0])
        own = {fold(p["name"]), fold(bare(p["name"]))}
        for f in forms:
            for cand in {fold(f), fold(bare(f))}:
                if len(cand) > 2:
                    # RANKED, BECAUSE A NAME CAN REACH SEVERAL PLACES AND THE
                    # FIRST ONE IS NOT THE RIGHT ONE. "Albanasi (Zadar)" and
                    # "Bolnica (Zadar)" both carry Zadar's own former names
                    # among their variants, so (HR, "zadar") resolved to
                    # albanasi, bolnica, zadar — in that order — and Zadar
                    # itself, with 59 books, came third and never won. A
                    # place whose OWN name is the one being matched outranks
                    # a place that merely inherited it from a parent.
                    idx[(cc, cand)].append((0 if cand in own else 1, p))

    # SECOND CHANCE, FROM THE GAZETTEER. A parish FamilySearch has books for
    # is very often a real settlement this atlas simply has not drawn yet —
    # 45,985 of them are sitting in the gazetteer with coordinates and every
    # name they answer to. Matching against those turns an unplaced book into
    # a new dot instead of a line in a report nobody actions.
    #
    # It is a SECOND pass, never a competing one: a place already on the
    # shelf wins, because it has been through the checks the gazetteer has
    # not. And population breaks ties — where a country has four villages of
    # the same name, the largest is the likeliest subject of a record
    # collection, and the alternative is picking whichever came first in the
    # file.
    gaz_idx = collections.defaultdict(list)
    try:
        gaz = json.load(open("data/gazetteer.json"))["places"]
    except FileNotFoundError:
        gaz = []
    for g in gaz:
        cc = g.get("k")
        if not cc:
            continue
        for f in {g.get("n", "")} | set(g.get("a") or []):
            cand = fold(f)
            if len(cand) > 2:
                gaz_idx[(cc, cand)].append(g)
    for key in gaz_idx:
        gaz_idx[key].sort(key=lambda g: -(g.get("p") or 0))

    # THE COUNTRY SCOPE HAS TO BEND, OR THE CROSS-BORDER CASE CAN NEVER FIRE.
    #
    # Scoping every lookup to the collection's own countries is what stops
    # "Santa Maria" matching nine countries at once. But it also guarantees
    # that "Italy, Pola and Trieste, Catholic Church Records" — whose tree
    # names Pola, which is Pula in Croatia — can only ever match Italian
    # places. That collection is the reason this atlas exists, and a scope
    # that excludes it defeats the product to avoid a bug.
    #
    # So: the collection's own countries first, always. Only if nothing
    # matches there does it look at the rest of the continent, and then only
    # accepts a name that is UNIQUE across it. "Pola" resolves to exactly one
    # place in Europe and is taken; a name shared by four villages is left
    # unplaced, because a wrong dot is worse than a missing one.
    # WHERE RECORDS ACTUALLY CROSSED, WHICH IS HISTORY AND NOT GEOGRAPHY.
    #
    # Continent was the wrong model. It let a Brazilian collection reach
    # Dominica and a Bolivian one reach the United States, because Latin
    # America shares hundreds of place names — Santa Cruz, Buenavista, La
    # Paz, Concepción, Belém, Colorado, Florida, California — and any two of
    # them agreeing looked like corroboration. Three hundred books went to
    # the wrong country before this.
    #
    # A register crosses a modern border for ONE reason: the jurisdiction
    # that kept it moved. That is a knowable, finite thing, so it is written
    # down rather than inferred. Each group is a filing system whose paper
    # genuinely interleaves across today's borders.
    #
    # THIS LIST IS DELIBERATELY SHORT AND SHOULD GROW ONLY ON EVIDENCE. Latin
    # America is absent not because its borders never moved but because
    # nothing here has yet shown a collection whose books genuinely belong
    # over one — and the cost of guessing wrong is a book on the wrong
    # continent.
    FILING_GROUPS = [
        # Habsburg lands: an Istrian baptism is Croatian in 1863 and filed
        # under Italy, Pola and Trieste in 1915. The case this atlas is for.
        set("AT HU CZ SK SI HR BA RO PL UA IT RS ME".split()),
        # Yugoslavia, which kept parish registers centrally for decades.
        set("HR SI BA RS ME MK".split()),
        # Prussia, Silesia, Pomerania, East Prussia.
        set("DE PL RU LT CZ DK".split()),
        # The Russian Empire and the Soviet Union.
        set("RU UA BY LT LV EE PL MD GE AM AZ KZ FI".split()),
        # Ottoman Europe.
        set("TR GR BG RS MK AL BA RO ME CY".split()),
        # The Nordic union states.
        set("SE NO DK FI IS".split()),
        # The Low Countries and the Rhine.
        set("NL BE LU FR DE".split()),
        # Iberia.
        set("ES PT".split()),
        # These islands, whose civil registration genuinely interleaves.
        set("GB IE IM".split()),
        # The Alpine borderlands.
        set("FR IT CH AT DE".split()),
    ]

    CONTINENT = {}
    for _c, _set in {
        "EU": "AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GI GR HU IS IE IT LV "
              "LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB",
        "AM": "AG AR AW BS BB BZ BM BO BR CA KY CL CO CR CU CW DM DO EC SV GL GD GP "
              "GT GY HT HN JM MQ MX MS NI PA PY PE PR KN LC VC SR TT TC US UY VE",
        "AF": "DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH "
              "GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RE RW ST SN SC SL SO "
              "ZA SS SD TZ TG TN UG ZM ZW",
        "AS": "AF AM AZ BH BD BT KH CN GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO "
              "MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE "
              "UZ VN YE",
        "OC": "AS AU CK FJ PF GU KI MH FM NR NC NZ NU PW PG WS SB TO TV VU",
    }.items():
        for _cc in _set.split():
            CONTINENT.setdefault(_cc, _c)

    def neighbours(ccs):
        """Countries whose records genuinely interleave with these.

        Not the continent — the filing system. A collection filed in a
        country that appears in none of the groups can never cross, which is
        the right default: most national registries are exactly that.
        """
        out = set()
        for g in FILING_GROUPS:
            if g & set(ccs):
                out |= g
        return sorted(out - set(ccs))

    def look_in(index, cand, ccs):
        for cc in ccs:
            got = index.get((cc, cand))
            if got:
                return min(got, key=lambda r: r[0])[1], cc
        return None, None

    def is_exonym(place, cand):
        """Did this name match the place under a name that is NOT its own?

        The Istrian crossings are all exonyms: Verteneglio IS Brtonigla,
        Pola IS Pula, Isola d'Istria IS Izola. A collection filed in one
        country naming a place by the other country's word for it is exactly
        the historical filing this atlas exists to expose.

        A crossing earned by an EXACT name match is a different thing
        entirely, and in Latin America it is almost always a coincidence:
        Brazil, Bolivia, Argentina and Uruguay share Santa Cruz, Buenavista,
        La Paz, Concepción, Belém, Colorado and hundreds more. Those put 300
        books onto the wrong continent's states before this test.
        """
        own = {fold(place.get("name") or place.get("n") or "")}
        own.add(fold(bare(place.get("name") or place.get("n") or "")))
        return cand not in own

    def look_abroad(index, cand, wider):
        """Every country on the continent where this name exists.

        Returns {cc: place}. Uniqueness is NOT demanded here — that belongs
        to the decision, not to the evidence. Requiring each level to be
        unique across Europe AND requiring two levels to agree was two
        safeguards multiplied together, and between them they threw away the
        Istrian case they were written to protect: Pola and Buie both name
        more than one European place, so neither could corroborate anything
        and IT->HR collapsed from nine books to one.
        """
        out = {}
        for cc in wider:
            got = index.get((cc, cand))
            if got:
                out[cc] = min(got, key=lambda r: r[0])[1]
        return out

    def resolve_path(index, path, ccs, wider, areas=()):
        """TWO PASSES OVER THE WHOLE PATH, AND THE ORDER IS THE POINT.

        The first cut asked, for each level deepest-first, "in country, then
        abroad" — so the deepest level got its shot abroad before a shallower
        level was tried at home. In "Italy, Pola and Trieste" the deepest
        level is the PARISH CHURCH: Sant'Antonio Taumaturgo, San Giorgio,
        San Martino Vescovo. A church dedication that happens to be the
        unique name of some village elsewhere in Europe would have won
        against Trieste sitting one level up in Italy.

        So: everything at home first, deepest to shallowest. Only when the
        whole path has failed at home does anything look across a border.
        """
        for name, lab in reversed(path):
            for cand in readings(name, lab):
                hit, cc = look_in(index, fold(cand), ccs)
                if hit:
                    return hit, cc, False
        # CROSSING A BORDER NEEDS TWO WITNESSES.
        #
        # A single name matching abroad is not evidence, it is a coincidence
        # waiting to happen. Davor, Bale, Čabar and Borojevići are Croatian
        # villages this shelf has not drawn; each is also the name of a real
        # village in Bosnia, Montenegro, Slovenia. With only the parish level
        # to go on, the Croatian church books landed 79 books in Bosnia and
        # 22 in Montenegro — confidently, uniquely, and wrongly. A wrong dot
        # is worse than a missing one.
        #
        # The true crossing looks different. "Pola › Verteneglio › San Zenone
        # Martire" has TWO levels pointing at Croatia: Pola is Pula, and
        # Verteneglio is Brtonigla. So a crossing is accepted only when at
        # least two distinct levels of the path independently resolve to the
        # same foreign country. That keeps Istria, which is the case this
        # atlas was built for, and refuses the coincidences.
        # EVIDENCE FROM EVERYTHING WE KNOW; DESTINATION FROM THE SHELF.
        #
        # The shelf holds 7,391 places and is thin on exonyms — it does not
        # know Pula answers to "Pola". The gazetteer holds 45,985 and does.
        # Corroboration should draw on both, because the question "does this
        # level also point at Croatia" is about knowledge, not about what we
        # happen to have drawn. Restricting the witnesses to the shelf is
        # what left the Istrian case with one vote and no crossing.
        votes = collections.Counter()
        best, gbest, depth = {}, {}, {}
        levels_abroad = 0
        witnessed, exonym = set(), set()
        # Settlements decide; areas only vouch, so they come last and their
        # places are never taken as the answer.
        ladder = list(reversed(path)) + list(reversed(areas))
        area_from = len(path)
        for lvl, (name, lab) in enumerate(ladder):    # 0 is the deepest
            shits, ghits = {}, {}            # place found per cc is the
            for cand in readings(name):      # most specific one
                shits = look_abroad(index, fold(cand), wider)
                ghits = {cc: g for cc, g in
                         ((cc, (gaz_idx.get((cc, fold(cand))) or [None])[0])
                          for cc in wider) if g}
                if shits or ghits:
                    break
            # TWO LEVELS WITH THE SAME NAME ARE ONE WITNESS, NOT TWO.
            #
            # Brazil has municipalities called Califórnia, Colorado, Flórida,
            # Belém and Buenos Aires, and FamilySearch files a parish under a
            # municipality of the same name — "Califórnia › Califórnia". Both
            # levels matched California in the United States, counted as two
            # independent witnesses, and 141 Bolivian and 239 Brazilian books
            # crossed onto American states and Argentine provinces.
            #
            # Corroboration means two DIFFERENT names agreeing, which is what
            # made Istria trustworthy: Pola is Pula and Verteneglio is
            # Brtonigla, two distinct names both landing in Croatia. The same
            # word twice is one piece of evidence written down twice.
            if (shits or ghits) and fold(name) not in witnessed:
                witnessed.add(fold(name))
                levels_abroad += 1
                for cc, pl in list(shits.items()) + list(ghits.items()):
                    if is_exonym(pl, fold(readings(name)[0] if readings(name) else name)):
                        exonym.add(cc)
            for cc in set(shits) | set(ghits):
                votes[cc] += 1
                depth.setdefault(cc, lvl)
                if lvl >= area_from:
                    continue        # an area voted; it does not get to win
                if cc in shits:
                    best.setdefault(cc, shits[cc])
                if cc in ghits:
                    gbest.setdefault(cc, ghits[cc])
        # TWO LEVELS MUST POINT ABROAD — THEN THE DEEPEST ONE DECIDES.
        #
        # Counting votes per COUNTRY was the wrong shape. "Pola › Isola
        # d'Istria" gives one vote to Croatia (Pola is Pula) and one to
        # Slovenia (Isola d'Istria is Izola): a tie under that rule, refused,
        # eleven real books lost. But the right answer is obvious — the book
        # is FROM the comune and merely FILED under the province.
        #
        # What actually separates that from the false positives is not which
        # country wins, it is how much of the path is foreign at all. Davor,
        # Bale and Čabar are single-level paths whose one name happens to
        # exist in a neighbouring country; nothing else about them points
        # outside Croatia. The Istrian paths are foreign from the province
        # down. So: at least two levels must resolve abroad, and then the
        # DEEPEST of them names the place, because it is the most specific
        # claim in the path.
        # DISTINCT LEVELS, NOT TOTAL VOTES. Summing votes across countries
        # let a SINGLE level clear the bar by matching two countries at once
        # — "Bale" exists in Croatia and Montenegro, so one name counted as
        # two witnesses and put eight Istrian books in Montenegro. The test
        # is how much of the PATH is foreign, so it has to count levels.
        # AND AT LEAST ONE OF THE WITNESSES MUST BE AN EXONYM. Two distinct
        # names agreeing was still not enough where names repeat: Santa Cruz
        # and Buenavista are both real in half of South America. A crossing
        # has to be earned by a place being called something else, which is
        # what a border moving actually leaves behind.
        if levels_abroad >= 2 and exonym:
            top = sorted(votes.items(), key=lambda kv: (depth[kv[0]], -kv[1]))
            if True:
                cc = top[0][0]
                if cc not in exonym:
                    return None, None, False
                if cc not in best and cc not in gbest:
                    return None, None, False     # only an area vouched for it
                if cc in best:
                    return best[cc], cc, True
                g = gbest.get(cc)
                if g:
                    pid = ("g-" + re.sub(r"[^a-z0-9]+", "-", fold(g["n"])).strip("-")[:48]
                           + "-" + cc.lower())
                    promote.setdefault(pid, {"id": pid, "name": g["n"],
                                             "country": cc, "lat": g["y"],
                                             "lon": g["x"], "from": "gazetteer"})
                    return {"id": pid}, cc, True
        return None, None, False

    by_place = collections.defaultdict(list)
    promote = {}
    crossed = collections.Counter()
    unplaced = collections.Counter()
    unplaced_cc = {}
    matched = miss = noname = 0
    seen = set()

    for cid, col in (wp.get("byCollection") or {}).items():
        ccs = [x for x in (live_cc.get(cid) or col.get("cc") or []) if x != "*"]
        for v in col.get("volumes", []):
            raw = v.get("path") or []
            labels = v.get("labels") or []
            conf = None
            path, areas = [], []
            for i, name in enumerate(raw):
                if not name:
                    continue
                lab = labels[i] if i < len(labels) else None
                if lab and IS_RELIGION.search(lab):
                    conf = name
                    continue
                if lab and NOT_A_PLACE.search(lab):
                    continue
                if lab and IS_AREA.search(lab):
                    areas.append((name, lab))   # may vouch, may not win
                    continue
                path.append((name, lab))
            if not path:
                noname += 1
                continue
            wider = neighbours(ccs)
            hit, hit_cc, abroad = resolve_path(idx, path, ccs, wider, areas)
            if not hit:
                # Try the gazetteer before giving up on it.
                for name, lab in reversed(path):
                    for cand in readings(name, lab):
                        for cc in list(ccs):
                            got = gaz_idx.get((cc, fold(cand)))
                            if got:
                                g = got[0]
                                pid = "g-" + re.sub(r"[^a-z0-9]+", "-",
                                                    fold(g["n"])).strip("-")[:48] \
                                      + "-" + cc.lower()
                                hit = {"id": pid}
                                promote.setdefault(pid, {
                                    "id": pid, "name": g["n"], "country": cc,
                                    "lat": g["y"], "lon": g["x"],
                                    "from": "gazetteer"})
                                break
                        if hit:
                            break
                    if hit:
                        break
            if not hit:
                miss += 1
                deepest = path[-1][0]
                unplaced[deepest] += 1
                unplaced_cc.setdefault(deepest, ccs[0] if ccs else "")
                continue
            matched += 1
            if abroad and hit_cc:
                crossed[(ccs[0] if ccs else "?") + "\u2192" + hit_cc] += 1
            # One book can be reached by more than one route through the
            # tree; the waypoint id is the book, so dedupe on it.
            key = (hit["id"], v.get("wp") or v["t"])
            if key in seen:
                continue
            seen.add(key)
            by_place[hit["id"]].append({
                "t": v["t"], "from": v.get("from"), "to": v.get("to"),
                "wp": v.get("wp"),
                "url": ("https://www.familysearch.org/search/image/index?owc="
                        + v["wp"]) if v.get("wp") else None,
                "col": cid, "colTitle": col.get("title"),
                "conf": conf,
                # True when the book was found by looking outside the
                # countries its collection is filed under. This is the
                # finding, not an edge case.
                "crossed": bool(abroad) or None,
                "filedCc": (ccs[0] if ccs else None) if abroad else None,
                "in": " › ".join(raw),
            })

    total = matched + miss + noname
    dump({
        "source": "FamilySearch records waypoint API",
        "note": ("One row per book, on the place its waypoint path names. "
                 "Matched deepest-first and only within the collection's own "
                 "countries. Titles are FamilySearch's."),
        "harvested": wp.get("harvested"),
        "counts": {"places": len(by_place),
                   "volumes": sum(len(v) for v in by_place.values()),
                   "matched": matched, "unmatched": miss,
                   "noPathName": noname},
        "byPlace": {k: v for k, v in sorted(by_place.items())},
    }, OUT)

    dump({
        "note": ("Settlements FamilySearch has books for and this atlas has "
                 "never heard of — the map's next places, commonest first."),
        "counts": {"names": len(unplaced), "volumes": sum(unplaced.values())},
        "names": [{"n": n, "cc": unplaced_cc.get(n, ""), "volumes": c}
                  for n, c in unplaced.most_common(4000)],
    }, GAPS)

    dump({
        "note": ("Settlements the gazetteer knows, with coordinates, that "
                 "FamilySearch has books for and this shelf had not drawn. "
                 "Promoted to places so the books have somewhere to land."),
        "counts": {"places": len(promote)},
        "places": sorted(promote.values(), key=lambda x: x["id"]),
    }, PROMOTE)

    print(f"{total:,} volumes considered")
    print(f"  {matched:,} matched a place "
          f"({100*matched/max(total,1):.0f}%), of which "
          f"{len(promote):,} are new dots promoted from the gazetteer")
    print(f"  {miss:,} named a place this atlas does not hold")
    print(f"  {noname:,} had no place in their path at all")
    print(f"\n{sum(len(v) for v in by_place.values()):,} distinct books on "
          f"{len(by_place):,} places -> {OUT}")
    print(f"{len(unplaced):,} unknown place names -> {GAPS}")
    print(f"{len(promote):,} promoted places -> {PROMOTE}")
    if crossed:
        print("\n  books found across a border, where the collection is filed "
              "under one country and the book belongs to another:")
        for k, v in crossed.most_common(12):
            print(f"      {k}  {v}")
    if unplaced:
        print("  most wanted: " + ", ".join(
            f"{n} ({c})" for n, c in unplaced.most_common(6)))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""The surnames the eight family archives attest, snapshotted so CI can see them.

TWO BUGS MET HERE AND THE SECOND ONE HID THE FIRST.

ONE. build-surnames.py read the sibling archives through an ABSOLUTE PATH on
one Mac — /Users/daviddefranceski/Claude/Projects. GitHub Actions checks out
this repository and nothing else, so in CI that directory does not exist, the
glob matched nothing, and every archive attestation was silently dropped from
the dataset the site actually serves. It was silent because a loop over an
empty list prints nothing.

    LIVE   Lerena -> Spain, United States
    LOCAL  Lerena -> ARGENTINA, Spain, United States, URUGUAY

David asked why Lerena showed no Argentina and no Uruguay when the research is
thorough there. It was thorough. The data existed on this machine and had
never once reached the site.

The cure is the rule this project already applies to places: a cross-repo
dependency is a SNAPSHOT, committed, not a live read. This script is run by
hand when an archive has moved on, and writes data/archive-surnames.json into
the repository, where CI can see it.

TWO. Only five of the eight archives were producing anything even locally,
because the reader looked for a field literally named «surname» under a key
literally named «people», and three archives do not store it that way — the
Defranceski archive least of all. Its register carries 1,508 rows under `sp`,
which is where every De Franceschi spelling variant in Croatia lives, and the
harvester walked straight past it. That is why the family this whole project
grew out of was attested in Slovenia, by a national register, and not in
Croatia by its own archive.

So the field names are DECLARED per archive rather than guessed, and every
archive that yields nothing is reported as a failure rather than skipped.

NOTHING ABOUT A PERSON LEAVES THE ARCHIVES. This reads person records and
keeps one thing from each: the surname string. No given name, no date, no
place, no relationship, no identifier. Record Atlas is a map of where records
are, and the family layers are the one thing that cannot generalise.

    python3 scripts/harvest-archive-surnames.py
"""
import json, glob, os, re, sys, time, collections, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
PROJ = os.path.dirname(_ROOT)

# label, folder, countries the archive's research actually covers, and where
# its surnames live. A spec of (filename-glob, path-into-the-doc, field).
# «*» as the field means the list holds bare strings.
ARCHIVES = [
    ("Defranceschi", "Defranceski Family", ["HR", "IT"], [
        ("register.json", "", "sp"),        # 1,508 FamilySearch personas
        ("gologorica.json", "", "name"),    # a GEDCOM, full names
        ("roster.json", "rows", "name"),    # the worked line, full names
    ]),
    ("Falco", "Falco Family", ["IT"], [
        ("register.json", "", "surname"), ("people.json", "", "surname"),
        ("living.json", "", "surname"), ("married-in.json", "", "surname"),
    ]),
    ("Blažević", "Blazevic Family", ["HR"], [("*.json", "", "surname")]),
    ("Booyzen", "Booyzen Family", ["ZA"], [
        ("*.json", "", "surname"), ("*.json", "", "last"),
        ("dna.json", "the_autoclusters/clusters", "tree_surnames"),
        ("dna.json", "the_aunts_own_chart/detail", "tree_surnames"),
    ]),
    ("Lerena", "Lerena Family", ["AR", "UY", "ES"], [("*.json", "", "surname")]),
    ("D'Arcy", "D'arcy Family", ["GB", "IE", "AU"], [("*.json", "", "surname")]),
    ("Mazza", "Mazza Family", ["IT", "AU", "US"], [("*.json", "", "surname")]),
    ("Luwinski", "Luwinski Family", ["PL", "DE"], [
        ("register.json", "people", "last"), ("emigration.json", "rows", "last"),
        ("*.json", "", "surname"),
    ]),
]

# Particles that belong to the surname rather than to the given name, so that
# «Gioannes Maria De Franceschi» yields «De Franceschi» and not «Franceschi».
PARTICLE = {"de", "di", "da", "del", "della", "dei", "dal", "van", "von", "der",
            "den", "ter", "le", "la", "du", "des", "of", "y", "e", "af", "af."}
# A GEDCOM writes the surname between slashes; a roster does not.
SLASHED = re.compile(r"/([^/]+)/")


# Ground that no longer exists under that name, which is most of what a family
# archive writes down. A gazetteer of present-day cities cannot resolve «Cape
# Colony» or «Transvaal», and those are exactly the words a death notice uses.
HISTORICAL = {
    "cape colony": "ZA", "cape province": "ZA", "transvaal": "ZA",
    "orange free state": "ZA", "natal": "ZA", "south west africa": "NA",
    "rhodesia": "ZW", "basutoland": "LS", "bechuanaland": "BW",
    "austria-hungary": "AT", "austro-hungarian empire": "AT",
    "kingdom of italy": "IT", "two sicilies": "IT", "papal states": "IT",
    "prussia": "DE", "silesia": "PL", "posen": "PL", "pomerania": "PL",
    "galicia": "PL", "bukovina": "RO", "bohemia": "CZ", "moravia": "CZ",
    "dalmatia": "HR", "istria": "HR", "carniola": "SI", "styria": "AT",
    "new france": "CA", "lower canada": "CA", "upper canada": "CA",
    "acadia": "CA", "british north america": "CA",
    "ceylon": "LK", "burma": "MM", "siam": "TH", "persia": "IR",
    "ottoman empire": "TR", "constantinople": "TR", "smyrna": "TR",
    "river plate": "AR", "rio de la plata": "AR", "banda oriental": "UY",
}


def _fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


class Ground:
    """Turns the place names an archive writes down into country codes.

    THE COUNTRY LIST USED TO BE TYPED BY HAND, one line per archive, and it was
    wrong the moment the research moved. David asked why Lerena showed no South
    Africa when the archive holds FOURTEEN Lerenas across Cape Town,
    Johannesburg, Transvaal, Cape Colony and Braamfontein — and the answer was
    that somebody once wrote ["AR", "UY", "ES"] beside that archive's name and
    nothing has re-read it since. The same file also contains a note reading
    «THE SURNAME IS ITALIAN AS WELL AS SPANISH, AND THIS ARCHIVE DID NOT KNOW
    THAT», which is the archive correcting itself in writing while this project
    ignored it.

    So the countries are READ OFF THE PLACES the archive names, in four passes,
    strongest first: a coordinate, a present-day gazetteer name, a country
    name, and a table of ground that has since been renamed."""

    def __init__(self):
        self.by_name, self.cc_names = {}, {}
        try:
            for g in json.load(open("data/gazetteer.json"))["places"]:
                k = _fold(g["n"])
                if k not in self.by_name or (g.get("p") or 0) > self.by_name[k][1]:
                    self.by_name[k] = (g["k"], g.get("p") or 0)
                for alt in g.get("a", []):
                    self.by_name.setdefault(_fold(alt), (g["k"], 0))
        except OSError:
            pass
        try:
            for iso, v in json.load(open("data/countries.json"))["countries"].items():
                self.cc_names[_fold(v["name"])] = iso
        except OSError:
            pass
        try:
            from geo import country_of
            self.country_of = country_of
        except Exception:
            self.country_of = lambda a, b: None

    def resolve(self, name, lat=None, lon=None):
        """The country a place name belongs to, or None. Never a guess."""
        if lat is not None and lon is not None:
            try:
                cc = self.country_of(float(lat), float(lon))
                if cc:
                    return cc
            except (TypeError, ValueError):
                pass
        # «Braamfontein, Johannesburg» and «Rosario, Santa Fe» — try the whole
        # string, then each comma-separated part, longest first, because the
        # rightmost part is usually the widest and most resolvable.
        parts = [name] + [p.strip() for p in re.split(r"[,/]", name or "")]
        for raw in parts:
            k = _fold(re.sub(r"\s*[—–-]\s*.*$", "", raw))
            if not k or len(k) < 3:
                continue
            if k in self.cc_names:
                return self.cc_names[k]
            if k in HISTORICAL:
                return HISTORICAL[k]
            if k in self.by_name:
                return self.by_name[k][0]
        return None


# A row is a PLACE if it looks like one. The first cut asked only for a `name`
# and swept up half the Defranceski archive's PEOPLE — «Agostino Defranceschi»
# went to the gazetteer, matched something, and put that archive in Chad,
# Kyrgyzstan and Zambia. A person is not a place and a name is not evidence of
# which.
PLACEY = {"lat", "lon", "coords", "country", "cc", "people", "count", "cems",
          "diocese", "prov", "region", "parish", "adm1", "adm2", "place"}


# A MIGRATION PATH IS A LIST OF PLACES AND EVERY ONE OF THEM IS A COUNTRY THE
# FAMILY WAS IN. These archives write a life as an arrow — «Senj →
# Johannesburg → Brisbane», «Crikvenica → Pfullingen → Senj» — in a `place`
# field on a person, and this harvester read only place FILES. David asked why
# Defranceski showed no South Africa when his own direct line runs through
# Johannesburg for three generations. It was written down, in the roster, as an
# arrow, and nothing here was looking at arrows.
ARROW = re.compile(r"\s*(?:→|->|—>|>|·|;)\s*")

# Files that describe a family's spread rather than its places: a `place` field
# naming a country outright, with no coordinate and no person attached.
SPREAD = ("diaspora.json", "emigration.json", "arrivals.json", "america.json")


def journeys(base, surnames=()):
    """Every (surname, place) an archive's person rows imply.

    A person row carries a name and a path. The name gives the surname — which
    is the precise attribution this whole file exists for — and the path gives
    every place that person is recorded in, not merely the last one."""
    known = {_fold(n) for n in surnames}
    out = []
    for p in sorted(glob.glob(os.path.join(base, "site/src/data", "*.json"))):
        try:
            doc = json.load(open(p, encoding="utf-8"))
        except Exception:
            continue
        spread = os.path.basename(p) in SPREAD
        for pool in lists_in(doc):
            shape = set()
            for r in pool[:40]:
                if isinstance(r, dict):
                    shape |= set(r)
            if "place" not in shape:
                continue
            for r in pool:
                if not isinstance(r, dict):
                    continue
                path = r.get("place")
                if not isinstance(path, str) or not path.strip():
                    continue
                who = r.get("name") or r.get("n") or ""
                if not isinstance(who, str):
                    who = ""          # a row keyed `n` for a number, not a name
                sn = _fold(surname_of(who)) if who else ""
                if known and sn and sn not in known:
                    # A name this archive does not collect is somebody else's
                    # family passing through; the place still counts for the
                    # archive but not for that surname.
                    sn = ""
                for hop in ARROW.split(path):
                    hop = re.sub(r"\*+|\(.*?\)", "", hop).strip(" .,")
                    if len(hop) > 2:
                        out.append((sn if not spread else "", hop))
    return out


def place_rows(base, surnames=()):
    """Every {name, lat, lon, people} an archive's place files offer.

    Only from files that are about places, only from rows carrying at least one
    place-ish field, and never a row whose name ends in one of this archive's
    own surnames."""
    known = {_fold(n) for n in surnames}
    out = []
    for fn in ("places.json", "gravesmap.json", "atlas.json", "researchmap.json",
               "map.json"):
        p = os.path.join(base, "site/src/data", fn)
        if not os.path.exists(p):
            continue
        try:
            doc = json.load(open(p, encoding="utf-8"))
        except Exception:
            continue
        for pool in lists_in(doc):
            shape = set()
            for r in pool[:40]:
                if isinstance(r, dict):
                    shape |= set(r)
            if not (shape & PLACEY):
                continue                      # a list of something else
            for r in pool:
                if not isinstance(r, dict):
                    continue
                nm = r.get("name") or r.get("n") or r.get("place")
                if not isinstance(nm, str) or not nm.strip():
                    continue
                nm = nm.strip()
                # «Agostino Defranceschi» is a person. So is anything whose last
                # word is a surname this archive collects.
                if known and _fold(nm.split()[-1]) in known:
                    continue
                co = r.get("coords") if isinstance(r.get("coords"), (list, tuple)) else None
                out.append({"name": nm,
                            "lat": r.get("lat", co[0] if co and len(co) > 1 else None),
                            "lon": r.get("lon", co[1] if co and len(co) > 1 else None),
                            "cc": r.get("country") or r.get("cc"),
                            "people": r.get("people") if isinstance(r.get("people"), list) else []})
    return out


def surname_of(full):
    """The surname inside a free-form personal name.

    Only used for the archives that store one. It is a guess and a modest one:
    the trailing word, plus any particles immediately before it. A name it
    cannot read is dropped rather than half-read."""
    full = (full or "").strip()
    m = SLASHED.search(full)
    if m:
        return m.group(1).strip()
    full = re.sub(r"\s*\([^)]*\)", "", full)
    parts = [p for p in re.split(r"\s+", full) if p]
    if len(parts) < 2:
        return ""
    i = len(parts) - 1
    while i > 1 and parts[i - 1].lower().strip(".") in PARTICLE:
        i -= 1
    return " ".join(parts[i:])


def dig(doc, path):
    for step in [s for s in path.split("/") if s]:
        if not isinstance(doc, dict) or step not in doc:
            return None
        doc = doc[step]
    return doc


def lists_in(doc, depth=0):
    """Every list of dicts in a document, to a sane depth."""
    if depth > 4:
        return
    if isinstance(doc, list):
        if doc and isinstance(doc[0], dict):
            yield doc
        for x in doc[:200]:
            yield from lists_in(x, depth + 1)
    elif isinstance(doc, dict):
        for v in doc.values():
            yield from lists_in(v, depth + 1)


def main():
    if not os.path.isdir(PROJ):
        sys.exit(f"the sibling archives are not here: {PROJ}")

    ground = Ground()
    out, report, missing = {}, [], []
    for label, folder, ccs, specs in ARCHIVES:
        base = os.path.join(PROJ, folder)
        if not os.path.isdir(base):
            missing.append((label, "folder not found"))
            continue
        names, whence = collections.Counter(), collections.Counter()
        for pattern, path, field in specs:
            for p in sorted(glob.glob(os.path.join(base, "site/src/data", pattern))):
                try:
                    doc = json.load(open(p))
                except Exception:
                    continue
                target = dig(doc, path) if path else doc
                if target is None:
                    continue
                pools = [target] if (isinstance(target, list) and target
                                     and isinstance(target[0], dict)) else list(lists_in(target))
                for pool in pools:
                    for row in pool:
                        if not isinstance(row, dict) or field not in row:
                            continue
                        v = row[field]
                        vals = v if isinstance(v, list) else [v]
                        for raw in vals:
                            if not isinstance(raw, str) or not raw.strip():
                                continue
                            # A year in a field called «last» is not a surname.
                            if raw.strip().isdigit():
                                continue
                            n = (surname_of(raw) if field == "name" else raw).strip()
                            # Booyzen's DNA clusters carry slugs, not spellings.
                            if field == "tree_surnames":
                                n = " ".join(w.capitalize() for w in n.split("-"))
                            # «*** GEORGINA BRAYLEY *** , aged 20» is a
                            # sentence with emphasis markers, not a surname.
                            # An archive's prose leaks into its data and a
                            # surname list is not the place to discover that.
                            if "*" in n or "," in n or len(n.split()) > 4:
                                continue
                            # A placeholder is not a name. «Surname not
                            # indexed» appears 429 times in one archive and
                            # would otherwise be its third commonest surname.
                            if _fold(n) in ("surname not indexed", "unknown",
                                            "not known", "no surname", "n/a",
                                            "unnamed", "illegible"):
                                continue
                            if len(n) < 2 or len(n) > 60:
                                continue
                            names[n] += 1
                            whence[os.path.basename(p) + ":" + field] += 1
        if not names:
            missing.append((label, "no surnames found — check the field spec"))
            continue

        # ---- the countries, READ rather than declared ----------------------
        found, unresolved, per = {}, [], collections.defaultdict(set)
        hard, conflict = set(), []
        # The arrows first — they carry the surname with them.
        for sn, hop in journeys(base, names):
            cc = ground.resolve(hop)
            if not cc:
                unresolved.append(hop)
                continue
            found[cc] = found.get(cc, 0) + 1
            if _fold(hop) in ground.cc_names or _fold(hop) in HISTORICAL:
                hard.add(cc)
            if sn:
                for n in names:
                    if _fold(n) == sn:
                        per[n].add(cc)
                        hard.add(cc)   # a named person, in a named place
                        break

        for pr in place_rows(base, names):
            cc = pr.get("cc") if isinstance(pr.get("cc"), str) and len(pr["cc"]) == 2 \
                 else ground.resolve(pr["name"], pr.get("lat"), pr.get("lon"))
            if not cc:
                unresolved.append(pr["name"])
                continue
            # A COORDINATE IS NOT A FACT, IT IS SOMEBODY ELSE'S GEOCODE. The
            # Defranceski archive holds «Rookwood, New South Wales, Australia»
            # at latitude 22.5, which is Cuba, and «Dolo» — a comune in the
            # Veneto — in Ethiopia. Trusting the number over the words put this
            # archive in nine countries it has never researched.
            #
            # So where the row carries both, they must agree. When they
            # disagree the row is thrown away rather than adjudicated: this
            # cannot tell which half is wrong and guessing would be how the
            # nine countries got there in the first place.
            by_name = ground.resolve(pr["name"])
            if by_name and cc and by_name != cc:
                conflict.append((pr["name"], cc, by_name))
                continue
            # «Named outright» means the TEXT says so — «South Africa», «Cape
            # Colony». A lone coordinate still needs a second place to
            # corroborate it.
            # A coordinate that has just been checked against its own name is
            # evidence again. It was demoted wholesale after Rookwood, which
            # was the wrong lesson: the cure for a bad geocode is the conflict
            # check above, not distrusting every good one. Johannesburg at
            # -26.2 is Johannesburg.
            if pr.get("lat") is not None \
                    or _fold(pr["name"]) in ground.cc_names \
                    or _fold(pr["name"]) in HISTORICAL \
                    or any(_fold(x.strip()) in ground.cc_names
                           for x in re.split(r"[,/]", pr["name"])):
                hard.add(cc)
            found[cc] = found.get(cc, 0) + 1
            # WHERE THE ARCHIVE LINKS PEOPLE TO A PLACE, the attribution can be
            # per surname instead of per archive — «Lerena in South Africa»
            # rather than «everything in the Lerena archive is in South
            # Africa». A person slug ends in the surname, which is how these
            # archives are built.
            for slug in pr["people"]:
                if not isinstance(slug, str):
                    continue
                tail = slug.rsplit("-", 1)[-1]
                for n in names:
                    if _fold(n).replace(" ", "") == tail:
                        per[n].add(cc)
                        break

        # ONE LOOSE NAME MATCH IS NOT EVIDENCE. «Vis» is a Croatian island and
        # also a village in three other countries; a single hit on a short name
        # put archives in places they have never researched. A country is
        # derived when two or more places resolve to it, or when one does by
        # coordinate or by being named outright.
        # THE FALLBACK LIST IS THE COARSE ANSWER AND IT MUST NOT BE THE NOISY
        # ONE. Per-surname attribution is exact and is preferred wherever it
        # exists; this list is only reached by a name the archive never places,
        # so it should be the ground the archive plainly works on rather than
        # every country a bad geocode ever pointed at. Two corroborating places
        # AND either a country named outright or a person placed there by name.
        derived = sorted(c for c, n in found.items() if n >= 2 and c in hard)
        # The declared list is a FLOOR, not the answer: an archive may research
        # a country it never names a place in, and dropping that would be a
        # different kind of wrong.
        allcc = sorted(set(derived) | set(ccs))
        gained = [c for c in derived if c not in ccs]
        lost = [c for c in ccs if c not in derived]

        # HOW OFTEN, NOT MERELY WHETHER. A surname mentioned once in an
        # archive is not a surname that archive researches, and lending it the
        # archive's whole geography is how «D'Arcy» came to be attested in
        # Cuba, Paraguay and Zimbabwe — the Defranceschi archive names it in
        # passing and it inherited all twenty-nine countries.
        out[label] = {"countries": allcc, "declared": ccs, "derived": derived,
                      "surnames": sorted(names),
                      "mentions": {n: c for n, c in names.most_common() if c > 1},
                      "bySurname": {n: sorted(v) for n, v in sorted(per.items()) if v},
                      "placesResolved": sum(found.values()),
                      "placesUnresolved": sorted(set(unresolved))[:40],
                      "placesConflicting": [{"name": n, "byCoord": a, "byName": b}
                                            for n, a, b in conflict[:40]],
                      "from": dict(whence.most_common())}
        report.append((label, len(names), ",".join(allcc), gained, lost,
                       len(per), len(set(unresolved)), len(conflict)))

    for label, n, ccs, gained, lost, per, unres, conf in report:
        print(f"  {label:14}{n:6} surnames -> {ccs}")
        if gained:
            print(f"                 + {','.join(gained)} — read off its own places "
                  f"and never declared")
        if lost:
            print(f"                 declared {','.join(lost)} with no place to "
                  f"show for it; kept")
        if per:
            print(f"                 {per} surnames placed country by country")
        if unres:
            print(f"                 {unres} place names this could not resolve")
        if conf:
            print(f"                 {conf} places whose coordinate and name "
                  f"disagree — dropped, not adjudicated")
    for label, why in missing:
        print(f"  {label:14}  FAILED — {why}")

    path = "data/archive-surnames.json"
    json.dump({
        "note": ("Surnames attested by the eight family archives, and the countries "
                 "each archive's research actually covers. A SNAPSHOT, committed on "
                 "purpose: build-surnames.py used to read the sibling repositories "
                 "through an absolute path, which exists on one laptop and not in CI, "
                 "so every one of these attestations was silently missing from the "
                 "deployed dataset. Re-run scripts/harvest-archive-surnames.py when "
                 "an archive has moved on."),
        "privacy": ("Surname strings only. No given name, no date, no place, no "
                    "relationship and no identifier leaves the archives — the family "
                    "layers are the one thing that cannot generalise, and this map "
                    "is about where records are, not about who is in them."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"archives": len(out),
                   "surnames": len({n for a in out.values() for n in a["surnames"]}),
                   "placedBySurname": sum(len(a.get("bySurname") or {})
                                          for a in out.values())},
        "archives": out,
    }, open(path, "w"), ensure_ascii=False, indent=1)
    total = len({n for a in out.values() for n in a["surnames"]})
    print(f"\n{total} distinct surnames across {len(out)} archives -> {path}")
    if missing:
        sys.exit(f"{len(missing)} archive(s) yielded nothing — not writing a "
                 f"half-empty snapshot over a good one without saying so")


if __name__ == "__main__":
    main()

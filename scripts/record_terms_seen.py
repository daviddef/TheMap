#!/usr/bin/env python3
"""Where each register word turns up in the Atlas's own catalogue: data/record-terms-seen.json.

Every term in data/record-terms.json may carry `titleWords` (single lower-case words that appear in the titles of the catalogue
entries it names, e.g. "battesimi") and a `concept` (the kind of register it names: baptism, marriage, banns, death, ...). This
counts, over every title the Atlas lists (the world file plus the curated Croatian file):

  - for each term: how many catalogue entries have one of its words in the title, in which countries, in which years;
  - for each concept: the same, over the union of its terms' words, and how many entries each language contributes.

It counts TITLES. A title says what kind of book it is; it does not say what language the entries inside are written in, so the
page words this as "titled", never as "written in". Nothing about a person is read or kept.

    python3 scripts/record_terms_seen.py [--world PATH] [--check]
"""
import argparse, collections, gzip, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEF_WORLD = os.path.join("/Volumes/DJ - Crucial - 4TB-SSD/Claude Projects/Family Projects/Record Atlas", "data", "fs-volumes-world.json.gz")

US = set("""Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois Indiana Iowa
Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada
Ohio Oklahoma Oregon Pennsylvania Tennessee Texas Utah Vermont Virginia Washington Wisconsin Wyoming""".split()) | {
    "New York", "New Jersey", "New Hampshire", "New Mexico", "North Carolina", "South Carolina", "North Dakota", "South Dakota",
    "Rhode Island", "West Virginia", "District of Columbia"}
CA = {"Quebec", "Ontario", "Nova Scotia", "New Brunswick", "Manitoba", "Saskatchewan", "Alberta", "British Columbia", "Newfoundland and Labrador", "Prince Edward Island"}


def country(coltitle):
    c = (coltitle or "?").split(",")[0].strip()
    if c in US:
        return "United States"
    if c in CA:
        return "Canada"
    return c


def load_json(p):
    return json.load(gzip.open(p, "rt", encoding="utf-8") if p.endswith(".gz") else open(p, encoding="utf-8"))


def entries(world):
    """(title, country, from, to) for every catalogue entry, the Croatian curated file merged by waypoint."""
    w = load_json(world)
    ct = w["colTitles"]
    seen = set()
    for vs in w["byPlace"].values():
        for v in vs:
            wp = (v.get("wp") or "").split(":")[0]
            if wp:
                seen.add(wp)
            yield v.get("t") or "", country(ct.get(v.get("col"))), v.get("from"), v.get("to")
    h = load_json(os.path.join(ROOT, "data", "fs-volumes.json"))
    for vs in h["byPlace"].values():
        for v in vs:
            if v.get("waypoint") in seen:
                continue
            yield v.get("t") or "", "Croatia", v.get("from"), v.get("to")


def year_ok(y):
    return isinstance(y, int) and 1400 <= y <= 2030


class Tally:
    def __init__(self):
        self.n = 0
        self.cc = collections.Counter()
        self.years = []
        self.by_term = collections.Counter()

    def add(self, c, f, t):
        self.n += 1
        self.cc[c] += 1
        ys = [y for y in (f, t) if year_ok(y)]
        if ys:
            self.years.append(sum(ys) / len(ys))
        return self

    def out(self, extra=None):
        ys = sorted(self.years)
        o = {"n": self.n, "countries": [[k, v] for k, v in self.cc.most_common(6)], "nCountries": len(self.cc)}
        if len(ys) >= 20:
            o["mostly"] = [int(ys[len(ys) // 10] // 5 * 5), int(ys[(len(ys) * 9) // 10] // 5 * 5 + 5)]
        if ys:
            o["earliest"] = int(ys[0])
        if extra:
            o.update(extra)
        return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--world", default=DEF_WORLD)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    terms = load_json(os.path.join(ROOT, "data", "record-terms.json"))["terms"]
    by_word = collections.defaultdict(list)       # word -> term ids
    concepts = collections.defaultdict(set)       # concept -> words
    word_lang = {}
    for t in terms:
        for w in t.get("titleWords") or []:
            by_word[w].append(t["id"])
            word_lang[(t["id"], w)] = t["lang"]
        if t.get("concept"):
            for w in t.get("titleWords") or []:
                concepts[t["concept"]].add(w)
    term_t = {t["id"]: Tally() for t in terms if t.get("titleWords")}
    conc_t = {c: Tally() for c in concepts}
    conc_lang = {c: collections.Counter() for c in concepts}
    lang_of_word = collections.defaultdict(set)
    for t in terms:
        for w in t.get("titleWords") or []:
            lang_of_word[w].add(t["lang"])
    total = 0
    for title, c, f, t in entries(a.world):
        total += 1
        toks = set(re.findall(r"[^\W\d_]+", title.lower()))
        hit = toks & by_word.keys()
        if not hit:
            continue
        ids = set()
        for w in hit:
            ids.update(by_word[w])
        for i in ids:
            term_t[i].add(c, f, t)
        for cn, ws in concepts.items():
            m = toks & ws
            if m:
                conc_t[cn].add(c, f, t)
                for l in {l for w in m for l in lang_of_word[w]}:
                    conc_lang[cn][l] += 1
    out = {
        "note": "Counted by scripts/record_terms_seen.py from the titles of the catalogue entries the Atlas lists. A title says what kind of book it is, not what language the entries inside are written in. Nothing about a person.",
        "entries": total,
        "terms": {i: t.out() for i, t in term_t.items() if t.n},
        "concepts": {c: t.out({"languages": [[l, n] for l, n in conc_lang[c].most_common()]}) for c, t in conc_t.items() if t.n},
    }
    dest = os.path.join(ROOT, "data", "record-terms-seen.json")
    if a.check:
        old = load_json(dest) if os.path.exists(dest) else {}
        print("unchanged" if old == out else "differs from the committed file")
        return
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"{total:,} entries; {len(out['terms'])} terms and {len(out['concepts'])} concepts counted -> {dest}")


if __name__ == "__main__":
    main()

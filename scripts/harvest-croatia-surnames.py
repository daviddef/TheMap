#!/usr/bin/env python3
"""Croatian surname frequencies from the DZS «Names and surnames» application.

WHAT THIS IS, AND WHAT IT IS NOT.

Every other file in data/frequencies/ is a CORPUS: a national statistics
office published a table of every surname above some floor, and the
harvester downloaded it whole. Slovenia's is 30,412 names; Italy's, closed
by the comuni rather than the state, is 31,019.

Croatia has no such table. This project's refusal file said for a day that
Croatia therefore «holds no names», which was wrong, and it was wrong in
the way that matters: the DZS PxWeb API really does have no surname table,
so walking it proved only that the data is not THERE. It is at
web.dzs.hr/app/imena — a 2011 census lookup, one name at a time, behind an
ASP.NET form, with a confidentiality floor of 10.

So this is not a corpus and must never be read as one. There is no listing
endpoint: you cannot ask the application what surnames exist, only whether
a surname you already have exists. Brute-forcing the alphabet at a
government service to synthesise a list it declines to publish would be
taking by volume what it offers by question, so this asks only about names
the atlas already attests in Croatian ground — 466 of them, from the two
family archives whose declared country is HR.

That makes the output a true and narrow statement: «of the surnames this
atlas has actually seen in Croatian registers, here is how many people
carried each one in 2011». `enumerable: false` says so in the file, and
build-surnames.py must not treat it as a national total.

A «below 10 or does not occur» answer is data too, and is kept. For an
atlas of historical records it is often the more interesting answer: it
says an Istrian name that fills a nineteenth-century parish register —
Bellinich, Alacevich — has gone from modern Croatia, which is the shape of
the exodus written into a census.
"""
import html, http.cookiejar, json, os, re, sys, time
import urllib.error, urllib.parse, urllib.request

URL = "https://web.dzs.hr/app/imena/default_en.aspx"
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources; contact via the repository)")
OUT = "data/frequencies/hr.json"
CACHE = "data/.croatia-surnames-scan.json"
PAUSE = float(os.environ.get("HR_PAUSE", "1.5"))
# A CEILING ON ONE RUN, because this is a government form being asked one
# question at a time and the candidate list grows every time the matcher
# places another Croatian volume. Unbounded, a scheduled job that loses its
# cache would sit there asking DZS eleven hundred questions in a row, which
# is taking by volume what they offer by question. Bounded, the backlog
# drains over several weeks and nobody notices us. 0 means no ceiling, which
# is right for a person running it by hand and watching.
MAX = int(os.environ.get("HR_MAX", "0"))

# The application's own words, matched rather than guessed at, so a change
# in its wording stops the harvest instead of silently recording zeroes.
FOUND = re.compile(r"Number of persons with surname\s+(.+?):\s*([\d ]+)", re.I)
ABSENT = re.compile(r"frequency of the surname\s+(.+?)\s+is less than", re.I)


def candidates():
    """The surnames this atlas attests in archives that declare Croatia.

    Deduplicated case-insensitively — the corpus carries both «Blažević»
    and «BLAŽEVIĆ» — and the longest-cased form is kept so the output
    reads like a name rather than a shout.
    """
    pool = []
    d = json.load(open("data/archive-surnames.json"))
    for arch in d["archives"].values():
        if "HR" in (arch.get("declared") or []):
            pool += arch.get("surnames") or []
    # AND EVERY NAME THE CORPUS HAS SINCE LEARNED IN CROATIA.
    # The first version asked about the 466 surnames two family archives
    # declared, and then never grew: the matcher places Croatian volumes
    # on most passes and every new name it finds was a name this lookup
    # would never think to ask about. The cache means asking again costs
    # nothing for names already answered, so the candidate list should be
    # everything the atlas believes is Croatian, not a fixed file.
    try:
        for r in json.load(open("data/surnames.json"))["surnames"]:
            if any(c.get("cc") == "HR" for c in r.get("countries") or []):
                pool.append(r["n"])
    except OSError:
        pass
    seen = {}
    for block in (pool,):
        for s in block:
            s = " ".join(s.split())
            if not s:
                continue
            k = s.casefold()
            # Prefer a mixed-case spelling over an all-caps one.
            if k not in seen or (seen[k].isupper() and not s.isupper()):
                seen[k] = s
    return sorted(seen.values(), key=str.casefold)


def opener():
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [("User-Agent", UA)]
    return op


def hidden(body):
    return {k: html.unescape(v) for k, v in re.findall(
        r'<input type="hidden" name="(__[A-Z]+)" id="\1" value="([^"]*)"', body)}


def main():
    names = candidates()
    cache = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE))
    todo = [n for n in names if n not in cache]
    backlog = len(todo)
    if MAX and len(todo) > MAX:
        todo = todo[:MAX]
    print(f"{len(names)} surnames attested in Croatian archives, "
          f"{len(cache)} already asked, {backlog} to ask"
          + (f" — asking {len(todo)} this run, {backlog - len(todo)} left for "
             f"the next one" if MAX and backlog > len(todo) else ""))

    op = opener()
    try:
        state = hidden(op.open(URL, timeout=30).read().decode("utf-8", "replace"))
    except urllib.error.URLError as e:
        sys.exit(f"DZS did not answer at all: {e}")

    for i, name in enumerate(todo, 1):
        form = dict(state, __EVENTTARGET="btnGetResult", __EVENTARGUMENT="",
                    txtName="", txtSurname=name)
        try:
            r = op.open(urllib.request.Request(
                URL, urllib.parse.urlencode(form).encode(),
                {"Content-Type": "application/x-www-form-urlencoded"}), timeout=30)
            body = r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, OSError) as e:
            # One failure is not a verdict. Leave it out of the cache so the
            # next run asks again, rather than recording an absence the
            # census never stated.
            print(f"  {name}: no answer ({e})")
            time.sleep(PAUSE * 4)
            continue

        state = hidden(body) or state
        flat = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body)))
        m = FOUND.search(flat)
        if m:
            cache[name] = int(m.group(2).replace(" ", ""))
        elif ABSENT.search(flat):
            cache[name] = 0        # below the floor of 10, or gone
        else:
            print(f"  {name}: the application answered in words this script "
                  f"does not know — stopping rather than guessing")
            break

        if i % 25 == 0 or i == len(todo):
            json.dump(cache, open(CACHE, "w"), ensure_ascii=False)
            print(f"  {i}/{len(todo)} asked")
        time.sleep(PAUSE)

    json.dump(cache, open(CACHE, "w"), ensure_ascii=False)

    rows = sorted(((n, c) for n, c in cache.items() if c > 0),
                  key=lambda r: (-r[1], r[0].casefold()))
    gone = sorted(n for n, c in cache.items() if c == 0)
    out = {
        "country": "HR",
        "source": ("Names and surnames in the Republic of Croatia, "
                   "2011 Population Census (DZS)"),
        "url": URL,
        "licence": ("No licence stated. Aggregate census counts with a "
                    "confidentiality floor of 10, published by the Croatian "
                    "Bureau of Statistics as a public lookup."),
        "enumerable": False,
        "note": ("NOT A NATIONAL CORPUS. The DZS application answers one "
                 "name at a time and has no listing endpoint, so this holds "
                 "only the surnames the atlas already attests in archives "
                 "whose declared country is Croatia. `asked` is the whole "
                 "question put; `found` carried ten or more people in 2011; "
                 "`gone` is the application's «less than 10 or does not "
                 "occur», which for a name that fills a nineteenth-century "
                 "Istrian register is itself a finding."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"asked": len(cache), "found": len(rows),
                   "gone": len(gone),
                   "people": sum(c for _, c in rows)},
        "surnames": [{"n": n, "c": c} for n, c in rows],
        "gone": gone,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"\n{OUT}: {len(rows):,} surnames found, {out['counts']['people']:,} "
          f"people, {len(gone):,} below the floor or gone")
    for n, c in rows[:10]:
        print(f"  {c:>7,}  {n}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Open the unsurveyed providers and say what is actually behind them.

317 of 519 providers carry access «unsurveyed» — «nobody has walked this one
yet» — and 200 of those are French communal archives harvested from Wikidata.
That is not an embarrassment to be hidden; it is the largest single piece of
work this atlas has left, and until it is done the map's honest answer for
ninety per cent of its ground is «somebody should look».

WHAT THIS DOES AND, MORE IMPORTANTLY, WHAT IT REFUSES TO DO.

It opens each provider's own site once, reads the words on it, and proposes an
access class with the exact phrases that produced the proposal. It writes back
ONLY where the evidence is unambiguous. Everything else lands in a review file
with its evidence, for a person to decide.

That asymmetry is the whole design. This directory's value is that it does not
lie: a place marked «free» that turns out to need an account has wasted a
researcher's evening, and one wrong row costs more trust than ten honest
blanks. An automated classifier that guesses confidently is worse than the
«unsurveyed» it replaces, because «unsurveyed» is true.

  Signals, and none of them is decisive alone:
    onsite     consultation only in the reading room, nothing online
    account    a register viewer that first asks you to sign in
    catalogue  an inventory or finding aid, with no images
    free       images of the registers, no account, no charge
    index      names transcribed, no images
    paid/mixed a charge, or a charge for part of it

ROBOTS.TXT IS OBEYED, AND A REFUSAL IS A RESULT. Where a site disallows this
path, the provider is recorded as declined-with-a-reason rather than surveyed,
and never fetched again by this script. This project has declined nine sources
that way already and does not send a user-agent it is not. The UA below says
who we are and links to the atlas, so anybody reading their logs can find us.

    python3 scripts/survey-providers.py --country FR --n 20
    python3 scripts/survey-providers.py --country FR --n 200 --write
"""
import argparse, collections, json, os, re, sys, time
import urllib.error, urllib.parse, urllib.request
import urllib.robotparser as robotparser
import concurrent.futures as cf

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources)")

REVIEW = "data/_survey-review.json"
DECLINED = "data/_declined.json"

# ---------------------------------------------------------------------------
# THE PHRASES, IN THE LANGUAGE THE SITES ARE WRITTEN IN.
# Matched against the page text folded to lowercase with accents stripped, so
# «état civil» and «etat civil» are the same needle — French archive sites are
# inconsistent about accents in navigation labels.
SIGNALS = {
    # «salle de lecture» IS NOT ON THIS LIST, AND THAT COST FORTY-TWO ROWS.
    # It was, and it matched 42 sites, every one of which was then written up
    # as «on paper, in the building» — including twenty archives
    # départementales, which are collectively the best FREE online register
    # source in Europe. The phrase means the archive has a reading room. Every
    # archive on earth has a reading room. Only a phrase that says the reading
    # room is the ONLY way in belongs here.
    "onsite": [
        "uniquement en salle de lecture", "uniquement sur place",
        "exclusivement en salle", "consultation uniquement en salle",
        "sur place uniquement", "consultable uniquement sur place",
    ],
    "account": [
        "creer un compte", "creation de compte", "espace personnel",
        "s'inscrire", "inscription obligatoire", "identifiez-vous",
        "connexion requise", "mon espace",
    ],
    "free": [
        "archives en ligne", "registres numerises", "etat civil numerise",
        "visionneuse", "images numerisees", "consulter les registres",
        "acces libre", "registres paroissiaux et d'etat civil",
    ],
    "catalogue": [
        "inventaire", "instrument de recherche", "etat des fonds",
        "fonds d'archives", "cadre de classement",
    ],
    "index": [
        "tables decennales", "releves nominatifs", "base nominative",
        "indexation collaborative",
    ],
    "paid": [
        "tarif", "payant", "abonnement",
    ],
}

# A page that says «état civil» because it lists the series it holds is not a
# page that says the images are online. These are what actually distinguish an
# online register viewer, and one of them must be present before «free».
VIEWER = ["archives en ligne", "registres numerises", "etat civil numerise",
          "visionneuse", "images numerisees", "consulter les registres"]

# AND A VIEWER ALONE IS NOT ENOUGH TO SAY «FREE».
# «Registres numérisés» is often a search facet, which proves the images exist
# and says nothing about who may look at them — a site with that facet behind a
# login would have been written up as free. Antibes only escaped that because
# its account area is called «Mon espace», which was not on the account list;
# it passed by the luck of my needle choice rather than by evidence. So one of
# these has to be on the page too: somebody saying, in words, that you may
# look without asking.
FREELY = ["accessibles directement", "accessible directement", "acces libre",
          "en libre acces", "consultation libre", "librement consultable",
          "gratuitement", "acces gratuit", "sans inscription"]


def fold(s):
    """Lowercase and strip the accents, so one needle matches both spellings."""
    import unicodedata
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def robots_allows(url):
    """True if the site's robots.txt permits us this path, plus any crawl-delay.

    WE FETCH robots.txt OURSELVES, AND THAT IS THE WHOLE POINT OF THIS
    FUNCTION'S EXISTENCE IN THIS FORM. RobotFileParser.read() uses urllib's
    default user-agent, «Python-urllib/3.x», which a great many municipal sites
    block outright. A 401 or 403 on robots.txt makes the parser set
    disallow_all, correctly per the standard — so the first cut of this recorded
    Auxerre as having refused us when its robots.txt says only

        Disallow: /data/
        Disallow: /img/

    and permits the page we wanted. It was writing refusals the archives had
    never made, into a file this project treats as a record of their wishes.
    That is a worse failure than any wrong access class, because a decline is
    not revisited.

    So: fetch with the UA we actually use, hand the text to the parser, and
    keep 401/403 meaning disallow — when it is genuinely OUR request being
    refused rather than a robot nobody has heard of.

    No robots.txt at all permits everything; that is the standard's answer, not
    an assumption. A network failure permits too, because refusing on a blip
    records a decline about our connection rather than their wishes.
    """
    p = urllib.parse.urlsplit(url)
    root = f"{p.scheme}://{p.netloc}/robots.txt"
    rp = robotparser.RobotFileParser()
    rp.set_url(root)
    try:
        req = urllib.request.Request(root, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read(200_000).decode("utf-8", "replace")
        rp.parse(body.splitlines())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return False, None, f"robots.txt refused our user-agent with {e.code}"
        return True, None, ""          # 404 and friends: nothing to obey
    except Exception:
        return True, None, ""
    if not rp.can_fetch(UA, url):
        return False, None, "robots.txt disallows this path for our user-agent"
    # A site that asks for a delay gets it. Auxerre asks for five seconds.
    try:
        delay = rp.crawl_delay(UA)
    except Exception:
        delay = None
    return True, delay, ""


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr,en;q=0.7",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(4_000_000)
        enc = r.headers.get_content_charset() or "utf-8"
        return r.status, r.geturl(), raw.decode(enc, "replace")


def text_of(raw):
    """Strip tags, then UNESCAPE, and the order is the point.

    The first cut of this stripped tags and folded accents and found nothing on
    a page carrying 586,000 characters of French. The page said «&eacute;tat
    civil». Stripping tags does not touch an entity, so fold() saw
    «&eacute;tat» and no needle could ever match it — and because the failure
    produced an empty evidence set rather than an error, it looked exactly like
    a site with nothing to say. French municipal pages are dense with entities.
    """
    import html as _html
    raw = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?s)<[^>]+>", " ", raw)
    raw = _html.unescape(raw)
    raw = raw.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", raw)


def survey(row):
    url = row.get("url")
    if not url:
        return dict(id=row["id"], outcome="no-url")

    ok, delay, why = robots_allows(url)
    if not ok:
        return dict(id=row["id"], name=row.get("name"), url=url,
                    outcome="declined", reason=why)
    if delay:
        time.sleep(min(float(delay), 10.0))

    try:
        status, final, html = fetch(url)
    except urllib.error.HTTPError as e:
        return dict(id=row["id"], name=row.get("name"), url=url,
                    outcome="http", status=e.code)
    except Exception as e:
        return dict(id=row["id"], name=row.get("name"), url=url,
                    outcome="unreachable", error=type(e).__name__)

    plain = text_of(html)
    # A SHELL IS NOT AN EMPTY ARCHIVE. Annecy returns 14,857 bytes of HTML and
    # one character of text: a JavaScript application that renders on the
    # client. Scored as «no signals found» it would read as a site with nothing
    # to say, which is a false negative dressed as a fact. It needs a browser,
    # and saying so is the honest outcome.
    # 1,200 RATHER THAN 400. Béziers rendered 432 characters — over the old
    # threshold, and still nothing but a name and an address. A page that thin
    # cannot be surveyed either way, and scoring it produces a verdict about
    # our reading rather than about the archive.
    if len(plain) < 1200:
        return dict(id=row["id"], name=row.get("name"), url=url, final=final,
                    status=status, outcome="needs-browser",
                    chars=len(plain), bytes=len(html))
    scored = score(plain)
    return dict(id=row["id"], name=row.get("name"), url=url, final=final,
                status=status, outcome="read", **scored)


def score(plain):
    """The verdict rules, in ONE place, whatever fetched the text.

    A static fetch and a rendered page hand in the same thing — the words on
    the page — so they are scored by the same code. Keeping this here is why
    render-pages.mjs is allowed to be a fetcher and nothing else.
    """
    body = fold(plain)
    hits = {k: [n for n in needles if n in body] for k, needles in SIGNALS.items()}
    hits = {k: v for k, v in hits.items() if v}

    # THE DECISION, AND IT IS DELIBERATELY TIMID.
    # A site is written up as «free» only when it shows a register viewer AND
    # does not ask for an account; as «onsite» only when it says so in words
    # and shows no viewer. Everything else — including every page carrying
    # both an account prompt and a viewer, which is most of them — is left for
    # a person, because which of the two governs is a judgement about that
    # site's wording and not about which list is longer.
    viewer = [n for n in VIEWER if n in body]
    freely = [n for n in FREELY if n in body]
    # NOTHING HERE IS CONFIDENT ANY MORE, AND THAT IS THE THIRD VERSION OF
    # THIS COMMENT. Each earlier one narrowed a rule that was still wrong.
    #
    #   1. «salle de lecture» was read as «paper only». It means the archive
    #      has a reading room. All of them do. 42 sites, 20 of them archives
    #      départementales — collectively the best free online register source
    #      in Europe — were about to be recorded as unphotographed paper.
    #
    #   2. So «free» was made to require an explicit free-access phrase beside
    #      the viewer phrase. Then Puy-de-Dôme's «accès libre» turned out to be
    #      «Accès libre pour les journées européennes du patrimoine» — free
    #      ENTRY to an exhibition — and Seine-et-Marne's was «en accès libre
    #      dans le hall d'entrée». Both would have been written «free», meaning
    #      free online images, on the strength of a sentence about a corridor.
    #
    # The fault is not the phrase list. It is that two phrases co-occurring
    # somewhere on a homepage is not a statement about the thing being asked.
    # A homepage is a poor witness to its own holdings, and no amount of
    # tightening makes a bag of words into a sentence.
    #
    # So this script no longer writes an access class, ever. It triages: alive
    # or dead, application or page, refused or open, and the literal phrases
    # found. `verdict` below is a SUGGESTION for the person who reads the row
    # and carries no authority. That leaves «unsurveyed» in place, which is
    # true, rather than replacing it with a guess, which is what the atlas
    # exists not to do.
    # Not finding a register viewer on a homepage is not evidence that there
    # is not one: it can mean the link is called something this list does not
    # know, or that it lives one page in, or that the homepage is a hundred
    # words of opening hours. Absence of evidence is not evidence of absence,
    # and writing it down as though it were is how a directory starts lying.
    # Only positive evidence earns a verdict this script will record by
    # itself — which in practice means «free», and only when somebody has
    # said in words that you may look without asking. An honest blank beats a
    # plausible lie; that sentence is in this project's own data files.
    verdict, confident = None, False
    if hits.get("onsite") and not viewer:
        verdict = "onsite"
    elif viewer and freely and not hits.get("paid"):
        verdict = "free"
    elif viewer and not hits.get("account") and not hits.get("paid"):
        verdict = "free"
    elif viewer and hits.get("account"):
        verdict = "account"          # plausible, not certain
    elif hits.get("catalogue") and not viewer:
        verdict = "catalogue"
    elif hits.get("index") and not viewer:
        verdict = "index"

    return dict(verdict=verdict, confident=confident, evidence=hits,
                viewer=viewer, freely=freely, chars=len(plain))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country")
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--write", action="store_true",
                    help="record what was ESTABLISHED — that the site was opened, "
                         "when, and whether it refused us. Never an access class.")
    ap.add_argument("--from-rendered", metavar="FILE",
                    help="score text already rendered by scripts/render-pages.mjs "
                         "instead of fetching (the JS-shell sites)")
    a = ap.parse_args()

    prov = json.load(open("data/providers.json"),
                     object_pairs_hook=collections.OrderedDict)
    rows = [r for r in prov["providers"] if r.get("access") == "unsurveyed"]
    if a.country:
        rows = [r for r in rows if a.country in (r.get("countries") or [])]
    rows.sort(key=lambda r: r["id"])

    if a.from_rendered:
        # SAME SCORER, DIFFERENT FETCHER. render-pages.mjs drove a browser and
        # wrote the words it found; they are scored here so that a site which
        # happens to be an application is judged by exactly the rules a site
        # which happens to be a page is judged by.
        rend = json.load(open(a.from_rendered))
        out = []
        for r in rend["rows"]:
            if r.get("error") or not (r.get("text") or "").strip():
                out.append(dict(id=r["id"], name=r.get("name"), url=r.get("url"),
                                outcome="unreachable",
                                error=r.get("error") or "rendered empty"))
                continue
            out.append(dict(id=r["id"], name=r.get("name"), url=r.get("url"),
                            final=r.get("final"), status=r.get("status"),
                            outcome="read", rendered=True, **score(r["text"])))
        print(f"scoring {len(out)} pages rendered by a browser")
    else:
        batch = rows[:a.n]
        print(f"surveying {len(batch)} of {len(rows)} unsurveyed"
              + (f" in {a.country}" if a.country else ""))
        with cf.ThreadPoolExecutor(a.workers) as ex:
            out = list(ex.map(survey, batch))

    by = collections.Counter(r["outcome"] for r in out)
    read = [r for r in out if r["outcome"] == "read"]
    sugg = collections.Counter(r.get("verdict") or "no suggestion" for r in read)
    print("  outcomes: " + ", ".join(f"{k}={v}" for k, v in sorted(by.items())))
    print("  suggestions for a person to check: "
          + ", ".join(f"{k}={v}" for k, v in sorted(sugg.items())))
    print("  NONE of these is written as an access class — see the comment in "
          "score(). They are a reading queue, not findings.")

    os.makedirs("data", exist_ok=True)
    # The rendered pass must not overwrite the static pass's findings: the two
    # cover different providers and both are needed to see the whole sweep.
    dest = "data/_survey-review-rendered.json" if a.from_rendered else REVIEW
    json.dump({"note": "A reading queue, not findings. `verdict` is a SUGGESTION "
                       "from phrase-matching a homepage and has no authority: two "
                       "phrases co-occurring on a page is not a statement about "
                       "holdings. «salle de lecture» means the archive has a "
                       "reading room, not that its paper is unphotographed; "
                       "«accès libre» has turned out twice to mean free entry to "
                       "an exhibition. A person reads the site and decides the "
                       "access class. `evidence` is the literal phrases found.",
               "ran": time.strftime("%Y-%m-%d"), "rows": out},
              open(dest, "w"), ensure_ascii=False, indent=1)
    print(f"  wrote {dest}")

    if not a.write:
        print("  (dry run — pass --write to record what was established)")
        return 0

    # WHAT IS ACTUALLY ESTABLISHED, AND NOTHING ELSE.
    # Not the access class — see score(). But «somebody opened this on this
    # date and the site answered» is a fact, and so is «it refused our
    # user-agent» and «it is a JavaScript application». Recording those turns
    # 200 blank URLs into a queue somebody can work, which is the difference
    # between «nobody has looked» and «looked, and here is what it says».
    idx = {r["id"]: r for r in prov["providers"]}
    today = time.strftime("%Y-%m-%d")
    n = 0
    for r in out:
        row = idx.get(r["id"])
        if row is None:
            continue
        row["checked"] = today
        row["triage"] = r["outcome"]
        if r["outcome"] == "declined":
            row["triageNote"] = r.get("reason")
        elif r["outcome"] == "read":
            phrases = sorted({p for v in r.get("evidence", {}).values() for p in v})
            row["triageNote"] = ("homepage read; phrases found: "
                                 + (", ".join(phrases) if phrases else "none")
                                 + ". Access class still needs a person.")
        elif r["outcome"] == "needs-browser":
            row["triageNote"] = ("the homepage renders client-side; "
                                 "see scripts/render-pages.mjs")
        else:
            row["triageNote"] = f"did not answer ({r.get('status') or r.get('error')})"
        n += 1
    json.dump(prov, open("data/providers.json", "w"), ensure_ascii=False, indent=1)
    print(f"  recorded triage for {n} providers; access classes untouched")
    return 0


if __name__ == "__main__":
    sys.exit(main())

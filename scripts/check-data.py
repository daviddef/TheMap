#!/usr/bin/env python3
"""The build gate. A directory that lies is worse than no directory.

Everything here is a rule that, broken, would put a wrong answer in front of
somebody who then drives to an archive. It runs before every deploy and fails
the build rather than warning into a log nobody reads.
"""
import json, os, re, sys, datetime
import glob as _g
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import country_of, km_to

import os as _os
_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
_os.chdir(_ROOT)

ERR = []
WARN = []


def err(m):
    ERR.append(m)


def warn(m):
    WARN.append(m)


# Coordinates inside the country they claim. A geocoder that silently puts a
# Croatian parish in Chad is the single likeliest way this map ships a lie, and
# it is cheap to catch — against real outlines, not a rectangle.


def main():
    places = json.load(open("data/places.json"))["places"]
    regions = json.load(open("data/regions.json"))
    provs = json.load(open("data/providers.json"))
    OVR = json.load(open("data/country-overrides.json"))["overrides"]
    for k, v in OVR.items():
        if not v.get("why"):
            err(f"country-override {k}: no reason given")
    # -2 · THE BUILD AND THE CLIENT MUST SHARD BY THE SAME RULE.
    # They did not, and it cost 10,962 surnames. The build took the first three
    # CHARACTERS and then dropped the non-alphanumerics — «d'arcy» became «da»,
    # too short for a shard, so nothing was written. The client scans the whole
    # string for its first three alphanumerics, gets «dar», and fetches a file
    # that was never made. Every name with a separator near the front was
    # affected: O'Brien, D'Angelo, Ah-Sing, Le Roy, de Witt.
    #
    # Both now compute the same thing, and this proves it on the real data
    # rather than trusting that they still agree.
    def client_key(f):
        k = ""
        for ch in f:
            if ch.isalnum():
                k += ch
                if len(k) == 3:
                    break
        return k if len(k) == 3 else ""

    try:
        sys.path.insert(0, "scripts")
        from build import shard_key as _bk
        _dis = [n for n in ("d'arcy", "o'brien", "ah-sing", "le roy", "de witt",
                            "st john", "d'angelo", "van der berg", "mcdonald")
                if _bk(n) != client_key(n)]
        if _dis:
            err(f"build.py and the client disagree on the shard key for "
                f"{', '.join(_dis)} — names sharded one way and looked up another "
                f"are unfindable by their own spelling")
    except ImportError:
        err("cannot import shard_key from build.py to check it against the client")

    # -1.5 · NO FIELD IN THE INDEX THAT NOTHING READS.
    # index.json is fetched by every visitor before the map draws, so a field
    # nobody uses is not a small cost but a pure one. This has happened three
    # times: `r` and `k` sat in 7,391 rows costing 22 KB to answer nobody, and
    # `vol` was added and never rendered on the same afternoon the lesson was
    # written down. The client is read and every key must appear in it.
    try:
        _idx = json.load(open(os.path.join("site", "public", "index.json")))
        _client = open(os.path.join("site", "src", "components",
                                    "RecordMap.astro"), encoding="utf-8").read()
        _keys = set()
        for _r in _idx.get("places", []):
            _keys |= set(_r)
        for _k in sorted(_keys):
            # A BARE `[f` IS A VARIABLE, NOT A FIELD READ. The old pattern
            # accepted anything after a dot OR a bracket, so `[f.y, f.x]`
            # and `PROV[f]` — where f is a local — satisfied it, and the
            # index shipped a field `f` on 10,046 rows that nothing reads.
            # A gate that passes wrongly is worse than no gate: it is the
            # reason nobody looked.
            #
            # A real read is a property access: `.f`, or a quoted subscript
            # `["f"]`. Anything else is a coincidence of naming, which is
            # near certain for the single-letter keys this index uses.
            if not re.search(r"\.\s*" + re.escape(_k) + r"\b"
                             r"|\[\s*[\"']" + re.escape(_k) + r"[\"']\s*\]",
                             _client):
                err(f"index.json ships a field '{_k}' that RecordMap.astro never "
                    f"reads — every visitor downloads it to answer nobody")
    except OSError:
        pass

    # -1 · THE INLINE SCRIPTS MUST PARSE.
    # RecordMap.astro carries 1,600 lines of JavaScript inside `<script
    # is:inline>`, which Astro copies into the page verbatim and never looks
    # at. A stray brace in there builds perfectly, deploys perfectly, and
    # produces a page with no map on it — the one failure mode that passes
    # every check this project has and is invisible until somebody loads it.
    import subprocess as _sp, tempfile as _tf
    if _sp.run(["node", "--version"], capture_output=True).returncode == 0:
        for _c in _g.glob("site/src/**/*.astro", recursive=True):
            _src = open(_c, encoding="utf-8").read()
            # SELF-CLOSING TAGS HAVE NO BODY. Written without the `[^/]`,
            # this pattern walked straight past `<script is:inline ... />` and
            # ran on to the NEXT script's closing tag, so it handed node the
            # intervening markup as if it were JavaScript and reported a
            # syntax error in a script that was perfectly fine. A gate that
            # cries wolf gets switched off, so it has to be right.
            for _i, _m in enumerate(re.finditer(
                    r"<script[^>]*\bis:inline\b[^>]*[^/]>(.*?)</script>", _src, re.S)):
                with _tf.NamedTemporaryFile("w", suffix=".js", delete=False,
                                            encoding="utf-8") as _fh:
                    _fh.write(_m.group(1))
                    _tmp = _fh.name
                _r = _sp.run(["node", "--check", _tmp], capture_output=True, text=True)
                os.unlink(_tmp)
                if _r.returncode != 0:
                    err(f"{_c}: inline script #{_i + 1} does not parse — "
                        f"{_r.stderr.strip().splitlines()[-1] if _r.stderr else '?'}")

    # -1b · EVERY SVG SHIPPED MUST BE VALID XML.
    # favicon.svg carried «--accent #1F5C6B» inside an XML comment. A double
    # hyphen is illegal there, so the file was not well-formed XML and a strict
    # parser threw the whole thing away — which is why the tab showed a grey
    # placeholder and David said there was no icon. It served HTTP 200 with the
    # right content type the entire time, so every check that asked the network
    # said it was fine. Only a parser can tell you an image is broken.
    import xml.dom.minidom as _xd
    for _svg in _g.glob("site/public/**/*.svg", recursive=True):
        try:
            _xd.parse(_svg)
        except Exception as _e:
            err(f"{_svg}: not well-formed XML — {_e}. A browser will refuse to "
                f"render it however cleanly it downloads.")

    # -1c · IF THE STYLESHEET HIDES THE NAV, THE LAYOUT MUST OFFER THE FALLBACK.
    # styles.css came across whole from the family archive and brought a
    # complete navigation design with it: dropdown groups, a menu button and a
    # drawer, with `nav.topnav{display:none!important}` below 1180px. This
    # layout rendered eleven bare links and no button — so on any window under
    # 1180px there was NO navigation at all, and above it the sheet's higher
    # specificity closed the links up to a 1px gap. Inheriting a stylesheet
    # means inheriting the markup it was written for.
    _css = open("site/public/styles.css", encoding="utf-8").read() \
        if os.path.exists("site/public/styles.css") else ""
    if re.search(r"nav\.topnav\s*{[^}]*display:\s*none", _css):
        _base = open("site/src/layouts/Base.astro", encoding="utf-8").read()
        for _need, _why in (('class="burger"', "the button that replaces the hidden bar"),
                            ('id="drawer"', "the panel that button opens")):
            if _need not in _base:
                err(f"styles.css hides nav.topnav under a media query but "
                    f"Base.astro has no {_need} — {_why}. Every narrow window "
                    f"would get no navigation at all.")
        if "details class=\"menu\"" not in _base and ".topnav details.menu" in _css:
            err("styles.css styles .topnav details.menu and nothing else inside "
                "the bar, but Base.astro renders bare links — they will take "
                "the sheet's 1px gap and run together as one word.")

    # 0 · EVERY IMPORT IN A PAGE MUST RESOLVE.
    # The surname page imported ../../../data/frequencies/fr.json, which is one
    # «..» short — [name].astro sits a directory deeper than the pages that use
    # that pattern, so it pointed at site/data rather than the repository root.
    # The data stage built perfectly, this gate said «data is sound», and then
    # Astro failed on the import, so the deploy died AFTER every check passed
    # and the site kept serving the previous build. David saw Lerena still
    # missing Argentina and asked whether it had pushed. It had; it had not
    # landed, and nothing between the two said so.
    for _pg in _g.glob("site/src/**/*.astro", recursive=True) + \
               _g.glob("site/src/**/*.js", recursive=True):
        # BOTH KINDS OF IMPORT. The first cut matched only `from "..."` and
        # missed `await import("...")`, which is how the surname and place
        # pages load their data — so this gate, built to stop exactly this
        # failure, watched it happen a second time and said «data is sound».
        _re_imp = r'(?:from|import)\s*\(?\s*["\'](\.[^"\']+\.(?:json|js))["\']'
        for _m in re.finditer(_re_imp, open(_pg).read()):
            _t = os.path.normpath(os.path.join(os.path.dirname(_pg), _m.group(1)))
            # public/ artefacts are written by build.py earlier in this run.
            if not os.path.exists(_t):
                err(f"{_pg}: imports {_m.group(1)} which resolves to {_t} — "
                    f"that file is not there, and Astro will fail on it AFTER "
                    f"this gate has passed")

    # 2 · NOTHING MAY GET SMALLER WITHOUT SOMEBODY SAYING SO.
    # Presence was never the failure mode. Every bug this project has shipped
    # to the public site was a silent shrinkage: a file that was still there,
    # still valid, still built, and holding a fraction of what it held the day
    # before. data/_floors.json records the size each measure has reached, and
    # a build that goes backwards stops here.
    def floors():
        try:
            F = json.load(open("data/_floors.json"))["floors"]
        except OSError:
            err("data/_floors.json is missing — nothing is guarding against "
                "the dataset quietly halving")
            return
        got = {}

        def count(name, n):
            got[name] = n
            f = F.get(name)
            if f is not None and n < f:
                err(f"{name}: {n:,} is below the floor of {f:,} — something has "
                    f"SHRUNK. Fix it, or raise the floor deliberately in "
                    f"data/_floors.json and say why.")

        pl = json.load(open("data/places.json"))["places"]
        count("places", len(pl))
        count("placesWalked", sum(1 for p in pl if p.get("via") != "geonames-admin"
                                  and p.get("via") != "townlands-ie"
                                  and (p.get("collections") or [])))
        count("countriesWithGround", len({p.get("country") for p in pl if p.get("country")}))
        count("collections", len(json.load(open("data/collections.json"))["collections"]))
        count("providers", len(json.load(open("data/providers.json"))["providers"]))
        rg = json.load(open("data/regions.json"))["regions"]
        count("regions", len(rg))
        count("regionEras", sum(len(r["eras"]) for r in rg))
        try:
            sn = json.load(open("data/surnames.json"))
            count("surnames", sn["counts"]["surnames"])
            count("surnamesWithCountries", sn["counts"]["withCountries"])
            count("surnamesWithVariants", sn["counts"]["withVariants"])
            count("alsoAPlace", sn["counts"].get("alsoAPlace", 0))
        except OSError:
            pass
        asn = json.load(open("data/archive-surnames.json"))["archives"]
        count("archives", len(asn))
        count("archiveSurnames", len({n for a in asn.values() for n in a["surnames"]}))
        count("registers", len([f for f in _g.glob("data/frequencies/*.json")
                                if not os.path.basename(f).startswith("_")]))
        count("gazetteer", len(json.load(open("data/gazetteer.json"))["places"]))
        try:
            ie = json.load(open("data/ireland-osm.json"))
            count("irishCivilParishes", len(ie["civilParishes"]))
            count("irishTownlands", len(ie["townlands"]))
        except OSError:
            pass
        count("adminDivisions", len(json.load(open("data/admin-divisions.json"))["divisions"]))
        try:
            count("scottishParishes", len(json.load(
                open("data/scotland-parishes.json"))["parishes"]))
        except OSError:
            pass
        try:
            _fv = json.load(open("data/fs-volumes.json"))
            count("fsVolumes", sum(len(v) for v in _fv["byPlace"].values()))
            count("fsVolumePlaces", len(_fv["byPlace"]))
        except OSError:
            pass
        try:
            _wa = json.load(open("data/world-archives.json"))
            count("worldArchives", len(_wa["archives"]))
            count("worldArchiveCountries", len({r["cc"] for r in _wa["archives"]}))
        except OSError:
            pass
        try:
            count("estonianParishes", len(json.load(
                open("data/estonia-parishes.json"))["parishes"]))
        except OSError:
            pass
        try:
            count("italianComuni", len(json.load(
                open("data/italy-comuni.json"))["comuni"]))
        except OSError:
            pass
        # The negatives are a deliverable too. A search that ran and found
        # nothing is worth more written down than repeated, and a file of them
        # that quietly empties is a file nobody is keeping.
        try:
            _dec = json.load(open("data/_declined.json"))
            _k = "declined" if "declined" in _dec else list(_dec)[-1]
            count("declinedDocumented", len(_dec[_k]))
        except OSError:
            pass
        for name, f in (("churches", "churches-wikidata"), ("cemeteries", "cemeteries-wikidata"),
                        ("libraries", "libraries-wikidata")):
            try:
                count(name, len(json.load(open(f"data/{f}.json"))["features"]))
            except OSError:
                pass
        try:
            count("settlements", len(json.load(
                open("data/region-settlements.json"))["settlements"]))
        except OSError:
            pass
        # A floor nobody measures is a floor nobody is standing on.
        for k in F:
            if k not in got:
                err(f"_floors.json has a floor for '{k}' and nothing counts it")

    floors()

    # 1 · NO BUILD-TIME SCRIPT MAY READ OUTSIDE THIS REPOSITORY.
    # build-surnames.py read the sibling archives through an absolute path. It
    # worked on the laptop and returned nothing in CI, and nothing is a valid
    # answer to a glob, so the build stayed green while the deployed dataset
    # lost every archive attestation for days. The rule is now enforced rather
    # than remembered: the three scripts `npm run build` invokes are read and
    # refused if they contain an absolute path. Hand-run snapshot importers may
    # have them — they are not in this list.
    import re as _re
    for _s in ("build-surnames.py", "build.py", "check-data.py"):
        try:
            _src = open(os.path.join("scripts", _s)).read()
        except OSError:
            continue
        for _m in _re.finditer(r'["\'](/Users/|/home/|[A-Z]:\\\\)[^"\']*["\']', _src):
            err(f"{_s}: absolute path {_m.group(0)[:60]} in a BUILD-TIME script — "
                f"it will not exist in CI and will fail silently")

    # THE ARCHIVES MUST ACTUALLY BE IN THERE. build-surnames.py read the sibling
    # repositories through an absolute path that exists on one laptop, so every
    # CI build shipped a dataset with none of their attestations and said
    # nothing about it. Lerena lost Argentina and Uruguay, Defranceski lost
    # Croatia, and the build was green every time. A silent zero is the one
    # failure a build gate exists to catch.
    try:
        snap = json.load(open("data/archive-surnames.json"))
        for label, a in snap["archives"].items():
            if not a.get("surnames"):
                err(f"archive-surnames: {label} contributes no surnames")
            if not a.get("countries"):
                err(f"archive-surnames: {label} attests no country")
        if len(snap["archives"]) < 8:
            err(f"archive-surnames: only {len(snap['archives'])} archives, expected 8 — "
                f"re-run scripts/harvest-archive-surnames.py")
    except FileNotFoundError:
        err("data/archive-surnames.json is missing — every family archive's "
            "attestations would be silently absent from the dataset")

    try:
        PIN = json.load(open("data/place-overrides.json"))["overrides"]
    except FileNotFoundError:
        PIN = {}
    for k, v in PIN.items():
        if not v.get("why"):
            err(f"place-override {k}: no reason given")
        if v.get("lat") is None or v.get("lon") is None:
            err(f"place-override {k}: no coordinates")

    legend = set(provs["access"])
    pids = set()
    for p in provs["providers"]:
        if p["id"] in pids:
            err(f"provider {p['id']}: duplicate id")
        pids.add(p["id"])
        if p["access"] not in legend:
            err(f"provider {p['id']}: access '{p['access']}' is not in the legend")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", p.get("checked", "")):
            err(f"provider {p['id']}: no usable `checked` date")
        else:
            age = (datetime.date.today()
                   - datetime.date.fromisoformat(p["checked"])).days
            if age > 365:
                warn(f"provider {p['id']}: not re-checked in {age} days")
        if not p.get("url", "").startswith("https://"):
            err(f"provider {p['id']}: url is not https")

    rids = set()
    for r in regions["regions"]:
        if r["id"] in rids:
            err(f"region {r['id']}: duplicate id")
        rids.add(r["id"])
        if len(r.get("ring", [])) < 3:
            err(f"region {r['id']}: a ring needs at least three points")
        last = None
        for e in r["eras"]:
            if e["regime"] not in regions["regimes"]:
                err(f"region {r['id']} {e['from']}: unknown regime '{e['regime']}'")
            if e["from"] > e["to"]:
                err(f"region {r['id']} {e['from']}: era ends before it begins")
            if last is not None and e["from"] < last:
                err(f"region {r['id']} {e['from']}: eras are out of order or overlap")
            last = e["to"]
            for f in e["filedUnder"]:
                if f not in pids:
                    err(f"region {r['id']} {e['from']}: filedUnder '{f}' is not a provider")

    seen = set()
    for p in places:
        pid = p.get("id")
        if not pid or pid in seen:
            err(f"place {pid!r}: missing or duplicate id")
        seen.add(pid)
        if not p.get("name"):
            err(f"place {pid}: no name")
        if p.get("lat") is None or p.get("lon") is None:
            err(f"place {pid}: no coordinates")
            continue
        if not p.get("country"):
            err(f"place {pid}: no country")
        elif pid not in OVR and pid not in PIN and not p.get("filedUnder"):
            # A place carrying `filedUnder` has already had this argument
            # settled and recorded: it says where the ground is AND which
            # country a source files it under. Flagging it again would be the
            # gate objecting to the answer it asked for.
            actual = country_of(p["lat"], p["lon"])
            if actual and actual != p["country"]:
                # The same 25 km tolerance the importer uses, because a gate
                # holding a stricter standard than the thing it gates just
                # fails honest data. El Paso is half a kilometre from Mexico
                # and a 110 m-rounded outline cannot see the river.
                edge = km_to(p["lat"], p["lon"], p["country"])
                if edge is None or edge >= 25:
                    err(f"place {pid}: filed as {p['country']} but {p['lat']},{p['lon']} "
                        f"is in {actual} — fix the coordinates, or add a reasoned "
                        f"entry to data/country-overrides.json")
        if p.get("region") and p["region"] not in rids:
            err(f"place {pid}: unknown region '{p['region']}'")

        for c in p.get("collections", []):
            if c.get("provider") not in pids:
                err(f"place {pid}: collection provider '{c.get('provider')}' is unknown")
            if c.get("access") not in legend:
                err(f"place {pid}: collection access '{c.get('access')}' is not in the legend")
            if c.get("from") and c.get("to") and c["from"] > c["to"]:
                err(f"place {pid}: volume '{c.get('title')}' ends before it begins")
            if c.get("url") and not c["url"].startswith("https://"):
                err(f"place {pid}: collection url is not https")
            # An access class that promises images must have something to open.
            if c.get("access") in ("free", "account", "paid") and not c.get("url"):
                err(f"place {pid}: '{c.get('title')}' claims {c['access']} but carries no link")

    for w in WARN[:12]:
        print("warn:", w)
    if len(WARN) > 12:
        print(f"warn: … and {len(WARN)-12} more")
    for e in ERR[:40]:
        print("FAIL:", e)
    if len(ERR) > 40:
        print(f"FAIL: … and {len(ERR)-40} more")

    print(f"\n{len(places)} places, "
          f"{sum(len(p.get('collections',[])) for p in places)} collections, "
          f"{len(provs['providers'])} providers, {len(regions['regions'])} regions")
    if ERR:
        print(f"{len(ERR)} error(s) — build stopped")
        sys.exit(1)
    print("data is sound" + (f" ({len(WARN)} warning(s))" if WARN else ""))


if __name__ == "__main__":
    main()

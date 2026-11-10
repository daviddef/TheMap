#!/usr/bin/env python3
"""THE ONE PLACE A PLACE'S NAMES, BY DATE, ARE KEPT: Salisbury until 1982, Harare after.

A register is searched under the name the clerk used, and the clerk used the name of his time: Fiume, not Rijeka;
Salisbury, not Harare; Léopoldville, not Kinshasa. Each family archive was patching this with its own note, so the next
session searched Harare for a 1954 baptism. This catalogue holds, for a place the Atlas knows, every name it has been
known by, when, in which language and under which regime, with the page that says so. A name is a DATED claim, never a
bare alias; an undated «also called» stays in the place's `names` in places.json.

    data/place-names.json         the catalogue (the only thing anyone writes)
    scripts/place_names.py        this tool

    python3 scripts/place_names.py at Harare 1954              # what was it called then, and what to search
    python3 scripts/place_names.py terms Harare                # every name, for a search or a nil
    python3 scripts/place_names.py cover Harare --tried "Harare, Salisbury"
    python3 scripts/place_names.py add --place harare Salisbury --from 1890 --to 1982 --lang en --kind colonial \\
        --source "Salisbury (Wikipedia)|https://en.wikipedia.org/wiki/Harare"
    python3 scripts/place_names.py check
    python3 scripts/place_names.py publish

WHAT IT REFUSES. A name with no source (https, with a title); a period that runs backwards; a name that is the place's
current Atlas name; a place id the Atlas does not hold; a person. `status` is `attested` when a source dates the name,
`lead` when a source gives the name but not the dates (search it, but do not date a record by it).
Typography (case, spaces, hyphens, apostrophes) is never a different name; an accent is.
"""
import argparse, datetime, json, os, re, sys, tempfile, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import surname_variants as sv  # noqa: E402   (the shared clone-and-publish plumbing and the typography key)

CAT = os.path.join(ROOT, "data", "place-names.json")
CAT_REL = "data/place-names.json"
KINDS = {"official": "The name in official use then", "colonial": "Given under a colonial or imperial administration",
         "historic": "A name the place has since lost", "exonym": "How another language or country called it", "native": "The people's own name, whatever the state called it"}
STATUSES = {"attested": "A source dates this name.", "lead": "A source gives the name but not the dates: search it, never date a record by it."}


def load(path=None):
    with open(path or CAT, encoding="utf-8") as fh:
        return json.load(fh)


def save(cat, path=None):
    cat["places"].sort(key=lambda p: p["id"])
    for p in cat["places"]:
        p["names"].sort(key=lambda n: (n.get("from") if n.get("from") is not None else -9999, sv.form_key(n["name"])))
    cat["built"] = datetime.date.today().isoformat()
    cat["counts"] = {"places": len(cat["places"]), "names": sum(len(p["names"]) for p in cat["places"])}
    tmp = (path or CAT) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(cat, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, path or CAT)


def atlas_places():
    with open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8") as fh:
        return {p["id"]: p for p in json.load(fh)["places"]}


def validate(cat, places=None):
    errs, seen = [], set()
    for p in cat.get("places", []):
        pid = p.get("id")
        if pid in seen:
            errs.append(f"place-names: place {pid} appears twice")
        seen.add(pid)
        if places is not None and pid not in places:
            errs.append(f"place-names {pid}: not a place id in data/places.json")
        keys = set()
        cur = sv.form_key(p.get("name", ""))
        for n in p.get("names", []):
            w = f"place-names {pid}/{n.get('name')}"
            k = (sv.form_key(n.get("name", "")), n.get("from"))
            if not n.get("name"):
                errs.append(f"{w}: an empty name"); continue
            if k in keys:
                errs.append(f"{w}: listed twice for the same start year")
            keys.add(k)
            if sv.form_key(n["name"]) == cur:
                errs.append(f"{w}: is the place's current name; the catalogue holds the OTHER names")
            a, b = n.get("from"), n.get("to")
            for x in (a, b):
                if x is not None and not isinstance(x, int):
                    errs.append(f"{w}: from/to must be whole years or null")
            if isinstance(a, int) and isinstance(b, int) and a > b:
                errs.append(f"{w}: runs backwards ({a} to {b})")
            if n.get("kind") not in KINDS:
                errs.append(f"{w}: kind {n.get('kind')!r} is not one of {', '.join(KINDS)}")
            if n.get("status") not in STATUSES:
                errs.append(f"{w}: status {n.get('status')!r} is not one of {', '.join(STATUSES)}")
            if n.get("status") == "attested" and a is None and b is None:
                errs.append(f"{w}: `attested` means a source dates the name; it has no from or to")
            if n.get("lang") and not re.fullmatch(r"[a-z]{2,3}(-[A-Za-z]+)?", n["lang"]):
                errs.append(f"{w}: lang {n['lang']!r} is not a language code")
            srcs = n.get("sources") or []
            if not srcs:
                errs.append(f"{w}: no source. Say which page gives the name and its dates")
            for s in srcs:
                if not str(s.get("url", "")).startswith("https://") or not s.get("title"):
                    errs.append(f"{w}: a source needs an https url and a title")
    return errs


def name_at(entry, year):
    """The names in force in `year`: dated ones whose period holds it, then undated leads."""
    hit, lead = [], []
    for n in entry["names"]:
        a, b = n.get("from"), n.get("to")
        if a is None and b is None:
            lead.append(n)
        elif (a is None or a <= year) and (b is None or year <= b):
            hit.append(n)
    return hit, lead


def find(cat, query, places=None):
    k = sv.search_key(query)
    out = []
    for p in cat["places"]:
        if p["id"] == query or sv.search_key(p["name"]) == k or any(sv.search_key(n["name"]) == k for n in p["names"]):
            out.append(p)
    return out


def span(n):
    a, b = n.get("from"), n.get("to")
    return f"{a if a is not None else '…'}–{b if b is not None else '…'}"


def cmd_at(a):
    cat = load()
    hits = find(cat, a.place)
    if not hits:
        print(f"{a.place}: not in the catalogue. It may be a place whose name never changed; that is not established."); return
    for p in hits:
        names, lead = name_at(p, a.year)
        print(f"{p['name']} ({p['id']}, {p.get('country', '')}) in {a.year}:")
        print("  " + (" · ".join(f"{n['name']} ({span(n)}, {n['kind']})" for n in names) if names else "no dated name for that year; search the current name"))
        if lead:
            print("  leads: " + " · ".join(n["name"] for n in lead))


def cmd_terms(a):
    cat = load()
    hits = find(cat, a.name)
    if not hits:
        print(f"{a.name}: not in the catalogue. Search it as written."); return
    for p in hits:
        print(f"{p['name']} ({p['id']}, {p.get('country', '')}):")
        print(f"  {p['name']}   (current)")
        for n in p["names"]:
            print(f"  {n['name']}   {span(n)}  {n['kind']}{' ' + n['lang'] if n.get('lang') else ''}  [{n['status']}]")


def cmd_cover(a):
    cat = load()
    hits = find(cat, a.name)
    tried = {sv.form_key(x) for x in re.split(r"[,;|]", a.tried) if x.strip()}
    if not hits:
        print("not catalogued: nothing to cover"); return
    miss = [n["name"] for p in hits for n in p["names"] if n["status"] == "attested" and sv.form_key(n["name"]) not in tried]
    if miss:
        print("NOT COVERED — the catalogue holds these dated names for the place and you did not try them:\n  " + " · ".join(dict.fromkeys(miss)))
        sys.exit(1)
    print("covered: every dated name of the place was tried.")


def cmd_add(a):
    cat = load()
    places = atlas_places()
    p = next((x for x in cat["places"] if x["id"] == a.place), None)
    if not p:
        if a.place not in places:
            sys.exit(f"{a.place!r} is not a place id in data/places.json.")
        p = {"id": a.place, "name": places[a.place]["name"], "country": places[a.place]["country"], "names": []}
        cat["places"].append(p)
    title, _, url = a.source.partition("|")
    row = {"name": a.name, "lang": a.lang, "kind": a.kind, "from": a.from_, "to": a.to,
           "status": "attested" if (a.from_ is not None or a.to is not None) else "lead", "sources": [{"title": title.strip(), "url": url.strip()}]}
    if a.regime:
        row["regime"] = a.regime
    row["added"] = datetime.date.today().isoformat()   # when this name reached the catalogue: what's-new reads it. Never a person.
    row = {k: v for k, v in row.items() if v is not None}
    hit = next((n for n in p["names"] if sv.form_key(n["name"]) == sv.form_key(a.name) and n.get("from") == row.get("from")), None)
    if hit:
        if row["sources"][0] not in hit["sources"]:
            hit["sources"].append(row["sources"][0])
    else:
        p["names"].append(row)
    errs = validate(cat, places)
    if errs:
        sys.exit("not written:\n  " + "\n  ".join(errs[:8]))
    save(cat)
    print(f"{p['name']}: {a.name} {span(row)}. Written to {CAT_REL} (local); `publish` sends it to the atlas.")


def cmd_check(a):
    cat = load()
    errs = validate(cat, atlas_places())
    for e in errs[:40]:
        print("FAIL:", e)
    c = cat.get("counts") or {}
    print(f"{len(cat['places'])} places, {sum(len(p['names']) for p in cat['places'])} dated names")
    sys.exit(1 if errs else 0)


def merge(origin, local):
    out = json.loads(json.dumps(origin))
    by = {p["id"]: p for p in out["places"]}
    for lp in local["places"]:
        p = by.get(lp["id"])
        if not p:
            out["places"].append(json.loads(json.dumps(lp))); continue
        have = {(sv.form_key(n["name"]), n.get("from")): n for n in p["names"]}
        for n in lp["names"]:
            h = have.get((sv.form_key(n["name"]), n.get("from")))
            if not h:
                p["names"].append(json.loads(json.dumps(n)))
            else:
                h["sources"] += [s for s in n["sources"] if s not in h["sources"]]
    return out


def cmd_publish(a):
    local = load()
    errs = validate(local, atlas_places())
    if errs:
        sys.exit("the local catalogue does not pass:\n  " + "\n  ".join(errs[:10]))
    with tempfile.TemporaryDirectory() as tmp:
        clone = os.path.join(tmp, "clone")
        sv.sh(["git", "clone", "--quiet", "--depth", "1", sv.REPO_URL, clone])
        op = os.path.join(clone, CAT_REL)
        origin = load(op) if os.path.exists(op) else {"note": local["note"], "licence": local["licence"], "statuses": local.get("statuses"), "kinds": local.get("kinds"), "places": []}
        merged = merge(origin, local)
        errs = validate(merged, atlas_places())
        if errs:
            sys.exit("the merged catalogue does not pass:\n  " + "\n  ".join(errs[:10]))
        save(merged, op)
        if sv.sh(["git", "diff", "--quiet", "--", CAT_REL], cwd=clone, check=False).returncode == 0 and os.path.exists(op) and sv.sh(["git", "ls-files", "--", CAT_REL], cwd=clone).stdout.strip():
            print("nothing to publish."); return
        if a.dry_run:
            print("--dry-run: nothing pushed."); return
        sv.sh(["git", "add", CAT_REL], cwd=clone)
        sv.sh(["git", "commit", "--quiet", "-m", f"Place names by date: {sum(len(p['names']) for p in merged['places'])} names for {len(merged['places'])} places\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"], cwd=clone)
        for _ in range(4):
            p = sv.sh(["git", "push", "--quiet", "origin", "HEAD:main"], cwd=clone, check=False)
            if p.returncode == 0:
                break
            sv.sh(["git", "pull", "--quiet", "--rebase"], cwd=clone)
        else:
            sys.exit("could not push:\n" + p.stderr)
    save(merge(load(), merged))
    print("published to main. It is on the map after the next deploy, not before.")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("at"); p.add_argument("place"); p.add_argument("year", type=int); p.set_defaults(fn=cmd_at)
    p = sub.add_parser("terms"); p.add_argument("name"); p.set_defaults(fn=cmd_terms)
    p = sub.add_parser("cover"); p.add_argument("name"); p.add_argument("--tried", required=True); p.set_defaults(fn=cmd_cover)
    p = sub.add_parser("add"); p.add_argument("name"); p.add_argument("--place", required=True, help="Atlas place id")
    p.add_argument("--from", dest="from_", type=int); p.add_argument("--to", type=int); p.add_argument("--lang")
    p.add_argument("--kind", required=True, choices=list(KINDS)); p.add_argument("--regime")
    p.add_argument("--source", required=True, help="Title|https://url"); p.set_defaults(fn=cmd_add)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    p = sub.add_parser("publish"); p.add_argument("--dry-run", action="store_true"); p.set_defaults(fn=cmd_publish)
    a = ap.parse_args(); a.fn(a)


if __name__ == "__main__":
    main()

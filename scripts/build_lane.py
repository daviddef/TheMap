#!/usr/bin/env python3
"""Which build a push needs: nothing, only the tests, the static pages, or everything.

The production deploy (.github/workflows/deploy-r2.yml) used to rebuild all 56,000 generated pages on every push, including a push that
changed one sentence on one static page. This reads the files a push changed and picks the smallest build that is still correct:

    none     nothing the site is made of changed (docs, the workflow files that are not this deploy, notes)
    check    only tests or the Workers changed: run the tests and the data checks, publish nothing
    static   only things the place, surname and name pages cannot show changed: a static page, a script or stylesheet served as it is, the
             research marks the What's new page reads. Build the static pages (RA_SHARD=none) and publish that one part.
    full     anything else, or anything this cannot be sure of: every slice, as before

THE RULE THAT KEEPS IT HONEST: when in doubt, full. "Static" is granted only to a file that is provably out of reach of the three generated
page templates, found by following every import from them (components, layouts, lib, data files). A file the follower cannot resolve, a
dynamic import it cannot read, or a path it has never heard of, makes the answer full. A wrong "full" costs time; a wrong "static" would
publish place pages that disagree with their template.

    python3 scripts/build_lane.py --base <last published sha> --head <sha> [--github-output FILE]
    python3 scripts/build_lane.py --files changes.txt          # lines of "M<TAB>path", as `git diff --name-status` writes them
"""
import argparse, glob, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RANK = {"none": 0, "check": 1, "static": 2, "full": 3}

# The three families the slices build. A page file under these directories, or anything they import, is "generated-affecting".
GENERATED_DIRS = ("site/src/pages/place/", "site/src/pages/surname/", "site/src/pages/name/")

# Served exactly as written; the build never reads them (checked: nothing in site/src reads site/public/js, css or images).
ASSET_EXT = {".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".avif", ".woff", ".woff2", ".ttf", ".txt", ".webmanifest", ".map"}
# the research marks: What's new (a static page) builds its "In the Atlas" news from research-sessions.json
RESEARCH = ("site/public/research-receipts/", "site/public/research-sessions.json")

EXTS = ("", ".js", ".mjs", ".ts", ".astro", ".json", ".css")
RE_FROM = re.compile(r"""(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]""")
RE_SIDE = re.compile(r"""(?m)^\s*import\s*['"]([^'"]+)['"]""")
RE_DYN = re.compile(r"""\bimport\(\s*(['"`])([^'"`]*)\1\s*\)""")
RE_DYN_ANY = re.compile(r"""\bimport\(\s*(?!['"])""")
RE_URL = re.compile(r"""new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url""")
RE_GLOB = re.compile(r"""(?:import\.meta\.glob|Astro\.glob)\(\s*(\[[^\]]*\]|['"][^'"]+['"])""")
RE_CSS_IMPORT = re.compile(r"""@import\s+(?:url\()?['"]([^'"]+)['"]""")


def read(path):
    try:
        with open(os.path.join(ROOT, path), encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def resolve(frm, spec):
    """A relative specifier from a repo-relative file to a repo-relative file, or None when there is no such file."""
    base = os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    for e in EXTS:
        p = base + e
        if os.path.isfile(os.path.join(ROOT, p)):
            return p.replace(os.sep, "/")
    if os.path.isdir(os.path.join(ROOT, base)):
        for e in EXTS[1:]:
            p = os.path.join(base, "index" + e)
            if os.path.isfile(os.path.join(ROOT, p)):
                return p.replace(os.sep, "/")
    return None


def reachable(roots):
    """(set of repo-relative files the roots import, transitively; list of reasons the walk could not be sure)."""
    seen, doubt, stack = set(), [], list(roots)
    while stack:
        f = stack.pop()
        if f in seen:
            continue
        seen.add(f)
        text = read(f)
        if text is None:
            continue
        if f.endswith((".json", ".png", ".svg")):
            continue
        text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)      # a comment that mentions import() is not an import
        text = re.sub(r"(?m)^\s*//.*$", " ", text)
        specs = set(RE_FROM.findall(text)) | set(RE_SIDE.findall(text)) | {m[1] for m in RE_DYN.findall(text)} | set(RE_URL.findall(text))
        if f.endswith(".css"):
            specs |= set(RE_CSS_IMPORT.findall(text))
        if RE_DYN_ANY.search(text):
            doubt.append(f"{f} has an import() whose target is computed")
        for g in RE_GLOB.findall(text):
            pats = re.findall(r"""['"]([^'"]+)['"]""", g)
            for pat in pats:
                if not pat.startswith("."):
                    doubt.append(f"{f} globs {pat}")
                    continue
                for hit in glob.glob(os.path.join(ROOT, os.path.dirname(f), pat), recursive=True):
                    rel = os.path.relpath(hit, ROOT).replace(os.sep, "/")
                    if rel not in seen:
                        stack.append(rel)
        for s in specs:
            if s.startswith("."):
                t = resolve(f, s)
                if t is None:
                    want = os.path.normpath(os.path.join(os.path.dirname(f), s)).replace(os.sep, "/")
                    if want.startswith("site/public/") or want.startswith("data/") or ignored(want):
                        seen.add(want)   # written by the data step (gitignored), so not in a checkout; a change to the data step's inputs is already "full"
                    else:
                        doubt.append(f"{f} imports {s}, which is not a file here")
                elif t not in seen:
                    stack.append(t)
            # a bare name is a package (node_modules), not ours; an absolute or aliased path is not used in this repo
            elif s.startswith("/") or s.startswith("~") or s.startswith("@/"):
                doubt.append(f"{f} imports {s}, an absolute path or an alias")
    return seen, doubt


def ignored(path):
    """True when git ignores the path: a file the data step writes, so it is not in a checkout."""
    return subprocess.run(["git", "check-ignore", "-q", path], cwd=ROOT).returncode == 0


def generated_roots():
    roots = []
    for d in GENERATED_DIRS:
        for dp, _, fs in os.walk(os.path.join(ROOT, d)):
            for f in fs:
                roots.append(os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, "/"))
    return roots


def classify_path(p, G, doubt):
    """(lane, why) for one changed path. G is what the generated page templates reach."""
    if p == ".github/workflows/deploy-r2.yml":
        return "full", "the deploy workflow itself changed: prove it with a real build"
    if p.startswith(".github/") or p.startswith("docs/") or p.startswith(".claude/") or p.endswith(".md") or p in ("LICENSE", ".gitignore", "CNAME"):
        return "none", "documentation or repository housekeeping"
    if p == "record-atlas-research-import.json":
        return "none", "the research import record: its public copy (site/public/research-sessions.json) changes with it"
    if p.startswith("site/test/") or p.startswith("workers/") or p.startswith("scripts/test-"):
        return "check", "tests or a Worker: nothing the site is built from"
    if p.startswith(RESEARCH):
        if p in G:
            return "full", "a generated page template reads it"
        return "static", "research marks: only the What's new page reads them at build time"
    if p.startswith("site/public/"):
        ext = os.path.splitext(p)[1].lower()
        if ext in ASSET_EXT:
            return "static", "a file served as written, never read by the build"
        return "full", "a data file in site/public: the build may read it into any page"
    if p.startswith(GENERATED_DIRS):
        return "full", "a generated page template"
    if p.startswith("site/src/"):
        if doubt:
            return "full", "the import walk could not be sure (" + doubt[0] + ")"
        if p in G:
            return "full", "a generated page template imports it"
        return "static", "no place, surname or name page imports it"
    # site/package.json, astro.config, data/**, scripts/**, anything not named above
    return "full", "inputs of the data step or the build itself, or a path this does not know"


def lane_for(changes, G=None, doubt=None):
    """changes: [(status, path)]. Returns (lane, [(lane, path, why)])."""
    if G is None:
        G, doubt = reachable(generated_roots())
    doubt = doubt or []
    rows, best = [], "none"
    for st, p in changes:
        ln, why = classify_path(p, G, doubt)
        rows.append((ln, p, why))
        if RANK[ln] > RANK[best]:
            best = ln
    return best, rows


def git_changes(base, head):
    out = subprocess.run(["git", "diff", "--no-renames", "--name-status", f"{base}..{head}"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [tuple(l.split("\t", 1)) for l in out.splitlines() if "\t" in l]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base"); ap.add_argument("--head", default="HEAD"); ap.add_argument("--files")
    ap.add_argument("--github-output")
    a = ap.parse_args()
    if a.files:
        changes = [tuple(l.rstrip("\n").split("\t", 1)) for l in open(a.files, encoding="utf-8") if "\t" in l]
    elif a.base:
        changes = git_changes(a.base, a.head)
    else:
        ap.error("give --base or --files")
    lane, rows = lane_for(changes)
    lines = [f"lane: {lane}", f"{len(changes)} changed files"]
    seen = set()
    for ln, p, why in sorted(rows, key=lambda r: -RANK[r[0]]):
        if (ln, why) in seen and len(rows) > 30:
            continue
        seen.add((ln, why))
        lines.append(f"  {ln:6} {p}  ({why})")
    print("\n".join(lines[:80]))
    if a.github_output:
        with open(a.github_output, "a") as f:
            f.write(f"lane={lane}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

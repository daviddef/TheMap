#!/usr/bin/env python3
"""Publish what the family archives have searched, so /my-research/ shows it without anyone importing a file.

WHY THIS EXISTS. David, on the Blažević session: «why are some sessions struggling to get to the
atlas and asking me to manually import?» There were two reasons, and neither was the atlas.

  1. THE INSTRUCTIONS WERE OUT OF DATE. The feedback skill still said progress «lives in localStorage
     and no script can write it, so produce an import file and open /my-research/ → Import a file».
     That stopped being true on 13 October: /my-research/ now fetches site/public/research-sessions.json
     and folds it into the reader's browser by itself, once per published update. A session that has
     added rows to searched.json has nothing to import. It has something to PUBLISH.

  2. PUBLISHING NEEDED THE SHARED CHECKOUT TO BE CLEAN, and it never is. The file is committed to
     Record Atlas, there is one working tree, and the skill (correctly) forbids committing when
     another session has uncommitted edits there. So the Blažević session regenerated a file, saw
     the Atlas session's changes, declined to commit, and handed the file to David. Correct
     behaviour, wrong outcome.

THIS SCRIPT REMOVES THE COLLISION INSTEAD OF WORKING AROUND IT. It regenerates the file from all
the archives' searched.json files, then commits and pushes ONLY the two published files from a
fresh temporary clone of origin. The shared working tree is never touched, so it does not matter
what anybody else has half-edited there, and nothing of theirs can be swept into the commit.

    python3 scripts/publish-research-sessions.py            # regenerate, publish if anything changed
    python3 scripts/publish-research-sessions.py --dry-run  # say what would change, publish nothing

ROW RECEIPTS (12 Nov 2026). The same commit also carries site/public/research-receipts/<archive>.json, one per archive, which the importer
writes beside the marks: for each of the archive's search rows (named by a 12-character hash of the row), the marks it made and the Atlas
page for each. The archives' /whats-new/ pages read them to say «In the Atlas» under a row. The commit is made from the same fresh clone, so
a row and its receipt cannot be published apart. `--dry-run` reports the receipt counts too. The importer's `--selftest` checks the row key.

THE SITE IS LIVE AFTER THE NEXT DEPLOY (CI queues, so roughly one to two hours). The reader's
browser picks the update up the next time /my-research/ is opened.
"""
import json, os, shutil, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
RECORD = "record-atlas-research-import.json"
PUBLIC = "site/public/research-sessions.json"
RECEIPTS = "site/public/research-receipts"   # one <archive>.json per archive: which search rows reached the Atlas (see the importer's docstring)
DRY = "--dry-run" in sys.argv
# An unknown flag must never fall through to a real publish: on 8 Nov 2026 `--help` published to main because only --dry-run was read.
if any(a.startswith("-") and a != "--dry-run" for a in sys.argv[1:]):
    print(__doc__ or "usage: publish-research-sessions.py [--dry-run]")
    print("Only --dry-run is understood. Nothing was done.")
    sys.exit(0 if any(a in ("-h", "--help") for a in sys.argv[1:]) else 2)


def run(cmd, cwd=None, check=True):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"{' '.join(cmd)}\n{r.stdout}{r.stderr}")
    return r


def same(a, b):
    """Equal apart from the day it was exported, which changes every run and means nothing."""
    a, b = dict(a), dict(b)
    a.pop("exported", None)
    b.pop("exported", None)
    return a == b


def main():
    tmp = tempfile.mkdtemp(prefix="publish-research-")
    try:
        # 0. Work from a FRESH CLONE of origin, never from this folder's own files. On 8 Nov 2026 the shared Atlas folder was on an old
        #    branch, 377 commits behind main: its provider list and scripts were stale, so a publish run from it would have silently
        #    dropped 16 source marks for providers it did not know. The importer, the providers and the volume index now all come from
        #    origin's main; only the family archives (siblings of this folder) and the large world volume file (a release asset, not in git)
        #    are read from here.
        url = run(["git", "remote", "get-url", "origin"]).stdout.strip()
        clone = os.path.join(tmp, "clone")
        run(["git", "clone", "--quiet", "--depth", "1", url, clone])
        world = os.path.join(ROOT, "data", "fs-volumes-world.json.gz")
        if os.path.exists(world):
            os.symlink(world, os.path.join(clone, "data", "fs-volumes-world.json.gz"))
        # 1. Regenerate. The importer reads the previous output for each line's «made» date, so
        #    seed the temp file with origin's committed one and let it overwrite.
        out = os.path.join(tmp, RECORD)
        if os.path.exists(os.path.join(clone, RECORD)):
            shutil.copy(os.path.join(clone, RECORD), out)
        env = dict(os.environ, ARCHIVES_DIR=os.path.dirname(ROOT))
        rcp_tmp = os.path.join(tmp, "receipts")
        r = subprocess.run([sys.executable, "scripts/import-research-sessions.py", "--out", out, "--receipts", rcp_tmp], cwd=clone, env=env, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip() or "the importer failed")
        print("\n".join(l for l in r.stdout.splitlines()
                        if any(k in l for k in ("rows read", "volume marks", "source marks", "film marks", "research lines", "archive copy", "receipt "))))
        new = json.load(open(out, encoding="utf-8"))

        # 2. Compare with what origin has, not with the working tree, which may be behind.
        pub = os.path.join(clone, PUBLIC)
        try:
            old = json.load(open(pub, encoding="utf-8"))
        except OSError:
            old = {}
        # The receipts are compared the same way: a row edited in an archive changes its key, so the receipts can change while the marks do not.
        new_rcp = {f: json.load(open(os.path.join(rcp_tmp, f), encoding="utf-8")) for f in sorted(os.listdir(rcp_tmp))} if os.path.isdir(rcp_tmp) else {}
        old_rcp = {}
        for f in new_rcp:
            try:
                old_rcp[f] = json.load(open(os.path.join(clone, RECEIPTS, f), encoding="utf-8"))
            except OSError:
                pass
        rcp_same = set(new_rcp) == set(old_rcp) and all(same(old_rcp[f], new_rcp[f]) for f in new_rcp)
        if old and same(old, new) and rcp_same:
            print("Already current: origin carries exactly what the archives hold. Nothing to publish.")
            return
        o, n = set((old.get("marks") or {})), set(new.get("marks") or {})
        print(f"Origin has {len(o):,} marks; the archives now give {len(n):,} "
              f"(+{len(n - o):,} new, -{len(o - n):,} gone).")
        n_rows = sum(len(v["rows"]) for v in new_rcp.values())
        print(f"Receipts: {len(new_rcp)} archives, {n_rows:,} rows"
              + ("" if not old_rcp else f"; origin has {sum(len(v['rows']) for v in old_rcp.values()):,}") + ("; unchanged." if rcp_same else "; changed."))
        if DRY:
            print("--dry-run: nothing written or pushed.")
            return

        # 3. Write the two files into the clone, in the shapes the repository already uses.
        with open(os.path.join(clone, RECORD), "w", encoding="utf-8") as fh:
            json.dump(new, fh, ensure_ascii=False, indent=1)
        with open(pub, "w", encoding="utf-8") as fh:
            json.dump(new, fh, ensure_ascii=False, separators=(",", ":"))
        os.makedirs(os.path.join(clone, RECEIPTS), exist_ok=True)
        for f in new_rcp:
            shutil.copy(os.path.join(rcp_tmp, f), os.path.join(clone, RECEIPTS, f))
        run(["git", "add", RECORD, PUBLIC, RECEIPTS], cwd=clone)
        msg = (f"Research sessions: {len(n):,} marks across {len(new.get('lines') or {})} families, "
               f"published from the family archives ({time.strftime('%Y-%m-%d')})")
        run(["git", "commit", "--quiet", "-m", msg], cwd=clone)

        # 4. Push, rebasing over whatever landed meanwhile. Only these two files are in the commit.
        for attempt in range(4):
            p = run(["git", "push", "--quiet"], cwd=clone, check=False)
            if p.returncode == 0:
                print("Published. Live after the next deploy; /my-research/ folds it in the next time it is opened.")
                return
            run(["git", "pull", "--quiet", "--rebase"], cwd=clone)
        sys.exit("could not push after four attempts:\n" + p.stderr)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()

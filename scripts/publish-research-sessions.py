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

THE SITE IS LIVE AFTER THE NEXT DEPLOY (CI queues, so roughly one to two hours). The reader's
browser picks the update up the next time /my-research/ is opened.
"""
import json, os, shutil, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
RECORD = "record-atlas-research-import.json"
PUBLIC = "site/public/research-sessions.json"
DRY = "--dry-run" in sys.argv


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
        # 1. Regenerate. The importer reads the previous output for each line's «made» date, so
        #    seed the temp file with the committed one and let it overwrite.
        out = os.path.join(tmp, RECORD)
        if os.path.exists(RECORD):
            shutil.copy(RECORD, out)
        r = run([sys.executable, "scripts/import-research-sessions.py", "--out", out])
        print("\n".join(l for l in r.stdout.splitlines()
                        if any(k in l for k in ("rows read", "volume marks", "source marks", "film marks", "research lines"))))
        new = json.load(open(out, encoding="utf-8"))

        # 2. Compare with what origin has, not with the working tree, which may be behind.
        url = run(["git", "remote", "get-url", "origin"]).stdout.strip()
        clone = os.path.join(tmp, "clone")
        run(["git", "clone", "--quiet", "--depth", "1", url, clone])
        pub = os.path.join(clone, PUBLIC)
        try:
            old = json.load(open(pub, encoding="utf-8"))
        except OSError:
            old = {}
        if old and same(old, new):
            print("Already current: origin carries exactly what the archives hold. Nothing to publish.")
            return
        o, n = set((old.get("marks") or {})), set(new.get("marks") or {})
        print(f"Origin has {len(o):,} marks; the archives now give {len(n):,} "
              f"(+{len(n - o):,} new, -{len(o - n):,} gone).")
        if DRY:
            print("--dry-run: nothing written or pushed.")
            return

        # 3. Write the two files into the clone, in the shapes the repository already uses.
        with open(os.path.join(clone, RECORD), "w", encoding="utf-8") as fh:
            json.dump(new, fh, ensure_ascii=False, indent=1)
        with open(pub, "w", encoding="utf-8") as fh:
            json.dump(new, fh, ensure_ascii=False, separators=(",", ":"))
        run(["git", "add", RECORD, PUBLIC], cwd=clone)
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

#!/usr/bin/env bash
# Take whatever the waypoint harvest has reached, and ship it.
#
# The harvest is a multi-day job. Leaving it uncommitted until it finishes
# would mean days of work living only in one laptop's /tmp and data/ — and
# the volumes are useful the moment they land, not only when the last
# collection is walked. So this runs on a timer: match, build, and push, but
# ONLY when the harvest has actually moved since last time. A commit that
# says nothing changed is noise in a changelog people read.
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP=".harvest-published"
now=$(python3 -c "
import json
d=json.load(open('data/fs-waypoints.json'))
print(sum(len(v['volumes']) for v in d['byCollection'].values()), len(d['done']))
")
vols=${now%% *}; done_n=${now##* }
was=$(cat "$STAMP" 2>/dev/null || echo "0 0")
was_v=${was%% *}

# Under a thousand new books is not worth a rebuild of 11,306 pages.
if [ "$((vols - was_v))" -lt 1000 ]; then
  echo "$(date +%H:%M) only $((vols - was_v)) new volumes since last publish — skipping"
  exit 0
fi

echo "$(date +%H:%M) publishing: $vols volumes, $done_n collections walked"
python3 scripts/match-fs-volumes.py | tail -6
( cd site && npm run build >/tmp/publish-build.log 2>&1 ) || {
  echo "BUILD FAILED — not pushing. See /tmp/publish-build.log"; tail -20 /tmp/publish-build.log; exit 1; }

printf '%s\n' "$now" > "$STAMP"
git add -A
git commit -q -m "Harvest: $vols volumes from $done_n collections walked

An intermittent publish while the waypoint harvest runs. The volumes are
useful as they land rather than only when the last collection is done, and
days of work should not sit uncommitted on one machine.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || { echo "nothing to commit"; exit 0; }
git push -q origin main
echo "$(date +%H:%M) pushed"

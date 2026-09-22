#!/bin/bash
# Commits and pushes harvest data on a fixed cadence.
# Written after twelve hours of work sat unpushed because the previous
# loop died silently and nothing noticed. This one records every cycle,
# and it tests the push itself rather than the tail of a pipe.
cd "$(dirname "$0")/.." || exit 1
LOG="$(dirname "$0")/../.publish-loop.log"
while true; do
  sleep "${1:-1800}"
  changed=$(git status --porcelain -- data/ | wc -l | tr -d ' ')
  if [ "$changed" -gt 0 ]; then
    # The counts live under byPlace. Iterating the top level counted the
    # file's own metadata keys instead and printed "?" into every commit
    # message this loop has ever written.
    n=$(python3 -c "
import gzip,json
try:
  d=json.load(gzip.open('data/fs-volumes-world.json.gz'))
  bp=d.get('byPlace',{})
  print(f'{sum(len(v) for v in bp.values()):,} volumes on {len(bp):,} places')
except Exception: print('an unknown number of volumes')
" 2>/dev/null)
    # STAGE THE HARVEST, NOT WHATEVER ELSE IS IN data/.
    # `git add -A data/` swept up everything in the directory, including
    # work in progress. On 22 September it committed and pushed a scratch
    # scan file and a 5.4 MB surname corpus that had been deliberately held
    # back pending a size check — the held-back file reached main within
    # eleven minutes of being written, from a loop nobody was watching.
    # An unattended committer must stage what it is FOR, by name.
    git add -A data/fs-volumes.json data/fs-volumes-promote.json \
              data/fs-volumes-unplaced.json data/fs-volumes-world.json.gz \
              data/admin-divisions.json data/admin-undrawn.json \
              data/exonyms.json 2>/dev/null
    # Nothing of ours changed? Then there is nothing to publish, even if
    # the working tree is busy with somebody else's edits.
    git diff --cached --quiet && { \
      echo "$(date '+%F %T')  harvest unchanged (other edits pending)" >> "$LOG"; \
      continue; }
    # The count already reads «N volumes on M places», so the old template's
    # trailing «volumes placed» produced «2,840,841 on 15,816 places volumes
    # placed» on every commit this loop has written.
    git commit -q -m "Harvest: $n placed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" 2>/dev/null
    if git push -q origin main 2>/dev/null; then
      echo "$(date '+%F %T')  pushed  $n volumes  ($changed files)" >> "$LOG"
    else
      echo "$(date '+%F %T')  PUSH FAILED  — $changed files still local" >> "$LOG"
    fi
  else
    echo "$(date '+%F %T')  nothing to publish" >> "$LOG"
  fi
done

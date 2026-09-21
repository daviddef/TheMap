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
    n=$(python3 -c "
import gzip,json,sys
try:
  d=json.load(gzip.open('data/fs-volumes-world.json.gz'))
  print(sum(len(v) if isinstance(v,list) else len(v.get('books',[])) for v in d.values()))
except Exception: print('?')
" 2>/dev/null)
    git add -A data/
    git commit -q -m "Harvest: $n volumes placed so far

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

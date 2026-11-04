#!/usr/bin/env bash
# Where the published bytes are. Run by the deploy workflow just before the
# "artifact has to fit" gate, and runnable by hand against any built dist:
#
#     scripts/size-budget.sh site/dist
#
# It never fails: the gate is the workflow step after it. This only makes sure
# that whoever reads a red or yellow deploy sees WHICH directory grew.
#
# Two numbers matter, and neither is the 1 GB the Pages docs quote:
#   - raw bytes in dist/ against the 10 GB the artifact upload refuses (the
#     workflow fails at 9.6 GiB, which leaves room for tar headers);
#   - the compressed artifact, which GitHub does not cap in practice (deploys
#     have succeeded at 2.26 GB) but whose Pages processing time grows with it:
#     deploy-pages gave up at its 10-minute default twice on 4 November.
# See docs/deploy-size.md.
set -u
dist="${1:-site/dist}"
limit=10307921510                         # 9.6 GiB, the workflow's hard gate
warn=9126805504                           # 8.5 GiB

# du -sb is GNU; the python fallback lets this run on a Mac too.
sz() { du -sb "$1" 2>/dev/null | cut -f1 || true; }
if [ -z "$(sz "$dist")" ]; then
  sz() { python3 -c 'import os,sys
t=0
for r,_,fs in os.walk(sys.argv[1]):
    t+=sum(os.lstat(os.path.join(r,f)).st_size for f in fs)
print(t if os.path.isdir(sys.argv[1]) else os.path.getsize(sys.argv[1]))' "$1"; }
fi
bytes=$(sz "$dist")
files=$(find "$dist" -type f | wc -l | tr -d ' ')
mb() { awk -v b="$1" 'BEGIN{printf "%.0f", b/1048576}'; }
pct=$(awk -v b="$bytes" -v l="$limit" 'BEGIN{printf "%.0f", 100*b/l}')

out() { echo "$@"; [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$@" >> "$GITHUB_STEP_SUMMARY"; return 0; }

out "### Published size"
out ""
out "- raw: **$(mb "$bytes") MiB** in $files files — ${pct}% of the 9.6 GiB gate, $(mb $((limit-bytes))) MiB of headroom"
out "- estimated artifact: about $(awk -v b="$bytes" 'BEGIN{printf "%.2f", b/4.1/1e9}') GB compressed (raw / 4.1, the ratio measured on 4 November)"
out ""
out "| directory | MiB | files |"
out "|---|---:|---:|"
for d in "$dist"/*; do
  [ -e "$d" ] || continue
  s=$(sz "$d")
  n=$([ -d "$d" ] && find "$d" -type f | wc -l | tr -d ' ' || echo 1)
  printf '%s\t%s\t%s\n' "$s" "$(basename "$d")" "$n"
done | sort -rn | head -12 | while IFS=$'\t' read -r s name n; do out "| $name | $(mb "$s") | $n |"; done
out ""
out "Largest single files:"
out '```'
find "$dist" -type f -size +5M | while read -r p; do printf '%s\t%s\n' "$(sz "$p")" "$p"; done | sort -rn | head -8 \
  | while IFS=$'\t' read -r s p; do out "$(mb "$s") MiB  ${p#"$dist"/}"; done
out '```'

if [ "$bytes" -gt "$warn" ]; then
  echo "::warning::site/dist is ${pct}% of the 9.6 GiB gate. Read docs/deploy-size.md before adding more generated pages or data; the table above says which directory grew."
fi
exit 0

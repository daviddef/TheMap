#!/usr/bin/env bash
# Move Record Atlas from daviddef.github.io/TheMap to recordatlas.org.
#
# RUN THIS ONLY ONCE THE DNS RESOLVES. It checks first and refuses otherwise,
# because the two halves of this change are not independently safe: a CNAME
# file makes GitHub redirect the github.io address to the domain, and a base
# of "/" makes every asset path absolute. Ship either one before the domain
# answers and the live site is down until it does.
set -euo pipefail
cd "$(dirname "$0")/.."

GH_IPS="185.199.108.153 185.199.109.153 185.199.110.153 185.199.111.153"
got=$(dig +short recordatlas.org A | sort | tr '\n' ' ')
ok=0
for ip in $GH_IPS; do case " $got " in *" $ip "*) ok=$((ok+1));; esac; done
if [ "$ok" -lt 2 ]; then
  echo "recordatlas.org does not point at GitHub Pages yet."
  echo "  found: ${got:-nothing}"
  echo "  need:  $GH_IPS"
  echo "Nothing changed. Add the A records, wait for them to propagate, run again."
  exit 1
fi
echo "DNS looks right ($ok of 4 GitHub addresses). Switching."

printf 'recordatlas.org\n' > site/public/CNAME
python3 - <<'PY'
import re
p = "site/astro.config.mjs"
s = open(p).read()
s = s.replace("site: 'https://daviddef.github.io',", "site: 'https://recordatlas.org',")
s = re.sub(r"\n\s*base: '/TheMap',", "", s)
open(p, "w").write(s)
PY
grep -rln "daviddef.github.io/TheMap" site/src notes README.md 2>/dev/null \
  | xargs -r sed -i '' 's#https://daviddef.github.io/TheMap#https://recordatlas.org#g'

( cd site && npm run build )
echo
echo "Built. Check site/dist/index.html for absolute paths, then commit and push."
echo "Afterwards, in AdSense: add recordatlas.org under Sites."
echo "GitHub will issue the HTTPS certificate a few minutes after the first deploy;"
echo "tick Enforce HTTPS in the repository's Pages settings once it appears."

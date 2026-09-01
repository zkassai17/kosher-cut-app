#!/bin/bash
# Weekly Cedar circular refresh — runs on THIS Mac (a residential IP Cedar allows;
# GitHub's servers are Cloudflare-blocked). Reads the current circular, auto-
# extracts the deals into cedar-cache.json, and pushes ONLY that file. CI's daily
# run then folds it into the app feed. Path-limited + autostash, so it never
# disturbs whatever you're working on. Installed via launchd (see README below).
set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
REPO="$HOME/kosher-cut-app"
cd "$REPO" || exit 1
STAMP="$(date '+%Y-%m-%d %H:%M')"

# Refresh the cache from the live circular (writes scraper/cedar-cache.json).
( cd scraper && node -e "import('./cedar.mjs').then(m=>m.cedarWeeklyAd()).then(()=>process.exit(0)).catch(e=>{console.error(String(e));process.exit(1)})" ) \
  || { echo "$STAMP  cedar fetch failed (Cedar unreachable?) — will retry next run"; exit 0; }

# Nothing changed → the circular is the same week; done.
if git diff --quiet -- scraper/cedar-cache.json; then
  echo "$STAMP  cedar unchanged"
  exit 0
fi

# Commit ONLY the cache file, rebase onto anything new, and push.
git add scraper/cedar-cache.json
git commit -m "chore(cedar): weekly circular auto-refresh ($STAMP)" >/dev/null 2>&1
git pull --rebase --autostash origin main >/dev/null 2>&1
if git push origin main >/dev/null 2>&1; then
  echo "$STAMP  cedar refreshed + pushed"
else
  echo "$STAMP  push failed — will retry next run"
fi

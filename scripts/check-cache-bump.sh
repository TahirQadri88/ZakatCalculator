#!/usr/bin/env bash
# Guards the release rule in CLAUDE.md §3: whenever index.html changes, both the
# service-worker cache name and the footer version badge must be bumped.
#
# Skipping the bump ships the change to a service worker that keeps serving the
# old cached markup — the fix reaches nobody, and it looks like it didn't work.
set -euo pipefail

BASE="${1:-HEAD~1}"

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "No base commit to compare against ($BASE) — skipping."
  exit 0
fi

if ! git diff --name-only "$BASE" HEAD | grep -qx 'index.html'; then
  echo "index.html unchanged — no cache bump required."
  exit 0
fi

sw_ver()     { git show "$1:sw.js"      2>/dev/null | grep -oE "zakat-calc-v[0-9]+"        | head -1; }
badge_ver()  { git show "$1:index.html" 2>/dev/null | grep -oE ">v[0-9]+</span>"           | head -1; }

OLD_SW=$(sw_ver "$BASE"); NEW_SW=$(sw_ver HEAD)
OLD_BADGE=$(badge_ver "$BASE"); NEW_BADGE=$(badge_ver HEAD)

fail=0

if [ "$OLD_SW" = "$NEW_SW" ]; then
  echo "FAIL: index.html changed but CACHE_NAME in sw.js is still $NEW_SW"
  echo "      Bump it (zakat-calc-vNN -> vNN+1) or the change won't reach users."
  fail=1
else
  echo "OK: cache name $OLD_SW -> $NEW_SW"
fi

if [ "$OLD_BADGE" = "$NEW_BADGE" ]; then
  echo "FAIL: index.html changed but the footer version badge is still $NEW_BADGE"
  fail=1
else
  echo "OK: version badge $OLD_BADGE -> $NEW_BADGE"
fi

exit $fail

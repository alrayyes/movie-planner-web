#!/usr/bin/env bash
# Lints CLAUDE.md and .claude/settings*.json with cclint.
#
# One file per call, never `cclint lint .`: its `ignore` config doesn't take
# effect, and an unscoped scan flags the vendored openspec skill files under
# .claude/ for a description-length rule this repository can't fix. Only
# cclint's own error-severity findings exit non-zero; warnings and notes print.
#
# Called by the pre-push hook and the CI lint job, so the two agree. Files can
# be passed as arguments (the test does); with none, it lints the tracked ones.
set -uo pipefail

cd "$(dirname "$0")/.."

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  mapfile -t files < <(git ls-files CLAUDE.md '.claude/settings*.json')
fi

status=0
for file in "${files[@]}"; do
  echo "cclint: $file"
  bunx cclint lint "$file" || status=1
done
exit "$status"

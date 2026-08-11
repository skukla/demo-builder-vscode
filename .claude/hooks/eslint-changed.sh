#!/usr/bin/env bash
# Stop hook — advisory eslint on changed TS/TSX files (fast inner-loop feedback).
#
# Scope: eslint only. tsc --noEmit and jest are intentionally NOT run here — tsc is
# whole-project (~10-30s) and would tax every turn; they live in the `gate` skill,
# run deliberately. This hook is advisory (always exits 0): it surfaces lint issues
# after a turn that changed .ts/.tsx, but never blocks stopping.
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$DIR" || exit 0

files=$( { git diff --name-only --diff-filter=ACMR; git diff --cached --name-only --diff-filter=ACMR; } 2>/dev/null \
  | grep -E '\.tsx?$' | sort -u )
[ -z "$files" ] && exit 0

echo "[eslint-changed] linting changed TS/TSX:"
echo "$files" | sed 's/^/  - /'
echo "$files" | xargs npx eslint
exit 0

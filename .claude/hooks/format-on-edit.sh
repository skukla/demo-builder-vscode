#!/usr/bin/env bash
# PostToolUse(Edit|Write) hook — auto-format the touched TS/TSX file.
#
# Scope: prettier --write + eslint --fix on the single edited file, only for
# .ts/.tsx under src/ or tests/. Advisory (always exits 0) — the Stop hook
# (eslint-changed.sh) remains the reporter for anything --fix can't repair.
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

file=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  "$DIR"/src/*.ts|"$DIR"/src/*.tsx|"$DIR"/tests/*.ts|"$DIR"/tests/*.tsx) ;;
  *) exit 0 ;;
esac

cd "$DIR" || exit 0
npx prettier --write "$file" >/dev/null 2>&1
npx eslint --fix "$file" >/dev/null 2>&1
exit 0

#!/usr/bin/env bash
# PostToolUse(Edit|Write) hook — auto-format the touched TS/TSX file.
#
# Scope: prettier --write + eslint --fix on the single edited file, only for
# .ts/.tsx under src/ or tests/. Advisory (always exits 0) — the Stop hook
# (eslint-changed.sh) remains the reporter for anything --fix can't repair.
#
# Prettier runs only on a file that was already prettier-formatted at HEAD, or
# is new to git. Most of src/ and tests/ never was (about 3,300 of 4,400 files
# on 2026-11-07), and one small edit to such a file rewrapped all of it: the
# data-installer engine grew from 382 to 513 lines and failed the god-file
# limit. The check reads HEAD because the edit has already landed when this
# runs. eslint --fix still runs on every file: eslint-config-prettier turns its
# layout rules off, so it fixes without rewrapping.
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

file=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  "$DIR"/src/*.ts|"$DIR"/src/*.tsx|"$DIR"/tests/*.ts|"$DIR"/tests/*.tsx) ;;
  *) exit 0 ;;
esac

cd "$DIR" || exit 0
rel="${file#"$DIR"/}"

# Formatted at HEAD, or not in HEAD at all: prettier may own its layout.
prettier_owns() {
  local before
  before=$(git show "HEAD:$rel" 2>/dev/null) || return 0
  printf '%s\n' "$before" | npx prettier --check --stdin-filepath "$rel" >/dev/null 2>&1
}

if prettier_owns; then
  npx prettier --write "$file" >/dev/null 2>&1
fi
npx eslint --fix "$file" >/dev/null 2>&1
exit 0

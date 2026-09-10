#!/bin/bash
# Proves 12-unquoted-glob.rule fires on globs meant for the TOOL and stays silent
# on globs meant for the SHELL.
#
# Written 2026-09-01, five weeks after the rule shipped. It had no harness at all,
# which `tests/hooks/rule-proofs.test.ts` caught on its first run — a blocking rule
# whose exact match shape nothing pinned. Its `--exclude-dir` case had already been
# found dead once (2026-08-13) for precisely that reason.
#
# Cases live in variables because the hook inspects the OUTER bash command; writing
# these literals on the command line would trip the rule under test.
cd "$(git rev-parse --show-toplevel)" || exit 1

run() {
  local cmd="$1" label="$2" expect="$3"
  local payload out code got verdict
  payload=$(CMD="$cmd" python3 -c 'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["CMD"]}}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1); code=$?
  got="pass"; [ "$code" -ne 0 ] && got="BLOCK"
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-52s expect=%-5s got=%-5s %s\n' "$label" "$expect" "$got" "$verdict"
}

# --- glob meant for the TOOL, left unquoted: must BLOCK ---
INCLUDE='grep -rn thing --include=*.css src/'
EXCLUDE='grep -rn thing --exclude=*.min.js src/'
# exclude-dir MUST be tried before exclude in the rule's alternation; getting that
# order wrong made this case silently pass (noted in the rule's own comments).
EXCLUDEDIR='grep -rn thing --exclude-dir=node_modules* src/'
NAME='find . -name *.test.ts'
INAME='find . -iname *.MD'
FPATH='find . -path */dist/*'

# --- correct, or out of scope: must PASS ---
Q_INCLUDE="grep -rn thing --include='*.css' src/"
Q_NAME="find . -name '*.test.ts'"
DQ_NAME='find . -name "*.test.ts"'
SHELL_GLOB='ls src/*.ts'
NO_GLOB='grep -rn thing --include=styles.css src/'

echo "=== glob passed to the TOOL, unquoted — zsh eats it before the tool runs ==="
run "$INCLUDE"    "--include=*.css"                            BLOCK
run "$EXCLUDE"    "--exclude=*.min.js"                         BLOCK
run "$EXCLUDEDIR" "--exclude-dir=node_modules* (alternation order)" BLOCK
run "$NAME"       "find -name *.test.ts"                       BLOCK
run "$INAME"      "find -iname *.MD"                           BLOCK
run "$FPATH"      "find -path */dist/*"                        BLOCK

echo
echo "=== quoted, or the shell expansion IS the point ==="
run "$Q_INCLUDE"  "--include='*.css' — single-quoted"          pass
run "$Q_NAME"     "-name '*.test.ts' — single-quoted"          pass
run "$DQ_NAME"    "-name \"*.test.ts\" — double-quoted"        pass
run "$SHELL_GLOB" "ls src/*.ts — expansion is the point"       pass
run "$NO_GLOB"    "--include=styles.css — no glob at all"      pass

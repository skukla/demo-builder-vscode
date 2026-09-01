#!/bin/bash
# Proves 16-unsplit-var.rule fires on the shapes that are always wrong in zsh and
# stays silent on the ones that are correct.
#
# Cases live in variables because the hook inspects the OUTER bash command —
# writing these literals on the command line would trip the rule under test. That
# is not hypothetical: the first attempt to create this file with a heredoc was
# blocked by the rule it was written to prove, which is the same loud, obvious
# false positive 12-unquoted-glob documents. Write the file, do not echo it.
cd "$(git rev-parse --show-toplevel)" || exit 1

run() {
  local cmd="$1" label="$2" expect="$3"
  local payload out code got verdict
  payload=$(CMD="$cmd" python3 -c 'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["CMD"]}}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1); code=$?
  got="pass"; [ "$code" -ne 0 ] && got="BLOCK"
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-54s expect=%-5s got=%-5s %s\n' "$label" "$expect" "$got" "$verdict"
}

# --- the recorded incidents: must BLOCK ---
ESLINT='FILES=$(cat list.txt)
npx eslint --fix $FILES'
GITRM='PATHS=$(git diff --name-only)
git rm $PATHS'
PRETTIER='F="$(ls)"
npx prettier --write $F'
RM='OLD=$(find . -name "*.tmp")
rm $OLD'

# --- correct forms, or out of scope: must PASS ---
QUOTED='SRC=$(pwd)
cp "$SRC" /tmp/x'
XARGS='FILES=$(cat list.txt)
xargs npx eslint --fix < list.txt'
COUNT='n=$(wc -l < f.txt)
[ "$n" -gt 0 ] && echo yes'
COUNT_BARE='n=$(wc -l < f.txt)
[ $n -gt 0 ] && echo yes'
LITERAL='npx eslint --fix src/one.ts src/two.ts'
ECHOVAR='MSG=$(date)
echo $MSG'
NOSUBST='FILES="a.ts b.ts"
npx eslint $FILES'

# --- the LOOP shape, missed until 2026-09-01 and the costliest of the four ---
# Six iterations each printed "removed 0", which read as "already done". Run
# correctly the same six removed 263 casts.
LOOP='for J in "a b" "c d"; do
npx eslint --fix $J
done'
LOOP_QUOTED='for J in "a b" "c d"; do
npx eslint --fix "$J"
done'
LOOP_ECHO='for J in a b; do
echo $J
done'

echo "=== must BLOCK (the shape that silently does nothing) ==="
run "$ESLINT"     "eslint --fix \$FILES"                        BLOCK
run "$GITRM"      "git rm \$PATHS"                              BLOCK
run "$PRETTIER"   "prettier --write \$F"                        BLOCK
run "$RM"         "rm \$OLD"                                    BLOCK
run "$LOOP"       "for J in ...; do tool \$J — the real incident" BLOCK

echo
echo "=== must PASS (correct, or out of scope) ==="
run "$QUOTED"     "cp \"\$SRC\" — quoted, one arg meant"        pass
run "$XARGS"      "xargs < file — the fix itself"               pass
run "$COUNT"      "[ \"\$n\" -gt 0 ] — quoted test"             pass
run "$COUNT_BARE" "[ \$n -gt 0 ] — bare, but not a file list"   pass
run "$LITERAL"    "literal paths, no variable at all"           pass
run "$ECHOVAR"    "echo \$MSG — not a file-taking tool"         pass
run "$NOSUBST"    "var not from \$(...) — out of scope"         pass
run "$LOOP_QUOTED" "loop var QUOTED — the correct form"         pass
run "$LOOP_ECHO"  "loop var to echo — not a file-taking tool"   pass

#!/bin/bash
# Proves 10-jest-pipe.rule blocks a jest run piped into a pager, and leaves
# everything else alone.
#
# The rule is the oldest hard stop here and shipped without a harness. What it
# guards is genuinely silent: piping jest into tail buffers the output, so the run
# looks HUNG rather than piped, and the reflex is to kill it and try again.
#
# Written 2026-09-08. Note the shape it must NOT match, which is the reason the
# pattern is anchored the way it is: `ps -Ao pid=,command= | grep jest` mentions
# jest at the END and starts nothing. A rule that fired on inspection commands
# would block the very command its own message recommends — the mistake rule 15
# actually made and had to fix.
#
# CASES LIVE IN VARIABLES, and this file is written with the Write tool rather than
# a shell heredoc. Both for the same reason: the hook inspects the outer Bash
# command, so a literal `jest … | tail` anywhere in the creating command trips the
# rule under test.
cd "$(git rev-parse --show-toplevel)" || exit 1

run() {
  local cmd="$1" label="$2" expect="$3"
  local payload out code got verdict
  payload=$(CMD="$cmd" python3 -c 'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["CMD"]},"session_id":"proof"}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1); code=$?
  got="pass"; [ "$code" -ne 0 ] && got="BLOCK"
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-54s expect=%-5s got=%-5s %s\n' "$label" "$expect" "$got" "$verdict"
}

# --- a jest run feeding a pager: must BLOCK ---
P_TAIL='npx jest --no-coverage | tail -20'
P_HEAD='npx jest --no-coverage | head -40'
P_GREP='npx jest --no-coverage | grep FAIL'
P_SPACED='npx jest src/thing |   tail -5'
P_BARE='jest --watchAll=false | tail'
P_PATH='./node_modules/.bin/jest --ci | grep -E "Tests:"'

# --- correct, or nothing to do with a jest run: must PASS ---
REDIRECT='npx jest --no-coverage > out.txt 2>&1'
PLAIN='npx jest --no-coverage'
MENTION='ps -Ao pid=,command= | grep jest'
OTHER_TOOL='cat notes.txt | grep jest'
NOT_JEST='ls src | tail -5'

echo "=== a jest run piped into a pager: buffered, and reads as hung ==="
run "$P_TAIL"   "jest | tail"                                  BLOCK
run "$P_HEAD"   "jest | head"                                  BLOCK
run "$P_GREP"   "jest | grep"                                  BLOCK
run "$P_SPACED" "jest |   tail (extra spacing)"                BLOCK
run "$P_BARE"   "bare jest, no npx"                            BLOCK
run "$P_PATH"   "node_modules/.bin/jest path form"             BLOCK

echo
echo "=== redirect, plain run, or jest merely MENTIONED ==="
run "$REDIRECT"   "jest > file 2>&1 — the correct form"        pass
run "$PLAIN"      "jest with no pipe at all"                   pass
run "$MENTION"    "ps | grep jest — inspection, starts nothing" pass
run "$OTHER_TOOL" "cat | grep jest — not a jest run"           pass
run "$NOT_JEST"   "ls | tail — no jest anywhere"               pass

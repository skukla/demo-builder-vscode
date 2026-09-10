#!/bin/bash
# Proves 13-piped-exit-code.rule fires on the shapes that are always wrong and
# stays silent on the ones that are correct.
#
# Cases live in variables because the hook inspects the OUTER bash command —
# writing these literals on the command line would trip the rule under test.
cd "$(git rev-parse --show-toplevel)" || exit 1

run() {
  local cmd="$1" label="$2" expect="$3"
  local payload out code got verdict
  payload=$(CMD="$cmd" python3 -c 'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["CMD"]}}))')
  out=$(printf '%s' "$payload" | bash .claude/hooks/router.sh 2>&1); code=$?
  got="pass"; [ "$code" -ne 0 ] && got="BLOCK"
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-46s expect=%-5s got=%-5s %s\n' "$label" "$expect" "$got" "$verdict"
}

WC_OR='ls | wc -l || echo none'
WC_AND='ls | wc -l && echo found'
HEAD_OR='cat f | head -3 || echo none'
TAIL_OR='cat f | tail -3 || echo none'
WC_PLAIN='ls | wc -l'
CAPTURED='n=$(ls | wc -l | tr -d " "); [ "$n" -gt 0 ] || echo none'
GREP_Q='printf x | grep -q x && echo yes'
GREP_L='ls | grep -l foo && echo yes'
# `grep -c` prints a count AND exits 1 when it is zero, so a fallback appends a
# SECOND value. Added 2026-09-01 after a verification script captured "0\n0",
# errored on all 80 comparisons, and printed a clean all-clear.
GREP_C_OR='grep -c foo file || echo none'
GREP_C_PIPE='n=$(git show r:f | grep -cE "pattern" || echo 0)'
GREP_C_AND='grep -c foo file && echo found'
GREP_C_LONG='grep --count foo file || echo none'
GREP_C_PLAIN='n=$(grep -c foo file)'

run "$WC_OR"    "pipe to wc, then ||"                  "BLOCK"
run "$WC_AND"   "pipe to wc, then &&"                  "BLOCK"
run "$HEAD_OR"  "pipe to head, then ||"                "BLOCK"
run "$TAIL_OR"  "pipe to tail, then ||"                "BLOCK"

# The exemption for grep was too broad by exactly one flag. This case previously
# expected `pass`, which encoded the bug; the reversal is deliberate.
run "$GREP_C_OR"    "grep -c then || — prints 0 AND exits 1"  "BLOCK"
run "$GREP_C_PIPE"  "the real incident: captured 0\\n0"        "BLOCK"
run "$GREP_C_AND"   "grep -c then &&"                          "BLOCK"
run "$GREP_C_LONG"  "grep --count then ||"                     "BLOCK"

run "$WC_PLAIN"     "pipe to wc with no branch"                "pass"
run "$CAPTURED"     "captured into a variable first"           "pass"
run "$GREP_Q"       "grep -q && — idiomatic, must not fire"    "pass"
run "$GREP_L"       "grep -l && — exit code means what it says" "pass"
run "$GREP_C_PLAIN" "grep -c with NO branch — the correct form" "pass"

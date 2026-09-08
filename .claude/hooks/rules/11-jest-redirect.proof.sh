#!/bin/bash
# Proves 11-jest-redirect.rule fires on the wrong order and stays silent otherwise.
# Cases live in a file because the hook inspects the OUTER bash command — writing
# these literals on the command line trips the very rules under test.
cd "$(git rev-parse --show-toplevel)" || exit 1

BAD_ORDER='2>&1 > out.txt'
GOOD_ORDER='> out.txt 2>&1'
PIPE_TAIL='| tail -5'
STDERR_DUP='2>&1 >&2'

# ISOLATE FROM RULE 15. These cases invoke jest, and `15-jest-concurrent` reads the
# LIVE process list unless DBV_JEST_PS names a snapshot. During a full `npm run gate`
# there ARE real jest workers running, so rule 15 blocked the cases below that expect
# to pass — reported four times as a "flake", once refusing a push on a green tree.
# It was never flaky: it is deterministic, and it fires exactly when the full suite
# runs this proof. An idle snapshot pins what rule 15 sees so this proof tests only
# the rule it is named after.
_IDLE_PS=$(mktemp)
printf '%s\n' "99999 /bin/zsh -l" > "$_IDLE_PS"
trap 'rm -f "$_IDLE_PS"' EXIT

run() {
  local cmd="$1" label="$2" expect="$3"
  local payload out code
  payload=$(CMD="$cmd" python3 -c 'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["CMD"]}}))')
  out=$(printf '%s' "$payload" | DBV_JEST_PS="$_IDLE_PS" bash .claude/hooks/router.sh 2>&1); code=$?
  local got="pass"; [ "$code" -ne 0 ] && got="BLOCK"
  local verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-40s expect=%-5s got=%-5s %s\n' "$label" "$expect" "$got" "$verdict"
}

run "npx jest --no-coverage $BAD_ORDER"   "wrong redirect order"      "BLOCK"
run "npx jest --no-coverage $GOOD_ORDER"  "correct redirect order"    "pass"
run "npx jest --no-coverage"              "no redirect at all"        "pass"
run "npx jest --no-coverage $STDERR_DUP"  "2>&1 >&2 (not a file)"     "pass"
run "npx jest --no-coverage $PIPE_TAIL"   "pipe rule still fires"     "BLOCK"
run "npm run lint $BAD_ORDER"             "same order, NOT jest"      "pass"

# Added after the rule blocked its own commit message.
run "git commit -m 'fixed the $BAD_ORDER thing in jest docs'" "commit MENTIONING it" "pass"

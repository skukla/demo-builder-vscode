#!/bin/bash
# Proves 15-jest-concurrent.rule blocks a second jest run only when one is really
# in flight, and recognises every spelling of "start jest".
#
# What it guards: two jest runs on one machine starve each other, and the result is
# not an error but a FLAKE — a wall-clock assertion missing its bound, a suite
# timing out. This repo has four logged occurrences of exactly that shape, one of
# which refused a push on a tree that was green.
#
# Written 2026-09-08. The rule already carries the scar this proof pins: its first
# cut matched `jest` as a word anywhere in the command and fired on
# `ps -Ao pid=,command= | grep jest`, an inspection command that starts nothing and
# is very close to the one its own message recommends. A peer session hit it within
# minutes. The MENTION cases below are that fix, held in place.
#
# The rule reads a process list, so it takes a test seam: DBV_JEST_PS names a file
# holding a snapshot in `pid command` form, used instead of live `ps`. Without that
# this proof would depend on whatever happens to be running.
#
# Written with the Write tool rather than a shell heredoc: a heredoc carrying these
# cases puts `npx jest` into a real Bash command, which is exactly what the rule
# under test watches for.
cd "$(git rev-parse --show-toplevel)" || exit 1

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# A jest that is genuinely running. The rule keys on the resolved binary path, so a
# snapshot line must carry node_modules/.bin/jest to count.
printf '%s\n' "99001 node /repo/node_modules/.bin/jest --ci --no-coverage" > "$TMP/live"
# A machine with nothing running.
printf '%s\n' "99002 /bin/zsh -l" > "$TMP/idle"
# Watch mode is deliberately excluded: it is a long-lived editor companion, not a
# competing run, so it must not block a one-shot suite.
printf '%s\n' "99003 node /repo/node_modules/.bin/jest --watch" > "$TMP/watch"

run() {
  local cmd="$1" snap="$2" label="$3" expect="$4"
  local payload out code got verdict
  payload=$(CMD="$cmd" python3 -c 'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["CMD"]},"session_id":"proof"}))')
  out=$(printf '%s' "$payload" | DBV_JEST_PS="$snap" bash .claude/hooks/router.sh 2>&1); code=$?
  got="pass"; [ "$code" -ne 0 ] && got="BLOCK"
  verdict="OK"; [ "$got" != "$expect" ] && verdict="*** WRONG ***"
  printf '%-56s expect=%-5s got=%-5s %s\n' "$label" "$expect" "$got" "$verdict"
}

# Every spelling of "this command starts jest".
NPX='npx jest --no-coverage'
BARE='jest --ci'
NPM_TEST='npm test'
NPM_RUN='npm run test:sop'
NODE_BIN='node --max-old-space-size=4096 node_modules/.bin/jest --ci'
ENV_PREFIX='TMPDIR=/tmp/x npx jest --no-coverage'
YARN='yarn jest --ci'
CHAINED='npm run lint && npx jest --no-coverage'

# Commands that MENTION jest without starting it.
MENTION_PS='ps -Ao pid=,command= | grep jest'
MENTION_GREP='grep -rn "jest" package.json'
UNRELATED='npm run lint'

echo "=== a run really is in flight: every way of starting a second one ==="
run "$NPX"        "$TMP/live" 'npx jest'                              BLOCK
run "$BARE"       "$TMP/live" 'bare jest'                             BLOCK
run "$NPM_TEST"   "$TMP/live" 'npm test (the wrapper)'                BLOCK
run "$NPM_RUN"    "$TMP/live" 'npm run test:sop'                      BLOCK
run "$NODE_BIN"   "$TMP/live" 'node … node_modules/.bin/jest'         BLOCK
run "$ENV_PREFIX" "$TMP/live" 'VAR=value prefix stripped first'       BLOCK
run "$YARN"       "$TMP/live" 'yarn jest'                             BLOCK
run "$CHAINED"    "$TMP/live" 'jest in the second half of a chain'    BLOCK

echo
echo "=== mentioning jest is not running jest ==="
run "$MENTION_PS"   "$TMP/live" 'ps | grep jest — the fixed false positive' pass
run "$MENTION_GREP" "$TMP/live" 'grep jest in a file'                 pass
run "$UNRELATED"    "$TMP/live" 'a command with no jest at all'       pass

echo
echo "=== nothing in flight, or nothing that competes ==="
run "$NPX" "$TMP/idle"  'npx jest with an idle machine'               pass
run "$NPX" "$TMP/watch" 'a --watch jest does not count as competing'  pass

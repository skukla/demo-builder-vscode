#!/usr/bin/env bash
# PreToolUse(Bash) hook — block piping jest output through tail/head/grep.
#
# Why: jest writes massive output (React act() warnings etc.); tail/head/grep
# buffer ALL of it until the process exits, so the run looks hung for minutes.
# Deterministic enforcement of the rule in tests/README.md / project memory.
#
# Contract: reads the tool-call JSON on stdin; exit 2 blocks the call and the
# stderr message is shown to Claude; exit 0 lets it proceed.

cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
[ -z "$cmd" ] && exit 0

if echo "$cmd" | grep -qE '(^|[[:space:]/])jest[[:space:]][^|;]*\|[[:space:]]*(tail|head|grep)([[:space:]]|$)'; then
  echo "Blocked: never pipe jest through tail/head/grep — output buffering makes the run look hung." >&2
  echo "Instead redirect to a file and read it: npx jest --no-coverage <pattern> > /tmp/jest-output.txt 2>&1" >&2
  exit 2
fi
exit 0

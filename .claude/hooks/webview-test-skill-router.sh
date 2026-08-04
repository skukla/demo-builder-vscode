#!/usr/bin/env bash
# PreToolUse(Write|Edit) hook — route webview-test edits to `webview-test-authoring`.
#
# Why: that skill fired ZERO times in 70,727 turns across four sessions while its
# trigger fired constantly (dream run 2026-07-31: 17 webview test files touched in
# one session, 10 hand-written Spectrum jest.mock preambles, plus the literal
# "unable to find role" failure its own description names as a trigger).
#
# The 2026-07-30 invoke-don't-transcribe convention cannot reach this: it only
# helps when something NAMES the skill, and nothing names this one at the moment
# you open a test file. Routing that depends on remembering to look is not routing.
#
# Fires AT MOST ONCE per session — a block on every webview test edit would be
# noise, and one landing is enough to load the skill for the rest of the session.
#
# Contract: reads the tool-call JSON on stdin; exit 2 blocks and shows stderr to
# Claude; exit 0 proceeds.

payload=$(cat)

read -r path session <<<"$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    o = json.load(sys.stdin)
except Exception:
    print("  "); raise SystemExit
print(o.get("tool_input", {}).get("file_path", "") or "-", o.get("session_id", "") or "nosession")
' 2>/dev/null)"

[ -z "$path" ] || [ "$path" = "-" ] && exit 0

# React/Spectrum webview tests only: a test under tests/**/ui/ (or a .testUtils
# beside one). Node-project tests and src files are none of this skill's business.
case "$path" in
    *"/tests/"*"/ui/"*.test.tsx|*"/tests/"*"/ui/"*.testUtils.tsx) ;;
    *"/tests/webview-ui/"*.test.tsx) ;;
    *) exit 0 ;;
esac

marker="${TMPDIR:-/tmp}/.dbv-webview-test-skill-${session}"
[ -f "$marker" ] && exit 0
touch "$marker" 2>/dev/null

cat >&2 <<'MSG'
Before writing/fixing a React+Spectrum webview test, invoke the `webview-test-authoring`
skill (Skill tool, skill: "webview-test-authoring"). It carries the traps this stack hits
that the docs do not: the Spectrum mock preamble, the fake-timer userEvent contract,
hoist-safe .testUtils extraction, querying div-role cards, and the mocked-vs-bundled-JSON
trap. Then retry this edit — this hook fires only once per session.
MSG
exit 2

#!/usr/bin/env bash
# PreToolUse dispatcher — one process, N rules.
#
# Five hooks had accumulated the same twelve lines of scaffolding: read the
# payload, parse it with python3, match a pattern, drop a session marker, print a
# message, exit 2. `reuse-first-router` and `webview-test-skill-router` were
# character-identical apart from a `case` pattern, a marker name and the message.
# Bash carried two separate entries, so every Bash call spawned two processes and
# parsed the same JSON twice.
#
# Rules now live in `rules/*.rule` and declare only what differs. Adding a guard
# is dropping a file — no settings.json edit, no extra process.
#
# Contract (unchanged): reads the tool-call JSON on stdin; exit 2 blocks the call
# and shows stderr to Claude; exit 0 proceeds.
#
# FAIL OPEN everywhere. This runs before every matched tool call, so a bug here
# reaches every guard at once — which is why `tests/hooks/router.test.ts` exists
# and why every unexpected condition exits 0.

payload=$(cat)
[ -z "$payload" ] && exit 0

# Cheap pre-filter. Nearly every tool call matches no rule, and python3 startup is
# ~55ms — worth avoiding when a substring test costs nothing. Every token below
# MUST appear in the payload of anything a rule can fire on; adding a rule that
# needs a new token means adding it here too.
case "$payload" in
    *jest*|*curl*|*wget*|*httpie*|*.tsx*|*mcp__*|*WebFetch*|*WebSearch*) ;;
    # 20-secret-files. `.env` admits the path guard; the rest are NECESSARY
    # substrings of each content pattern the rule can block on.
    *.env*|*"PRIVATE KEY"*|*ghp_*|*ghs_*|*github_pat_*|*AKIA*|*xox*|*mongodb*) ;;
    # `npm test` / `npm run test:*` start jest without the string "jest" anywhere
    # in the command, so 15-jest-concurrent would never see them. Matched on the
    # two-word literal rather than a bare *test* — that would drag in every path
    # with "test" in it, which is most of this repo.
    *"npm test"*|*"npm run test"*) ;;
    # 14-commit-backtick. NECESSARY condition for that rule: it only fires on a
    # git commit. Without this token the rule would never run and would look
    # exactly like a guard that simply never matches — the failure this
    # pre-filter has already caused once (see the --exclude note below).
    *"git commit"*) ;;
    # 12-unquoted-glob. Each of these is a NECESSARY condition for that rule to
    # fire, so the gate cannot hide a real hit. Kept as the specific flag spellings
    # rather than a bare `*"*"*` (an asterisk appears in most payloads) — this stays
    # cheap while still admitting everything the rule can match.
    # `--exclude` without the `=` on purpose: `--exclude-dir=` does NOT contain
    # `--exclude=`, so gating on the latter silently dropped every exclude-dir
    # call. Caught by a test; it looked exactly like a rule that simply never
    # matched.
    *"--include="*|*"--exclude"*|*"-name "*|*"-iname "*|*"-path "*|*"-ipath "*) ;;
    # 13-piped-exit-code. The rule requires a pipe INTO head/tail/wc, so the pipe
    # must be part of the token — a bare *head* would admit every path containing
    # the word. Both spacings, because `|wc` and `| wc` are equally common.
    *"| head"*|*"|head"*|*"| tail"*|*"|tail"*|*"| wc"*|*"|wc"*) ;;
    *) exit 0 ;;
esac

# Parse ONCE for all rules. \x1f (unit separator) delimits; it cannot appear in a
# real command or path, and any that did is stripped.
fields=$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    o = json.load(sys.stdin)
except Exception:
    raise SystemExit
ti = o.get("tool_input") or {}
def g(v):
    return (v or "").replace("\x1f", " ").replace("\n", " ")
print("\x1f".join([
    g(o.get("tool_name")),
    g(ti.get("command")),
    g(ti.get("file_path")),
    g(ti.get("content")) or g(ti.get("new_string")),
    g(o.get("session_id")) or "nosession",
]))
' 2>/dev/null) || exit 0
[ -z "$fields" ] && exit 0

IFS=$'\037' read -r TOOL CMD FILE CONTENT SESSION <<<"$fields"
[ -n "$SESSION" ] || SESSION=nosession

RULES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rules"
[ -d "$RULES_DIR" ] || exit 0

for rule in "$RULES_DIR"/*.rule; do
    [ -f "$rule" ] || continue

    # Each rule redefines these; clear them so a malformed rule cannot inherit
    # the previous one's matcher and fire on its behalf.
    unset -f rule_match rule_message 2>/dev/null
    rule_id=""
    rule_once=1

    # shellcheck disable=SC1090
    . "$rule" 2>/dev/null || continue
    [ -n "$rule_id" ] || continue
    declare -f rule_match >/dev/null 2>&1 || continue
    declare -f rule_message >/dev/null 2>&1 || continue

    rule_match "$TOOL" "$CMD" "$FILE" "$CONTENT" || continue

    if [ "$rule_once" = "1" ]; then
        marker="${TMPDIR:-/tmp}/.dbv-${rule_id}-${SESSION}"
        # Already spent this session — fall through to the remaining rules rather
        # than returning, so one rule's marker cannot suppress another's.
        [ -f "$marker" ] && continue
        touch "$marker" 2>/dev/null
    fi

    rule_message >&2
    exit 2
done

exit 0

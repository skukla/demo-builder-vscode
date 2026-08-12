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
    g(o.get("session_id")) or "nosession",
]))
' 2>/dev/null) || exit 0
[ -z "$fields" ] && exit 0

IFS=$'\037' read -r TOOL CMD FILE SESSION <<<"$fields"
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

    rule_match "$TOOL" "$CMD" "$FILE" || continue

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

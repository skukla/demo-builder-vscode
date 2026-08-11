#!/usr/bin/env bash
# PreToolUse(Write) hook — route NEW UI files to the `reuse-first` skill.
#
# Why: recreation happens at the moment a new component file is created, before any
# scan can see it. On 2026-07-31 one new surface (integrations) rebuilt six things
# the wizard already had — centered loading, error+Retry, the sign-in affordance,
# the kebab menu, the menu-icon set, the API-catalog feedback trio. The USER caught
# every one; no tooling did. The existing scans are after-the-fact and the UI one
# only triggers at 3+ sites, so 2-site recreation stays invisible to them.
#
# Same reasoning as webview-test-skill-router.sh: routing that depends on
# remembering to look is not routing. The skill's own description cannot help,
# because nothing NAMES it at the moment you decide to write a new component.
#
# WRITE ONLY, not Edit: creating a file is the decision point. Editing an existing
# component is not — blocking those would fire constantly and teach nothing.
#
# Fires AT MOST ONCE per session; one landing loads the skill for the rest of it.
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

# New React components under any ui/ directory (feature or core). Tests are the
# other router's business; .css/.ts helpers are not component recreation.
case "$path" in
    *"/tests/"*) exit 0 ;;
    *"/src/"*"/ui/"*.tsx) ;;
    *) exit 0 ;;
esac

# Only when the file does NOT yet exist — Write to an existing path is a rewrite of
# something already reviewed, not a new surface.
[ -e "$path" ] && exit 0

marker="${TMPDIR:-/tmp}/.dbv-reuse-first-${session}"
[ -f "$marker" ] && exit 0
touch "$marker" 2>/dev/null

cat >&2 <<'MSG'
You are creating a NEW UI component. Invoke the `reuse-first` skill (Skill tool,
skill: "reuse-first") before writing it.

The extension already has a full visual language — loading, empty, error, status,
sign-in, kebab menus, modals, layouts, rename, search — in src/core/ui/components/
(job->component table: src/core/ui/components/CLAUDE.md). The wizard solved most
screen patterns first. Rebuilding one does not produce a neutral copy; it produces
a copy that drifts, because the next fix lands on only one of the two.

Check the vocabulary, then write. This hook fires only once per session.
MSG
exit 2

#!/usr/bin/env bash
# Stop hook — route to `dead-code-scan` after a turn that DELETED exported symbols.
#
# Deletion is when orphans appear and exactly when nobody looks for them. Removing
# one thing strands its helpers, its config entry, its last-remaining-member
# collection, and its docs. On 2026-08-05 deleting one message handler took 3 source
# files, 4 test files and 6 registration sites with it — none named by the item that
# scoped the work — and a follow-up pass found eleven more handlers of the same
# shape that had been dead for months.
#
# Same reasoning as reuse-first-router.sh: routing that depends on remembering to
# look is not routing. The difference is timing — recreation is caught BEFORE a
# write, orphaning only becomes visible AFTER a delete.
#
# Blocks (exit 2), once per session. Advisory would be weaker, and this fires rarely:
# only when a turn removes an `export`.
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$DIR" || exit 0

removed=$( { git diff -U0; git diff --cached -U0; } 2>/dev/null \
  | grep -E '^-\s*export (async )?(function|const|class|interface|type) ' \
  | grep -oE '(function|const|class|interface|type) [A-Za-z_][A-Za-z0-9_]*' \
  | awk '{print $2}' | sort -u )
[ -z "$removed" ] && exit 0

session="${CLAUDE_SESSION_ID:-nosession}"
marker="${TMPDIR:-/tmp}/.dbv-deletion-scan-${session}"
[ -f "$marker" ] && exit 0
touch "$marker" 2>/dev/null

{
  echo "This turn deleted exported symbols:"
  echo "$removed" | sed 's/^/  - /'
  cat <<'MSG'

Invoke the `dead-code-scan` skill (Skill tool, skill: "dead-code-scan") before
finishing. Deleting one thing strands others: helpers whose only caller just went,
a collection whose last member you removed, config rows, and docs that still name
it. ts-prune sees the newly-orphaned exports; the skill's four-origin protocol
covers what it cannot.

Run the CONTROL step first — without it the check has produced a ~15% false-positive
rate. This hook fires only once per session.
MSG
} >&2
exit 2

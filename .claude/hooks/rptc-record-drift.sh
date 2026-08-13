#!/usr/bin/env bash
# Stop hook — when a turn RESTRUCTURED the RPTC record, check the record still holds.
#
# Why a hook and not just the skill: `rptc-hygiene-scan` is pull-only and depends on
# someone remembering to run it — the same failure doc-drift.sh names, and the one that
# actually happened. On 2026-08-13 five shipped plans had been sitting in `plans/` for
# weeks (one saying so in its own overview, with instructions to archive it), and a
# reconcile that verified every link resolved still left three plan directories in the
# backlog with no index entry at all. Both were created by moving things, and the
# instruction to check afterwards is exactly the kind that gets skipped.
#
# STRUCTURAL changes only: a plan/backlog directory added, removed or moved, or the
# index itself edited. Editing an item's BODY does not fire it — that happens dozens of
# times a session and noise is how a hook gets switched off (see rules/20-data-installer-probe).
#
# Advisory (always exits 0) and silent when clean. A rotted index is worth fixing, never
# worth halting a turn over.

DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$DIR" || exit 0
[ -d .rptc ] || exit 0

# Added / deleted / renamed anywhere under .rptc/{plans,backlog,complete}, OR any edit to
# the backlog index. -M catches the move that archiving a plan actually is.
structural=$(
  {
    git diff --name-status --diff-filter=ADR -M;
    git diff --cached --name-status --diff-filter=ADR -M;
  } 2>/dev/null | grep -E '\.rptc/(plans|backlog|complete)/' | head -1
)
index_edit=$(
  { git diff --name-only; git diff --cached --name-only; } 2>/dev/null \
    | grep -x '.rptc/backlog/README.md' | head -1
)
[ -z "$structural" ] && [ -z "$index_edit" ] && exit 0

SCAN="$DIR/.claude/skills/rptc-hygiene-scan/scan.sh"
[ -f "$SCAN" ] && out=$(bash "$SCAN" 2>/dev/null) || exit 0

# Sections 1-2 ONLY — the two a structural move actually breaks. §3 (plans claiming
# shipped) and §4 (stale citations) drift slowly and are unrelated to this turn; reporting
# them here would attach the same pre-existing list to every move until people stopped
# reading it. cut-release covers those.
findings=$(printf '%s\n' "$out" | grep -E '^\s+(DEAD|UNINDEXED)')
[ -z "$findings" ] && exit 0

echo "[rptc-record-drift] this turn restructured the RPTC record, and the record no longer holds:" >&2
printf '%s\n' "$findings" >&2
echo "  Full detail + how to judge each: bash .claude/skills/rptc-hygiene-scan/scan.sh" >&2
echo "  UNINDEXED is the one a dead-link check cannot see: the item is on disk and" >&2
echo "  invisible in the index. That is how three plan directories went missing on 2026-08-13." >&2
exit 0

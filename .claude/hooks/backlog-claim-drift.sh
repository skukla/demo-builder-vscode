#!/usr/bin/env bash
# Stop hook — this turn changed code that a LIVE backlog item describes. Did you just
# close it?
#
# The sibling `rptc-record-drift.sh` watches the record's STRUCTURE (a plan moved, the
# index edited). This one watches its TRUTH, which nothing did. On 2026-08-13 a
# validation pass found five of the fourteen actionable backlog items describing defects
# that no longer existed — one of them ranked first on a pick-list minutes before it was
# measured. Traced to their fixing commits, the mechanism was consistent:
#
#   12f4b802  export_project_settings/includeSecrets   touched src/, not the item
#   0b9f0f6d  integrations host contract               touched src/, not the item
#   bf1b48d8  reset consent                            touched src/, not the item
#   63b76b63  generated diagnosis skill                touched src/, not the item
#   3843b6be  the PDP pair                             CREATED both items and fixed
#                                                      them in the same commit
#
# Four of five never touched the record, so "did this turn edit .rptc/?" looks like the
# test — but it would miss the fifth, where the items were filed and fixed together and
# were stale the moment they were born. The condition that catches all five is simply:
# the item is STILL IN backlog/ at the end of a turn that changed code it cites.
#
# The hygiene scan cannot catch this class at all: a shipped item's links resolve
# perfectly. Structure and truth are different properties.
#
# Advisory (always exits 0) and silent when it finds nothing. A stale item is worth a
# question, never worth halting a turn.
#
# Testable seam: pass changed files as arguments to bypass git detection.
#   bash backlog-claim-drift.sh src/features/foo/bar.ts

DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$DIR" || exit 0
[ -d .rptc/backlog ] || exit 0

# A file cited by many items is a hub (dashboardHandlers.ts, constants.ts). Reporting
# every item that name-drops it is how a hook stops being read — the trade named in
# rules/20-data-installer-probe. Above this, the mention is vocabulary, not a claim.
MAX_ITEMS_PER_FILE=3
# Total lines of output. A wall of text is a wall people scroll past.
MAX_REPORTED=6
# The inverse cap: an ITEM that names more than this many source files is a broad plan
# using code as context, not a claim about any one of them. Measured 2026-08-13 over the
# then-34 items: the six that were genuinely stale cited 2-14 files each, while the
# chatty ones cited 16-44 (legacy-soft-deprecation 44, claude-cli-detection 37). The
# gap between 14 and 16 is where this sits, so it is tighter than it looks — re-measure
# before moving it, and note that export-settings at 14 was one file from being missed.
MAX_FILES_PER_ITEM=15

# Basenames too generic to mean anything. `index.ts` appears in most items as prose.
GENERIC='^(index|types|constants|utils|helpers|config|README)\.(ts|tsx|md)$'

if [ "$#" -gt 0 ]; then
    changed=$(printf '%s\n' "$@")
else
    changed=$(
        {
            git diff --name-only --diff-filter=ACMR;
            git diff --cached --name-only --diff-filter=ACMR;
        } 2>/dev/null | sort -u
    )
fi

# Source, plus the generated TEMPLATES under src/ (skills, AGENTS.md). Templates earn
# their place: the diagnose-demo replay fired on the right file and named the WRONG items
# because the commit's only precise link to its item was `templates/skills/diagnose-demo.md`.
# Its .ts sibling `skillsWriter.ts` is cited by five items — a genuine hub, correctly
# suppressed — so without templates that item was unreachable.
changed=$(printf '%s\n' "$changed" \
    | grep -E '^src/.*\.(ts|tsx)$|^src/.*/templates/.*\.md$' | grep -v '\.test\.')
[ -z "$changed" ] && exit 0

findings=""
count=0

while IFS= read -r file; do
    [ -z "$file" ] && continue
    base=$(basename "$file")
    printf '%s' "$base" | grep -qE "$GENERIC" && continue

    # Match the full path first (a real citation), then the bare basename (how items
    # usually name a symbol's home). Search item BODIES only — the index summarises
    # them and would double-report every hit.
    items=$(
        grep -rl -e "$file" -e "$base" .rptc/backlog/ --include='*.md' 2>/dev/null \
            | grep -v '/README\.md$' | sort -u
    )
    [ -z "$items" ] && continue

    n=$(printf '%s\n' "$items" | grep -c .)
    [ "$n" -gt "$MAX_ITEMS_PER_FILE" ] && continue

    while IFS= read -r item; do
        [ -z "$item" ] && continue
        [ "$count" -ge "$MAX_REPORTED" ] && break 2

        # Skip broad plans that name code as context rather than claim.
        cites=$(grep -oE '[A-Za-z0-9_/.-]+\.(ts|tsx)' "$item" 2>/dev/null | sort -u | grep -c .)
        [ "$cites" -gt "$MAX_FILES_PER_ITEM" ] && continue

        findings="${findings}  ${file}
      cited by  ${item#.rptc/backlog/}
"
        count=$((count + 1))
    done <<EOF
$items
EOF
done <<EOF
$changed
EOF

[ -z "$findings" ] && exit 0

echo "[backlog-claim-drift] this turn changed code a live backlog item describes:" >&2
printf '%s' "$findings" >&2
echo "  Closed it? Move it to .rptc/complete/ with an outcome + update the index." >&2
echo "  Didn't? Ignore — a cited file is not a claim. (Fires on ~39% of code turns.)" >&2
exit 0

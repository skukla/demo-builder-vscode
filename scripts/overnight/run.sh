#!/usr/bin/env bash
#
# Run a queue of /goal sessions, one per item, unattended.
#
# WHY A SHELL LOOP AND NOT ONE SESSION. `/goal` allows one goal per session and
# nothing inside a session can set the next one — it is a command the human
# types, and Claude has no tool for it. `claude -p "/goal …"` runs a goal to
# completion in a single invocation, so the queue lives out here.
#
# A fresh session per item is deliberate. A context overflow that auto-compaction
# cannot clear CLEARS A GOAL outright, and that is the likeliest overnight death;
# several short sessions are safer than one long one. Continuity between items
# comes from the repo — the ledgers and backlog.mjs — not from context.
#
#   ./scripts/overnight/run.sh --dry-run          # print what would run
#   ./scripts/overnight/run.sh                    # every item in scripts/overnight/queue
#   ./scripts/overnight/run.sh PL-32              # just these
#
set -uo pipefail          # NOT -e: one item failing must not kill the queue

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
GOALS="$HERE/goals"
STAMP="$(date +%Y-%m-%d-%H%M)"
LOGDIR="$REPO/.rptc/handoff/overnight-$STAMP"

DRY=0
[[ "${1:-}" == "--dry-run" ]] && { DRY=1; shift; }

# Order comes from the queue file, never from a glob: a glob sorted PL-16 ahead
# of PL-32 because "1" precedes "3", which is not an order anybody chose.
if [[ $# -gt 0 ]]; then
    NAMES=("$@")
else
    NAMES=()
    while IFS= read -r line; do
        line="${line%%#*}"; line="$(echo "$line" | tr -d '[:space:]')"
        [[ -n "$line" ]] && NAMES+=("$line")
    done < "$HERE/queue"
fi

FILES=()
for n in "${NAMES[@]}"; do
    if [[ -f "$GOALS/$n.goal" ]]; then FILES+=("$GOALS/$n.goal")
    else echo "MISSING $GOALS/$n.goal — not queued"; fi
done
[[ ${#FILES[@]} -gt 0 ]] || { echo "nothing to run"; exit 1; }

# The owner's standing rule for unattended work: commits go to a WORK BRANCH,
# never to develop. Made here rather than left to each condition, because git
# mechanics in prose is how a rule gets skipped on turn nineteen.
BRANCH="loop/$(date +%Y-%m-%d)-goal-queue"
if [[ $DRY -eq 0 ]]; then
    if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
        git -C "$REPO" checkout -q "$BRANCH"
    else
        git -C "$REPO" checkout -q -b "$BRANCH"
    fi
    echo "branch:   $BRANCH (from $(git -C "$REPO" rev-parse --short HEAD))"
else
    echo "branch:   $BRANCH (would be created)"
fi

echo "queue:    ${#FILES[@]} item(s)"
echo "logs:     $LOGDIR"
echo "started:  $(date)"
[[ $DRY -eq 1 ]] && echo "MODE:     dry run — nothing will be invoked"
mkdir -p "$LOGDIR"

for f in "${FILES[@]}"; do
    [[ -f "$f" ]] || continue
    name="$(basename "$f" .goal)"
    log="$LOGDIR/$name.jsonl"

    echo
    echo "════ $name — $(date +%H:%M) ════"

    if [[ $DRY -eq 1 ]]; then
        echo "would run: claude -p \"/goal <$name condition>\" --permission-mode auto"
        echo "condition preview:"
        sed 's/^/    /' "$f"
        continue
    fi

    # `caffeinate` because machine sleep ends the run; -i idle, -m disk, -s system.
    caffeinate -ims claude -p "/goal $(cat "$f")" \
        --permission-mode auto \
        --output-format stream-json --verbose \
        >> "$log" 2>&1
    code=$?

    echo "$name finished at $(date +%H:%M), exit=$code"
    # A non-zero exit ends THIS item only. The queue continues on purpose: an
    # exhausted credit balance or a cleared goal should not cost the rest.
done

echo
echo "queue done: $(date)"
echo "read the logs with:  scripts/overnight/summarise.sh $LOGDIR"

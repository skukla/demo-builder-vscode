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
#
# THE BRANCH IS ALWAYS CUT FROM THE CURRENT HEAD. This used to reuse a branch of
# the same date-name if one existed, and on 2026-09-03 the second run of the day
# checked out the morning's branch — an old commit without the day's work OR the
# goal files — then skipped every goal as missing and printed "queue done" in
# under a second, exit 0. A branch that is fully merged is deleted and recut; one
# carrying unmerged commits is a decision for a human, not a script.
BRANCH="loop/$(date +%Y-%m-%d)-goal-queue"
START_SHA="$(git -C "$REPO" rev-parse --short HEAD)"
if [[ $DRY -eq 0 ]]; then
    if [[ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" == "$BRANCH" ]]; then
        # A RESUME: the queue was stopped mid-run (a fix went in between batches on
        # 2026-09-03) and is being restarted on the same branch. Nothing to cut.
        echo "branch:   $BRANCH (already checked out — resuming on it at $START_SHA)"
        RESUME=1
    elif git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
        if [[ -z "$(git -C "$REPO" log --oneline "HEAD..$BRANCH")" ]]; then
            git -C "$REPO" branch -q -D "$BRANCH"
            echo "branch:   $BRANCH existed, fully merged — recut"
        else
            echo "REFUSING: $BRANCH exists with commits not in HEAD. Merge or rename it first."
            git -C "$REPO" log --oneline "HEAD..$BRANCH" | sed 's/^/    /'
            exit 1
        fi
    fi
    if [[ "${RESUME:-0}" -eq 0 ]]; then
        git -C "$REPO" checkout -q -b "$BRANCH"
        echo "branch:   $BRANCH (from $START_SHA)"
    fi
else
    echo "branch:   $BRANCH (would be cut from $START_SHA)"
fi

# The goal files were listed BEFORE the checkout. Prove they survived it — a goal
# that is not on the branch would otherwise be skipped silently below.
for f in "${FILES[@]}"; do
    [[ -f "$f" ]] || { echo "ABORT: $f is not present on $BRANCH"; exit 1; }
done

echo "queue:    ${#FILES[@]} item(s)"
echo "logs:     $LOGDIR"
echo "started:  $(date)"
[[ $DRY -eq 1 ]] && echo "MODE:     dry run — nothing will be invoked"
mkdir -p "$LOGDIR"

RAN=0
for f in "${FILES[@]}"; do
    name="$(basename "$f" .goal)"
    log="$LOGDIR/$name.jsonl"
    RAN=$((RAN + 1))

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
if [[ $DRY -eq 0 && $RAN -eq 0 ]]; then
    echo "NOTHING RAN — exiting non-zero so this cannot read as success."
    exit 1
fi
echo "queue done: $(date) — $RAN item(s) invoked"
echo "read the logs with:  scripts/overnight/summarise.sh $LOGDIR"

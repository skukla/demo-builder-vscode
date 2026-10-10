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
RUNS_LOG="$REPO/.rptc/handoff/runs.log"

# BOUNDARY LINES. `npm run mutation:status` answers "how far along is it, and is it
# still moving" from these and from nothing else — the queue's starting numbers, and
# each batch's start (with the pid to ask about) and end. They go into the SAME log
# runs.sh keeps, in its format, rather than into a second one. On 2026-10-10 the only
# way to tell how far a run had got was a hand-written line that searched `ps` and
# matched its own command.
mark() { mkdir -p "$(dirname "$RUNS_LOG")"; echo "$(date '+%Y-%m-%d %H:%M')  $*" >> "$RUNS_LOG"; }

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

# The cap on one batch, in minutes; the reasoning is beside the watchdog below.
# BATCH_TIMEOUT_SEC exists so the watchdog can be exercised in a second by
# tests/scripts/overnightRunner.test.ts; nothing else sets it.
BATCH_TIMEOUT_MIN="${BATCH_TIMEOUT_MIN:-150}"
BATCH_TIMEOUT_SEC="${BATCH_TIMEOUT_SEC:-$((BATCH_TIMEOUT_MIN * 60))}"

echo "queue:    ${#FILES[@]} item(s)"
echo "progress: npm run mutation:status      (exit 3 = stalled, 4 = nothing running)"
echo "logs:     $LOGDIR"
echo "started:  $(date)"
[[ $DRY -eq 1 ]] && echo "MODE:     dry run — nothing will be invoked"
mkdir -p "$LOGDIR"
if [[ $DRY -eq 0 ]]; then
    # A count that could not be read is recorded as unknown, never as zero.
    GAPS="$(cd "$REPO" && node scripts/overnight/status.mjs --gaps 2>/dev/null)"
    [[ "$GAPS" =~ ^gaps=[0-9]+\ modules=[0-9]+$ ]] || GAPS="gaps=unknown modules=unknown"
    mark "queue start — $GAPS sha=$START_SHA batches=${#FILES[@]} cap=$BATCH_TIMEOUT_MIN${RUNS_LOOP:+ loop=1}"
fi

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
    #
    # WALL-CLOCK CAP. A batch that hangs used to stall every batch behind it, with
    # nothing to stop it: the turn budget in the goal text could not, because the one
    # real stall on 2026-09-04 happened INSIDE a single turn, waiting 16 minutes on a
    # string that was never going to appear. Time is the only thing that catches that,
    # so it is enforced out here rather than asked for in the prompt. Generous on
    # purpose — the slowest healthy batch so far took 71 minutes, so this only fires on
    # something genuinely wrong. Killing one batch costs nothing that is not already
    # committed: every module commits on its own, and the queue rebuilds from the
    # baseline, so whatever it did not reach comes back in the next run.
    #
    # A measurement the batch started runs in its own process group, so killing the
    # batch does not reach it. It is asked to stop by the pid it recorded; left alone it
    # would end at its own 12-minute limit, and the next batch's first measurement would
    # be refused until then.
    caffeinate -ims claude -p "/goal $(cat "$f")" \
        --permission-mode auto \
        --output-format stream-json --verbose \
        >> "$log" 2>&1 &
    batch_pid=$!
    mark "batch start — $name pid=$batch_pid cap=$BATCH_TIMEOUT_MIN log=${log#"$REPO"/}"
    ( sleep "$BATCH_TIMEOUT_SEC"; kill -0 "$batch_pid" 2>/dev/null && {
        echo "$name EXCEEDED ${BATCH_TIMEOUT_MIN} min — killing it so the queue continues"
        pkill -P "$batch_pid" 2>/dev/null
        kill "$batch_pid" 2>/dev/null
        (cd "$REPO" && node scripts/overnight/status.mjs --stop-measurement)
    } ) &
    watchdog_pid=$!
    wait "$batch_pid"
    code=$?
    kill "$watchdog_pid" 2>/dev/null    # the batch finished first; retire the watchdog
    wait "$watchdog_pid" 2>/dev/null

    echo "$name finished at $(date +%H:%M), exit=$code"
    mark "batch end — $name exit=$code"
    # A non-zero exit ends THIS item only. The queue continues on purpose: an
    # exhausted credit balance or a cleared goal should not cost the rest.
done

echo
if [[ $DRY -eq 0 && $RAN -eq 0 ]]; then
    echo "NOTHING RAN — exiting non-zero so this cannot read as success."
    exit 1
fi
[[ $DRY -eq 0 ]] && mark "queue end — invoked=$RAN"
echo "queue done: $(date) — $RAN item(s) invoked"
echo "where it stands:     npm run mutation:status"
echo "read the logs with:  scripts/overnight/summarise.sh $LOGDIR"

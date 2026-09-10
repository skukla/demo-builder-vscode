#!/usr/bin/env bash
#
# Run mutation burn-down queues BACK TO BACK until nothing is left, a stop file
# appears, or a run stops producing commits.
#
#   ./scripts/overnight/runs.sh                 # generate a 40-module queue, run it, repeat
#   LIMIT=20 MAX_RUNS=3 ./scripts/overnight/runs.sh
#   touch .rptc/handoff/STOP-RUNS               # finish the current run, then stop
#
# WHY. run.sh works one queue; the owner asked (2026-09-04, going to sleep) that
# finishing a queue lead straight into the next one, "until I stop you or you run
# out of runs". Each queue is regenerated from reports/mutation/baseline.json, so it
# always names the modules with open gaps that remain, in consequence order.
#
# It first waits for any run.sh already going, and the moment that queue ends it
# stops the redundancy sweep the 2026-09-03 launcher chained after it: two Stryker
# runs starve each other, so the sweep cannot share the night with run 3. The
# sweep runs once, at the end, over everything that finished.
#
# FOUR EXITS, all logged: no module has open gaps (done); the stop file (the
# owner's hand); a run that invoked its batches but moved HEAD by zero commits —
# an exhausted balance or a broken template would otherwise regenerate the same
# queue forever; and a queue size that could not be READ, which is not zero and
# must not be mistaken for it.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
LOG="$REPO/.rptc/handoff/runs.log"
STOP="$REPO/.rptc/handoff/STOP-RUNS"
LIMIT="${LIMIT:-40}"
MAX_RUNS="${MAX_RUNS:-20}"
SWEEP_MINUTES="${SWEEP_MINUTES:-300}"

log() { echo "$(date '+%Y-%m-%d %H:%M')  $*" | tee -a "$LOG"; }

log "runs.sh started — LIMIT=$LIMIT MAX_RUNS=$MAX_RUNS  (stop file: $STOP)"
[[ -f "$STOP" ]] && { rm -f "$STOP"; log "cleared a stale stop file"; }

# 1. A queue already running finishes on its own terms. The patterns are anchored
#    to the bash/node PROCESS: the shell that launched run 2 on 2026-09-03 carries
#    both names in its own command line and outlives the queue by five hours.
RUNNING='^bash .*overnight/run\.sh'
SWEEP='^node .*mutationRedundancySweep'
if pgrep -f "$RUNNING" >/dev/null; then
    log "waiting for the running queue to finish"
    while pgrep -f "$RUNNING" >/dev/null; do sleep 30; done
    log "running queue finished"
    # 2. Its launcher may chain the redundancy sweep next; stop it before Stryker starts.
    for _ in $(seq 1 30); do
        if pgrep -f "$SWEEP" >/dev/null; then
            pkill -f "$SWEEP"
            pkill -f 'stryker run stryker\.redundancy\.config\.json'   # an orphaned child, if any
            log "stopped the chained redundancy sweep — it runs at the end instead"
            break
        fi
        sleep 2
    done
fi

run=0
while :; do
    [[ -f "$STOP" ]] && { rm -f "$STOP"; log "stop file found — stopping"; break; }
    [[ $run -ge $MAX_RUNS ]] && { log "MAX_RUNS=$MAX_RUNS reached — stopping"; break; }
    run=$((run + 1))

    # The generator prints exactly one "queued: N in M batch(es)" line. Read N off
    # it with awk and REQUIRE a number: an unreadable count stops the loop as an
    # error, so a broken generator cannot masquerade as "nothing left".
    gen="$(node scripts/mutationQueue.mjs --limit "$LIMIT" 2>&1)"
    queued="$(printf '%s\n' "$gen" | awk '{ for (i = 1; i < NF; i++) if ($i == "queued:") { print $(i + 1); exit } }')"
    if [[ ! "$queued" =~ ^[0-9]+$ ]]; then
        log "could not read the queue size from the generator — stopping. Its output:"
        printf '%s\n' "$gen" | tee -a "$LOG"
        break
    fi
    if [[ "$queued" -eq 0 ]]; then
        log "no module has open gaps — the burn-down is DONE"
        break
    fi
    # Record what this run was asked to do: the regenerated queue and goals are
    # tracked files, and a dirty tree is what the goal sessions inherit otherwise.
    git add scripts/overnight/goals scripts/overnight/queue
    git commit -q -F - <<MSG
chore(overnight): run $run queue — $queued modules, regenerated from the baseline

Backlog: PL-22
MSG
    before="$(git rev-parse HEAD)"
    log "run $run: $queued modules queued; starting run.sh from $(git rev-parse --short HEAD)"
    "$HERE/run.sh" >> "$LOG" 2>&1
    code=$?
    after="$(git rev-parse HEAD)"
    commits="$(git rev-list --count "$before..$after")"
    log "run $run finished: exit=$code, $commits commit(s)"
    if [[ "$commits" -eq 0 ]]; then
        log "run $run produced NO commits — stopping so the same queue does not spin"
        break
    fi
done

log "starting the redundancy sweep over every finished module (--minutes $SWEEP_MINUTES)"
caffeinate -ims node scripts/mutationRedundancySweep.mjs --minutes "$SWEEP_MINUTES" >> "$LOG" 2>&1
log "redundancy sweep finished — runs.sh done"

# Running a queue of goals overnight

Two scripts and a queue file. `run.sh` works the queue, `summarise.sh` tells you
what happened at breakfast.

```bash
./scripts/overnight/run.sh --dry-run     # see the queue and the conditions
./scripts/overnight/run.sh               # work it
./scripts/overnight/summarise.sh .rptc/handoff/overnight-<stamp>
npm run mutation:status                  # how far along, and is it still moving
```

## Why a shell loop and not one session

`/goal` allows **one goal per session**, and nothing inside a session can set the
next one — it is a command the human types, and Claude has no tool for it. But
`claude -p "/goal …"` runs a goal to completion in a single invocation, so the
queue lives in the shell.

A fresh session per item is deliberate, not a compromise. A context overflow that
auto-compaction cannot clear **clears a goal outright**, and that is the likeliest
way an overnight run dies. Several short sessions survive what one long one does
not. Continuity between items comes from the repo — the ledgers, `backlog.mjs`,
git — never from context.

## What makes a condition work

The evaluator is a small fast model that **cannot run commands or read files**. It
judges only what the session has already surfaced in the transcript. So a
condition has to name the proof, not just the outcome:

- **A measurable end state** — a ledger at zero, a gate exit code, an empty queue.
- **The check that proves it**, with an instruction to PASTE the numbers. An
  unpasted number does not exist as far as the evaluator is concerned.
- **A cap** — `stop after N turns`. There is no `--max-turns` flag for this; the
  bound has to be in the condition text.

Conditions live in `goals/<name>.goal`, one per item, capped at 4,000 characters
by the feature.

## What it does not protect you from

The evaluator reads the transcript, so **it inherits the session's framing**. If a
turn claims a ledger is at zero, the evaluator believes it. It is a good guard
against drifting off and stopping early; it is not a guard against a confident
wrong conclusion.

That is why every condition here ends with an explicit *stop and say so* clause,
and why `summarise.sh` prints `git log` alongside the transcript summary: the
transcript says what was attempted, git says what actually stuck.

## Ordering

`queue` sets the order, one name per line. Not a glob — a glob sorted `PL-16`
ahead of `PL-32` because "1" precedes "3", which is not an order anybody chose.
Put the cleanest end state first; it is the one most likely to finish, and it
finishes while the night is young.

## The rails

- `--permission-mode auto` is required for unattended turns; `/goal` does not
  change permission mode by itself.
- `caffeinate -ims` wraps each invocation. Machine sleep ends the run.
- The queue continues past a failed item on purpose. An exhausted credit balance
  or a cleared goal should not cost the rest of the night.
- Conditions forbid cloud writes and require every commit to be gated on
  `npm run gate` exiting 0, with the exit code captured in a variable rather than
  read through a pipe.

## The mutation burn-down queue is generated

```bash
node scripts/mutationQueue.mjs --limit 30 --dry   # see the order
node scripts/mutationQueue.mjs --limit 30         # write queue + goals/MUT-NN.goal
./scripts/overnight/run.sh                        # work it
```

It reads `reports/mutation/baseline.json`, drops every module already at zero open
gaps, ranks the rest by **consequence** — updates and rollback, auth, project state,
reset, lifecycle, prerequisites, project creation, then everything else — and within
an area by open gaps, then writes batches of five as goal files. Re-run it after a
night and it produces the next night's queue from what actually stuck. The order is a
rule in the script, not a list; the plan's step 6 is why.

## How far along is it (`npm run mutation:status`)

One screen: open gaps now and when the run started, commits since, the batch in flight,
the module being measured, minutes since the last commit and the last heartbeat, the
pace, and a rough finish. `--json` gives the same facts to a script. Exit 0 healthy,
3 STALLED, 4 nothing running.

It reads what the runners wrote and nothing else. `run.sh` and `runs.sh` append
boundary lines to `.rptc/handoff/runs.log` — `loop start`, `queue start` (both with the
gap count and the commit), `batch start` (with the batch's pid and cap), `batch end`,
`queue end`, `loop end` — and `mutationMeasure.mjs` rewrites
`reports/mutation/run-status.json` every 30 seconds while it measures. "Alive" is
decided one way: the recorded pid, asked of the kernel. It never searches the process
list, because on 2026-10-10 a status line that did matched its own command and reported
"measuring" for a run that was dead.

STALLED names its reason: a measurement past its own time limit, a measurement whose
process is gone, a batch past its cap, or a batch listed as open whose process is gone.

## Sessions measure with one bounded command

`npm run test:mutation:measure -- <module> [more]` is the only way a goal session
measures. It refuses a group over 400 mutants, kills the Stryker process tree at 12
minutes, and removes the temp directory and the incremental cache however it ends. The
goal text says so, and forbids the open-ended alternatives; the evidence is in
`BURNDOWN.md`. When `run.sh` kills a batch at its cap it also asks the measurement in
flight to stop, by its recorded pid.

## Running queues back to back (`runs.sh`)

`run.sh` works one queue. `runs.sh` regenerates the mutation queue from
`reports/mutation/baseline.json` (`mutationQueue.mjs --limit 40`), runs it, and
repeats until no module has open gaps — or until you `touch
.rptc/handoff/STOP-RUNS`, which lets the current run finish and then stops. It
also stops on a run that produced no commits (an exhausted balance would otherwise
regenerate the same queue forever) and on a queue size it could not read. It logs
every boundary to `.rptc/handoff/runs.log`, and runs the redundancy sweep once, at
the end. Started 2026-09-04 at the owner's request: "move straight into run three
and so on until I stop you or you run out of runs".

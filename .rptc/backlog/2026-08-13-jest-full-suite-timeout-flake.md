---
id: 2026-08-13-jest-full-suite-timeout-flake
title: Full-suite Jest runs fail ~3 random suites on timeouts under parallel load
status: backlog
created: 2026-08-13
priority: high
---

# Full-suite Jest runs fail ~3 random suites on timeouts under parallel load

## Why this is priority: high despite failing nothing real

**The gate is what every other claim in this repo is verified against.** `gate`,
`cut-release`, and every "full suite green" in a handoff or commit message rest on one
full-suite run being a reliable signal. It is not: a green run is one sample of a process
that fails ~3 suites at random, and a red run says nothing about the code that triggered
it.

Both directions cost. A false red sends someone hunting a break that isn't there — this
item exists because a session spent time stashing changes to attribute three failures that
turned out to be noise. A false green is worse and silent.

## Symptom

A full `npx jest --no-coverage` fails **about three suites, different ones each run**, with
**timeouts rather than assertion failures**. Every affected suite passes in isolation.

Two consecutive runs on 2026-08-13, same tree, no changes between them:

| Run | Failed suites |
|---|---|
| 1 | `inExtensionMcpServer`, `inExtensionMcpServer.socketOwnership`, `mcpConfigWriter` |
| 2 | `extension-context`, `executor-appBuilderComponentLoading`, `processCleanup.timeout` |

Disjoint sets. Both runs: 3 failed / 992 passed of 995 suites.

## The failure mode is timing, not behaviour

```
Extension - Context Variables Initialization › activate() › ...
  thrown: "Exceeded timeout of 10000 ms for a test."

Executor - App Builder Component Loading › should load an app-builder component ...
  thrown: "Exceeded timeout of 10000 ms for a test."

ProcessCleanup - Timeout Behavior › should send SIGKILL after timeout ...
  expect(received).toBeLessThan(expected)
  Expected: < 2000
  Received:   12793
```

That last one is the most diagnostic in the set: it is a **wall-clock assertion**, and it
measured 12,793 ms against a 2,000 ms bound. Nothing about SIGKILL changed — the process
was starved for over ten seconds. The two 10 s timeouts are the same phenomenon hitting a
different limit.

## What has been ruled out

- **Not caused by any one branch.** Verified by stashing: the six affected suites pass in
  isolation both with and without the working-tree changes present.
- **Not obvious CPU contention.** The only competing process was an esbuild watcher at
  1.9% CPU, on a 16-core machine.
- **Not a duplicate of the worker-force-exit item** (`2026-06-09-jest-worker-force-exit.md`)
  — that is a leaked-timer *warning after* a passing run; this is suites *failing during*
  one. Different symptoms, neither subsumes the other.

  **But almost certainly the same root cause, and that item already did the measurement
  this one needs.** Its index entry records the force-exit warning as reproducible on
  demand at **0/3 runs at `maxWorkers` 25%, 3/3 at 75%**, appearing when the setting went
  25% → 75% in `3c17791e` (2026-08-05). Its conclusion: higher concurrency "did not create
  a leak, it changed suite-to-worker packing and exposed one."

  Timeouts under contention are the same story with a harder edge — packing that merely
  delays teardown in one suite starves a wall-clock assertion in another. **Read that item
  before starting here**, and treat the two as one investigation with two symptoms: if
  dropping `maxWorkers` clears both, they were always the same bug.

## Suspects, in the order worth testing

1. **`maxWorkers: '75%'` — start here, it is already half-proven.** 12 workers on 16 cores.
   The sibling item measured its own symptom at **0/3 at 25%, 3/3 at 75%**, and the setting
   changed 25% → 75% in `3c17791e` (2026-08-05). `jest.config.js` records the throughput
   tuning (25% = 35 s @ 1.8 GB, 75% = 18 s @ 4.0 GB) but nobody measured what 12 workers do
   to *timing-sensitive* suites, which is a different question from throughput and the one
   that matters for gate trust.
2. **`workerIdleMemoryLimit: '256MB'`** — recycling a worker mid-suite would stall it. The
   config warns loudly against raising it; check whether recycling correlates with the
   failures before touching it.
3. **Real-timer suites specifically.** All six affected suites either await real time or
   assert on elapsed wall-clock. The react project uses fake timers globally; the node
   project does not. A suite asserting `< 2000 ms` is untestable under contention by
   construction, whatever the worker count.

## Execution plan

1. **Measure the flake rate.** Run the full suite 10× unchanged, recording which suites
   fail. Establishes a baseline and confirms the ~3/995 rate. Without this, any "fix"
   is unfalsifiable — the next green run proves nothing.
2. **Bisect the worker count.** Same 10× at `maxWorkers` 50% and 25%. If the rate goes to
   zero, the tradeoff is wall-clock time against gate trust, and the answer is trust.
3. **Fix the wall-clock assertions regardless.** `processCleanup.timeout`'s `< 2000 ms` is
   a real bug in the test even at one worker — it asserts machine speed. Assert ordering
   (SIGTERM before SIGKILL) or use fake timers.
4. **Re-run the baseline** to confirm the rate actually moved.

## Constraints

- **Do not raise `workerIdleMemoryLimit`.** `jest.config.js` documents that 512 MB bought
  1.7 s and took peak RSS from 4.0 GB to 6.8 GB, reintroducing the OOM exposure commit
  `87db88e7` closed. The comment says KEEP AT 256MB; believe it.
- **Do not "fix" this by raising individual test timeouts.** That hides the starvation and
  makes the suite slower to fail. `tests/sop/no-lowered-test-timeout.test.ts` already
  guards the opposite direction — check whether it needs a sibling.
- **Measure before and after, with a rate not a single run.** A flake fixed by one green
  run is a flake you stopped looking at.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-13-jest-full-suite-timeout-flake.md`. The full Jest suite
> fails ~3 random suites per run on timeouts, and every affected suite passes in isolation
> — so the gate that everything else is verified against is one sample of a noisy process.
> Start with step 1: run the full suite 10× unchanged and record which suites fail, to
> establish the baseline rate. Do not change any config before that number exists.

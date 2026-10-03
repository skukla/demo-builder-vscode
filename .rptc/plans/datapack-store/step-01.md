# Step 01 — can a long export share a namespace with `render-pdp`?

Status: measuring (started 2026-10-01). Decides package-in-Stage vs a second workspace.

## The fact the question turns on (Adobe docs, read 2026-10-01)

Adobe I/O Runtime caps **concurrent activations at 100 per namespace, fixed and not
configurable**, and answers `429 TOO MANY REQUESTS` beyond it. Per-action container
concurrency defaults to 200 (1–500). A blocking/web action may run at most 60 s; a
non-blocking one up to 3 hours. (`developer.adobe.com/runtime/docs/guides/using/system_settings`)

So the arithmetic is: a store job that runs as ONE non-blocking activation takes one of the
hundred slots for as long as it runs. A store job that fans out — one activation per product,
say — takes as many as it fans, and at 100 it takes `render-pdp` down with it for every
storefront. The measurement proves the arithmetic and the instrument, then the design rule
follows from it rather than from the docs alone.

## Method

Everything runs in a SCRATCH workspace of the discovery service's Console project
(`DatapackSpike`, created for this step and deleted after it), never in Stage.

1. Deploy `render-pdp` as it is, plus `probe-sleep` (a web action that holds an activation
   open for `ms` milliseconds; `actions/probe-sleep/index.js`, step-01 instrument only).
2. **Baseline.** Time 20 sequential `GET render-pdp?org=skukla&site=kukla-justrite` with a
   PDP path. Record p50 / p95 / max and the status codes.
3. **Load like a well-behaved store.** Hold 5 `probe-sleep` activations open for 50 s each
   and repeat the timing while they run. Expect: no change.
4. **Load like a fan-out.** Fire 100 `probe-sleep` activations at once and time `render-pdp`
   during them. Expect: 429s on `render-pdp` — the control that the cap is real and shared,
   and that the instrument can see it.
5. Undeploy, delete the workspace, restore the repo's Stage config.

## Result (2026-10-01, scratch workspace `DatapackSpike`, `render-pdp` timed from the owner's machine)

| Phase | `render-pdp` p50 | p95 | max | statuses | the sleepers |
|---|---|---|---|---|---|
| baseline, idle namespace | 112 ms | 159 | 159 | 20 × 200 | — |
| 5 slots held 50 s | 76 ms | 164 | 164 | 20 × 200 | 5 × 200 |
| 100 slots held 50 s | 67 ms | 118 | 118 | 20 × 200 | 100 × 200 |
| after the storm | 67 ms | 120 | 120 | 20 × 200 | — |
| **150** slots held 40 s | 66 ms | 164 | 164 | 20 × 200 | 150 × 200 |
| **300** slots held 40 s | 67 ms | 158 | 158 | 20 × 200 | 300 × 200 |

**`render-pdp` did not move** — not at 5, not at 100, not at 300 concurrent activations held
open beside it. Not one 429 appeared anywhere, on the PDP action or on the sleepers.

**The documented cap did not fire, and that is itself a finding.** The docs say 100 concurrent
activations per namespace, fixed, 429 beyond. 300 I/O-bound activations ran at once and all
answered 200. The likely reason is intra-container concurrency: a Node action container runs
up to 200 activations at a time (the per-action default), so 300 sleepers that merely await a
timer fit in two containers and never approach whatever the namespace actually counts. A store
job is the same shape — it awaits REST calls — so this is the relevant case, not a loophole.
What was NOT measured: CPU-bound work, which would saturate a container rather than share it.
Nothing in the store's design is CPU-bound.

Instrument control: the sleepers' own timings (p50 within 300 ms of the requested hold, every
status recorded) show the load was real and the measurement saw it.

## Decision

**Same workspace. The store is the `datapack-store` package inside the service's Stage
deployment.** The second-workspace shape is not needed: even a fan-out of 300 concurrent
activations left the PDP path untouched. The one-activation-per-job rule stays as the store's
design — one non-blocking activation per export or push, sequential inside — because it is
simpler and cheaper, not because this measurement requires it.

What this step leaves behind: the `DatapackSpike` workspace stays for steps 02–05 as the
development namespace (the database provisions per workspace, so step 02 needs one that is not
Stage); it is deleted when the build ships. The `probe-sleep` instrument was undeployed and
removed from the repo as promised. The repo's Console selection points at `DatapackSpike`; a
deploy to Stage is a deliberate `aio app use -w Stage` away, and `npm run deploy` is never run
from this branch until the owner says ship.

---
id: 2026-08-13-jest-full-suite-timeout-flake
title: Full-suite Jest runs fail ~3 random suites on timeouts under parallel load
status: complete
created: 2026-08-13
completed: 2026-08-13
priority: high
---

# Full-suite Jest runs fail ~3 random suites — RESOLVED

**Cause: a second jest run sharing the machine. Not `maxWorkers`, not
`workerIdleMemoryLimit`, not any test.** Both configuration suspects the item was
filed against are innocent.

## The measurement

Tree clean at `1a66f939`, 16 cores, `maxWorkers: '75%'` unchanged throughout:

| Condition | Runs | Runs with failures | Failed suites |
|---|---|---|---|
| One suite at a time | 10 | **0** | 0 |
| Two suites concurrently | 6 | **6** | 4–6 each |

The concurrent failure signature is exactly what the item reported: `Exceeded
timeout of 10000 ms` in `inExtensionMcpServer`, `inExtensionMcpServer.socketOwnership`,
`mcpConfigWriter`, `extension-context`, `executor-appBuilderComponentLoading`,
`executor-meshComponentLoading`, plus `processCleanup.timeout`'s wall-clock
assertion reading up to 12,793 ms against a 2,000 ms bound. Every one passes solo.

Two Claude sessions work this repo and the sibling worktree symlinks `node_modules`
straight back to the main checkout, so overlapping runs were routine and nothing
announced them. A peer session independently hit a teardown failure at 11:50:01,
inside the contention window measured here (11:48:51–11:51:32).

## Why the original suspects were wrong

`maxWorkers: '75%'` is green 10/10 with the box to itself, at load average 11 with
no cooldown between runs — harsher than a normal gate. The sibling item's
`0/3 at 25%, 3/3 at 75%` measurement was real but measured the force-exit WARNING,
not suite failures, and generalising it to this symptom pointed at the wrong lever.
Bisecting the worker count would have "fixed" the flake by making runs slower and
the collision window narrower, leaving the actual cause in place.

## What shipped

- **`.claude/hooks/rules/15-jest-concurrent.rule`** — blocks starting a jest run
  while another is live. Counts jest PARENT processes (`node_modules/.bin/jest`,
  verified disjoint from its own `jest-worker` children), ignores `--watch`, and
  never counts a run it is executing inside. Matches on the COMMAND WORD of each
  pipeline segment, so `ps … | grep jest` is not mistaken for running jest — the
  first cut did make that mistake and blocked a peer within minutes.
  `router.sh`'s prefilter gained `npm test` / `npm run test`, which start jest
  without the string "jest" appearing anywhere.
- **`tests/hooks/router.test.ts`** — 21 → 30 tests. Every test now runs against a
  synthetic `ps` snapshot by default; without that the suite's own assertions
  depend on what else is running, which failed 6/6 under concurrency and took the
  pre-existing jest-pipe test with it.
- **`tests/core/shell/processCleanup.timeout.test.ts`** — four wall-clock upper
  bounds removed. Each duplicated a claim already proven deterministically with
  fake timers in `processCleanup.mocked.test.ts` / `processCleanup-coverage.test.ts`;
  against real processes they asserted machine speed. 61 tests still pass.
  Also: `spawnedPids` was declared and **never pushed to**, so the `afterEach`
  safety net iterated an empty array for its whole life and every failed test
  leaked a `node … setTimeout(60000)` process for a full minute — failures adding
  load, causing failures. Now wired up.
- **`jest.config.js`** — `cache`/`cacheDirectory` moved into the two `projects`.
  At the top level they do not propagate (same trap the file already documents for
  `roots`) and were inert: `.jest-cache/` has been in `.gitignore` since the day it
  was configured and the directory had never existed. Jest was silently using its
  default cache under `$TMPDIR`, shared with every other checkout.
- **`scripts/validate-jest-config.js`** — was failing on `develop` and wired into
  no CI job, so nobody saw it. It pinned `maxWorkers` to an exact 50%; the value
  moved to 75% in `3c17791e` and the check never followed. Now reads the real
  config object and asserts the invariants with a documented failure mode
  (`workerIdleMemoryLimit` at 256MB, cache declared per-project, maxWorkers a
  percentage within range) rather than pinning a tuning knob.
- **Docs** — `.rptc/CLAUDE.md`, `.rptc/sop/testing-guide.md`, `.test-cheatsheet.md`.
  The full suite takes **~20 seconds**, not the 3–5 minutes documented everywhere;
  `test:unit` ~12s not 2–3 min; `test:ui` ~5s not 30s–1min. Archived
  `.rptc/complete/` copies left as the historical record they are.

## Verification

10 runs before, 6 after: 0 failed suites in both. A 2-trial concurrency re-run
confirms `router.test.ts` went from 6/6 failing to 0 — the rest of the contention
set still fails under concurrency, which is the point: the guard prevents the
condition rather than making it survivable. Final gate: `tsc` clean, whole-repo
eslint 0/0, **996 suites / 12,773 tests green**.

## The guard is a narrowing, not a fix — demonstrated during its own verification

The first attempt at that final gate returned **7 failed suites, 14 timeouts —
the exact contention set** — with the guard installed. The immediately following
run, sampled with `ps` every 3 seconds to confirm it was alone, was 996/996 green
with zero timeouts.

A PreToolUse hook only sees Claude's own tool calls. Runs started from a terminal,
from inside a shell script (including the measurement harness used for this
investigation), or by a session whose checkout predates the rule file are invisible
to it. Nothing was sampled during the failing run, so contention there is inferred
from the signature rather than proven — but the guard did not prevent it either way.

**Operational consequence, worth more than the guard itself:** failures concentrated
in `inExtensionMcpServer` / `mcpConfigWriter` / `extension-context` /
`executor-*ComponentLoading` should be read as *suspected contention* before they
are read as a regression, and a full-suite result — green or red — is only worth
what the `ps` sampling alongside it is worth.

## Left open, deliberately

- ~~The MCP socket root is shared across concurrent runs.~~ **FIXED — see below.**
- **An attempt to isolate this variable is recorded as VOID, not as evidence.**
  Re-running the contention trial with per-run `TMPDIR`s moved socket paths for
  suites that derive them from `os.tmpdir()` directly, producing `EADDRINUSE` and
  `ENOENT` that do not occur normally. It changed more than the one variable and
  discriminates nothing. Do not cite its numbers.
- **The sibling force-exit item's rate needs correcting.**
  `2026-06-09-jest-worker-force-exit.md` is indexed as "3/3 at 75%". Across the 16
  full runs here it appeared in **7** — about 44%, not reliably reproducible on
  demand. It never co-occurred with `ENOTEMPTY` (0/16), which kills the peer's
  "one root cause" hypothesis in the direction testable from here.
- **Ten other wall-clock upper-bound assertions remain** across
  `cacheManager-operations` (`duration < 10`), `retryStrategyManager`,
  `csp-nonce-security`, `commandSequencer`,
  `adobeEntityService-organizations-edgeCases` and `processCleanup.test.ts`.
  None failed in any SOLO run. `processCleanup.test.ts` did fail once under a
  later concurrency trial, which is the same starvation story as the assertions
  already removed — so treat them as latent under contention rather than sound.
  Listed so the next person does not have to re-derive the inventory.

---

# Follow-up: per-run MCP socket root (same day)

The peer session declined this one and routed ownership to the user, who assigned
it here. Their reason for declining was good and is worth keeping: it is
`tests/setup/`, every suite depends on it, and changing teardown semantics for the
whole repo from a feature branch on one unreproduced correlated failure is how the
next invisible bug ships.

## What changed

- **`tests/setup/mcpTestSocketRoot.ts`** (new) — one home for the path, shared by
  setup, teardown and the guard test, so the three cannot drift into disagreeing
  about it.
- **`tests/setup/globalSetup.ts`** (new) — stamps the jest MAIN process pid into
  the environment before any worker spawns. Workers inherit it.
- **`tests/setup/node.ts`** — socket dir is now `<base>/<runId>/w<workerId>`
  instead of `<base>/w<workerId>`.
- **`tests/setup/globalTeardown.ts`** — removes only `<base>/<runId>`, never the
  shared base. Then sweeps sibling run dirs whose pid is dead, so keying per-run
  does not simply trade a collision for unbounded growth. A run whose pid is still
  alive is a concurrent run and is left strictly alone (EPERM counts as alive —
  the safe direction, since treating a live run as dead is what deleted sockets).
- **`tests/setup/mcpTestSocketRoot.test.ts`** (new, 4 tests) — runs in a WORKER, so
  it passes only if globalSetup's env actually reached the worker. Nothing else in
  the suite would notice if that chain broke: the fallback in `socketRootForRun()`
  is deliberately silent, so a break would look like normal operation until two
  concurrent runs deleted each other's sockets.

`globalSetup`/`globalTeardown` DO apply to a multi-project run (jest runs them once
for the whole run) — unlike `cache`/`roots`, which silently do not. Noted in
`jest.config.js` so the next person does not have to re-derive which is which.

## Verified

Seeded the base with two fake run trees — one named for a live process, one for a
dead pid — then ran the suite:

- own subtree removed ✅
- **live run's sockets survived** ✅ (this is the defect: it used to delete them)
- dead run's tree swept ✅
- run id observed in a worker is numeric, i.e. from globalSetup, not the fallback ✅

Full suite **997 suites / 12,777 tests green**, sampled with `ps` throughout to
confirm it ran alone (max 1 jest parent). tsc clean, eslint 0/0,
`validate:jest-config` passing. Two concurrent full suites: **0 ENOTEMPTY, 0
globalTeardown errors**.

## What this does NOT fix, stated plainly

**It does not reduce the contention failures.** Across 4 concurrent runs before and
after, the MCP suites failed the same number of times (2 → 2 each); the movements
elsewhere (2 → 4) are noise in a sample that small, not a regression signal. Those
failures are CPU starvation and always were.

**And the failure that motivated it was never reproduced here.** `ENOTEMPTY` was 0
in all 20 runs measured across the day, before and after. The fix is verified
correct by construction — a live run's tree demonstrably survives a concurrent
teardown now, and demonstrably did not before — but no observed failure has been
shown to go away, because none was ever observed locally. The peer's report plus
the timestamp correlation (their failure 16 seconds after one of these teardowns
fired) is the whole of the evidence that it was ever hit.

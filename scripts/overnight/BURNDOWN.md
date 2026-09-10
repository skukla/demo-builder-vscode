# The mutation burn-down: why each rule in the goal exists

Every goal condition points here. The goal carries the INSTRUCTIONS, short enough to
survive the 4,000-character limit `/goal` enforces; this file carries the evidence for
them, which is what was crowding the module list out of the goal (2026-09-05: five rules
added in a day squeezed batches from five modules to two).

Read this once per batch. It does not change between batches.

## Why suites named for a FUNCTION are renamed before measuring

`suitesFor` in `scripts/focusModule.mjs` finds a module's suites by convention: inside
`tests/<the module's directory>`, any file whose name starts with the module's stem. A
suite named after the function or scenario it exercises is invisible to it, so its kills
count towards nothing — the tests run and pass on every build and no measurement sees them.

Measured on 2026-09-05, rename alone, before any test was written:

| Module | Before | After |
|---|---|---|
| `importHandlers.ts` | 151 | 62 |
| `dataInstallerWriteClient.ts` | 106 uncovered | 17 |
| `inExtensionMcpServer.ts` | 83 | 49 |
| `demoPackageLoader.ts` | 55 | closed to 97% with the moved suite |

**REJECT as well as accept.** Two correct refusals the same day: three suites around
`readDescriptors.ts` cut across four descriptor families rather than belonging to one, so
attributing them would have inflated one file and hidden three; and two suites near
`webviewCommunicationManager.ts` read the source as TEXT rather than exercising it, so
counting their matches would have inflated the score while proving nothing. Confirm by
imports, and that the suite drives the module rather than reading it.

The survey is backlog PL-45. It is a floor: `demoPackageLoader.ts`'s suite sat in another
feature's directory entirely, reaching the module through a re-export barrel, which the
survey's detector cannot see.

## Why small modules share one measurement

A module pays a fixed toll — one measurement, a re-measure, the scoped check, a commit —
whatever its size. Measured over 61 modules on 2026-09-05: 1.0 gaps closed per minute at
1-5 open gaps against 13.7 at 100+, while median time moved only from 2.5 to 10.6 minutes.

`focusModule.mjs` takes any number of paths and writes one config covering them all. The
report is per-module (Stryker keys by file, `checkMutationBaseline` writes a row for each),
so nothing downstream changes. Commit one module at a time regardless, so a failure stays
attributable to one change.

It refuses a group in which any module has no suites, rather than measuring the rest and
reporting that module a confident zero.

## Why the check is scoped per module and the gate runs once per batch

The repo-wide gate takes ~84 seconds and the pre-push hook runs it AGAIN, so gating every
module the heavy way cost 95 minutes of one run on 2026-09-05 — a fifth of it, spent
twice. The scoped check keeps failures attributable; the full gate at push is what decides
what leaves the machine, and it has refused pushes for real reasons since.

`validate:test-file-sizes` is in the scoped set because it is a one-second script and 750
lines blocks CI: leaving it to push meant finding out four modules later.

## Why commits name an explicit pathspec

`git mv` stages a rename by itself, so a plain `git commit` — no flags, nothing explicitly
added — carries whatever a concurrent session staged. That put nine files of one session's
work into another's commit on 2026-09-05, and then four renamed suites into a commit about
an unrelated module. "Never `-a`" does not describe either case; committing an explicit
list of your own paths does.

## Traps that have cost real time

- **The incremental cache goes stale.** After editing the code or tests under measurement,
  delete `reports/mutation/focus-incremental.json`. It reported a wrong score three times
  on 2026-09-05, each caught only because a run finished suspiciously fast.
- **Wait on `Done in`, never `mutation score`.** Stryker capitalises it, so a
  case-sensitive match never fires — 16 minutes lost on 2026-09-04.
- **`expect([undefined]).toEqual([])` passes.** Emptiness assertions with `toEqual` let a
  wrong result through; use `toStrictEqual`. Backlog PL-43.
- **A mock missing a method makes the code abort into a catch, and the test still passes.**
  Three variants found on 2026-09-05: a missing method, a render function never called, and
  dropped props. Each hid code rather than breaking anything, and the only symptom was a
  coverage number nobody could explain.
- **Verify an equivalent by planting the mutation**, not by reasoning. Doing so found a test
  whose assertions ran between two awaits and were passing on nothing.

## The 4,000-character limit is real

`/goal` refuses a longer condition outright: `Goal condition is limited to 4000 characters`.
It was raised to 4,600 on 2026-09-05 on the strength of the delivery path — the runner
passes the text as a shell argument and ARG_MAX is 1,048,576 — which measured the wrong
layer and stopped three batches from starting. Buy room by moving prose HERE, never by
raising the cap.

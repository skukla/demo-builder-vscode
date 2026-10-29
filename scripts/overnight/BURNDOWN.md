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

## Why an uncovered mutant is checked against the importing suites before a test is written

A focused run selects the suites NAMED for the module. A mutant it reports uncovered may
be reached by a consumer's suite that was never selected, and a test written for it then
duplicates one that exists. After the first measurement run
`npm run test:mutation:measure -- --widen`: it adds the importing suites for every module
the run left uncovered and measures again, or says there is nothing to add. A later
measurement of the same modules keeps the widened suites. Found 2026-10-10 working the 754 gaps the stale-row re-measure exposed; the
evidence is in the `mutation-test-pilot` skill.

## Why there is one way to measure, and it has limits

`npm run test:mutation:measure -- <module(s)>` (`scripts/mutationMeasure.mjs`). On
2026-10-10 a session working these gaps outside the runner stalled four ways in one
morning, and each rule in the goal is one of them:

- **Nothing bounded a measurement's size or its time.** Nine files, 1,112 mutants, one
  run: 45 minutes with no result, killed by hand. The command refuses a GROUP over 400
  mutants before starting (a module's size is its baseline row; with no row it is
  estimated from its line count, and the output says which) and kills the whole process
  tree at 12 minutes, exit 124.
- **The session waited in a shell loop for `Done in`**, a line a dead run never prints,
  and in a jest run with `--detectOpenHandles`, which does not exit. So: never wait in a
  loop for output, and never start an open-ended run. The command returns by itself, with
  one final line to paste.
- **Stryker's workers ran out of memory**, and the session diagnosed it from scratch. It
  was already written down: test memory growth is in
  `.rptc/research/test-file-organization-and-memory-optimization/research.md` and in the
  comments of `jest.config.js`. So: grep the research, the docs, this file and the
  config's comments BEFORE diagnosing, and say what was found. (The fix is in
  `stryker.focus.config.json`: `maxTestRunnerReuse: 50`.)
- **Nobody could tell how far along it was.** `npm run mutation:status` now can.

The temp directory and the incremental cache are removed on every exit, so the
stale-cache trap below cannot happen through this command. It does not write the
baseline: pinning stays a separate act, after the ratchet check.

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

Sharing and the 400-mutant budget are the same rule seen from both ends: group SMALL
modules until the group nears 400 mutants, and measure anything larger alone. Each
module in the goal is listed with its mutant count so the grouping can be done by
reading. A single module over 400 is measured alone with `--timeout-min 30`.

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
- **Do not wait on a line of output at all.** The advice here used to be "wait on
  `Done in`, never `mutation score`" (16 minutes lost on 2026-09-04 to the wrong
  string). On 2026-10-10 a session waited on the RIGHT string for a run that had died.
  `npm run test:mutation:measure` returns when the run ends or its limit does.
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

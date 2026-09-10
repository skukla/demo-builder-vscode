# What the mutation sample misses

**Measured 2026-09-02, during the overnight loop.** One question, answered with numbers:
do the twelve modules we measure effectiveness on represent the codebase?

They do not, and the gap is about a factor of two.

## The measurement

Every number below is a mutation score: the tool changes the source on purpose — a
`true` becomes `false`, a line is deleted — re-runs the suite, and reports how many of
those changes the tests caught. It answers "would these tests notice a bug", which
coverage does not.

### The pinned set — 13 modules

Median **84.54%**, mean 85.00%, lowest 66.88%. (Four of these were improved during the
same session, so the median is flattered slightly; before tonight the lowest was 54.43%.)

### The files this repository's own documentation calls key

`CLAUDE.md` lists eleven "Key Files". Five are code rather than config. Measured for the
first time:

| Module | Score | Mutants nothing reaches |
|---|---|---|
| `src/extension.ts` | **8.77%** | 135 of 228 |
| `src/features/authentication/services/authenticationService.ts` | **39.25%** | 54 |
| `src/features/updates/services/componentUpdater.ts` | **44.60%** | 39 |
| `src/features/updates/services/updateManager.ts` | **51.40%** | 12 |
| `src/core/state/stateManager.ts` | **56.49%** | 11 |

Median **44.60%**.

One of those numbers was corrected before this was written down. A first pass reported
componentUpdater at 39.67%, from arithmetic done by hand over the report. Stryker marks
some mutants `RuntimeError` — invalid mutations that could not run at all — and excludes
them from the denominator, as our own summariser does; counting them as undetected
understates the score. Thirteen of that file's 300 were in that state. Every other number
here came from the summariser and needed no correction.

The sixth key code file, `WizardContainer.tsx`, could NOT be measured: the focused runner
uses the node Jest project, and a React component's tests need the react one. That is a
gap in the instrument, not a result — do not read it as untested.

## What this means, and what it does not

**It means the effectiveness figure we quote is optimistic.** An earlier pass in the same
session put the codebase somewhere around 59–93% with a wide confidence interval, derived
from the sample. That interval was computed correctly and from an unrepresentative set.

**It does not mean the sample was chosen badly.** A sample of twelve is a sample; the
point of measuring more is to find out where it is wrong, which is what happened here.
And nobody claimed these were the worst modules — they were a starting set.

**One number needs a caveat rather than alarm.** `extension.ts` is an entry point:
activation, command registration, wiring. Much of it is a list of registrations, where a
mutation survives because nothing observable changes if one line of wiring is altered in
a test that never activates the extension. A low score there is less damning than the
same score on logic. The other four are ordinary logic and the numbers mean what they
look like.

## The answer to "is twelve enough?"

That question was asked earlier in the session and answered with statistics: the spread
across twelve modules gives a 95% interval of roughly 74–92%, and the advice was to
ROTATE modules rather than add more, because a module you have worked is no longer a
sample of anything.

The rotation advice stands. The framing was incomplete: **the problem is not how many, it
is which.** Twelve randomly chosen modules would have found this; twelve modules that all
happened to be well-tested cannot. Selecting the next set by IMPORTANCE — the files this
repo says are load-bearing — found five modules below the sample's minimum in about ten
minutes.

## Recommended next targets, in order

1. `componentUpdater.ts` (44.60%, 39 unreached) — it snapshots, updates and rolls back
   the components inside a user's project. A defect here damages work that already exists.
   Started during this loop: the rollback path now has tests, and the score moved from
   39.67% to 44.60%. The remaining 120 survivors are the largest single pool measured.
2. `authenticationService.ts` (39.25%, 54 unreached) — every Adobe operation goes through
   it, and its failure modes are the ones users report.
3. `updateManager.ts` (51.40%) — the other half of the update path.
4. `extension.ts` — only after deciding what a mutation score there should mean.
5. Teach the focused runner to measure React modules, then `WizardContainer.tsx`.

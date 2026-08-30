# Overnight loop — 2026-08-30

Worked on `loop/2026-08-29-convergence-phases`, now **merged into develop and
pushed**; the branch is kept as a backup. Full gate (tests + both typechecks +
whole-repo lint) green on every commit, and green again on develop after the merge:
15,423 tests across 1,198 files.

(This line said "15 commits ahead of develop" for most of the run. It was true when
written and stopped being true twice over — the run kept going, and then it merged.
The count is left out now rather than pinned to a number that ages the same way.)

---

## The short version

The test-quality programme is finished except for one lane, and that lane turned
out to be a different job than we thought.

Two new tools exist. One runs the test-suite censuses and — the important part —
says which of their numbers actually mean anything, because three of them
provably don't. The other is mutation testing: it breaks the code on purpose and
checks whether any test notices. That one scored 93% and named the 7% it caught
us on.

The night's recurring theme, and it cost real time: **several of our measurements
count what code looks like, not what's wrong with it.** I hit that four times. I
also got three of my own measurements wrong before catching them, which is the
same disease. All corrections are in this report and in the plan.

Nothing here needs a decision except whether to merge.

---

## The longer version

I picked up where the last stretch left off: finishing the duplicated-test cleanup,
then building the two release-time instruments the plan had never got to.

**The duplicated tests.** The scanner had reported 15 test files that repeat
themselves. Twelve were real, and those are now fixed — each one had the same block
of setup pasted two or three times, and each is now written once. I checked every
one by comparing the list of things the tests assert before and after; in all twelve
that list is identical, which is what proves a cleanup didn't quietly delete a check.

The last three were the biggest and looked the worst — one claimed 344 duplicated
lines. They aren't duplication at all. The scanner was reporting a block as a copy of
*itself*, at overlapping positions. I confirmed it by generating a file where thirty
tests share a shape but nothing whatsoever is copied, and the scanner flagged that
too. Nothing can be removed from those three files, because nothing repeats. The test
for spotting this is now written into the scan's own instructions so the next person
skips it in seconds instead of hours.

**The two new tools.** The first collects our three test-suite surveys into one
release-time check. Running them was never the hard part; knowing which columns to
believe is. Three of them — including one counting "logic in tests" — measure style
rather than defects, and I'd rather that verdict live in the tool than be rediscovered
annually. The sharpest illustration: extracting duplicated setup into a shared helper
is plainly good, and it *raises* the "logic in tests" count, because a helper is a
function. Two of our own instruments then disagree about the same commit.

The second is mutation testing, which the architecture document has named as the way
to measure test quality since it was written, and which nobody had built. It changes
the code in small ways — deletes a trim, flips a condition, blanks a string — and
re-runs the tests. Anything that survives is a bug our tests would let through. It
scores 93% over four modules in 33 seconds.

It embarrassed me immediately, which is the best argument for keeping it. The module
that scored *worst* was one I'd written tests for that same day, deliberately, with
the success criteria written down in advance. It scored 78%. Five mutations survived
— a deleted trim, a disabled guard, a dropped final newline — and every one is
something a hand-edited settings file actually contains. Five more tests took it to
100%. Reading your own tests cannot find that, and the coverage number certainly
doesn't.

Before it scored anything it also found a genuine bug: a test started two operations,
waited for the one that succeeds, and left the one that fails unattended for a
fraction of a second. Our test runner tolerates that. A plain Node process treats it
as fatal. It had been sitting there quietly for as long as the test existed.

**The last lane, and why I stopped.** The remaining work is roughly 5,500 lines of
setup code copied between related test files. The plan called it twenty mechanical
extractions. It isn't. I grouped the files into families and compared what each
actually mocks: 17 families genuinely share identical setup and can be merged safely;
26 have *drifted*, and merging those would silently change what they test. The worst
is one family of 11 files carrying 5 different versions of the same setup, where some
files fake a module wholesale and others deliberately keep the real thing. Collapsing
those onto one version would hand real code to tests that meant to fake it — and every
test would still pass, because a fake answers the same no matter what you give it.

The cause is written in the family's own helper file: its opening comment *instructs*
every test to paste the setup in. The duplication was the documented procedure. That
instruction has since drifted from what the files actually do.

I nearly stopped there, on the grounds that I'd made three measurement corrections in
the preceding hour and this refactor's failure mode is passing tests that check
nothing. Then I reconsidered, because that reasoning only holds for the 26 drifted
families. For the 17 identical ones the failure is *loud*: if the setup stops
applying, the tests go red immediately.

So I did the first one — the `AdobeAuthStep` family, four files each carrying the same
24 lines. It's now done, and more importantly it establishes the recipe, including the
check that makes it safe: I deliberately broke the shared setup and confirmed exactly
the four dependent test files failed, then restored it and confirmed all seven passed
again. Without that step, "the tests are green" would only tell me the tests ran. That
control is written into the plan as required for each of the remaining sixteen.

---

## Shipped

| What | Evidence |
|---|---|
| 12 self-repeating test files fixed | Assertion sets identical before/after in all 12; scanner count 15 → 3 |
| 3 remaining "duplicates" proven false | Synthetic control reproduces the signature with zero copy-paste; detection rule added to the scan skill |
| `test-strategy-scan` | New skill; runs three censuses + the verdict table. Registered, offered by `cut-release` |
| Mutation testing pilot | `npm run test:mutation`, 93.37% over 166 mutants in 33s. Registered; runs inside `npm run sweep` |
| `envMerge` tests strengthened | 78% → 100%; 5 surviving mutants killed, re-run proves it |
| Unhandled-rejection bug in `componentUpdater-core` | Fixed; found by the pilot's dry run |
| Missing ledger row for `envMerge.ts` | Ledger back to green (1001 rows), self-test control still detects a planted hole |
| **14 test families stopped pasting their shared setup** | Each verified three ways: tests green, per-file assertion sets unchanged, and a planted control proving the shared setup still binds. Duplicated blocks across files 140 → 124; duplicated lines 6,739 → 5,950 |
| **Two misleading measurements retired** | `logicInTests` deleted from the survey (detector, self-test and all); `throw-style` struck from the plan. The survey now reports only numbers worth acting on |
| Merged into develop and pushed | Full suite green on develop after the merge: 15,423 tests, 1,198 files, both typecheckers, whole-repo lint |

## Handed off

**29 families whose shared setup has drifted apart.** Real work, and deliberately not
started: merging drifted setup changes what the tests check while every test still
passes — the failure you cannot see. Each family needs a decision about which version
is correct first.

Worst first: `installHandler` (11 files carrying 5 different versions of the same
setup), `dashboardHandlers` (6 files, 6 versions), `edsResetService` (5/5). Three more
arrived here from the mechanical group once it became clear they were not single
merges: `appBuilderComponentRunner` is really two separate groups needing two different
shared files, and `skillsWriter` and `daLiveAuthService` have files that mock the same
thing in different ways.

One separate case: `blockCollectionHelpers`, 6 files with no mocks at all — its
duplication is fixtures and test bodies, so the shared-setup recipe does not apply.

## Filed, not forced

- **11 surviving mutants** across three modules, recorded in the mutation skill as
  classified leads rather than a score to chase. One is worth doing on merit: nothing
  asserts that `sanitization.ts` actually *removes* the characters it strips, and that
  function guards against log injection.
- **`logicInTests` moved 161 → 167** during the programme. I checked whether my own
  work caused it — neither the 7 files I refactored nor the 4 test files I added are
  flagged. Since it isn't a defect metric, I didn't chase it further.

## Corrected

Four things I got wrong and fixed. The first three are the same mistake — trusting my
own measurement before controlling it — which is exactly what I spent the night
finding in our tooling.

1. **Read an exit code through a pipe.** Reported the ledger check as passing when it
   was failing; `tail`'s exit code is not the command's. This repo documents that trap
   specifically and I walked into it. Real answer: it was failing, on a missing row for
   a file I'd created earlier in the loop. Now fixed and green.
2. **"Only 6 of 140 duplicates are real."** My verifier demanded a whole-fragment match;
   the scanner's fragment boundary overshoots by a few characters. Reading one pair by
   hand is what caught it. Real answer: essentially all 140 are real.
3. **"4 families safe, 40 need judgment."** I'd defined each file's setup as everything
   before its first import, which cuts different files at different places. Corrected
   method compares actual mock calls and carries two controls. Real answer: 17 and 26 —
   more than four times as much mechanical work available as I first reported.
4. **Claimed a missing `trace` in a mock logger was a live hazard.** Checked before
   writing it up: it isn't reachable in those tests. Dropped the claim.

## Environment

Nothing expired, nothing blocked, no sign-ins needed. Two new dev dependencies
(`@stryker-mutator/core`, `@stryker-mutator/jest-runner`) and one new npm script.
Mutation reports and sandbox directories are gitignored.

One note: adding the npm script with a JSON round-trip reflowed em-dashes across
package.json's user-facing setting descriptions. Caught and reverted; the committed
diff is the script plus the two dependencies and nothing else. `cut-release` warns
about exactly this for `npm version` — it applies to any programmatic edit of that file.

## What you decided, and what happened

All three questions this report originally parked were answered the same day and
carried out:

1. **Merge into develop** — done, and pushed. Develop and the remote are in sync.
   Full suite green on the pushed state.
2. **Retire the two misleading measurements** — done. `logicInTests` deleted outright
   rather than footnoted, because a known-bad number left in the output gets acted on
   by whoever did not read the warning. The reasoning, and the bar any replacement has
   to clear, sit where the detector used to be.
3. **Finish the mechanical merges** — done. 14 shipped; 3 of the original 17 turned
   out not to be single merges and moved in with the drifted group.

## What is left

Two things, and they are different kinds of thing.

**Phase 9 — does the 93% hold?** (filed as PL-22.) The mutation score covers four
modules chosen *because* we believed they were well tested, so it reads our best work
rather than the average — and one of those four still scored 78%. Point the same tool
at four to six modules nobody is confident about: suites the survey flags as
`module-wall`, the two coverage laggards phase 6 raised by writing new tests, and
something old and load-bearing. Hours, not days.

**Lane C2 — the 29 drifted families**, described above.

**Do phase 9 first.** It is cheaper, it does not depend on lane C2, and it answers a
question lane C2 cannot: C2 tidies how the tests are written, phase 9 asks whether they
work. If the answer comes back near 93%, the case for a strengthening pass largely
goes away — which is worth knowing before spending days on one.

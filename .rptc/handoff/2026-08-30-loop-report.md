# Loop report — 2026-08-30, enforcement

Branch `loop/2026-08-30-enforcement`, four commits, pushed. Full gate green after
each: 15,480 tests, both typecheckers, whole-repo lint.

## The short version

Three jobs were queued: write the three convention-checks nobody had written, sort
out the overlap between `CLAUDE.md` and the architecture handbook, and find out
whether the 93% mutation score meant anything outside the four modules it was
measured on. All three are done.

The headline is the third one. **It does not hold: 93% on the pilot, 59% on a fair
sample.** The tests are much weaker than we believed on exactly the code that is
hardest to test — async, heavily-mocked service and handler code.

The other theme is uncomfortable and worth stating plainly: **three separate
instruments in this repo were silently not running, and each looked exactly like an
instrument that had run and found nothing.** One I created myself this morning. That
is now the thing most guarded against.

Conventions with an enforcer went from 41 to 52, out of 58.

---

## Item 1 — the three unwritten checks

**Shipped.** Each was proved by planting the violation it exists to catch and
confirming the build goes red.

- **Component style blocks stay local.** Found 13 classes defined inside one
  component's `<style>` block and used by others. Nothing is broken — every one is
  also in `custom-spectrum.css`, which all eight bundles import — so they are
  redundant copies, not missing styles. Ledgered; the set may only shrink. Removing
  them is NOT free (the global copies carry `!important` and the inline ones do not,
  so deletion can change which rule wins) and belongs to the CSS migration.
- **Styling goes through `cn()`, not style objects.** There was already a cap of five
  per file, which bounds one file and says nothing about the total — twenty files
  could each add four and stay green. The totals are now pinned: 3 static, 20 dynamic,
  separately, so removing a static one cannot be paid for by adding a dynamic one.
- **Exit codes read through a pipe.** New hook rule. It blocks branching on a pipe
  into `head`, `tail` or `wc`, which exit 0 whatever they were fed. `grep` is
  deliberately not blocked, because `cmd | grep -q x && …` is correct.

### What this turned up

The hook system has a hand-maintained list of substrings at the top; if a payload
matches none of them, no rule runs at all. My new rule's token was not in that list,
so **the rule was written, reviewed, and proved dead by its own test harness** before
I noticed. The same thing had happened before to a different rule.

Every rule now has a probe payload it must block, checked against the rules directory
in both directions. Verified by deleting the token again and watching it go red.

Also pinned: the hook-rule count in `CLAUDE.md`, which said 9 against 10 on disk.

---

## Item 2 — CLAUDE.md and the handbook

**Shipped, and the conclusion is the opposite of the plan.**

The plan was to delete the duplicated rules from `CLAUDE.md` and leave pointers.
Measuring first showed that would make things worse: **`CLAUDE.md` is loaded into
every agent session automatically and the handbook is not.** Delete a rule from
`CLAUDE.md` and agents stop seeing it; delete it from the handbook and it stops being
explained. The duplication is doing a job. Only the silent drift was broken.

So the seven shared rules are now pinned to each other, each side matched on its own
wording, and the check fails if either copy is edited away.

Measuring the overlap also found three rules about the CODE living only in
`CLAUDE.md`. One is enforceable and now enforced: **never pass an argument as `any`
or `never`** — clean across 904 files, so a hard rule. `CLAUDE.md` records four
production no-ops that cast hid, each with twelve green tests, because a mock answers
the same whatever it is handed.

`CLAUDE.md` now links to the handbook, which it never did.

---

## Item 3 — does 93% hold? (PL-22)

**Answered: no.**

| | Pilot | Fair sample |
|---|---|---|
| Score | 93.37% | **59.29%** |
| Modules | 4 | 8 (7 + a control) |
| Mutants | 166 | 1,329 |
| Time | 33s | 16m 15s |

The seven were picked by a deterministic stride across all 423 source files that have
a test — not "modules nobody is confident about", which the plan originally suggested,
because that is a biased selection too and answers a different question. `envMerge.ts`
was re-run as a control and reproduced its 100% exactly, so the gap is real.

**The pattern is the finding.** The score falls almost monotonically with how much
`await` a module contains:

| Module | Score | awaits |
|---|---|---|
| `envMerge.ts` (control) | 100% | 0 |
| `commerceCredentialStore.ts` | 95.65% | 5 |
| `claudeCodeFootprint.ts` | 83.33% | 11 |
| `daLiveAuthPrompt.ts` | 67.04% | 15 |
| `installHandler.ts` | 41.77% | 41 |

The pilot's four modules average ONE await and two are pure functions. It measured the
easiest slice in the repo. What the tests fail to constrain is async, heavily-mocked
code — the same conclusion as the standing rule that a mock cannot see a malformed
call, reached from the other direction.

### Two traps that each produced a plausible wrong answer

- **The first run said seven of eight modules had near-zero coverage, in 19 seconds.**
  That number was false. Stryker mutates one hand-maintained list and runs tests from
  another, and the jest config hard-codes the pilot's four test paths — so those
  modules had no tests selected and every mutant landed in "no coverage", which reads
  exactly like a catastrophe. There is now a build-failing check that a mutated module
  always has a test selected. **The control passed while every other number was
  meaningless**, which is the standing lesson: a control proves the tool works, not
  that you aimed it right. The tell was the clock — 1,300 mutants cannot run in 19s.
- **Stryker's sandbox is a full copy of the repo**, so running jest during a mutation
  run makes jest find two of every manual mock and corrupt its own file listings. That
  was live for the original pilot too; jest now ignores it.

---

## Also done

- **The sidebar's second message channel: checked, not a defect.** It looked like two
  implementations of one job. It is not: the sidebar sends 15 one-way commands in two
  lines, while `WebviewClient` is 311 lines of handshake, queue and request/response.
  Routing the sidebar through it would add a handshake it does not take part in. The
  verdict is recorded where the question was raised.
- **The convergence plan is closed.** Phase 9 WAS PL-22, so answering it completed the
  programme; the plan moved to `.rptc/complete/` and the record scan is clean.

## Your decisions

1. **Merge `loop/2026-08-30-enforcement` into `develop`?** Four commits, gate green.
2. **Do we act on the 59%?** It is a real weakness with a named target — async,
   heavily-mocked handlers, `installHandler.ts` worst at 41.77% with 193 survivors.
   Strengthening those tests is a sizeable piece of work and I have not started it.
3. **The 13 redundant style-block classes** are safe to remove but need the visual
   baseline instrument first, because of the `!important` difference. Part of the CSS
   migration, still unauthorised.

---
id: PL-49
kind: chore
area: platform
needs: []
value: high
status: shipped
parent: PL-11
---

# 635 tests catch nothing — find out WHY before deciding what goes

Measured 2026-09-07 by the redundancy sweep that followed [[PL-22]] to zero. It completed
all 609 modules: of **21,429 tests, 792 caught no deliberate change** to the code they were
measured against. Not "caught less than another test" — caught nothing at all.

(An earlier draft said 635 of 15,227, read from a partial log midway through the run. The
figures here are the sweep's own final totals.)

Sibling of [[PL-48]], which covers the much larger droppable count. These two are different
findings and must not be merged: droppable is a property of a GROUP and names no test, while
this list names individual tests exactly.

## The deliverable is a classification, not a delete list

A test that catches no change is not automatically worthless. It may assert a behaviour
nothing can mutate, or document intent for a reader. The first real example read
(`accsDiscoveryConfig.ts`) was exactly that shape:

> `deriveCredentialServiceUrl returns undefined when the URL is empty`

A genuine behaviour, asserted correctly, that no mutation can break — so the metric cannot
see its value. Deleting it would remove a true statement about the code and gain nothing.

So the question worth answering is **why** these 635 catch nothing, because a pattern points
at a habit worth fixing, and fixing the habit is worth more than any number of deletions.

## FIRST: normalise by how much there is to catch — it removes a third of the list

**Stryker has no mutator for plain numbers.** Verified across 120 modules: zero numeric
mutations, out of 10,400. A module built from numeric constants therefore generates almost
nothing to catch, and every test of it is scored as catching nothing — correctly, and
meaninglessly.

`core/utils/timeoutConfig.ts` is the proof: **380 lines, 4 mutants, all caught.** Its 88
"catch nothing" tests are not weak tests. There is nothing there for them to catch.

Dividing mutants by tests separates the artefact from the finding:

| | tests | share of the 792 |
|---|---|---|
| In modules with < 0.5 mutants per test | 245 across 13 modules | **31% — not findings** |
| In modules with a normal amount to mutate | 547 across 153 modules | 69% — the real question |

**Do this filter first.** It is minutes of work against
`reports/mutation/redundancy/summary.jsonl`, which already carries `mutants` per row, and it
removes a third of the list before anyone reads a single test.

## The two headline examples were BOTH artefacts — the first hypothesis is dead

An earlier draft named `dashboardHandlers.ts` (101 of 133) and `timeoutConfig.ts` (88 of 93)
as the clusters to read first, and proposed they might share one cause: this repo's known
trap that asserting a mock was called tests the mock rather than the code.

**That hypothesis is unsupported and should not be carried forward.** Both files fail the
filter above — `dashboardHandlers.ts` has 133 tests against just **50 mutants** (0.38 per
test). Its tests catch little because there is little to catch, not because they assert the
wrong thing. The mock-habit theory was built on the two files least able to support it.

It may still be true elsewhere. It now has to be tested on modules where it CAN be tested —
ones with plenty to catch and many tests catching none of it:

| catch nothing / tests | mutants | module |
|---|---|---|
| 46 / 91 | 130 | `features/dashboard/handlers/aiHandlers.ts` |
| 35 / 64 | 135 | `features/eds/services/pdp/pdp404HandlerPublisher.ts` |
| 29 / 54 | 89 | `commands/diagnostics.ts` |
| 24 / 65 | 101 | `features/project-creation/handlers/executor.ts` |
| 17 / 90 | 162 | `core/shell/processCleanup.ts` |
| 12 / 70 | 222 | `features/eds/handlers/storefrontSetup/storefrontSetupHandlers.ts` |

Three of those six are handlers, which is what kept the habit theory alive — but read them
before believing it a second time.

## PHASE 2 RESULT (2026-09-07) — there is essentially nothing to delete

Done. The named lists were rebuilt from the raw reports and two modules were read. The
answer is that this item's premise was wrong twice over, and its useful output is a
measurement fix rather than a cleanup.

**The 691 catch-nothing tests visible in the 605 saved reports split three ways:**

| | tests | verdict |
|---|---|---|
| In modules with < 30 mutants | 137 | **not findings** — too little to catch, as `timeoutConfig` showed |
| Zero mutant coverage in a mutant-RICH module | 284 across 52 modules | **misattribution** — see below |
| Execute the module and still catch nothing | 270 | the real question, and mostly legitimate |

**The mock-assertion hypothesis is dead for the second time.** It was first built on two
modules that turned out to be thin-mutant artefacts. Read properly, neither surviving cluster
is about mocks at all.

### The 284: suites measured against a module they do not exercise

`pdp404HandlerPublisher.ts` exports one function; its suite imports three others THROUGH it,
and those live in `pdp404Snippet.ts`. `aiHandlers.ts` re-exports `readMergedAiPrompts` from
`aiPromptHandlers`, and every dead test in its four suites names a function defined there.
The tests are fine. They are attributed to the wrong module, because `suitesFor` matches by
FILENAME and the filename matches the module the code is imported FROM, not the one it lives
in.

**This is [[PL-45]]'s problem from the other side** and has been recorded there. Five of the
six worst cases carry a re-export; the other 46 modules do not, so a second mechanism exists
and has NOT been identified.

### The 270: absence assertions, which mutation testing cannot see

Sampled two, from unrelated modules:

- `ensureHomeAiContext — best-effort never throws when a write fails` — asserts
  `resolves.toBeUndefined()`. Real, load-bearing best-effort semantics. Almost no mutation
  makes it throw, so nothing can catch it.
- `should not send acknowledgment for response messages` — asserts an absence.

Their names across the wider sample follow the same shape: *never throws*, *should NOT skip*,
*leaves running undotted*, *never puts the dot on*. A test asserting that something does not
happen stays true under most mutations by construction.

**Confidence: two bodies read, roughly twenty names inspected.** The pattern is strong but
this is a sample, not a census. Reading twenty more bodies would settle it; nothing depends
on settling it, because the verdict either way is "keep them".

### What to do

1. **Nothing to the tests.** No deletions are justified by this measurement.
2. **The misattribution is real and belongs to [[PL-45]]** — fixing it makes 52 modules'
   mutation profiles honest and stops the measurement running suites that cannot score.
3. **Do not "fix" an absence assertion to make it catch a mutant.** It would stop testing the
   guarantee it exists for. This is a known blind spot of mutation testing, now written down.
4. **Phase 4's enforcer does not happen.** There is no habit to enforce against.

## What NOT to do

Do not bulk-delete on the count. Do not treat a catch-nothing test as a defect in the test
author. And do not act on any of it before the two clusters above are read, because if they
share one cause then most of the 635 have one fix rather than 635 decisions.

## Done means

The 635 are classified into: safe to delete, rewrite to assert the decision, and keep with a
reason. Any deletions are proven by re-measuring the module to zero open gaps, the ratchet
[[PL-22]] left in place. A named pattern, if one exists, is written up where test authors
will meet it.

## The plan

`.rptc/plans/test-suite-consolidation/overview.md` sequences this item with
[[PL-48]]: Phase 2 is this item's investigation, Phase 4 the enforcer that only exists if
Phase 2 finds a real habit.

## Shipped so far

- nothing yet; measured and specified 2026-09-07.
- 2026-09-07  Phase 2 complete. 691 catch-nothing tests split three ways: 137 in thin-mutant modules (not findings), 284 across 52 modules misattributed to a file they never exercise (moved to PL-45), 270 that genuinely execute and catch nothing (absence assertions - keep). No deletions justified. Mock-assertion hypothesis dead for the second time; Phase 4 enforcer cancelled.
- 2026-09-07  docs: Phase 2 — nothing to delete, and the real finding is a measurement fault (`aa4a8092a`)
- 2026-09-07  docs(backlog): normalise both findings by how much there is to catch — a third of one is an artefact (`b43e271ae`)
- 2026-09-07  Complete 2026-09-07. Phase 2 classified all 792: 137 in thin-mutant modules (not findings), 284 misattributed (moved to PL-45, now shipped), 270 genuine absence assertions that must be KEPT. No deletions justified. The mock-assertion hypothesis died twice. Phase 4's enforcer is cancelled - there is no habit to enforce against.

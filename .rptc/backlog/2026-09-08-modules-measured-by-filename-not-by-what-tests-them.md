---
id: PL-50
kind: question
area: platform
needs: []
value: high
status: open
parent: PL-11
---

# 160 modules are measured against the suites that share their NAME, not the suites that run them

**The question: are these tested-but-invisible, or genuinely untested?** The two need opposite
responses, and nothing measured so far distinguishes them. That is why this is a question and
not a chore.

## What is true today

A module is paired with a suite by FILENAME — `focusModule.suitesFor` looks for
`<stem>.test.ts` or `<stem>-<topic>.test.ts` in the mirror directory. Everything else about
the mutation programme rests on that one rule, and every attribution failure found on
2026-09-07 came from it:

| shape | example | where it went |
|---|---|---|
| A suite scored against a module it never runs | `pdp404HandlerPublisher.test.ts` tested `pdp404Snippet` through a re-export | [[PL-45]], fixed |
| A suite that carries a module's name and tests something else | `DashboardStatusHeader-layout.test.ts` read the STYLESHEET, so Stryker matched no tests and reported 0% | [[PL-45]], fixed |
| **A module well tested through a CONSUMER's suite, never measured at all** | `agentsMdSections.ts` — 480 lines, sixteen section builders, exercised by the 81 tests filed under `aiContextWriter` | **this item** |

The third shape is invisible to the sweep that found the first two, by construction: that
scan asked which modules HAVE a mirroring suite and no baseline row. A module in this
category has no suite of its own by definition.

## The measurement

**160 modules** export a function or a class, have no suite of their own, and appear in no
baseline row. Barrels (`index.tsx`) and type-only files are excluded. The largest:

| lines | exports | module |
|---|---|---|
| 655 | 13 | `features/eds/ui/steps/repoSelectionInline.helpers.tsx` |
| 629 | 1 | `features/eds/services/daLive/daLiveBlockLibraryOperations.ts` |
| 581 | 1 | `core/utils/progressUnifier/ProgressUnifier.ts` |
| 480 | 16 | `features/project-creation/services/aiBundle/agentsMdSections.ts` |
| 410 | 1 | `features/authentication/services/adobeEntityReads.ts` |
| 408 | 4 | `features/eds/services/storefront/storefrontRepublishService.ts` |

`agentsMdSections` is the one that shows why it matters: those 480 lines become an AI agent's
instructions inside a user's repository, and a mutation score has never been taken of them.

## Why NOT to work through them module by module

Each fix would be "invent a mirroring suite for it" — a lot of work for modules that may
already be thoroughly tested. `agentsMdSections` has 81 tests exercising it right now. Doing
that 160 times treats the symptom 160 times and leaves the rule that caused it intact.

## ANSWERED 2026-09-08 — BOTH, and the split is the finding

Five of the largest were measured against the suites that reach them, using a hand-written
config because `focusModule` refuses a module with no suites of its own.

| module | score | mutants | ~gaps | why |
|---|---|---|---|---|
| `agentsMdSections` | 54.55% | 385 | 57 | genuinely exercised through its consumer |
| `repoSelectionInline.helpers` | 50.15% | 337 | 130 | genuinely exercised through its consumer |
| `adobeEntityReads` | 31.27% | 259 | 137 | exercised, thinly |
| `daLiveBlockLibraryOperations` | 0.00% | 386 | 289 | **replaced by an injected double** — its suite asserts the CONSUMER forwards calls, so this code never runs |
| `storefrontRepublishService` | 0.00% | 163 | 119 | **`jest.mock`ed by 10 of its 12 consumer suites** |

**So it is not a visibility problem, and a tooling change alone will not fix it.** Where the
code actually runs it averages **45%** — against 90%+ for the measured set, whose floor the
burn-down drove to zero open gaps. Measuring these would expose real work, not confirm
existing quality.

**And two of five are never executed by any test at all.** Not weakly tested: substituted, in
one case by `jest.mock` and in the other by a hand-injected double at an ADR-015 seam. A
suite named for the consumer asserts that calls are FORWARDED, which is a real thing to
assert and leaves the forwarded-to module unrun everywhere.

### The size, stated plainly

Five probes cover 1,530 mutants and about 732 gaps — a mean of **146 gaps per module**. Over
160 modules that extrapolates to roughly **23,000 open gaps**, which is larger than the
17,475 the original burn-down started from. Treat that as an order of magnitude, not a
forecast: the sample is five, chosen as the LARGEST modules, so it is biased high.

### What this means for the answer

Neither branch the question offered is right on its own:

- **A tooling change is still needed**, because these modules cannot currently be measured at
  all — but it buys visibility, not quality.
- **A coverage programme is also needed**, and at this scale it is a bigger piece of work than
  PL-22 was. It should be sized and prioritised deliberately, not started as a follow-on.
- **A third thing surfaced that neither branch anticipated**: modules substituted everywhere
  by mocks or injected doubles. For those the question is not "measure them" but "is anything
  testing this code, anywhere?" — and for `daLiveBlockLibraryOperations`, 386 mutants say no.

### A trap this experiment paid for

The first probe reported **0.00% with all 385 mutants surviving**, and it was wrong. Its jest
config lived in `/tmp` with an absolute `rootDir`, so jest ran against the ORIGINAL source
while Stryker mutated a sandbox copy — the tests never saw a mutation. The working config
must sit in the repo root and use a RELATIVE `require('./jest.config.js')` with `**/tests/…`
globs, exactly as `jest.focus.config.js` does, so that it resolves inside the sandbox. A 0%
where every mutant survives should be read as "the module never ran" until proven otherwise;
that is also what `storefrontRepublishService` and `daLiveBlockLibraryOperations` turned out
to mean, for different reasons.

## The experiment that answered this — about an hour

Take five or six of the largest and measure each against its CONSUMER's suites rather than
its own. `focusModule` refuses a module with no suites — "Refusing to write a config that
would report a confident zero" — so the config has to be written by hand for the probe.

- **If they score well**, this is a visibility problem, and the answer is a tooling change:
  attribute a module to the suites that COVER it. Stryker already computes exactly that; what
  the filename rule decides is only which suites to RUN.
- **If they score badly**, it is a real coverage hole across 160 modules and deserves its own
  sized programme, not a tooling fix.

Do not start the experiment while a mutation queue is running — the focus configs are single
generated files and two runs starve each other.

## What this is not

Not [[PL-45]], which is shipped: that closed the two shapes where a suite exists and is
misfiled. Not the "196 modules with no suite at all" line recorded there either — that count
was taken with a looser filter and did not ask whether tests reach the module anyway.

## Shipped so far

- nothing; the deciding measurement has not been taken.
- 2026-09-08  ANSWERED 2026-09-08: both. Five largest probed against the suites that reach them. Where the code runs it averages 45% (agentsMdSections 54.55, repoSelectionInline.helpers 50.15, adobeEntityReads 31.27) against 90%+ for the measured set - so measuring exposes real work, not existing quality. Two of five are never executed by ANY test: storefrontRepublishService is jest.mocked by 10 of 12 consumers, daLiveBlockLibraryOperations is replaced by an injected double at an ADR-015 seam. Mean 146 gaps/module; over 160 modules that is ~23,000, larger than the burn-down's original 17,475 - order of magnitude only, the sample is the largest five and biased high.

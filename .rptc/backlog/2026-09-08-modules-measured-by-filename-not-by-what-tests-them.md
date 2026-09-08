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

## The experiment that would answer this — about an hour

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

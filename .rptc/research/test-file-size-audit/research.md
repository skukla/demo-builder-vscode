# Why 13 test files are over 500 lines — a per-file audit

**Date:** 2026-09-10
**Trigger:** clearing lint warnings (232 → 13). The 13 survivors were all `max-lines`
on test files. Before splitting them, the owner asked the question that stopped the
work: *"are you auditing what should be the correct structure or are you just
building a mechanism to support what's already there?"*

It was a mechanism. A splitter cut each file at its arithmetic midpoint and named the
halves `-part2`, which carries no information; the repo's own convention names splits
by SUBJECT (`settingsSerializer-integrations`, `ConnectStoreStepContent.sections`).
It broke 167 tests, because the brace counter it used mis-parsed braces inside strings
and regexes. The guard — counting `it(` per file — matched anyway, because a token
count cannot see a broken structure. All of it was reverted.

This is the audit that should have come first.

## The finding that reframes the rest

**67 source files exceed the god-file thresholds, and the check that would find them
is not in this repo's cadence.**

### First, a correction, because I got this wrong twice

I initially wrote *"no instrument checks any of them."* **That is false, and the owner
caught it: the god-file check has always been in the SOP.** It is Agent 11 of the
global `/sop-scan` command (`~/.claude/commands/sop-scan.md`), a HIGH-priority pattern,
carrying exactly these thresholds:

```
Service classes (.ts): >400   React components (.tsx): >350
Handler files (.ts):   >500   Utility files (.ts):     >300
EXCLUDE: test files, type definitions (types.ts, interfaces.ts),
         barrels (index.ts), config files.
```

I searched `tests/sop/`, `docs/` and `.claude/skills/` and concluded "no enforcer" from
a clean result — the exact mistake this repo's own rule names: *a control proves the
tool works, not that you aimed it right.* The command lives in `~/.claude/commands/`,
outside every path I searched.

**And my first count was wrong too, for a related reason.** I said 91, applying the
thresholds while ignoring every exclusion Agent 11 states. Under the real criteria it
is **67** (25 files excluded as tests, type definitions, barrels or config). A number
produced by a rule I had not read is not a measurement of that rule.

### What IS true

The check exists and is **run on demand by an agent**, never by the build and never by
the sweep:

| | test files | source files |
|---|---|---|
| stated limit | 500 warn / 750 error | 400 service · 350 component · 500 handler · 300 util |
| enforced in CI | yes — eslint `max-lines` + its own `check-test-file-sizes` workflow | no |
| in `tests/sop/toolingRegistry.ts` | `validate:test-file-sizes` | **absent** |
| run by `npm run sweep` | yes | **no** |
| how it runs | automatically | `/sop-scan --pattern godfiles`, when someone asks |
| currently over | 13 | **67** |

The registry holds 39 instruments and none of them measures source file size, so
`tooling-registry.test.ts` — which exists to fail the build when an instrument is
unregistered — cannot see this one. It only knows about repo-local instruments; a
global command is invisible to it.

That is the real gap, and it is narrower and more fixable than "there is no check":
**the check is real, and it is the only quality rule in this repo whose cadence is
"when somebody remembers to ask".**

```
1156  vs  400   features/eds/services/daLive/daLiveContentCopy.ts
1121  vs  400   features/app-builder/services/appBuilderComponentRunner.ts
 972  vs  400   features/eds/services/edsPipeline.ts
 928  vs  500   features/projects-dashboard/handlers/dashboardHandlers.ts
 909  vs  500   features/dashboard/handlers/appBuilderComponentHandlers.ts
```

By kind: 40 services, 15 components, 7 handlers, 5 utils.

## The measurements

`code` counts non-blank, non-comment lines. `outside` is lines not inside any
top-level `describe` — i.e. shared setup. `ratio` is test code ÷ the module it mirrors.

| test file | lines | code | outside | blocks | ratio | source |
|---|---|---|---|---|---|---|
| appBuilderComponentRunner | 727 | 517 | 85 | 5 | **0.5x** | 1121 (limit 400) |
| appBuilderComponentHandlers | 707 | 514 | 71 | 5 | **0.6x** | 909 (limit 500) |
| helixService-preview-publish | 722 | 637 | 25 | 1 | **0.8x** | 823 (limit 400) |
| envFileGenerator-configFiles | 666 | 556 | 80 | 3 | **0.8x** | 698 (limit 300) |
| ProjectActionsMenu | 663 | 525 | 57 | 14 | 1.7x | 313 |
| deleteAdobeProjectHandler | 722 | 551 | 119 | 8 | 1.9x | 294 |
| deployMeshHeadless | 703 | 518 | **127** | 4 | 2.0x | 255 |
| toolDescriptors | 680 | 564 | 58 | 7 | 2.1x | 273 |
| settingsSerializer | 642 | 510 | 24 | 11 | 2.1x | 240 |
| flowStages | 709 | 564 | 72 | 10 | 2.3x | 242 |
| aiBundleActivationRefresh | 728 | 528 | **230** | 8 | 2.5x | 212 |
| ConfigFieldRenderer | 668 | 551 | 25 | 8 | **3.8x** | 144 |
| ConnectStoreStepContent.advanced | 684 | 501 | **240** | 10 | — | family member |

## Verdicts

### A — leave the test; the SOURCE is the god file (4)

`appBuilderComponentRunner`, `appBuilderComponentHandlers`,
`helixService-preview-publish`, `envFileGenerator-configFiles`.

Every one is **below 1.0x**: there is less test than there is code under test. Two of
them are already one slice of a ten-file family. Splitting these makes navigation
worse and leaves the actual defect — a 1,121-line service — untouched.

These four are the argument for `decompose-god-file`, not for a test split.

### B — deduplicate; the length is copied setup (1)

`ConnectStoreStepContent.advanced.test.tsx` — 240 of its 684 lines sit outside any
describe, and its family already has `ConnectStoreStepContent.testUtils.tsx` (224
lines) and `.sharedMocks.tsx` (73). It imports **one** symbol from them and then
redeclares 15 of their exports:

```
MockField · MockServiceGroup · ACCS_ENDPOINT_KEY · PAAS_URL ·
PAAS_ADMIN_USERNAME · PAAS_ADMIN_PASSWORD · accsServiceGroup ·
paasServiceGroup · catalogServiceGroup · mockUseStoreDiscovery ·
mockUseComponentConfig  (+ 5 of the same jest.mock targets)
```

`defaultProps` is declared in **four** of the five family files; `renderWithProvider`
in three (and again in `ConfigFieldRenderer`, unrelated).

Using what already exists removes the preamble **without moving a single test**, and
takes the file under the threshold as a side effect. Its own doc comment calls it
"Part 2" — the anti-pattern this audit exists to avoid, already in the tree.

### C — extract setup first, then reconsider (2)

`aiBundleActivationRefresh` (230 lines outside describes, one 33-line sibling) and
`deployMeshHeadless` (127 outside, 8 `jest.mock` calls, and only 314 of 703 lines
inside describes — its tests live at the top level, which is why the mechanical
splitter lost 14 of them here).

For both, the setup is the bulk. Move it to a shared fixture and re-measure; a split
decided before that would be cutting the wrong thing.

### D — split by subject, seams are real (5)

| file | the seam |
|---|---|
| `deleteAdobeProjectHandler` | 8 blocks that divide cleanly into GATES (payload, org, ownership, confirmation) and OUTCOMES (started signal, happy path, partial failure, unexpected errors) |
| `ProjectActionsMenu` | 14 blocks along menu groups — USE / MANAGE / More… / gating |
| `flowStages` | 10 blocks, 77 tests, already one topic per block |
| `toolDescriptors` | 7 blocks; `capturePayloadFrom` alone is ~250 lines and is its own subject |
| `settingsSerializer` | 11 blocks; `extractSettingsFromProject` is 5 of them and >half the file |

Each split must be **named for its subject** and verified by running the suite, not
by counting tokens.

### E — leave (1)

`ConfigFieldRenderer` — the highest ratio at 3.8x, and correct. 25 lines of setup,
one shared `renderWithProvider`, then one describe per field type (text, url,
password, select, boolean) plus default-highlighting, help content and the unknown
type. A 144-line renderer with five field types and several states each genuinely
produces this much test. Splitting it yields two ~330-line files with duplicated
setup, and a reader still looks under `ConfigFieldRenderer*` either way.

## What this says about the threshold

Of 13 files over the line, **one** (B) is over because of a real defect that the
warning happened to catch. Four (A) are pointing at a god file in `src/`. One (E) is
a false positive. The rest need a judgement per file.

That is a weak signal — but it is the only file-size signal the repo has, and it is
aimed at the wrong half of the codebase.

## Recommended order

1. **Put the god-file check on a cadence.** The rule and the scan already exist —
   Agent 11 of `/sop-scan`. What is missing is a row in `tests/sop/toolingRegistry.ts`
   so `npm run sweep` runs it, plus a shrink-only ledger seeded at 67 so the count can
   only fall. This is the cheapest item here and the only one that stops the other 66
   growing while the rest is worked through.
2. **B** — deduplicate `ConnectStoreStepContent.advanced`. Contained, removes real
   duplication, moves no tests.
3. **C** — extract setup for the two setup-heavy files, re-measure.
4. **D** — five subject-named splits, one at a time, suite green after each.
5. **A** — decompose the four god files; the tests then follow the new seams for
   free, which is the reason to do it in this order rather than first.

## Postscript — the guidance already existed, and its validator was hiding it

The owner asked why I was re-measuring with a tool's criteria instead of running the
tool. There is no good reason. Running `npm run sweep` — which I should have done
first — changes three of this document's conclusions.

**1. The playbook exists and says all of this already.**
`docs/testing/test-file-splitting-playbook.md`, 87 lines, states in its own words
every conclusion this audit reached the expensive way:

> **Line count is a trigger, not a reason.** A 600-line suite covering one function
> coherently is better left alone than split into four files that all import the same
> mocks.

> **Extract the shared setup FIRST** — create `<name>.testUtils.ts` before moving any
> tests, and commit that separately.

> One file per responsibility, named `<component>-<responsibility>.test.ts`.

> **Keep the test count identical across the split.** That is the check that the move
> lost nothing — a dropped `describe` is invisible in a green run otherwise.

It also carries the `babel-plugin-jest-hoist` trap that explains *why* the mechanical
splits broke: when the preamble moves to `.testUtils` and the spec still imports the
component directly, the component binds to real Spectrum and fails as assertion noise
rather than as an error.

**2. Its validator has been red on its own bug, so nobody reads its output.**
`validate:test-guidelines` demanded four literal headings — "When to Split", "How to
Split", ".testUtils.ts Pattern", "Examples" — from an early draft. The playbook was
rewritten with better ones ("When", "Extract the shared setup FIRST", "Then split",
"A real example") and the check went red and stayed red, reporting four missing
sections against a document that covers all four. **This is the second time this same
validator has failed on its own bug rather than on a finding**; CLAUDE.md records the
first, in its export detector. Fixed here to match by concept, with a planted-heading
control proving it can still fail.

**3. The count in the headline was the wrong number.**
`validate:test-file-sizes` — the repo's own instrument — reports **144 files in the
500–750 warning zone and 0 over the 750 limit that blocks CI.** The 13 this audit
started from is eslint's `max-lines` count, which skips blank lines and comments. Two
counters, both correct, an order of magnitude apart; the audit's per-file verdicts
stand, but "13 files to fix" was never the shape of the problem.

The playbook draws the conclusion outright: *"the hard limit is satisfied and the rest
is judgement rather than a queue to work through."*

**What the sweep found besides.** Three failing gates, all real, none previously
reported: this validator; `docs:adr-check` (ADR-022 names `optimizePackageImports`,
which neither resolves nor is declared); and `check-ledger` (the ADR-015 audit's
done-gate — `di-style` holds 907 rows against 851 source files, so 56 rows point at
files that no longer exist).

**The lesson, which is the same one three times over.** The instrument existed; the
guidance existed; the count existed. Each was skipped in favour of writing something
new, and each rewrite was worse than the thing it replaced. Run the tool first, and
when its output looks like noise, fix the tool rather than working around it.

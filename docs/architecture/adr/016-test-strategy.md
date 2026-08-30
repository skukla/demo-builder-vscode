# ADR-016: Test strategy — three tiers, chosen on the escape record

**Status:** Accepted (owner-ratified 2026-08-28)
**Companion to:** ADR-015 (dependency architecture) — the two were designed
together and enforce each other; neither stands alone.
**Evidence base:** `.rptc/plans/test-strategy-audit/` — the escape analysis
(15 shipped defects with receipts), the witness census (54/54 convergence
files), the craft census (1,179/1,179 suites), the coverage run (84% lines /
73% branches), and the run-noise measurement (355 act() warnings per green
run). This is the first time in the project's life the test strategy was
CHOSEN rather than accreted.

## Context

Two years of AI-driven development accreted a mock-heavy unit style with no
deliberate strategy. The escape analysis showed the consequence precisely:
of 15 defects that shipped past the suite, 8 lived in the gap between our
code and external reality — a class NO unit-test improvement can close,
because a test double of a wrong assumption is still wrong. The remaining
escapes were mock-blindness on internal seams (5, already fixed forward by
the argument-assertion rule), one unchecked convention, and one comment
doing verification's job.

## Decision — the three tiers

1. **UNIT** — the default for all logic: dependencies handed in, fakes
   passed through the front door, assertions on HOW collaborators are called
   (interaction testing, Freeman & Pryce). Rides ADR-015: converted code
   sheds its module-mock walls; suites migrate to plain deps-object fakes.
2. **CONTRACT** — any fixture standing for an external system is CAPTURED
   from a live response, never composed from memory (characterization,
   Feathers; integration-contract testing, Fowler/Pact); drift scripts
   re-check external agreements on a cadence (eds:drift /
   data-installer:drift are the pattern).
3. **LIVE** — cloud-touching paths verify against the real system: journeys
   that contain their own undo and end at a checked zero; probe verification
   after tool changes; and verify-after-write built INTO destructive
   operations (the remove_integration fix shape — postconditions, not
   trust).

### Where a test file lives (added 2026-08-28)

The tiers above say what a test IS. They said nothing about where it goes,
and that omission had a cost: a second test tree, `tests/unit/`, existed for
years without violating anything written down. It held 28 files against 1,158
in the mirror tree, covered 5 modules the mirror tree ALSO covered, and — being
in a different directory — could not reach the shared setup helpers its
neighbours used. That is the whole explanation for suites that "each do their
own thing": they were not allowed to share.

The rule, from here:

**A test file lives at the path its subject lives at, with `src/` replaced by
`tests/`.** `src/features/eds/services/toolManager.ts` is tested by
`tests/features/eds/services/toolManager*.test.ts` and nowhere else. A suite
split for size keeps the base name and adds a `-suffix`; the split shares one
`*.testUtils.ts` beside it.

There is no tier directory, and there must not be one. UNIT, CONTRACT and LIVE
describe how a test is written — handed-in fakes, captured fixtures, real
systems — not where it sits. A given file routinely contains tests of more than
one tier for the same subject, and separating them by directory would split a
subject's coverage across the tree for no reader's benefit. The tier is visible
in the test's own construction, which is where it belongs.

Enforced by `tests/sop/mirror-placement.test.ts`: every test file must sit at its
subject's mirrored path, and no test file may live outside the mirror.

Grounding: Test Pyramid (Cohn; Fowler), contract tests (Fowler; Pact),
GOOS interaction testing (Freeman & Pryce), characterization tests
(Feathers), architectural fitness functions (Ford/Parsons/Kua).

### Fixtures and fakes: one canonical builder each (added 2026-08-28)

The tiers say a unit test hands its dependencies in. They did not say where the
fake being handed in comes from, and that silence had the same shape as the
placement gap above.

**Measured 2026-08-28 across 1,289 test files:** 2,532 hand-rolled fake object
literals, 552 distinct shapes, 305 of those shapes used exactly once. 559 of the
literals are a logger, split across two shapes differing by one method name.

The cause is not unwillingness to share. The suite contains **98 builder
functions**; the problem is that 14 of those NAMES are defined in more than one
file — 43 redundant definitions — so there is no canonical one to find, and
writing another is cheaper than searching. `createMockContext` exists ten times
across six different return types: ten incompatible things wearing one name.

Four rules, in the order they matter:

**1. One home.** A fake that a second feature directory needs lives in
`tests/helpers/`. A `*.testUtils.ts` beside a suite is for setup specific to
that subject. The test is mechanical — does another feature need it?

**2. A builder returns the REAL type. No `as never`, no `as any`.** 163
hand-rolled fakes are currently cast to `never` or `any`, which disables the
compiler for precisely the thing most likely to drift. A builder typed
`(): Logger` stops compiling the day `Logger` gains a method — one failure, one
fix, at the one place that needs changing. A fake cast to `never` fails nothing
and silently ceases to resemble what it stands for. This is the repo's standing
"a cast at a call boundary is a silenced type error" rule, applied to test code
where it had been ignored.

Cast the object literal INTO the return type at the boundary of the builder if
the structural fake is partial; never type the builder itself as `never`.

**3. Shapes are read, not remembered.** A builder's method list comes from the
real interface plus what callers actually use. Data fixtures — `Project` above
all — are copied from a real `~/.demo-builder/projects/*/.demo-builder.json`.
This repeats the CONTRACT tier's rule for external systems because the same
failure occurs internally: an invented shape typechecks and fails only when a
real accessor touches it.

**3b. A domain fixture is CONTENT over a canonical SHAPE, not a re-implementation
of it.** Added 2026-08-28 after the owner asked, of eleven freshly-typed
builders, "are all of these the canonical pattern?" They were not. Annotating
`createDeployedStatusResponse(): CommandResult` made the compiler check the
shape, and left the function still assembling `{ code, stdout, stderr, duration }`
by hand — a twelfth private copy of a shape the suite already has a builder for.
They now read `return createSuccessResult(JSON.stringify({ meshStatus: 'deployed' }))`:
the mesh-specific part is the content, and the shape comes from one place.

Typing a fixture and canonicalising it are two separate obligations, and the
first can be satisfied while the second silently is not.

**4. One builder name, one definition.** Enforced by
`tests/sop/builder-uniqueness.test.ts`, whose ledger of 14 duplicated names may
only shrink. It does not force consolidation; it stops the count growing while
consolidation happens, which is the only property that makes the work
finishable — 43 became 43 one forgivable duplicate at a time.

**Consolidation is on-touch, never a sweep.** A suite adopts the canonical
builder when it is open for another reason. Progress is two falling numbers:
distinct shapes (`test-divergence-scan`) and duplicated builder names (the
ledger above). Tracked as PL-16.

**A conversion ships its builder with it.** Making a service receive its
dependencies creates demand for a fake; without a builder in the same change,
each adopting suite writes its own. This is not hypothetical — the ADR-015
conversion work added roughly 20 hand-rolled fakes in a single day, including
one deps object written out eleven times.

## Ratified with the tiers

- **Framework**: Jest stays. Criteria: fit (20s full suite — the speed a
  switch would sell, we have), pain (zero of 15 escapes trace to the
  framework), cost (1,179-suite migration buys nothing).
  `@vscode/test-electron` (real-extension-host tests) is the noted
  complement IF journeys ever prove insufficient as the live tier.
- **eslint-plugin-jest** adopted (warn → ratchet to error): the community's
  Jest best-practice rules replace hand-rolled census detectors.
- **Run noise goes to ZERO and stays there**: fix the three measured classes
  (un-awaited updates, mock prop-spreading, expected-error absorption), then
  a setup-level fail-on-unexpected-console gate with a shrinking allowlist.
  A green run MEANS a clean run.
- **Effectiveness is measured, not assumed**: a Stryker mutation pilot over
  the convergence-queue services + worst-covered load-bearing files produces
  the evidence-based dead-weight verdict; pruning decisions come from its
  data. Release-cut cadence (mutation runs are too slow for CI).
- **Duplication target = an adjudicated floor, not literal zero**: per-suite
  mock isolation is ratified policy; the tests-tree clone count (159)
  ratchets down as ADR-015 conversions melt the mock walls, resting where
  every remaining clone carries a named reason or sits on a kill queue
  (src precedent: floor 66).
- **Split-suite families share a testUtils** (the family-setup rule) and
  deps-object fakes are the target double style.

## Explicitly not promised

"No bugs ever." New failure modes will occur; the system's guarantee is that
each becomes a permanent check (journey → finding → enforcement), so error
CLASSES do not repeat.

## Rejected alternatives

- **Switch to Vitest** — no measured pain traces to Jest; migration cost
  with no capability gain.
- **Literal-zero duplication** — destroys ratified isolation to flatter a
  metric (Goodhart).
- **Rewrite tests from scratch** — the suite has a real catch record and 91%
  of suites already use the accepted lighter double styles; incremental
  convergence (Feathers) is the accepted path and the chosen one.

## Enforcement

`tests/sop/architecture-rules.test.ts` (shared with ADR-015), the console gate,
eslint-plugin-jest, the clone ratchet, and the pinned census instruments in
`.rptc/plans/pattern-conformance-audit/harness/`.

This ADR's own rules are enforced by:

| Rule | Check |
|---|---|
| Placement (mirror `src/`, no tier directory) | `tests/sop/mirror-placement.test.ts` |
| One builder name, one definition | `tests/sop/builder-uniqueness.test.ts` |
| Split families share their setup | `tests/sop/test-family-setup.test.ts` |
| Suites emit no console noise | `tests/setup/consoleGate.ts` |
| A per-test timeout may not undercut the file budget | `tests/sop/no-lowered-test-timeout.test.ts` |
| No bare `sleep` in tests | `tests/sop/no-bare-sleep.test.ts` |
| Config leaves are not mocked | `tests/sop/no-config-leaf-mocks.test.ts` |
| Divergent fakes (advisory, at release cuts) | `.claude/skills/test-divergence-scan/scan.mjs` |

Each carries a ledger that may only shrink, and each runs its positive controls
first — a check that matched nothing reads identically to a clean one.

Audited 2026-08-28: of the 14 checks under `tests/sop/`, thirteen are named or
described in a governing document (this ADR, ADR-015, `docs/development/sop/`, `CLAUDE.md`,
or `docs/`). The fourteenth — the per-test timeout rule — was enforced and
documented only in its own header, where nobody looking for the rule would find
it; it is listed above now. The remaining code-quality checks (magic timeouts,
complex expressions, inline styles, component extraction) are correctly homed in
`docs/development/sop/` and `CLAUDE.md` rather than here: they govern how code is written,
not how it is tested.

Execution is tracked under PL-11 (test health epic); the fixture consolidation
under PL-16.

## The mock-wall list, moved here from the ADR-015 ledger (2026-08-29)

Thirteen files construct a STATELESS class that many suites module-mock. Under
ADR-015 they were construction-boundary rows; that was the wrong home. Nothing
about them is a dependency-architecture problem — rebuilding these costs nothing
at runtime. What they cost is TEST DESIGN: a suite that cannot hand the collaborator
in has to mock the module instead.

That is this ADR's concern, so the list lives here. It is a measure, not a ledger:
no build fails on it, and it shrinks as suites convert to handed-in fakes.

| Suites mocking it | File | Class(es) |
|---|---|---|
| 26 | `projectDeletionService.ts` | HelixService |
| 26 | `checkGitHubAppHandler.ts` | GitHubAppService, HelixService |
| 26 | `storefrontRepublishService.ts` | HelixService |
| 26 | `edsResetService.ts` | ConfigurationService, HelixService |
| 26 | `edsResetConfigStep.ts` | ConfigurationService, HelixService |
| 26 | `refreshBlockLibraryHeadless.ts` | HelixService |
| 26 | `publishKeyRegistrar.ts` | HelixService |
| 26 | `storefrontSetupPhases.ts` | ConfigurationService, GitHubAppService, HelixService |
| 26 | `contentAuthoringTools.ts` | HelixService |
| 12 | `storefrontNameMigrationForProject.ts` | ConfigurationService |
| 12 | `repairSiteConfigForProject.ts` | ConfigurationService |
| 12 | `storefrontSetupHandlers.ts` | ConfigurationService |
| 10 | `edsResetUI.ts` | GitHubAppService |

`HelixService` dominates: 26 suites mock it, across 8 of the 13. Converting those
suites to hand it in is the single largest test-design win available, and it is
independent of any ADR-015 work — the construction can stay exactly where it is.

Measured by `.rptc/research/construction-boundary-is-the-wrong-question/`.

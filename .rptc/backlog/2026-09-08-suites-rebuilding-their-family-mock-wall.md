---
id: PL-51
kind: fix
area: platform
needs: []
value: med
status: built
---

# Test suites that rebuild a mock wall their family helper already owns

Filed 2026-09-08, after the sidebar work (PL-19) turned up a 546-line suite
hand-rolling a fake and a full `jest.mock` preamble that its sibling already got
from their shared `.testUtils`.

**The headline is how much the obvious measurements OVERSTATED this.** Three
signals were tried, and only the third survives contact with the files.

| Signal | Count | Verdict |
|---|---|---|
| suites in a family that never import its `.testUtils` | 79 | **useless** — most legitimately need a different wall |
| ...whose mocked MODULE NAMES overlap the helper's by >=60% | 11 | **still wrong** — same module, different factory |
| ...carrying a **byte-identical** mock factory the helper defines | 28 | the real signal |

Both files hand-checked before the third measurement existed came back as
legitimate variants, and the byte-identical measure independently classified both
as variants too. That agreement is the only reason to trust the 28.

- `dashboardHandlers-dalive-auth.test.ts` shares ONE mock with its helper and has
  twelve of its own for a different concern. It ranked FIRST on the naive signal.
- `continueHandler-perNodeScope.test.ts` mocks the same two modules as its helper
  with different factories — a driven command executor, and a function the helper
  does not touch. Its docblock explains the mock discipline on purpose.

## The trap that decides the scope

Importing a helper brings ALL of its mocks, and this repo has already paid for
that once: 79 dead mocks accumulated across eleven families' shared setup, found
and REMOVED on 2026-08-31 (`2eafc0682` found them, `adc0013f6` / `56dc6c09b` /
`7eb23721a` cleared them). **That backlog is closed** — the scan reports 1
redundant automock today, and it is inside the enforcer that bans the pattern.

It is cited here as the COST OF THE METHOD, not as open debt: converting a suite
that needs only part of a helper's wall is how those 79 got there, so doing it
again would rebuild a problem this repo has already finished paying off.

That splits the 28:

- **17 — safe.** The suite already declares every mock the helper has, identically;
  the helper is a strict subset of what it needs. Converting deletes lines and
  imports nothing unwanted.
- **4 — would import unwanted mocks.** `checkUpdates-graduation` (+6),
  `stalenessDetector-hashCalculation` (+2), `importHandlers-scopes` (+1),
  `daLiveContentCopy-retry` (+1). Skip, or split the helper first.
- **9 — true variants.** Leave alone; say so rather than re-raising them.

## The method, proved once

`importHandlers-target.test.ts` converted 2026-09-08 as the reference: delete the
three identical `jest.mock` blocks, and take the SUT **from the helper** rather
than importing it directly — `jest.mock` hoists within a module, not across them,
so a direct import of the subject loads the real module before the helper's mocks
register. 201 tests passed unchanged, which is what a behaviour-preserving
refactor looks like.

## Done when

The 17 safe suites take their wall from their family helper, the 4 are either
converted after splitting the helper or recorded as declined with the reason, and
the 9 variants are recorded so no later scan re-raises them.

Deliberately NOT parented to PL-30: that roster is closed and may only shrink
(its own rule), and this is a new finding.

## Related

The gap that let this accumulate: `tests/sop/test-family-setup.test.ts` checks a
family HAS a `.testUtils`, not that its members use it. Worth considering whether
the byte-identical check above belongs there as an enforcer once the 17 are clear
— it is cheap and it is the only one of the three signals that did not mislead.

## Shipped so far

- 2026-09-08  Reference conversion landed: importHandlers-target.test.ts takes its wall from the family helper; 201 tests in the family passed unchanged. 16 safe suites remain.
- 2026-09-08  docs(backlog): say plainly that the 79 dead mocks are CLOSED, not open (`250c19e91`)
- 2026-09-08  test(data-installer): take the import-handler wall from the family helper (`401119819`)
- 2026-10-03  Re-measured (top-level helper mocks only): the 16 safe suites are converted (importHandlers x3, createProject x4, adobeEntityCollaborators x4, daLiveContentOperations x4, projectConfigWriter-atomicWrite) plus 25 more that imported their helper but re-declared its mocks (stateManager x14, PrerequisitesManager x8, componentUpdater x2, updateManager-earlyAccess); 4,951 tests in the touched families unchanged, full suite 31,136 green. Dead mocks deleted after a set probe: daLive timeoutConfig, createProject debugLogger + PrerequisitesManager, importHandlers adobeAuthGuard; plus three never-called helper functions that only wrapped jest.mock (projectHandlers setupMocks, prerequisitesCacheManager mockDependencies, environmentSetup setupMocks). Still declined: checkUpdates + checkUpdates-graduation (+6 unwanted mocks), stalenessDetector-hashCalculation (+2), importHandlers-scopes (+1), daLiveContentCopy-retry (+1). Variants left alone: dashboardHandlers x10, sidebarProvider, edsResetUI-adobeIoAuth, erpIntegrationHandlers-openScreen, commandManager, stalenessDetector-changeDecisions/edgeCases.
- 2026-10-04  night4-b (staged, uncommitted): re-measured with a byte-identical mock-factory scan (top-level jest.mock blocks, suite vs its family .testUtils): 22 suites share at least one identical factory; 2 have the helper's whole wall. (1) importHandlers-scopes, declined on 2026-10-03 for one unwanted mock: that mock (adobeAuthGuard) has since been deleted from the helper as dead, so the helper's wall is now a strict subset — converted (two jest.mock blocks deleted, the handlers taken from the helper); 205 tests in the family pass unchanged. (2) meshDeployment-createFallback: a VARIANT — the helper's verifier mock lives inside setupMeshDeploymentVerifierMock(), a function its siblings call in beforeEach, not at top level, so the suite's own top-level mock is needed. Still declined, re-checked: checkUpdates + checkUpdates-graduation (helper 9 mocks, 3 shared), stalenessDetector-hashCalculation (4, 2 shared), daLiveContentCopy-retry (3, 2 shared). Variants unchanged from the 2026-10-03 list. Every suite the item named is now converted, declined with its reason, or recorded as a variant. Not done (optional, per the item): turning the byte-identical check into an enforcer. Lead, not acted on: the siblings call setupMeshDeploymentVerifierMock() in beforeEach — a jest.mock registered after the subject loaded; worth a dead-mock-scan probe.
- 2026-10-04  Correction, same night: the setupMeshDeploymentVerifierMock() lead is NOT dead — probed by commenting out every call: 5+ tests in meshDeployment-errors and -operations fail (the subject reaches the verifier lazily, so a mock registered in beforeEach still applies). Files restored unchanged. Lead closed.

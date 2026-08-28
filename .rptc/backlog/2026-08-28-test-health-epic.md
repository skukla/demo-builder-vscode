---
id: PL-11
kind: epic
area: platform
needs: []
value: med
status: active
---

# Test health and optimization

Filed 2026-08-28 at the owner's direction: the test-health work kept arriving
as orphan items and same-day incidents with no shared home or done-condition.

## What this epic collects

- `PL-9` — tests-tree dedup census (execution lane; two mechanical clusters
  fixed 2026-08-28, three variant families triaged).
- `PL-10` — the testing-approach audit (the question lane: which duplication
  is convention, is the split-suite pattern healthy, mock-contract drift,
  what a tests-tree scan skill would add).

## The standing failure modes this epic exists to retire

Each measured, not hypothesized — most more than once:

1. **Stale mocks survive contract changes** (webview-test-authoring §8's
   four-in-one-day, and again 2026-08-28: adding one export to
   appConfigPackages broke NINE suites whose module mocks lacked it — found
   only by running them).
2. **Mocks cannot see malformed calls** — four production no-ops shipped
   green in August because collaborators were mocked; the argument-assertion
   rule exists but nothing detects suites that need it and lack it.
3. **Invented fixtures** — shapes written from memory that typecheck and
   agree with the code and disagree with reality (the manifest-record trap,
   the DA.live path trap).
4. **Dead-or-broken shared helpers beside N clones of their job** (the
   PrerequisitesStep testUtils lesson).

## Done when

A new suite's defects surface at WRITE time, not at review or in production:
the conventions have either a mechanical check or a documented
accepted-variety verdict, and the census numbers (clone %, testUtils
coverage of split families) hold or improve across two release cuts.

## Shipped so far

- 2026-08-28  Witness census SHIPPED (harness/test-census.mjs + .json, reconciled 54/54): before any ADR-015 convergence, each queue file's suites were classified by whether they can OBJECT to a bad refactor. Result: 47 WITNESS (argument-asserting suites already in place — the convergence can start there safely), 1 BLIND (prerequisitesCacheManager: SEVEN suites, none inspect collaborator calls), 4 UNTESTED (catalogPrewarmPhase, edsResetConfigStep, MultiVersionDetector, VersionSatisfactionChecker), 2 INDIRECT (meshRedeploy, componentInstallation — exercised through parent suites; re-read before trusting). Ordering rule ratified by the owner: strengthen-then-convert for the seven weak files; convert-then-simplify for the 47. Caveat recorded: WITNESS = the suite asserts SOME collaborator's calls, not necessarily the locator seam — per-file confirmation happens at conversion time.
- 2026-08-28  TRUE-SHAPE reconciliation: epic now holds PL-9 (dedup census/ratchet — serviced by the batch loop), PL-14 (enforcement tooling, HIGH — first), PL-15 (noise burn-down, needs PL-14). The batch loop is SHARED with PL-13 (architecture convergence) — one stream, not two. Also queued on this epic: the 7 weak witnesses (strengthen-first, gates the batches), coverage follow-ups (proxy 0%, deletion 16%, template sync 18%), the hollow suite fix, and the mutation-informed pruning decision after the first Stryker pass.

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

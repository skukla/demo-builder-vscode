---
id: PL-9
kind: chore
area: platform
needs: []
value: low
status: active
---

# Tests-tree dedup — the census after the first-ever scan

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-27 by the dedup sweep, which ran jscpd over `tests/` for the
first time (the scan skill ignores `*.test.*` by design — that ignore is
right for src and was bypassed deliberately here).

Measured at min-lines 20 / min-tokens 140: **174 clones, 2.66% duplication**
(src is 0.62%). Most is CONVENTION — per-suite Spectrum mock preambles are
duplicated on purpose (webview-test-authoring §2) and are not targets.

The actionable class is split suites repeating an ARRANGE ritual per test
instead of using their testUtils. The sweep fixed the worst cluster as the
reference: PrerequisitesStep's progress specs (14 clones) inlined the
message-callback wiring because the testUtils helper was BROKEN — it
returned the captured callbacks by value, so the returned functions stayed
no-ops forever, and every spec copied the working inline version instead.
Lesson worth keeping: a dead helper next to N clones of its job usually
means the helper is broken, not unwanted. Fixed via trampolines +
`renderLoadedStep`; 23 tests, count unchanged, all green.

Remaining clusters, largest first (re-run before working — lines move):
`npx jscpd tests --min-lines 20 --min-tokens 140 --reporters console`

1. eds/services/reset/edsResetService-meshAuth.test.ts (8 clones — internal)
2. lifecycle/commands/stopDemo.process.test.ts (6, internal)
3. extension-activation-navigation + extension-context (5 each)
4. eds/services/blockCollectionHelpers-multiLibrary-merging (5)
5. projects-dashboard/commands/showProjectsList (4)
6. prerequisites/handlers/installHandler-shellOptions (4)
7. lifecycle/commands/startDemo.portConflict (4)
8. eds/daLive/daLiveContentOperations-transform (4)

Per cluster: same rule as production dedup, adapted for tests — extract the
arrange ritual to the suite's testUtils (hoist-safe per
webview-test-authoring §3), test COUNT stays identical, all green. Also
90 files sit in the 500-750 warning zone (validate:test-file-sizes) — split
per the playbook when touched, not as a batch.

## Shipped so far

- 2026-08-27  test(prerequisites): the arrange ritual lives in testUtils — because the helper was broken (`8002fe208`)
- 2026-08-28  Cluster 1 fixed (loop, 2026-08-28): the extension-activation pair's duplicated ~220-line preamble extracted to tests/extension.testUtils.ts (owns mocks + SUT import per the hoisting rule; also made the pair deterministic — the fs/promises flag-file mock now covers both suites). 14 tests before and after, zero edited. Census: 167 clones/2.59% at pickup -> 162/2.53% after. Next clusters per the fresh census: edsResetService customBlockLibraries<->meshAuth (4), AddIntegrationFlowModal pair (3), checkUpdates-upstream pair (3), startDemo pair (3).
- 2026-08-28  Cluster triage completed (loop, 2026-08-28). MECHANICAL, fixed tonight: extension-activation pair (5 clones) and AddIntegrationFlowModal pair (3) — census 167 -> 159, 2.59% -> 2.45%. VARIANTS, need per-family design, not forced: edsResetService family (5 suites, preambles differ 70-160 lines of 130 — each steers different mocks), checkUpdates-upstream pair (makeProject defaults differ semantically: forkSync's fixture deliberately lacks githubRepo), startDemo/stopDemo family (7 clones woven across 4 files). Internal-only clusters (daLiveContentOperations-transform, blockCollectionHelpers-multiLibrary) unexamined. Next pass starts from this triage.
- 2026-08-28  refactor(tests): the AddIntegrationFlowModal pair shares one preamble (`4d4192dcc`)
- 2026-08-28  refactor(tests): the extension-activation pair shares one preamble (`767c8ecd6`)

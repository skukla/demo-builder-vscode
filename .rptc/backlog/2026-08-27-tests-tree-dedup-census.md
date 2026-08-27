---
id: PL-9
kind: chore
area: platform
needs: []
value: low
status: backlog
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

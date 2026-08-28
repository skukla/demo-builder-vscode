---
id: PL-10
kind: question
area: platform
needs: []
value: med
status: backlog
parent: PL-11
---

# Testing approach audit — do the tests need the same scan toolkit the code got?

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-28, by the owner on reading the overnight loop's dedup pass:
*"we may have a ton of duplicated test trees, and our entire testing approach
may need to be optimized heavily. That seems like an opportunity for an audit
or a set of skills or scripts similar to others we've made for actual code."*

## What is already known (so the audit does not re-derive it)

- **Scale**: 1,171 suites / ~15,179 tests, full run ~20s. 59 `*.testUtils.*`
  files already exist — the shared-preamble pattern is established, just
  unevenly applied.
- **Duplication census** (PL-9, measured 2026-08-28): 159 clones / 2.45%
  duplicated lines at min-lines 20 / min-tokens 140 (src is 0.62%). Much is
  CONVENTION (per-suite Spectrum mocks are duplicated on purpose —
  webview-test-authoring §2). Two mechanical clusters were fixed by
  extraction; three families (edsResetService ×5, checkUpdates pair,
  start/stopDemo ×4) are VARIANTS whose fixtures differ semantically —
  forcing a shared preamble risks changing what the suites test. The triage
  is logged on PL-9.
- **The broken-helper lesson** (PL-9): a dead testUtils helper next to N
  clones of its job usually means the helper is BROKEN, not unwanted.
- **Existing instruments**: the code side has dead-code-scan,
  code-duplication-scan, component-extraction-scan, circular-dependency-scan,
  architecture-duplication-scan — none aimed at `tests/` (the dup scan
  ignores `*.test.*` BY DESIGN, correct for src).

## The audit's questions

1. **Which duplication is convention and which is debt?** The Spectrum-mock
   preamble rule makes raw clone counts misleading; the audit needs a
   classifier (or a documented ignore-list) before any number is a target.
2. **Is the split-suite pattern healthy?** Families like edsResetService-*
   split one SUT across 5 files, each re-mocking ~20 modules with slight
   variations. Is that variance load-bearing or accidental drift? (The
   checkUpdates pair's fixtures differ in ONE metadata field — deliberate or
   rot? Nobody can tell today; that un-tellability is itself the finding.)
3. **Mock-contract drift**: webview-test-authoring §8 documents four
   one-day incidents of stale mocks surviving contract changes. Is there a
   scannable signal (mock shape vs real export shape)?
4. **What would a `tests-tree-scan` skill do** that jscpd + the triage rules
   don't already? Candidate checks: suites >500 lines without a testUtils;
   testUtils exported-but-unused helpers (the broken-helper smell); per-suite
   mocks of modules a sibling testUtils already mocks; fixture shapes that
   match no real artifact (the invented-shape trap).

## Deliverable

A written verdict per question, and — only where a check is mechanical and
repeatable — a scan script/skill in the mold of the code scans (proposes,
never applies). Not a rewrite of the test tree; PL-9 keeps the dedup
execution.

## Related

- PL-9 (tests-tree dedup census — the execution lane this audit would steer)
- `.claude/skills/webview-test-authoring/` (the conventions any scan must
  respect)
- `tests/README.md`, `docs/testing/test-file-splitting-playbook.md`

## Shipped so far

- 2026-08-28  ESCAPE ANALYSIS SHIPPED (.rptc/plans/test-strategy-audit/escape-analysis.md): 15 shipped defects from two years of receipts, each with found-how / why-missed / style-that-catches. The tally is the strategy verdict's evidence: 8 of 15 escapes are EXTERNAL-contract/live-behavior gaps that NO unit-test improvement can close (mocks structurally blind); 5 of 15 were internal mock-blindness (already fixed forward by the argument-assertion rule — witness census 47/54); 1 unchecked convention (fixed by the convention-test pattern); 1 documentation-as-verification. Catch record compiled alongside. Verdict slate drafted, NOT codified: a three-tier strategy (unit = handed-in deps + argument assertions; contract = fixtures-from-live + drift scripts; live = journeys/probe verification + verify-after-write in destructive ops) — every tier already practiced somewhere, none yet policy. Awaiting the owner's ruling.
- 2026-08-28  SLATE WRITTEN (.rptc/plans/test-strategy-audit/slate.md): the seven-item ratification package — three-tier strategy ADR, eslint-plugin-jest, noise burn-down to zero with fail-on-console, the STRYKER MUTATION PILOT (the effectiveness instrument answering 'are 15k tests pulling weight' from evidence; first targets = convergence-queue services + worst-covered load-bearing files; release-cut pass, not CI), the three deferred codifications (family testUtils rule, deps-object doubles, clone ratchet), coverage follow-ups (proxy 0%, deletion 16%, template sync 18%), craft fixes (the hollow suite + throw-style normalization). Promises stated honestly: zero-warning runs enforceable; 'no bugs ever' explicitly NOT promised — non-repeating error classes are.

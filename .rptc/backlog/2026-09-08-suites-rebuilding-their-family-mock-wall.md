---
id: PL-51
kind: fix
area: platform
needs: []
value: med
status: backlog
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

Importing a helper brings ALL of its mocks. This repo has already measured what
that produces: **79 dead mocks across eleven families** (PL-14, 2026-08-31). So
converting a suite that needs only part of a helper's wall trades a small
duplication for the larger defect.

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

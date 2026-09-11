---
id: PL-57
kind: chore
area: platform
parent: PL-30
needs: []
value: med
status: built
---

# The component-extraction convention was enforced by nothing

Found 2026-09-11 by the convention-proof harness, on its first sweep through the
conventions that had no proof. It was the only one of the 68 for which no proof
could be written.

## What the handbook said

> **Convention.** Markup repeated in three or more places becomes a component.
> Enforced by `tests/sop/component-extraction.test.ts`.

## What that suite actually asserts

Four things, none of them that:

1. No abstract class with fewer than two implementations.
2. No `withX` / `createXComponent` HOC naming.
3. No over-generic `<T>` wrapper component.
4. Four named shared components still have at least their stated usage counts —
   plus a fifth test that asserted a two-element array literal declared three lines
   above it had two elements, which could only fail if someone edited that array.

No violation of the stated rule could turn it red. The citation resolved, the suite
was green, and the scorecard counted it as enforced for as long as the entry existed.

## The recommendation was wrong, and the pushback was right

Filed with a recommendation to restate the handbook and leave duplication to the
periodic review, on the grounds that the rule was "already protected either way".

**That premise was false.** The owner's objection was that a periodic scan catches
duplication after it is built, and the rule is about what happens while it is being
built. Checking instead of arguing turned up two things:

- `tests/sop/clone-pairs.ledger.json`, which looked like the protection, scans
  `tests`. Source duplication had no automatic check of any kind.
- `.claude/hooks/rules/30-reuse-first.rule` fires on WRITE of a path that does not
  exist yet and returns early when it does — "editing an existing component is not
  the reflex being guarded" — and only once per session. A third copy arrives as an
  Edit to files that already exist, so it sits outside that hook by design.

CLAUDE.md's "duplication is the one defect class with no automatic hook" was read
too broadly as well. It says deciding whether two things SHOULD be one needs
judgement, which a count-ratchet does not do.

## What shipped

Both halves, split along what is mechanical and what is judgement:

- **The count** is a shrink-only pin — `scripts/check-source-duplication.mjs`, 58
  clone pairs, step 7 of `npm run gate` (6.4s measured; too expensive for every jest
  run, free where the full suite already runs). Verified deterministic before pinning
  — two consecutive runs, same count and same fragment set — and both ratchet arms
  verified by moving the pin (57 → GREW, 59 → LOWER_THE_PIN).
- **The verdict** stays judgement, restated as a §11 discipline whose lack of an
  enforcer is written down rather than implied.
- The three rules the suite really enforces are conventions now, each with a proof.
  The test that tested nothing is deleted; the decision it recorded is kept as a
  comment.

The handbook count went 115 → 118. It went UP because the record got more accurate.

## Shipped so far

- 2026-09-11  Found and recorded in `scripts/convention-proofs.mjs` beside the
  proofs, so it is not rediscovered
- 2026-09-11  Ratchet, handbook correction, three new conventions with proofs
  (`b6948a16b`)

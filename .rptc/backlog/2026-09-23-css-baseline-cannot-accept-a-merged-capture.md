---
id: PL-63
kind: fix
area: platform
needs: []
value: med
status: built
---

# The CSS baseline check refuses every push that MERGES a stylesheet change

Filed 2026-09-23, from the v1.0.0-beta.148 release, which it blocked twice.

## What it asks, and why that cannot be satisfied by a merge

`scripts/check-css-baseline.mjs` requires that a resting capture ran **while one of
the push's changed stylesheets was dirty in the working tree**. The rationale is in
its own header and it is sound for authoring: captures happen on a dirty tree before
the commit, so comparing capture time against commit time would reject the correct
workflow.

It has no answer for the other way work arrives. When a feature branch merges, its
stylesheets land **already committed**. There is no moment, on the merging branch,
when those files are dirty — so no capture taken there can ever match, no matter how
complete it is.

## What was measured, 2026-09-23

`feature/colleague-storefront` brought six stylesheets to `develop`, two of them new
(`add-demo.css`, `export-dialog.css`). The branch never captured a baseline while
writing them. At the release:

- a full resting fingerprint of the MERGED tree was captured — 8 surfaces x 2 themes
  x 3 widths = 48, every one populated, 30 to 109 elements each, nothing blank;
- the check refused anyway, correctly by its own rule, because `dirtyPaths` was empty;
- `master` and `develop` both needed `CSS_BASELINE_BYPASS` to go out.

A check whose only outcome on a whole class of pushes is the bypass teaches people to
reach for the bypass. That is the failure mode, not the refusal.

## What would fix it

Not loosening the rule — the authoring case it protects is real. Options, in rough
order of appeal:

1. **Accept a capture taken at the merge's own commit.** The record already carries
   `sha`; a capture whose sha equals the pushing HEAD is evidence about exactly the
   code being pushed, which is stronger than one taken mid-edit.
2. **Ask the question on the feature branch instead**, where the files ARE dirty —
   a pre-push check on any branch, so the evidence exists before the merge.
3. **Accept a capture whose dirtyPaths is empty when the range is a merge**, and say
   in the message that the evidence is a snapshot rather than a before/after.

Option 2 is the habit change that prevents this; option 1 is what unblocks the case
where somebody did the work anyway.

## The related gap, stated separately

Nobody captured a before/after DIFF for those six stylesheets, so it is not known
that they moved only what they intended. The resting capture proves every surface
still renders. That is a smaller claim and worth not confusing with the larger one.

## Shipped so far

- 2026-09-24  fix(gate): the CSS baseline check accepts a resting capture taken at the commit being pushed (`80b15aae0`)
- 2026-09-23  docs(backlog): PL-63 — the CSS baseline check cannot be satisfied by a merge (`c658c93c5`)
- 2026-09-24  BUILT — option 1 from the item: check-css-baseline.mjs accepts a resting record whose sha equals HEAD when the range is a commit range (origin/x..HEAD); the dirty-tree question (range HEAD, the convention proof) keeps the dirtyPaths rule only, proven still REFUSED by convention-proofs css-baseline-before-push. Option 2 (ask on the feature branch) not done. First real use: today's develop push carrying seven stylesheets from the integrations view-mode work.
- 2026-09-24  fix(gate): the CSS baseline check accepts a resting capture taken at the commit being pushed (`17f7a567d`)

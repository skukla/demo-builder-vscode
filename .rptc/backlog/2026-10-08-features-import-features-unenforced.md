---
id: PL-68
kind: fix
area: platform
needs: []
value: med
status: shipped
---

# "Features do not import other features" says it is enforced by eslint; nothing enforces it

The handbook convention (`docs/development/handbook.md`, section 2: "Features do not import
other features; commands may. ... enforced by eslint.") claims a check that does not exist.
`eslint.config.mjs` enforces path aliases only; no rule, enforcer suite or ledger stops one
feature importing another.

**Found** 2026-10-07 by the PR-1a pattern audit (handbook reviewer): the branch put the one
Node reader (`nodeRequirements.ts`) inside `features/components` and eight other features
imported it (23 new cross-feature imports). Nothing failed, because nothing checks. PR-1a fixes
its own case by moving the reader to `core/`; the gap itself predates the branch and covers the
whole repo.

**What fixing it means.** Measure the existing cross-feature imports first (how many, which
features), then choose: an `import/no-restricted-paths` zone set, or an enforcer in `tests/sop/`
with a ratcheting ledger like `architecture-rules.exemptions.json` (the layer-direction rule's
model). Either way the handbook line must name the real enforcer, and
`tests/sop/claude-md-handbook-agreement.test.ts` keeps the two copies of the rule in step.

**Why not inside PR-1a:** the measurement and any exemptions touch every feature, which is
scope creep for a Node change.

## Shipped so far

- 2026-10-07  docs(backlog): PL-68, the features-import-features rule claims an eslint check that does not exist (`cdd433130`)
- 2026-10-19  docs(handbook): "features do not import features" is not enforced, say so (`64eafa5b7`)
- 2026-10-19  Measured 2026-10-19: 857 cross-feature imports, 72 feature pairs. The false eslint claim is corrected; enforce-with-ledger vs restate the rule is the owner's decision
- 2026-10-19  Owner chose restate over enforce (2026-10-19). Done.
- 2026-10-19  docs(handbook): restate the cross-feature import rule as the code works (`0a33356d5`)

# Wizard: multi-org users need an explicit org guard, not `getOrganizations()[0]`

## Provenance
Phase 4 security + code review of `fix/wizard-org-mismatch` (security ~30; not a vuln). The primary
fix uses `getOrganizations()[0]` as "the org" — the same convention `detectProjectOrgMismatch` already
uses. For a user who belongs to **multiple** orgs, `[0]` is an arbitrary first membership, not
necessarily the org the token/CLI is scoped to. Full diagnosis:
`.rptc/research/wizard-org-mismatch/research.md`.

## Goal / Scope
For multi-org users, guarantee the wizard acts on the **intended** org, not an arbitrary `[0]`.
NOT a security boundary — `[0]` is always one of the authenticated identity's own memberships, and
org-bound tokens fail-safe (403) on a wrong-org op — but the displayed org label and any pre-selection
ops can be wrong for multi-org accounts. Deferred because the real remedy is a UX/selection change
larger than the surgical org-scoping fix.

## Execution plan
1. Before showing "Connected" (and before any provisioning op), run `detectProjectOrgMismatch` /
   `ensureOrgContext` so a display-vs-token divergence forces re-selection (the canonical
   forced-login recovery) instead of silently proceeding on an arbitrary org.
2. Where a specific org is intended (an existing project's org, or a user selection), target THAT org
   explicitly rather than `getOrganizations()[0]`.
3. Regression tests: multi-org token → the guard fires / the correct org is targeted (mock
   `getOrganizations()` returning several orgs).

## Constraints
Repo PUBLIC. Keep the "no in-app org picker; forced-login recovery" model (per the canonical
org-context approach) — don't add an ad-hoc picker. Surgical. Fix branch off `develop`; no co-author
trailers.

## Kickoff prompt
`/rptc:fix "Wizard uses getOrganizations()[0] (arbitrary for multi-org users); add a detectProjectOrgMismatch/
ensureOrgContext guard before 'Connected' and target the intended org explicitly. Keep the forced-login
recovery model (no in-app picker). Diagnosis in .rptc/research/wizard-org-mismatch/research.md; backlog at
.rptc/backlog/2026-07-01-wizard-multi-org-selection-guard.md."`

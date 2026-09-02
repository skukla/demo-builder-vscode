---
id: PL-35
kind: fix
area: eds
value: med
status: backlog
needs: []
---

# The extractResetParams stand-in has drifted from the real function

Two dashboard suites — `dashboard/handlers/dashboardHandlers-eds` and
`projects-dashboard/handlers/dashboardHandlers-dalive-auth`, in different
features — each carried a byte-identical 49-line implementation of
`extractResetParams`, commented "mirrors real implementation". Found 2026-09-02
by the clone ledger; de-duplicated into `tests/helpers/edsResetParamsFake.ts`
the same day, with the drift recorded there rather than fixed.

## What the stand-in gets wrong

Measured against `src/features/eds/services/reset/edsResetParams.ts`:

- **Different error text.** "Missing EDS metadata: GitHub repository not
  configured" against production's "EDS metadata missing - no GitHub repository
  configured". A suite asserting one would fail against the other.
- **No `daLiveSite` fallback to the repo name.** The real function grew that on
  2026-08-23 because its absence made reset refuse every migrated project — a
  live bug. This copy still refuses them.
- **No repo-format or GitHub-slug validation.** Both reach a Helix URL in
  production.
- **No storefront-config resolution** from brand and stack; template and
  content-source values are frozen literals.

## Why it has cost nothing so far

Neither suite overrides the stand-in and neither asserts its error text. Every
divergent branch is dead in both. That is also why this is filed rather than
fixed in passing: nothing is currently wrong, and the fix changes what these
suites COVER.

## What "fixed" looks like

Drive `jest.requireActual('@/features/eds/services/reset/edsResetParams')` with
an injected `packages` fixture — the real function already takes one for exactly
this reason. Then the handler suites exercise real validation, the stand-in goes,
and the drift cannot recur.

The risk to check first: the real function resolves storefront config, so a
fixture has to supply a brand and stack these suites do not currently set.

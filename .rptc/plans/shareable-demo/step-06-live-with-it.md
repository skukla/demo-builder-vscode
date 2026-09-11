# Step 06 — Living with it: reset, edit, republish, names, update check

Item: [[EDS-13a]]. Decisions: D2, D4. Depends on steps 01 and 05.

## Goal

Every door in research §3b behaves for an added demo as it does for a shipped one, because
each reads the step-01 resolver. This step is mostly verification of step 01 against a real
project, plus the few places that need a colleague-specific rule.

| Door | Expected after steps 01 + 05 | Colleague-specific rule |
|---|---|---|
| Reset (both dashboard doors, MCP) | resolves the stored row; re-fetches the colleague's `main`; re-copies content | no LKG pin (`edsResetRepoHelper.ts:286` branch is skipped because no `codePatchSource`); the dry check re-runs |
| `refresh_block_library` | passes the template guard | — |
| Edit-mode rebuild | rehydration finds the row | a MISS logs at warn (step 01) |
| Republish / `.env` regenerate | flags from the stored row | the SC's B2B answer is one of those flags |
| Dashboard subtitle, projects-list card | the demo's name | — |
| AGENTS.md | the demo's name | — |
| Update checker / template sync | unchanged: instance metadata, compare to their `main` | — |
| Name migration, site-config repair | resolve without overlay | — |
| Block-library audience, inspector overrides | defaults | accepted degradation, named in docs |

## Tests first

The reset-params suite with a project carrying a stored row (injected `packages` empty to
prove the catalog is not consulted); the config-flag suite with a stored `configFlags`; the
dashboard/projects-list name tests with a stored row.

## Done when

On a real project created in step 05: reset completes from both doors, Configure opens with
the demo card present, republish preserves the B2B flags, and the update check reports
against the colleague's `main`.

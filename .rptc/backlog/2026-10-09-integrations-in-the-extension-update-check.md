---
id: AB-73
kind: feature
area: app-builder
needs: []
value: med
status: backlog
---

# Integrations in the extension update check

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-10-09.

**The gap (verified 2026-10-09).** The extension's update system (the startup check and
"Check for Updates": `checkUpdates.ts`, `updateExecutor.ts`, `updateApplyService.ts`, and
the agent tool `apply_updates`) covered the extension, components, templates, forks, block
libraries, the inspector SDK and the Adobe MCP packages across ALL projects, and never
looked at App Builder integrations or their ERPs. Integrations had their own path:
`checkIntegrationUpdates` ran only when the Integrations screen opened, only for the open
project, and `updateAppBuilderComponent` updated a pair from its card. So an SC who never
opened the Integrations screen was never told, other projects were never checked, and
`apply_updates` answered "upToDate: true" while an integration update was waiting.

**What was built.**

- The startup check and Check for Updates list every deployed pair with newer code, across
  all projects, one row per pair ("Justrite: ERP Integration and Justrite ERP"), using the
  Integrations screen's own rule (`checkIntegrationUpdates`, with AB-71's deployed-commit
  rule) and recording `updateAvailable` where the card badge reads it. The check runs
  alongside the other project checks, so the extension's own update notice does not wait on
  it; a project with no deployed integration costs nothing; a pair costs one `git fetch`
  per clone, run in parallel (both clones of a pair: 0.23 s, 0.26 s and 1.22 s over three
  runs, measured 2026-10-09 against the public repos), plus one Adobe org lookup for a
  project that has something newer (not measured: no live call was made).
- Picking the row is the confirmation. It runs the SAME pair update the card's Update
  button runs: the order and loop moved from the dashboard handler into
  `app-builder/services/integrationPairUpdate.ts`; the handler module binds them to a
  context and exports `checkProjectIntegrationUpdates`, `integrationUpdateProbe` and
  `updateIntegrationPairFor`, which the update check and `apply_updates` call. A project
  other than the open one is saved in place (`handlerRunnerDeps(..., 'in-place')`), never
  made current, and its rows are not telegraphed into the open project's grid.
- `apply_updates`: without confirm, `summary.integration` names each pair; with
  `confirm:true` it applies them through the same pair update; `categories.integration`
  reports the outcome.
- Org-bound tokens: the list asks the guard chain's own org step (`orgGuard`, split out
  of `runGuards` so both run the one function) once per project with something newer; a pair in another Adobe org is listed unticked
  with "open that project and update it from its Integrations screen", never deployed from
  this org, and `apply_updates` returns it under `deferred`. Applying runs the full chain
  (`guardOrBlock`) regardless.
- A failed update is reported in plain words ("X in P did not update: why") and the badge
  stays on (AB-71's rule records it).

Surfaces: the human picker, `apply_updates`, `check_integration_updates` (unchanged), the
Integrations card badge (unchanged, same `updateAvailable`).


---
id: PL-56d
kind: fix
area: platform
parent: PL-56
needs: [PL-56c]
value: high
status: active
---

# Import creates what the file says, re-proves sign-ins, and tells the SC what it did

Filed 2026-09-11 from `.rptc/research/project-import-export/research.md` ("What import
produces"). `kind: fix` because today's behaviour is wrong, not missing: an imported project
is created with integrations and mesh hardcoded empty whatever the file said.

## What changes

- `buildProjectConfig` (`wizardHelpers.ts:605`) reads the imported selections, App Builder
  components, custom sources and API picks instead of hardcoding `integrations: []` and
  `appBuilder: []`; import mode calls the same integration seeding edit mode uses
  (`buildEditModeIntegrationState`, `useWizardState.ts:216`); `datapack` and the store
  structure travel.
- Sign-ins are re-proven, never assumed: import seeds GitHub and DA.live exactly as edit mode
  does (`buildEditModeEdsConfig`); `buildImportModeEdsConfig` (`useWizardState.ts:130`) is
  deleted. The Adobe context goes through the Adobe step's existing mismatch handling and
  "Switch IMS Org". The owner's rule: if the context is stale or needs re-authentication,
  the EXISTING prompt runs before anything continues.
- Credentials: the wizard lists what the new project needs and cannot have ("3 need your
  input: admin password, catalog API key, …") and the existing Commerce connection step
  collects them; same-machine Copy moves them SecretStorage → SecretStorage directly.
- Data (D31): the named pack is pre-selected in Sample Data with community packs shown when
  needed; the banner adds "install it from the dashboard once your instance is connected" or
  "not published; ask the owner to export it", or "already installed on your instance" when
  `get-installed-datapacks` says so. Re-import is documented safe (existing items skipped,
  run succeeds), so "install" is a true verb.
- Integrations: identity only; the one-mesh-per-workspace reuse rule
  (`executorMeshPhase.ts:161`) stays; verify what a second App Management association to
  the same instance from another workspace does.
- The banner designed in 2025-12 and never built: "Brought in 14 settings from
  <sourceDescription>; 3 need your input", on the Welcome step, using the wizard's existing
  notice vocabulary. `sourceDescription` finally has a consumer.
- v1 files import through the contract's migration; the version check stops being a
  warning nobody sees.

## Follow-on, not in this item

Credentials are stored per project in the keychain; import can notice a login already saved
for the same backend address and offer to reuse it, so a machine move costs one entry per
backend rather than per project. File it when this item ships.

## Tests first

An end-to-end test that imports a captured v2 file and asserts the CREATION WIRE
(`ProjectConfigSource`), not wizard state: integrations, mesh, custom sources, picks,
datapack all present. Nothing covers this today.

## Progress 2026-09-13

The bundle half landed with the Export two-forms work: the projects list's Import and the
wizard's zip door both read a demo bundle's setup and open the wizard pre-filled on the card
the storefront became (`setupForCard` drops the sender's repository and site names). What
remains here is the rest of the ask: re-prove the sign-ins the setup names before anything
continues, and tell the SC what was applied and what was not.

## Shipped so far

- 2026-09-13  feat(eds): a demo bundle's setup opens the wizard pre-filled, on the card its storefront became (`abba851b5`)

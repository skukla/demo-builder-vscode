---
id: AB-21
kind: feature
area: app-builder
needs: []
value: med
status: active
---

# An integration's settings live on its tile, not on Configure Project

Filed 2026-09-18 from the owner: "Any configuration of the ERP integration should happen via
the integration's tile, not through the project set up", widened the same day to **every
integration**: "Keep Configure Project for the project itself."

Today every App Builder catalog entry's settings (`envSchema`) appear as tabs on Configure
Project. For the ERP pair that is two tabs, each with its own "ERP name".

Plan: `.rptc/plans/integration-settings-on-tile/overview.md`.

## Found while surveying (2026-09-18)

- Configure lists every entry the stack allows, installed or not, so a PaaS or ACCS project
  shows "ERP" and "ERP integration" tabs with no ERP installed
  (`src/features/dashboard/commands/configure.ts:205-208`).
- The ERP name can be set in two places that can disagree: `ERP_DISPLAY_NAME` is declared on
  both `demo-erp` and `erp-integration`, and each reads its own value first.
- A changed value takes effect only on the next deploy, and nothing starts one after Save.
- Secret settings are stored in SecretStorage and never read at deploy
  (`deployInputs.ts:69` skips them). No shipped entry has one yet.
- The `configure_project` agent tool writes any component's values with no check against the
  entry's settings, and does not refuse App Builder secret settings.
- The ERP cards cannot be renamed in the drawer: rename refuses systems and catalog entries.

## Shipped so far

- 2026-09-18  feat(integrations): an integration's settings live on its tile, not Configure Project (`807c5b704`)
- 2026-09-18  test(ai): configure_project suites share one setup file (`fb9db3d75`)

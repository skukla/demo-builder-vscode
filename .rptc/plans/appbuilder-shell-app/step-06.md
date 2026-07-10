# Step 6 — API assignment UI in the Integrations sub-steps

> **ABSORBED (2026-07-10)** by `.rptc/plans/integrations-flow-redesign/` — kept as
> history. The work items below reference components deleted by that redesign
> (`AddIntegrationModal`, `AppBuilderIntegrationCard`, the Integrations sub-steps).
> What shipped: wizard facet = `ApiAccessStage` in the Add Integration modal journey;
> dashboard parity = `ManageApisModal`; auth gating resolved by construction (the API
> stage follows the in-modal sign-in/destination stages).

## Goal

Users assign Adobe APIs to an App Builder integration in the wizard itself (and from the
dashboard), not only through the AI session. Completes the UX story steps 1–5 opened:
pick the blank shell → check "Firefly Services" → create → the app deploys with access
already subscribed.

## Why the backend is already done (steps 3's contracts — reuse, don't fork)

- **Option list**: `listConsoleApis` handler returns the org's live entitlements
  (code + name + `managed` flag). The wizard picker renders exactly that.
- **Persistence**: selections land in `Project.additionalConsoleApis` — the same field
  the MCP tool writes — so wizard-assigned and AI-assigned APIs are one population.
- **Subscription**: creation Phase 3b / the mesh pre-deploy / every later reconcile
  already union `additionalConsoleApis` into the full-list PUT. Zero new subscribe code.

## Work items

1. **Wizard surface** (`src/features/project-creation/ui/...` Integrations area):
   an API-selection facet when an App Builder integration is selected — either inside
   `AddIntegrationModal` (a second facet after the catalog pick) or an "APIs" row on the
   added-integration card (`AppBuilderIntegrationCard` / `DeployablesBody`). Entries from
   the org service list; each entry's `requiredApis` + the baseline render as locked
   (always subscribed); free picks are checkboxes. Follow `wizard-step-authoring` +
   `spectrum-webview-ui` skills.
2. **Wizard ⇄ extension data flow**: a webview message backed by the existing
   `listConsoleApis` handler (it is already headless-safe; follow the
   `webview-command-handler` skill for the end-to-end wiring). Serialize the chosen codes
   in `buildProjectConfig` → creation writes `Project.additionalConsoleApis` before
   Phase 3b runs (subscribe then covers them in the same union).
3. **Dashboard parity**: a "Manage APIs" action on the integration card that reuses
   `listConsoleApis` (options) + `addConsoleApis` (apply). Removal of an API is OUT of
   scope (the reconcile is additive-by-union today; removal semantics are a separate
   design).

## Design decisions to settle at execution

- **Auth gating (the load-bearing one)**: the org service list needs a signed-in,
  org-resolved session, and the Integrations area is reachable before Adobe auth
  completes. Options: (a) the API facet renders only after the Commerce sign-in gate is
  satisfied (matches the in-accordion sign-in pattern), or (b) it degrades to "APIs can
  be assigned after sign-in — or ask the AI later" copy. Decide with the v6 builder's
  lock/continue model in hand; default recommendation is (a).
- **Where the facet lives**: modal facet vs card row. Pick whichever keeps
  `AddIntegrationModal` under the component-size SOP; the card row also gives a natural
  home for later "Manage APIs" parity.
- **Placement of the wizard-side fetch**: the wizard currently has no console-service
  read; confirm the handler is reachable from the create-project webview's handler map
  (it lives in `dashboardHandlers` — may need registration on the wizard command's map
  or a shared map import).

## TDD

- Picker component tests (options render, managed/locked entries not toggleable,
  selection round-trip).
- `buildProjectConfig` serialization test for the chosen codes.
- Creation-side test: `additionalConsoleApis` present on the persisted project before
  Phase 3b subscribe runs; union includes them (extends the step-3 suites).
- Handler-map registration test if the wizard map gains the read handler.

## Sequencing

After the step-4 live walkthrough — it tells us whether the AI-only loop is sufficient
or this UI is load-bearing for the demo story, and whether auth-gating option (a) feels
right in practice.

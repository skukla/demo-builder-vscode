# Step 5 — Backlog corrections from the slice-3 staleness research (docs only)

Research (2026-07-09, three parallel agents) found both App Builder backlog items stale.
Fold the corrections in so the next planner starts from facts.

## `2026-06-17-appbuilder-app-package-bound.md` (slice 3) — rescope

- `citisignal-headless` is NOT a package id (packages: `isle5`, `custom`, `citisignal`,
  `buildright`; "CitiSignal Headless" is storefront `headless-paas` inside `citisignal`;
  scoping matches package id — `appBuilderComponentSelection.ts:38,55`).
- The proposed example binding is behaviorally redundant: `headless-commerce-mesh` already
  resolves `'required'` via the mesh-kind rule (`requiresMesh: true`), and required-mesh
  auto-include already works via the dual-flow (`selectedOptionalDependencies` → mesh phase).
- "Auto-included and shown locked" is dormant beyond annotation: the union helper
  `computeSelectedAppBuilderComponents` has zero production callers; the locked-row renderer
  `AppBuilderComponentsStepContent` is mounted nowhere (old caller `ProjectBuilderStep` is
  gone). Only the `onlyForPackages` exclusion is live (mesh-tile path, `tileStatus.ts:73`).
- Real remaining scope when a bindable `kind:'integration'` entry exists: schema fields +
  binding data + required-id seeding on stack select (mirror `resolveBlockLibrarySeed`;
  `WelcomeStep` clears the field citing a re-seed that doesn't exist) + locked rendering in
  the LIVE IntegrationsStep + summary/Review visibility (BuildYourProjectSummary shows only
  an API Mesh row; ReviewStep reads always-empty `components.appBuilder`).
- Gate the item on the first real package-bound integration (candidates: an app from THIS
  plan's shell lineage, slice 4 scaffold output, or the BuildRight rebuild).
- Decide the two dead pieces' fate explicitly (wire-when-activated vs delete now per
  no-soft-deprecation).

## `2026-06-21-appbuilder-component-first-class-persistence.md` — prune to the true claim

- STALE (now false): "no `buildProjectConfig` serialization" (`wizardHelpers.ts:694-695`
  serializes both fields); "custom-URL provisioning missing" (Phase 3b provisions via
  `buildCustomIntegrationEntry`; the door was rebuilt as `CustomIntegrationRow` —
  `showCustomDoor={false}` is obsolete, the old component is production-dead).
- STILL TRUE (keep, deepened): no edit-mode rehydration — `useWizardState.ts:182-230`
  rehydrates neither `selectedAppBuilderComponents` nor `appBuilderComponentSources`, and
  the saved project record stores neither, so there is nothing to rehydrate FROM.
- Note the design insight: package-BOUND components are derivable from the package id and
  need no persistence; only free-form selections have this gap.

## Also

- ReviewStep's App Builder row reading `components.appBuilder` (always `[]`) is a live
  user-visible bug for hand-picked integrations — file it or fix it alongside step 2.

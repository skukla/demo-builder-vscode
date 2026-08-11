# App Builder slice 3 (package-bound) — staleness audit vs develop

**Date:** 2026-07-09 · **Method:** three parallel research agents (mechanism state /
schema+data / selection→creation flow trace) · **Trigger:** picking up
`.rptc/backlog/2026-06-17-appbuilder-app-package-bound.md`

## Verdict

The binding mechanism exists as claimed, but "small, activation only" is stale in both
directions: downstream already works end-to-end for SELECTED integrations; upstream, the
auto-include pieces are production-dead and the proposed binding data is impossible as
written. **The slice has no meaningful activation data until a real `kind: 'integration'`
package-bound app exists.** Direction chosen: build that first app instead — see
`.rptc/plans/appbuilder-shell-app/`.

## Verified accurate

- `nativeForPackages?`/`onlyForPackages?` on the catalog entry type
  (`src/types/appBuilderComponents.ts:49,55`); scoping implemented + tested
  (`appBuilderComponentSelection.ts:37-83`): `onlyForPackages` excludes, `nativeForPackages`
  → `'required'`; mesh-kind rule also yields `'required'` when `pkg.requiresMesh`.
- Schema gap real but cosmetic: `app-builder-components.schema.json` omits both fields, but
  there's no Ajv anywhere for this config, no `additionalProperties: false`, and the loader
  is a plain cast (`appBuilderComponentCatalogLoader.ts:12,20`) — the fields pass through.
- `onlyForPackages` exclusion is LIVE via the mesh tile (`tileStatus.ts:73` is the only
  production caller of `getSelectableAppBuilderComponents`).

## Stale / wrong

1. **`citisignal-headless` is not a package id.** Packages: `isle5`, `custom`, `citisignal`,
   `buildright`. "CitiSignal Headless" = storefront `headless-paas` inside `citisignal`
   (`demo-packages.json:211-230`); scoping matches package id.
2. **The example binding is redundant.** `headless-commerce-mesh` already resolves
   `'required'` for that storefront (`requiresMesh: true` at `demo-packages.json:229`), and
   required-mesh auto-include already works via the dual-flow legacy path
   (`useProjectBuilder.ts:92-101,229` → `components.dependencies` → mesh phase).
3. **"Auto-included + shown locked" is dead code beyond annotation.**
   `computeSelectedAppBuilderComponents` (the union) has zero production callers;
   `AppBuilderComponentsStepContent` (the locked renderer) is mounted nowhere (its caller
   `ProjectBuilderStep` no longer exists). Live `IntegrationsStep`/`AddIntegrationModal`
   have no requirement handling. `WelcomeStep.tsx:80-89` clears
   `selectedAppBuilderComponents` citing a re-seed that was never implemented.
4. **Review visibility must be BUILT, not verified.** `BuildYourProjectSummary` shows only
   an API Mesh row (`buildSummary.ts:114-130`); `ReviewStep` reads `components.appBuilder`
   which the wizard hardcodes to `[]` (`wizardHelpers.ts:686`) — user-picked integrations
   are invisible on Review today (live bug, independent of binding).

## Downstream (works today for selected integrations)

`selectedAppBuilderComponents` serializes (`wizardHelpers.ts:694-695`) → creation Phase 3b
(`executor.ts:542-589`) resolves catalog/custom entries, filters `kind === 'integration'`
(mesh excluded — no double deploy), role-gates, then `addAppBuilderComponent`
(`appBuilderComponentRunner.ts:213-247`): subscribe required APIs → clone+install →
deploy under org context → persist `project.appBuilderComponents` → dashboard card.

## Sibling item `2026-06-21-appbuilder-component-first-class-persistence.md`

- FALSE now: claims about missing `buildProjectConfig` serialization and missing custom-URL
  provisioning (`CustomIntegrationRow` is the rebuilt door; `showCustomDoor={false}` is
  obsolete).
- TRUE still (deepened): no edit-mode rehydration (`useWizardState.ts:182-230`), and the
  saved project record stores neither selection field — nothing to rehydrate from.
- Insight: package-BOUND components are derivable from the package id — binding sidesteps
  persistence; only free-form selections have the gap.

## Divergence note

Block libraries resolve natives via a two-list split (`getNativeBlockLibraries`,
`blockLibraryLoader.ts:56-61`); App Builder selection annotates a single list
(`requirement: 'required'`). Same UX intent, different shape — an implementer mirroring the
block-library display must not assume the required entry leaves the picker list.

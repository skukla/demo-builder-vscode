# App Builder app — package-bound apps (auto-attach to a demo template)

> **Status: GATED on the first real package-bound integration.** Rewritten 2026-07-09
> after a three-agent staleness audit
> (`.rptc/research/appbuilder-slice3-staleness/research.md`) — the original "small,
> activation only" framing was wrong in both directions. Slice 3 of 5.

## What the audit established (verified on `develop`, 2026-07-09)

**Mechanism (accurate, keep):** `nativeForPackages?`/`onlyForPackages?` exist on the
catalog entry type (`src/types/appBuilderComponents.ts`) and the scoping is implemented +
tested (`appBuilderComponentSelection.ts`): `onlyForPackages` excludes (LIVE on the
mesh-tile path via `tileStatus.ts`), `nativeForPackages` → `requirement: 'required'`
(annotation only). The schema now declares both fields — cosmetic anyway (no Ajv for this
config; the loader is a plain cast).

**Stale claims (corrected):**
- `citisignal-headless` is NOT a package id. Packages: `isle5`, `custom`, `citisignal`,
  `buildright`; "CitiSignal Headless" is storefront `headless-paas` inside `citisignal`.
  Scoping matches PACKAGE id.
- Binding `headless-commerce-mesh` would be behaviorally redundant: it already resolves
  `'required'` via the mesh-kind rule (`requiresMesh: true` on the storefront), and
  required-mesh auto-include already works via the dual-flow legacy path.
- "Auto-included and shown locked" is dead code beyond the annotation:
  `computeSelectedAppBuilderComponents` (the union) has zero production callers;
  `AppBuilderComponentsStepContent` (the locked renderer) is mounted nowhere (its caller
  `ProjectBuilderStep` is gone). `WelcomeStep` clears `selectedAppBuilderComponents`
  citing a re-seed that was never implemented. The live `IntegrationsStep` /
  `AddIntegrationModal` have no requirement handling.
- Summary/Review visibility must be BUILT, not "verified" — see the rewritten
  `2026-06-21-appbuilder-component-first-class-persistence.md` item (ReviewStep bug).

## Gate

Pick this up only when a real `kind: 'integration'` catalog entry purpose-built for a
specific demo package exists. Likely sources: an app grown from the **blank shell**
lineage (`.rptc/plans/appbuilder-shell-app/` — shipped 2026-07-09), slice 4
scaffold-and-author output, or the BuildRight rebuild.

## Real remaining scope (when the gate opens)

1. Binding data on the entry: `nativeForPackages: ["<package-id>"]`.
2. **Seeding**: union required ids into `selectedAppBuilderComponents` on stack select
   (mirror `resolveBlockLibrarySeed` in `useProjectBuilder.ts`); fix the WelcomeStep
   clear/re-seed contract. `computeSelectedAppBuilderComponents` is exactly this union —
   wire it or delete it.
3. **Locked UI** in the live IntegrationsStep/AddIntegrationModal. Design decision:
   single annotated list (the orphaned `AppBuilderComponentsStepContent` shape) vs block
   libraries' two-list split (`getNativeBlockLibraries` — natives leave the picker).
   Removability: default "shown as included, not removable" (matches native libraries).
4. **Visibility**: integrations row in `BuildYourProjectSummary` + the ReviewStep fix.
5. Decide the two dead pieces' fate (wire-when-activating vs delete now per
   no-soft-deprecation).

Note: package-bound components are DERIVABLE from the package id — binding sidesteps the
persistence gap that free-form selections have.

## Kickoff prompt

"Activate package-bound App Builder apps (slice 3). Read
`.rptc/backlog/2026-06-17-appbuilder-app-package-bound.md` (rewritten 2026-07-09) and
`.rptc/research/appbuilder-slice3-staleness/research.md` FIRST — the mechanism exists but
the auto-include seeding, locked UI, and summary visibility do not. Requires a real
package-bound `kind: 'integration'` entry to bind."

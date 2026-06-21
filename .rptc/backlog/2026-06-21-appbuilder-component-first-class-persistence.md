# App Builder component — first-class persistence & provisioning

> Date prefix = deferral snapshot (scoped during Slice 2 "Project Builder" implementation, 2026-06-21).

## Provenance

Deferred out of **Slice 2 — two-column "Project Builder" wizard step** (plan: `quiet-orbiting-sutherland`, branch `feature/project-builder-ux`). Slice 2 moved stack + component + block-library selection out of `ArchitectureModal` into the new `project-builder` wizard step (`src/features/project-creation/ui/builder/`) and retired `ArchitectureModal`/`useModalState`. Slice 2 was **selection-only**; the three gaps below were left for later because they are coupled facets of making `selectedAppBuilderComponents` a first-class persisted/provisioned field, and today nothing exercises that path (the catalog is meshes-only, and meshes route through the dual-flow into `components.dependencies`, which "D3" removes).

## Goal / Scope

Make `selectedAppBuilderComponents` a first-class persisted + provisioned field, removing the transitional mesh dual-flow. Three coupled gaps:

1. **Edit-mode rehydration** of `selectedAppBuilderComponents` / `selectedOptionalDependencies` in `buildEditModeState`. Coupled to #3 — you cannot rehydrate what was never serialized. Required meshes re-derive from the stack, so today only an *optional, non-stack-native* mesh selection is lost on edit (rare). Low user impact until non-mesh components exist.

2. **Custom-URL creation-side provisioning** (`onAddCustomAppBuilderComponent`). Needs #3 **plus** creation-side clone/provision of an arbitrary GitHub repo as an App Builder component (the D1/D2 runner is wired to the dashboard, not to creation). A real feature, not wiring. **Slice 2 HID the inert custom-URL door** via `AppBuilderComponentsStepContent`'s `showCustomDoor` prop (the builder passes `showCustomDoor={false}`; default stays `true` for any other caller). Re-enable the door (`showCustomDoor` back to default / drop the override in `ProjectBuilderStep`) when this provisioning lands.

3. **`buildProjectConfig` serialization** of `selectedAppBuilderComponents`. Dead data until creation consumes non-mesh components.

## Execution plan

Land together with the **D3 dual-flow removal** (the mesh ↔ `selectedOptionalDependencies` mirror-write in `appBuilderComponentSelectionState.ts` + `useProjectBuilder.onAppBuilderComponentToggle`, locked by `tests/features/project-creation/ui/wizard/useWizardState-dualFlow.test.tsx`). Order: (3) serialize → (1) rehydrate → (2) provision + re-enable door. Each phase TDD; keep the dual-flow regression green until D3 actually removes it.

## Constraints

- Repo is PUBLIC: route any per-component secret through user-scoped VS Code settings; never bundle as constants/fixtures.
- Do NOT remove the dual-flow mirror-write before creation actually consumes `selectedAppBuilderComponents` — the Adobe-auth/IO step gating depends on it (`useWizardState.ts` `hasMeshInDependencies`).
- Files <500 lines, functions <50.

## Kickoff prompt

"Resume the deferred App Builder component first-class persistence work (`.rptc/backlog/2026-06-21-appbuilder-component-first-class-persistence.md`). Land it WITH the D3 dual-flow removal: serialize `selectedAppBuilderComponents` in `buildProjectConfig`, rehydrate it (and `selectedOptionalDependencies`) in `buildEditModeState`, add creation-side provisioning for custom-URL components, then re-enable the custom door (`showCustomDoor`) in `ProjectBuilderStep`/`AppBuilderComponentsStepContent`. Strict TDD; keep the dual-flow regression test green until D3 removes the mirror-write."

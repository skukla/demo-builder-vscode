# Slice 1 — Rename `deployable` → "App Builder component"

**Status:** Implemented + verified (gates green). Awaiting commit approval.
**Branch/worktree:** `feature/appbuilder-component-rename` (off `develop`).
**Research:** `.rptc/research/project-builder-ux/research.md` → "Terminology / domain model — FINDING" + "Decisions (PM, 2026-06-21)".

## Context

D1/D2 coined the noun **"deployable"** for the App-Builder-deploying units (mesh + integrations). Research
established it is a redundant coinage — these are simply a *kind of component* (the codebase already had a
`component` umbrella, an `appBuilder` category, and `ComponentInstance.subType`). The rename was done NOW
because `project.deployables` is still synthetic/read-through (`appBuilderComponentMigration.ts` maps legacy
`meshState`/`appState` at LOAD only; never persisted) — so zero user-data migration, a window that closes once
D2/D3 persist the keyed map.

**Scope decision (PM):** Full symbol/file/message-id rename + catalog file rename, but the catalog stays a
SEPARATE file and the bridge is kept. The true registry merge into `components.json` (reconciling mismatched
mesh ids, deleting the bridge + the mesh dual-flow) is **deferred to D3**.

## What changed

- **Vocabulary rule (3 disjoint case forms):** `DEPLOYABLE`→`APP_BUILDER_COMPONENT`,
  `Deployable`→`AppBuilderComponent`, `deployable`→`appBuilderComponent`. Applied across 72 files
  (46 src + 26 test). Enum VALUES unchanged (`kind: 'mesh' | 'integration'` kept; `'integration'`→`'app'` is
  deferred).
- **31 files renamed** (`git mv`), e.g. `deployableRunner.ts`→`appBuilderComponentRunner.ts`,
  `src/types/deployables.ts`→`src/types/appBuilderComponents.ts`,
  `src/core/state/deployableMigration.ts`→`appBuilderComponentMigration.ts`.
- **Catalog config (kebab):** `deployables.json`→`app-builder-components.json`,
  `deployables.schema.json`→`app-builder-components.schema.json`; JSON top key `deployables`→`appBuilderComponents`;
  `$schema` + loader import + test `readFileSync` paths updated.
- **7 webview message ids** renamed on both sides (`addAppBuilderComponent`, `deployAppBuilderComponent`,
  `redeployAppBuilderComponent`, `removeAppBuilderComponent`, `verifyAppBuilderComponent`,
  `appBuilderComponentStatusUpdate`, key `appBuilderComponents`).
- **`package.json` setting** (unreleased): key `demoBuilder.deployables.custom`→`demoBuilder.appBuilderComponents.custom`,
  title "Deployables"→"App Builder Components", description updated.
- **2 current-doc READMEs** updated (`src/core/shell`, `src/features/app-builder`).
- **8 user-facing UI strings** fixed where the blind swap leaked the camelCase token (caught by two
  code-review passes): the dashboard add button, remove-dialog title, custom-URL label, auth warning, picker
  prompt, empty state, the "Which … should be included?" prompt, and the custom-entry description. Plus ~41
  comment-grammar fixes ("a/A appBuilderComponent" → "an/An App Builder component").

## Verification (all green)

- `tsc --noEmit`: 0 errors. `npm run lint`: 0 errors (6 pre-existing warnings). `npx jest --no-coverage`:
  788 suites / 9617 tests pass.
- `grep -ri deployable src tests package.json` → 0. `app-builder-components.json` parses (top key
  `appBuilderComponents`, 3 entries).

## Out of scope (D3)

- Merge catalog into `components.json`; reconcile mismatched mesh ids; delete the
  `meshAppBuilderComponentToComponentIds` bridge + mesh dual-flow. Change `'integration'` kind → `'app'`.

## Follow-ups (optional, not blocking)

- A superseding ADR (or CHANGELOG entry) recording the "deployable → App Builder component" vocabulary change
  (ADR-011's body is left immutable as the original-decision record).

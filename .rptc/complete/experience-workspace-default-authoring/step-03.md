# Step 3: Setting + State Field + Resolver

**Purpose:** Introduce the global default setting, the per-project metadata field, and the precedence resolver. Pure plumbing — no behavior change yet (consumers wire up in Steps 4–5).

**Prerequisites:** Step 0 (independent of Steps 1–2).

**Model:** `resolveByomOverlayConfig` (`edsHelpers.ts:323-341`) — per-project value wins, global setting is fallback.

---

## Tests to write FIRST (RED)

**New test file:** `tests/features/eds/handlers/edsHelpers-authoringExperience.test.ts`.

- [ ] `resolveAuthoringExperience(undefined)` with global setting unset → `'universal-editor'` (default).
- [ ] `resolveAuthoringExperience(undefined)` with global setting `'experience-workspace'` → `'experience-workspace'` (global fallback).
- [ ] `resolveAuthoringExperience('experience-workspace')` → `'experience-workspace'` (per-project wins, even when global is UE).
- [ ] `resolveAuthoringExperience('universal-editor')` with global `'experience-workspace'` → `'universal-editor'` (per-project wins both ways).
- [ ] `resolveAuthoringExperience('garbage')` → `'universal-editor'` (invalid value falls through to default — fail safe).
- [ ] Mock `vscode.workspace.getConfiguration('demoBuilder.daLive').get('authoringExperience', ...)` (reuse the existing `vscode` config mock pattern from `edsHelpers-byomOverlay.test.ts`).

## Implementation (GREEN)

- [ ] **Setting** — `package.json`, in the existing `demoBuilder.daLive` properties group (`:241-262`), add:
  ```json
  "demoBuilder.daLive.authoringExperience": {
    "type": "string",
    "enum": ["universal-editor", "experience-workspace"],
    "default": "universal-editor",
    "description": "Default AEM authoring experience for new EDS projects. Universal Editor preserves the current da.live doc editor + punch-out; Experience Workspace uses the da.live-native canvas. Override per project from the project menu."
  }
  ```
- [ ] **Type** — add a string-union type alias `AuthoringExperience = 'universal-editor' | 'experience-workspace'` (place next to the EDS metadata types; e.g. `src/types/base.ts` or wherever EDS component-instance metadata is typed — locate via `grep -rn "daLiveOrg" src/types/`). The per-project field is `authoringExperience?: AuthoringExperience` on the EDS component-instance `metadata` (`componentInstances[COMPONENT_IDS.EDS_STOREFRONT].metadata`, beside `daLiveOrg`/`daLiveSite`). No backfill — absence = resolver default.
- [ ] **Resolver** — add `resolveAuthoringExperience(metadataValue: string | undefined): AuthoringExperience` to `edsHelpers.ts`, mirroring `resolveByomOverlayConfig`. Validate the per-project value against the union; if it's a recognized value, return it; else read `demoBuilder.daLive.authoringExperience` (default `'universal-editor'`); coerce any unrecognized result to `'universal-editor'`.

## Files

- **Modify:** `package.json`, `src/features/eds/handlers/edsHelpers.ts`, EDS metadata type file (`src/types/*`)
- **Create test:** `tests/features/eds/handlers/edsHelpers-authoringExperience.test.ts`

## Acceptance Criteria

- Setting appears in VS Code settings under the DA.live group with the two-value enum, default UE.
- Per-project field is optional and absent by default (no migration).
- Resolver precedence: per-project → global → UE; invalid input → UE.
- `vscode` stays out of `typeGuards.ts` (resolver lives in `edsHelpers.ts`).

## Notes / Constraints

- KISS/YAGNI: 2-value string union — no enum class, no strategy.
- DRY: same resolver shape as the BYOM resolver; reviewers can pattern-match.

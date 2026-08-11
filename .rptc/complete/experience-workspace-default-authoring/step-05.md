# Step 5: Flip Handler + UI

**Purpose:** Let an SC flip a single project's authoring experience. Persist the metadata (pure-local) then immediately re-apply the site-scoped `editor.path`. Surface the toggle in the kebab + dashboard, and relabel the "Author" button dynamically.

**Prerequisites:** Steps 3 (resolver/field) and 4 (URL branch + site-scoped editor.path).

**Models:**
- `handleSetProjectPinned` (`dashboardHandlers.ts:1031-1063`) — pure-local persist via `saveProjectConfigOnly`.
- `republishStorefrontContent` Step 1 (`storefrontRepublishService.ts:317-323`) — the editor.path re-apply is a THIN extraction of this Step-1 call (`applyDaLiveOrgConfigSettings(...)`), NOT the full republish reset.
- Handler registration precedent: `projectsListHandlers.ts:91` (`'setProjectPinned': handleSetProjectPinned`).

---

## Part A — Flip handler (backend)

### Tests FIRST (RED) — `tests/features/projects-dashboard/handlers/dashboardHandlers-setAuthoringExperience.test.ts` (NEW)

- [ ] Missing/invalid payload (`projectPath` or non-union `experience`) → `{ success: false, error }`.
- [ ] Invalid project path → `{ success: false }` (via `validateProjectPath`, like `handleSetProjectPinned`).
- [ ] Happy path: loads project (`persistAfterLoad: false`), writes `authoringExperience` into EDS metadata, persists via `saveProjectConfigOnly` (NOT `saveProject` — no `onProjectChanged` side effects).
- [ ] After persist, immediately calls the extracted editor.path re-apply (`applyDaLiveOrgConfigSettings` with the new experience, site-scoped) — assert it is invoked with `(daLiveOrg, daLiveSite, experience)` for the flipped value.
- [ ] Does NOT run the full `republishStorefrontContent` pipeline (assert no config regen / Helix steps).
- [ ] editor.path re-apply failure is non-fatal: metadata still persisted, handler returns success with a warning (mirror the non-fatal posture of `applyDaLiveOrgConfigSettings`).

### Implementation (GREEN)

- [ ] Add `handleSetAuthoringExperience: MessageHandler<{ projectPath: string; experience: AuthoringExperience }>` to `src/features/projects-dashboard/handlers/dashboardHandlers.ts`, following the `handleSetProjectPinned` recipe:
  1. Validate payload + path.
  2. Load project (`persistAfterLoad: false`).
  3. Set `componentInstances[EDS_STOREFRONT].metadata.authoringExperience = experience`.
  4. `saveProjectConfigOnly({ ...project, ... })`.
  5. Construct DA content ops (reuse the `createDaLiveServiceTokenProvider` seam as `republishStorefrontContent` does) and call `applyDaLiveOrgConfigSettings(daLiveContentOps, daLiveOrg, daLiveSite, logger, experience)` — the thin extraction.
- [ ] Register `'setAuthoringExperience': handleSetAuthoringExperience` in `projectsListHandlers.ts` (beside `setProjectPinned`, `:91`) and in the dashboard handler map (`dashboard/handlers/dashboardHandlers.ts` map, beside `openDaLive` `:550`) if the dashboard surface dispatches it too.

---

## Part B — UI

### Tests FIRST (RED)

**Update** `tests/features/projects-dashboard/ui/components/ProjectActionsMenu.test.tsx`:
- [ ] EDS project resolved to UE → "Author" item label is "Author in Universal Editor".
- [ ] EDS project resolved to EW → label is "Author in Experience Workspace".
- [ ] A flip action ("Switch to Experience Workspace" / "Switch to Universal Editor") appears for EDS projects and invokes `onSetAuthoringExperience(project, <other experience>)`.
- [ ] Non-EDS project → no Author item, no flip action (regression guard).

**Update** the dashboard ActionGrid test (`tests/features/dashboard/ui/components/ActionGrid.test.tsx` or nearest) and `useDashboardActions` test:
- [ ] Author button label reflects the resolved experience.
- [ ] Toggle control posts `setAuthoringExperience` with the opposite experience.

### Implementation (GREEN)

- [ ] `ProjectActionsMenu.tsx`: replace the hardcoded `'Author in DA.live'` (`:195`) with a label derived from the resolved experience (passed down as a prop or read from project metadata via the resolver result threaded from the backend-provided view model). Add a flip action to the USE or MANAGE group and a new `onSetAuthoringExperience?: (project, experience) => void` callback to `ProjectActions`.
- [ ] `projects-dashboard/ui/index.tsx`: add `handleSetAuthoringExperience` callback (posts `setAuthoringExperience`), wire into the `actions` object (mirrors `onPinToggle` wiring at `:399`/`handlePinToggle`).
- [ ] Dashboard: `ActionGrid.tsx` (`:207` Author button), `ProjectDashboardScreen.tsx`, `hooks/useDashboardActions.ts` (`handleOpenDaLive` `:134`) — relabel the Author button from the resolved experience and add a flip control posting `setAuthoringExperience`.
- [ ] The resolved-experience label value should ride along in the dashboard view model already built backend-side (e.g. beside `edsDaLiveUrl` in `showDashboard.ts:147`), so the UI stays presentational and `vscode`-free.

## Files

- **Modify (backend):** `src/features/projects-dashboard/handlers/dashboardHandlers.ts`, `src/features/projects-dashboard/handlers/projectsListHandlers.ts`, `src/features/dashboard/handlers/dashboardHandlers.ts`, `src/features/dashboard/commands/showDashboard.ts` (label in view model)
- **Modify (UI):** `src/features/projects-dashboard/ui/components/ProjectActionsMenu.tsx`, `src/features/projects-dashboard/ui/index.tsx`, `src/features/dashboard/ui/components/ActionGrid.tsx`, `src/features/dashboard/ui/ProjectDashboardScreen.tsx`, `src/features/dashboard/ui/hooks/useDashboardActions.ts`
- **Create test:** `tests/features/projects-dashboard/handlers/dashboardHandlers-setAuthoringExperience.test.ts`
- **Update tests:** `ProjectActionsMenu.test.tsx`, `ActionGrid.test.tsx` (+ `useDashboardActions` test)

## Acceptance Criteria

- Flip persists metadata locally AND re-applies site-scoped editor.path immediately, with NO full republish.
- editor.path re-apply failure does not lose the metadata write (non-fatal).
- Author button label + URL both reflect the active experience and stay in sync after a flip.
- Flip available from both kebab and dashboard.

## Notes / Constraints

- KISS: the flip is metadata write + one thin editor.path re-apply. Do not reuse the full republish path.
- DRY: same `saveProjectConfigOnly` pure-local persist as pin; same `applyDaLiveOrgConfigSettings` call as republish Step 1.
- Keep UI presentational — resolution happens backend-side (no `vscode`/resolver in webview).

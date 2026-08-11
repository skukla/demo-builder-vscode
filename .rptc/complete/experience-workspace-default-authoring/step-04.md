# Step 4: URL Branch + Site-Scope `editor.path` (LOAD-BEARING)

**Purpose:** Make the resolved experience drive (a) the "Author" button URL and (b) the DA `editor.path` row. Convert `editor.path` from org-scoped to **site-scoped** — the load-bearing safety change so flipping one project never clobbers sibling sites sharing the same DA org.

**Prerequisites:** Step 3 (resolver + type).

**This is the highest-risk step. Its RED tests are the proof of per-project isolation.**

---

## Part A — `getEdsDaLiveUrl` branch (NEW unit test; none exists today)

**Anchors:** `src/types/typeGuards.ts:373-382`. KEEP `vscode` OUT of this file — take the resolved experience as a parameter.

### Tests FIRST (RED) — `tests/types/typeGuards-eds-dalive-url.test.ts` (NEW)

- [ ] UE + valid EDS project → `https://da.live/#/<org>/<site>` (unchanged current behavior).
- [ ] EW + valid EDS project → `https://da.live/canvas#/<org>/<site>/` (param-less, trailing slash = site root; no `?nx`/`?nxver`).
- [ ] Non-EDS project → `undefined`.
- [ ] Missing `daLiveOrg` or `daLiveSite` → `undefined`.
- [ ] No experience arg (back-compat default) → UE form.

### Implementation (GREEN)

- [ ] Change signature to `getEdsDaLiveUrl(project, experience: 'universal-editor' | 'experience-workspace' = 'universal-editor')`.
- [ ] Branch the return: UE → existing `https://da.live/#/${daLiveOrg}/${daLiveSite}`; EW → `https://da.live/canvas#/${daLiveOrg}/${daLiveSite}/`.
- [ ] Update the three backend call sites to resolve the experience and pass it in:
  - `src/features/dashboard/commands/showDashboard.ts:147` → `getEdsDaLiveUrl(project, resolveAuthoringExperience(<metadata>))`
  - `src/features/projects-dashboard/handlers/dashboardHandlers.ts:788` (`handleOpenDaLive`)
  - `src/features/project-creation/services/aiContextWriter.ts:144`
  - Each reads the EDS metadata `authoringExperience` from the project and calls `resolveAuthoringExperience(...)`. (All three are backend with `vscode` + project access.)

---

## Part B — Site-scope `editor.path` (LOAD-BEARING)

**Anchors:** `applyDaLiveOrgConfigSettings` (`edsHelpers.ts:667-713`); editor.path block currently `applyOrgConfig(daLiveOrg, {'editor.path': ...})` at `:704-707`. REUSE `applySiteConfig(org, site, {...})` (`daLiveContentOperations.ts:2432`) — the same idempotent per-key sheet merge already used for `aem.repositoryId`.

### Tests FIRST (RED) — UPDATE `tests/features/eds/handlers/edsHelpers-applyDaLiveOrgConfigSettings.test.ts`

The existing test `'routes editor.path to applyOrgConfig with the org only'` (`:109`) asserts the OLD org-scoped behavior — it MUST be rewritten:

- [ ] **UE experience:** editor.path routes to `applySiteConfig(daLiveOrg, daLiveSite, { 'editor.path': <row> })` (NOT `applyOrgConfig`); row key is `/<org>/<site>` (site-scoped); row value contains `https://experience.adobe.com/#/@<IMSOrgId>/aem/editor/canvas/main--<site>--<org>.ue.da.live`.
- [ ] **EW experience:** editor.path routes to `applySiteConfig` with row `/<org>/<site>=https://da.live/canvas#`.
- [ ] `aem.repositoryId` still routes to `applySiteConfig` (regression guard — unchanged).
- [ ] `applyOrgConfig` is NOT called for editor.path anymore (assert the org-scoped mock receives no editor.path write).
- [ ] Experience parameter wired through `applyDaLiveOrgConfigSettings` (new param) selects UE vs EW row.

### Implementation (GREEN)

- [ ] Add an `experience` parameter to `applyDaLiveOrgConfigSettings(daLiveContentOps, daLiveOrg, daLiveSite, logger, experience)`.
- [ ] Replace the org-scoped editor.path write (`:704-707`) with a **site-scoped** `applySiteConfig(daLiveOrg, daLiveSite, { 'editor.path': editorRow })` where:
  - The left-hand key becomes `/<org>/<site>` (per-site row), NOT the dummy `editorPathPrefix`. **Decision:** `editorPathPrefix` is no longer used to scope the row; the per-site `/<org>/<site>` key replaces it. (If `editorPathPrefix` becomes fully unused after this, remove the setting + its read at `:677` per the project's "no soft deprecation" rule — verify no other readers first via `grep -rn "editorPathPrefix" src/`.)
  - UE row value: `https://experience.adobe.com/#/@${imsOrgId}/aem/editor/canvas/main--${daLiveSite}--${daLiveOrg}.ue.da.live`.
  - EW row value: `https://da.live/canvas#`.
  - Full row string: `/${daLiveOrg}/${daLiveSite}=<value>`.
- [ ] Update the one caller `republishStorefrontContent` (`storefrontRepublishService.ts:322-323`) to resolve + pass the experience.

## Files

- **Modify:** `src/types/typeGuards.ts`, `src/features/eds/handlers/edsHelpers.ts`, `src/features/dashboard/commands/showDashboard.ts`, `src/features/projects-dashboard/handlers/dashboardHandlers.ts`, `src/features/project-creation/services/aiContextWriter.ts`, `src/features/eds/services/storefrontRepublishService.ts`
- **Create test:** `tests/types/typeGuards-eds-dalive-url.test.ts`
- **Update test:** `tests/features/eds/handlers/edsHelpers-applyDaLiveOrgConfigSettings.test.ts`

## Acceptance Criteria

- `getEdsDaLiveUrl` branches correctly; UE output byte-identical to today.
- `editor.path` is written **site-scoped** (`/<org>/<site>` key) via `applySiteConfig` for BOTH experiences.
- `applyOrgConfig` no longer carries editor.path (sibling sites in a shared DA org are isolated).
- `typeGuards.ts` remains `vscode`-free.

## Notes / Constraints

- **Load-bearing:** the site-scope change is what makes the per-project flip safe. Do not skip the "applyOrgConfig not called for editor.path" assertion.
- DRY: reuse `applySiteConfig` + `writeMergedDataConfig` (preserves permissions/library sheets) — do not write new scoping/merge code.
- If removing `editorPathPrefix`, follow "no soft deprecation": delete the setting from `package.json` and the read, don't leave a stub.

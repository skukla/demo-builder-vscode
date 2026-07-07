# ✅ SHIPPED (2026-07-07) — Republish affected projects when an EW-URL-affecting daLive setting changes

> Implemented from this approved plan (TDD). Shared `authoringExperienceFlip` service extracted from
> ConfigureCommand (behavior-identical), debounced `ewSettingChangeListener` added + registered at
> activation. 4 new files + 18 tests; full eds+dashboard suites green (2074 tests).

---

# Plan: Republish affected projects when an EW-URL-affecting daLive setting changes

**Branch:** `feature/republish-on-ew-url-setting-change` (worktree off develop)
**Approach:** Clean — extract a shared authoring-experience flip service that both Configure and the new settings listener call (full parity).

## Step 0: RPTC Re-initialization (if context is cleared)

Re-invoke `/rptc:feat` with "Plan is approved, continue to implementation" plus the worktree path
(`…/demo-builder-vscode.worktrees/feature/republish-on-ew-url-setting-change`) to restore RPTC context, then resume at Phase 3.

## Requirements (locked, from brainstorming)

- **Trigger:** `onDidChangeConfiguration` for `demoBuilder.daLive.ewCanvasBranch` and `demoBuilder.daLive.authoringExperience` ONLY.
- **Affected-project predicate (per setting):**
  - `ewCanvasBranch` → EDS projects whose resolved authoring is `experience-workspace`.
  - `authoringExperience` (default) → EDS projects with NO per-project override (only those follow the default).
- **Scope:** PROMPT to confirm ("N project(s) affected — republish now?") before any write.
- **Feedback:** NOTIFY on completion (toast per project, mirroring Configure).
- **Reuse:** full Configure flip parity via a shared service. Debounce rapid edits.

## Steps

### Step 1 — Extract the shared flip service
- **New:** `src/features/eds/services/authoringExperienceFlip.ts`
  - `applyAuthoringExperienceFlip(project, experience, { context, secrets, logger }): Promise<FlipResult>`
  - Consolidates Configure's three private side-effects, each non-fatal (mirrors current try/catch):
    1. editor.path re-apply → `applyDaLiveOrgConfigSettings(daLiveContentOps, org, site, logger, experience)`
    2. Quick Edit vendoring (EW only) → `installQuickEdit(...)` + `helixService.previewCode('/*')`
    3. config.json regen → `republishStorefrontConfig({ project, secrets, logger })`
  - Returns `{ editorPath: ok|warn, quickEdit: ok|warn|skipped, configRegen: ok|warn }` for the notify/log.
- Export from `src/features/eds/index.ts`.
- **Tests:** `tests/features/eds/services/authoringExperienceFlip.test.ts` — calls all three with the right args; each failure is swallowed and surfaced as a warn (non-fatal); Quick Edit skipped for da-live-classic.

### Step 2 — Refactor Configure to delegate
- **Modify:** `src/features/dashboard/commands/configure.ts`
  - Replace the bodies of `reapplyEditorPath` / `ensureQuickEditVendored` / `regenerateStorefrontConfig` (or their call site in the save handler) with a single `applyAuthoringExperienceFlip(...)` call. Behavior MUST stay identical.
- **Tests:** existing `configure-authoring-experience.test.ts` stays green (no behavior change).

### Step 3 — Settings-change listener + affected-project resolver
- **New:** `src/features/eds/services/ewSettingChangeListener.ts`
  - `registerEwSettingChangeListener({ context, stateManager, logger }): vscode.Disposable`
  - On `onDidChangeConfiguration`, if it affects `ewCanvasBranch` or `authoringExperience`:
    - Debounce (~300 ms) to coalesce rapid edits.
    - Enumerate `stateManager.getAllProjects()`, load full projects, filter to EDS, apply the per-setting predicate.
    - If none → return silently.
    - Prompt `showInformationMessage("N project(s) affected by this Experience Workspace setting change — republish now?", { modal: false }, "Republish", "Not now")`.
    - On confirm: for each affected project, resolve target experience (`resolveProjectAuthoringExperience`) and call `applyAuthoringExperienceFlip(...)`; collect results.
    - Notify on completion (toast: "Re-applied EW config to <project>" / summary for many).
- **Tests:** `tests/features/eds/services/ewSettingChangeListener.test.ts` — predicate per setting (respects overrides, EW-only for ewCanvasBranch); ignores unrelated settings; no-op when zero affected; prompt confirm vs cancel; notify; debounce.

### Step 4 — Register at activation
- **Modify:** `src/extension.ts` — `context.subscriptions.push(registerEwSettingChangeListener({ context, stateManager, logger }))`.
- **Tests:** light activation/registration assertion if an extension-activation test exists; else covered by Step 3.

## Risks
- Configure refactor (Step 2) touches a working save path — keep behavior identical; lean on existing configure tests.
- DA.live / CDN writes are real — gated behind the confirm prompt (no silent writes).
- Loading full projects for all EDS projects on a settings change — acceptable (settings changes are rare; debounced).

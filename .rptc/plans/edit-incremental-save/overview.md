# Edit wizard: reversible per-project draft (autosave in-progress edits)

> **Step 0 — RPTC re-initialization (ALWAYS FIRST on re-entry):** if context was cleared,
> re-invoke `/rptc:feat "Plan is approved, continue to implementation"`. This restores skills,
> Serena, and the phase tasks. Work happens in the worktree
> `…/demo-builder-vscode.worktrees/feature/edit-incremental-save` (branch
> `feature/edit-incremental-save`). Mirror this plan to
> `.rptc/plans/edit-incremental-save/overview.md` on implementation start.

## Context

When editing a project, the wizard holds every edit in in-memory React `WizardState`. Nothing
persists until the user completes the whole flow through the final ProjectCreationStep, which runs
the heavy rebuild (`executeProjectCreation`: temp install → atomic swap → `saveProject`). So if a
user removes an integration and closes the editor before finishing, the change is lost — reopening
re-seeds from the saved project config (`extractSettingsFromProject`).

**Goal (user-approved):** autosave in-progress edits to a **reversible per-project draft** so
reopening the editor restores them. The draft is UX continuity only — nothing deployed changes
until the final rebuild, so Cancel/close stay non-destructive. On reopen the draft is **restored
silently** with a small "unsaved changes restored" indicator and a **Discard** action that reverts
to the project's last-saved state. The draft is cleared when the rebuild succeeds or the user
discards. Covers **all** wizard areas (the draft is the editable slice of `WizardState`), not just
integrations.

**Cancel/close semantics:** both keep the draft ("pause, I'll come back"). The only throw-away
paths are the in-editor **Discard** action and a **successful rebuild** (which supersedes the
draft). A *failed* rebuild keeps the draft.

**Scope decision (user-approved): edit mode only.** Create and Import produce a *new* project with
no path until the final rebuild, so there is no stable key to draft against. Import is just a
seeded create (pre-fills a new project from a settings file / another project), not a separate
mode — it drafts the same way create would. Drafting create/import needs a singleton
"in-progress new project" slot plus new rules (resume-vs-discard on relaunch, draft-vs-import-seed
precedence); that is a deliberate follow-up, out of scope here.

## Approach — reversible draft in `globalState`, keyed by project path

The draft lives extension-side in `context.globalState` (Memento), keyed by the project path. The
webview autosaves it (debounced) over the message channel; the extension injects it into the
wizard's initial data on reopen; a successful rebuild or Discard clears it.

### New files

1. `src/features/project-creation/ui/wizard/editDraft.ts` — **pure** (no React):
   - `pickEditDraft(state: WizardState): EditDraft` — the editable slice that edit mode round-trips
     (mirror the field set `settingsSerializer.extractSettingsFromProject` produces + the
     integration builder's keys: `selectedAppBuilderComponents`, `appBuilderComponentSources`,
     `selectedConsoleApis`, `selectedOptionalDependencies`, `adobeProject`, `adobeWorkspace`,
     component selections, storefront/repo fields, block-library selections, …). Excludes transient
     UI/auth-checking/loading flags — those re-derive on mount.
   - `applyEditDraft(base: WizardState, draft: EditDraft): WizardState` — merge draft over the
     config-seeded base (draft wins; absent draft → base unchanged).
2. `src/features/project-creation/services/editDraftStore.ts` — thin Memento wrapper:
   `getEditDraft(globalState, projectPath)`, `saveEditDraft(globalState, projectPath, draft)`,
   `clearEditDraft(globalState, projectPath)`. Key: `projectCreation.editDraft:<projectPath>`.
   Mirrors the existing `context.context.globalState` access in
   `eds/handlers/edsDaLiveOrgHandlers.ts`.
3. `src/features/project-creation/handlers/editDraftHandlers.ts` —
   `handleSaveEditDraft` / `handleClearEditDraft` (read `projectPath` + `draft` from the message,
   call the store; no-op + `{ success:false }` when `projectPath` is missing).
4. `src/features/project-creation/ui/wizard/hooks/useEditDraftAutosave.ts` — edit-mode-only hook:
   watches `pickEditDraft(state)` (compared by serialized value), debounced by a named constant
   `EDIT_DRAFT_DEBOUNCE_MS` (no magic literal — SOP), posts `save-edit-draft`; flushes any pending
   save on unmount so closing the tab persists the latest. No-ops in create mode.

### Modified files

5. `src/features/project-creation/handlers/ProjectCreationHandlerRegistry.ts` — register
   `save-edit-draft` and `clear-edit-draft` (+ the count-pinned registry test).
6. `src/features/project-creation/commands/createProject.ts` — in `getInitialData`, when in edit
   mode, read the draft via `editDraftStore.getEditDraft` and attach it to the `editProject` config
   (`editProject.editDraft`).
7. `src/features/project-creation/ui/wizard/hooks/useWizardState.ts` — thread `editProject.editDraft`
   through `getInitialWizardState` → `buildEditModeState`, applying `applyEditDraft` over the seeded
   state; expose `hasRestoredDraft` and `discardEditDraft()` (posts `clear-edit-draft`, then resets
   `setState` to the draft-less `buildEditModeState` baseline).
8. `src/features/project-creation/ui/wizard/WizardContainer.tsx` — mount `useEditDraftAutosave`
   (edit mode); render the "unsaved changes restored" indicator + **Discard** button (wired to
   `discardEditDraft`) in the wizard header/timeline area when `hasRestoredDraft`.
9. `src/features/project-creation/handlers/createHandler.ts` — on a **successful** edit rebuild
   (`editProjectPath` present), clear the draft via `editDraftStore.clearEditDraft`. Leave the draft
   on failure.
10. Types — `src/types/webview.ts`: `EditDraft` type, `EditProjectConfig.editDraft?`,
    `initialData.editDraft?`, and the `save-edit-draft` / `clear-edit-draft` message payloads.

## Reuse (don't re-derive)
- `settingsSerializer.extractSettingsFromProject` (`projects-dashboard/services`) — the canonical
  edit round-trip field set that `pickEditDraft` mirrors.
- `buildEditModeState` (`useWizardState.ts:227`) — the draft-less baseline that Discard resets to.
- `TransientStateManager` / `context.context.globalState` Memento — the persistence primitive.
- `defineHandlers` + `dispatchHandler`, `webviewLogger`, the existing WebviewClient message channel.

## Test strategy (TDD, tests first each step)
- `editDraft.test.ts` — `pickEditDraft` returns only editable fields (drops transient flags);
  `applyEditDraft` merges draft over base (draft wins; empty draft → base unchanged).
- `editDraftStore.test.ts` — save/get/clear round-trip against a mock Memento; keying by path;
  clear removes only that project's key.
- `editDraftHandlers.test.ts` — save calls the store; clear removes; missing `projectPath` → no-op.
- `ProjectCreationHandlerRegistry.test.ts` — the two new keys present (count pin updated).
- `useWizardState` test — edit mode + `editDraft` → initial state reflects the merged draft;
  `discardEditDraft()` resets to the config baseline and posts `clear-edit-draft`.
- `useEditDraftAutosave.test.ts` — debounced `save-edit-draft` post on change in edit mode; no post
  in create mode; flush-on-unmount.
- `createHandler` test — successful edit rebuild clears the draft; failed rebuild keeps it.

## Risks / non-goals
- **Staleness:** if the saved project changes underneath an open draft (e.g., a dashboard deploy),
  the silently-restored draft may reflect the older config. Accepted per the silent-restore
  decision; NOT hash-guarding now (YAGNI). Note as a follow-up.
- **Not** persisting create-mode drafts (no project path to key on) — edit mode only.
- **Not** changing what a rebuild does or the deployed-artifact lifecycle — the draft only defers
  where in-progress selections live until the existing rebuild applies them.

## Verification (live, Extension Dev Host)
1. `npm run compile` (or `watch:all` from the worktree) → Cmd+R.
2. Edit a project → Integrations → remove an integration → **close the editor** without finishing.
3. Reopen the editor → the integration is still removed, with an "unsaved changes restored"
   indicator. Click **Discard** → reverts to the saved state (integration back), indicator gone.
4. Remove it again → finish the full rebuild → reopen → shows the saved (removed) state with **no**
   indicator (draft cleared on success).
5. Repeat the removal, trigger a rebuild **failure** → reopen → the draft still restores (not lost).
6. Jest: the suites above pass; `tsc --noEmit` 0; eslint 0.

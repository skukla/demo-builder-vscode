# Inline Project Rename — dashboard title + project card, dialogs deleted

> **Step 0 — RPTC re-initialization (ALWAYS FIRST on re-entry):** if context was cleared,
> re-invoke `/rptc:feat "Plan is approved, continue to implementation"`. On implementation
> start, mirror this plan to `.rptc/plans/inline-project-rename/overview.md`.

## Context

Renaming a project today is buried (kebab → More… → Rename → modal dialog; dashboard → More →
Rename → same dialog), and the visible alternative — Edit — walks the whole wizard, rebuilds the
project, and produces a display-only rename that diverges from the folder. The approved fix:
**rename in place where the name is displayed** — the project card and the dashboard title — and
**delete the old rename UX outright** (kebab item, dashboard More item, both dialogs). One rename
affordance everywhere, zero dialogs, `renameProjectCore` unchanged.

User-approved scope: **Both surfaces, full cleanup.**
Branch: `feature/integrations-flow-redesign` (user-approved; depends on this branch's uncommitted
ProjectActionsMenu changes). Note: the three RPTC architect agents failed on an API credit limit —
the architecture below was produced in main context; implementation runs main-context TDD
(Route B "direct") unless subagent credits recover.

## Verified facts the plan relies on

- Backend reused verbatim: message `renameProject` `{projectPath, newName}` →
  `handleRenameProject` (`projects-dashboard/handlers/dashboardHandlers.ts:565`) →
  `renameProjectCore` (`services/projectRenameService.ts`): trims, rejects empty, **rejects while
  running**, `validateProjectNameSecurity`, folder-collision check, disk rename, path updates,
  recent-projects, save. Registered in BOTH webviews' handler maps.
- Card name: `ProjectCard.tsx:119` `<Text UNSAFE_className="project-card-spectrum-name">` inside a
  `role="button"` click-to-open tile with its own `onKeyDown` (Enter/Space opens) — the editor must
  stop click AND keydown propagation (kebab precedent: wrapping stopPropagation div).
- Dashboard title: `ProjectDashboardScreen.tsx:271` `<PageHeader title={displayName} …>`;
  `PageHeaderProps.title: string` (widen to `React.ReactNode` — backward compatible).
- Existing dialog flows being replaced: projects-list `ui/index.tsx` ~338-370
  (`RenameProjectDialog` + refresh via `getProjects`); dashboard `ProjectDashboardScreen.tsx`
  ~345-352 (`DashboardRenameDialog`; backend re-sends init so the title refreshes).
- Cross-feature rule: the shared field must live in `@/core/ui/components` (two consumers —
  precedent: `ApiAccessPicker`). Home: `core/ui/components/forms/InlineRenameField.tsx`.
- No inline styles (`tests/sop/inline-styles.test.ts`); CSS classes in `custom-spectrum.css`.

## Component design — `InlineRenameField` (core/ui/components/forms/)

```ts
export interface InlineRenameFieldProps {
    /** The committed name (display mode). */
    name: string;
    /** Commit: resolve null on success, or an error message to show inline. */
    onRename: (newName: string) => Promise<string | null>;
    /** Hide the affordance entirely (demo running). */
    disabled?: boolean;
    /** Class applied to the display-mode text (caller owns typography). */
    textClassName?: string;
    /** Accessible label for the pencil; default `Rename ${name}`. */
    renameLabel?: string;
}
```

Behavior:
- Display mode: `<span className={cn('inline-rename-text', textClassName)}>{name}</span>` + quiet
  pencil `ActionButton` (`.inline-rename-pencil`, opacity 0 → 1 on wrapper `:hover`/`:focus-within`).
  `disabled` renders the text only (no pencil).
- Edit mode (pencil click): plain `<input>` (`.inline-rename-input`, `font: inherit` so the card
  vs title sizing follows context, `box-sizing: border-box`), autofocus + select-all, prefilled.
- Keys: Enter commits · Escape cancels · blur commits. Trimmed-empty or unchanged → silently exit
  (no request). While the request is pending: input disabled (busy). Error string → stay in edit
  mode, show `.inline-rename-error` under/beside the input. Success (null) → exit edit mode
  (the parent's refreshed state supplies the new name).
- The wrapper stops `click` and `keydown` propagation (card tile must not open / hijack Enter).

CSS additions (`custom-spectrum.css`): `.inline-rename` (inline-flex, gap 6, min-width 0),
`.inline-rename-pencil`, `.inline-rename-input`, `.inline-rename-error` (12px red), hover reveal.

## Surface integrations

**Project card** (`projects-dashboard/ui/components/ProjectCard.tsx` + `ui/index.tsx`):
- Replace the name `<Text>` with `<InlineRenameField name={project.name}
  textClassName="project-card-spectrum-name" disabled={isRunning} onRename={…} />`.
- `ProjectActions` (in `ProjectActionsMenu.tsx`): REMOVE `onRename`; ADD
  `onRenameSubmit?: (project: Project, newName: string) => Promise<string | null>` (consumed by
  the card, not the menu). `ui/index.tsx` implements it: `request('renameProject',
  {projectPath: project.path, newName})` → success: refresh `getProjects`, return null; failure:
  return the error string. Delete the dialog state/handlers + `RenameProjectDialog` usage.

**Dashboard title** (`dashboard/ui/ProjectDashboardScreen.tsx` + `core/ui/components/layout/PageHeader.tsx`):
- Widen `PageHeaderProps.title` to `React.ReactNode` (string callers unaffected).
- `title={<InlineRenameField name={displayName} disabled={isDemoRunning} onRename={…} />}` with a
  title-sized `textClassName`; `onRename` posts `renameProject` for `project.path` and returns
  null/error (backend re-sends init → title refreshes, matching the old confirmRename flow).
- Delete `showRenameDialog`/`openRenameDialog`/`closeRenameDialog`/`confirmRename` dialog state and
  the `DashboardRenameDialog` block.

## Menu language (user-added scope)

Rename two action labels EVERYWHERE they appear (both surfaces, for consistency):
- **"Author in DA.live Classic / Experience Workspace" → "Author Content"** — kebab
  (`ProjectActionsMenu.tsx:247`) and the dashboard ActionGrid tile (`ActionGrid.tsx:282`, incl.
  its `aria-label` at :278). The label becomes STATIC, so the kebab's now-unused
  `EXPERIENCE_LABEL` map, `DEFAULT_AUTHORING_EXPERIENCE`, and `experience` resolution are
  deleted (dead code); ActionGrid drops whichever of `EXPERIENCE_LABEL`/`EXPERIENCE_FULL_NAME`
  become orphaned. Update the stale comments referencing the dynamic label
  (`dashboardHandlers.ts:1144`, `types/base.ts:129`, both components' docblocks).
- **"Open Admin Panel" → "Manage Commerce"** — kebab (`ProjectActionsMenu.tsx:264`) and the
  ActionGrid tile text "Admin Panel" (`ActionGrid.tsx:296`). Keys/handlers unchanged
  (`openAdminPanel` message stays).

Test sync: `ProjectActionsMenu.test.tsx` "Authoring experience label" describe becomes a static
"Author Content regardless of experience" pin (non-EDS absence pin stays); "Open Admin Panel
action" describe relabels to Manage Commerce; `ActionGrid.test.tsx` label pins update.

## Deletions (src + tests, outright)

- `projects-dashboard/ui/components/RenameProjectDialog.tsx` (+ its test file if present)
- `dashboard/ui/components/DashboardRenameDialog.tsx` + `tests/features/dashboard/ui/components/DashboardRenameDialog.test.tsx`
- ProjectActionsMenu: the More… `rename` item, `onRename` from `ProjectActions`, actionMap entry,
  `Rename` icon import, docblock line (Rename no longer exists in any menu)
- ActionGrid (`dashboard/ui/components/ActionGrid.tsx`): `'rename'` overflow key (~53), handler
  case (~187), `<Item key="rename">` (~359), `handleRename` prop; `ProjectDashboardScreen` stops
  passing `handleRename`
- Barrel exports for the deleted dialogs (both features' components index)

## Build sequence (TDD, tests FIRST each step)

1. **InlineRenameField + CSS** — NEW `tests/core/ui/components/forms/InlineRenameField.test.tsx`:
   display text + pencil; `disabled` hides pencil; pencil → edit (prefilled, focused); Enter
   commits trimmed name via onRename; Esc cancels (no call); blur commits; empty/unchanged → no
   call, exits; pending disables input; error → stays editing + message; success → display mode;
   click/keydown propagation stopped (spy on a wrapping onClick/onKeyDown).
2. **Card surface + kebab language** — sync `ProjectCard.test.tsx` (pencil present, hidden while
   running, rename calls `onRenameSubmit`, card `onSelect` NOT fired during rename interaction);
   sync `ProjectActionsMenu.test.tsx` (Rename pins → "no Rename item anywhere, incl. submenu";
   "Author Content" static-label pins; "Manage Commerce" pins); `ui/index` wiring (post + refresh
   + error passthrough — extend `ProjectsDashboard.test.tsx` level if the wiring is testable
   there, else pin via ProjectCard-level integration). Kebab label changes + dead experience-label
   machinery removal ride in this step (same files).
3. **Dashboard surface + tile language** — `PageHeader` ReactNode-title pin (existing
   PageHeader/layout tests stay green); sync `ProjectDashboardScreen-actions.test.tsx` +
   `-rendering.test.tsx` (title renames inline → posts `renameProject`; dialog pins removed); sync
   `ActionGrid.test.tsx` (no rename overflow item; "Author Content" + "Manage Commerce" tile
   labels).
4. **Deletions sweep + gate** — delete the two dialogs (+ tests, barrels); scoped jest
   (projects-dashboard, dashboard, core/ui) + `tsc --noEmit` + `npm run compile`; ts-prune-style
   check that nothing still imports the deleted files.

## Risks

- Card keyboard/click propagation (tile opens on Enter/Space) → editor stops propagation; pinned
  by a test in step 1 and a card-level test in step 2.
- PageHeader `title` widening → string still assignable; pin with existing consumers' suites.
- Running-state race (demo started mid-edit) → backend still rejects; error surfaces inline.
- Input width in the card's `minWidth: 0` flex row → `.inline-rename` min-width 0 + input
  `width: 100%` within the name flex slot.

## Verification (live, Extension Dev Host)

1. `npm run compile` → Cmd+R. Projects list: hover a card → pencil appears beside the name; click →
   input; Enter commits (card + list refresh with new name; folder renamed on disk); Esc cancels;
   duplicate name shows the collision error inline; running project shows no pencil.
2. Card click still opens the project; typing in the editor never opens it.
3. Project dashboard: hover title → pencil; rename → title refreshes (init re-sent); More menu has
   no Rename; kebab (list) has no Rename under More….
3b. Language: kebab shows "Author Content" (EDS) and "Manage Commerce"; the dashboard ActionGrid
   tiles read "Author Content" and "Manage Commerce"; both still open the right authoring surface
   per the project's resolved experience (behavior unchanged, label static).
4. Renamed project: Start Demo works (componentInstances paths updated); recent projects show the
   new name.

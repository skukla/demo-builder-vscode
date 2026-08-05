# Move the Logs toggle into the sidebar as a Utility

## Provenance

Researched 2026-06-12 via `/rptc:research`. Two design forks were decided by the
owner: **keep the toggle behavior** (show/hide, not a one-shot open) and
**consolidate fully** (remove the Logs button from the wizard footers too, not
just the dashboard). Implementation-ready; pick up as a `/rptc:feat`.

Research traced every "Logs" affordance via two parallel research agents
(file:line refs below are from that pass).

## Goal / Scope

Today the "Logs" affordance lives in **three button locations**, all routing
through a single chokepoint. Move it to **one** place — a new "Logs" utility in
the sidebar UtilityBar (alongside Tools / Help / Settings) — and remove the
three buttons.

**Single chokepoint (keep — the sidebar utility reuses it):**
- `src/features/lifecycle/services/lifecycleService.ts` `toggleLogsPanel()` —
  if `sessionUIState.isLogsViewShown` → `workbench.action.closePanel` + flag
  false; else `demoBuilder.showLogs` + flag true.
- `src/core/state/sessionUIState.ts` `isLogsViewShown` (session-only flag).
- Command `demoBuilder.showLogs` (registered `src/extension.ts:223-225` →
  `debugLogger.show(false)`; opens the "Demo Builder: User Logs" channel).

**ADD — sidebar Logs utility** (follows the existing utility pattern exactly):
- `src/features/sidebar/ui/views/UtilityBar.tsx` — new `onOpenLogs?` prop + a 4th
  `ActionButton` tile (`ViewList` icon, label "Logs", `aria-label="View Logs"`),
  gated `{onOpenLogs && (...)}` like the others.
- `src/features/sidebar/ui/Sidebar.tsx` — thread `onOpenLogs` through.
- `src/features/sidebar/ui/index.tsx` — `const handleOpenLogs = useCallback(() =>
  sendMessage('openLogs'), [])`; wire into `<Sidebar onOpenLogs=... />`.
- `src/features/sidebar/providers/sidebarProvider.ts` — add `case 'openLogs':
  await this.handleOpenLogs(); break;` to the `handleMessage` switch, and a
  `handleOpenLogs()` that calls `toggleLogsPanel()` (KEEP toggle behavior).
- `src/features/sidebar/types.ts` — append `'openLogs'` to `SidebarMessageType`
  (advisory — the provider switch matches raw string literals, so the switch
  case is what actually routes).
- Always show it (no context gating): the User Logs channel is global
  (auth/updates/mesh/lifecycle), meaningful even before a project loads. Matches
  the sidebar's "same layout in every context" design.

**REMOVE — the three buttons + now-orphaned per-surface handlers:**
- Dashboard: `ActionGrid.tsx` "Logs" `ActionButton` (Build zone) + the
  `isLogsHoverSuppressed` plumbing for it; `useDashboardActions.ts`
  `handleViewLogs`; `dashboardHandlers.ts` `handleViewLogs` + `'viewLogs'` map
  entry.
- Generic wizard footer: `WizardContainer.tsx` footer "Logs" `Button`
  (`PageFooter centerContent`, gated by `shouldShowWizardFooter`) +
  `useWizardNavigation.ts` `handleShowLogs` (posts `'show-logs'`). If the Logs
  button is the footer's only content, drop the footer.
- ProjectCreationStep: `ProjectCreationStep.tsx` "Logs" `Button` in all three
  footer states (in-progress / success / error) + `onShowLogs` prop +
  `handleShowLogs`; the `'show-logs'` route in
  `ProjectCreationHandlerRegistry.ts` + `lifecycleHandlers.ts handleShowLogs`
  (once no caller remains).
- **Dead code:** `dashboardHandlers.ts handleViewDebugLogs` + `'viewDebugLogs'`
  map entry — registered but never called from any frontend. Remove.

**KEEP intact (legitimately use `demoBuilder.showLogs`, not toggle buttons):**
- Status-bar error indicator (`errorLogger.ts` — only shows on errors/warnings).
- AI `open_view` tool (`viewTools.ts` `logs: 'demoBuilder.showLogs'`).
- Error-notification "View Logs" / "Open Debug Logs" CTAs (`deployMesh.ts`,
  `cleanupDaLiveSites.ts`).

## Execution plan

1. Add the sidebar Logs utility end-to-end (UtilityBar → Sidebar → index →
   provider switch + `handleOpenLogs` → `toggleLogsPanel()`), with the
   UtilityBar test extended to assert the 4th icon + callback.
2. Remove the dashboard ActionGrid Logs button + `handleViewLogs` +
   `'viewLogs'`; sync dashboard tests (handler-map count, useDashboardActions,
   ActionGrid render/menu tests).
3. Remove the two wizard Logs buttons (`WizardContainer`, `ProjectCreationStep`)
   + their `show-logs` wiring; sync wizard tests.
4. Remove dead `handleViewDebugLogs` / `'viewDebugLogs'`.
5. Decide the `resetToggleStates` question (see Constraints) and adjust.
6. Full suite + typecheck + lint green.

## Constraints

- **Keep toggle semantics.** The sidebar Logs utility toggles (show/hide) by
  reusing `toggleLogsPanel()` — do NOT convert to a plain one-shot open, and do
  NOT delete `toggleLogsPanel` / `isLogsViewShown`.
- **`resetToggleStates` desync (deliberate call needed).**
  `dashboardHandlers.resetToggleStates()` resets `isLogsViewShown` on
  dashboard navigate-away. With the toggle now living in the always-present
  sidebar (not dashboard-scoped), that reset can desync the flag from the
  panel's real visibility (flag "closed" while the panel is still open → next
  sidebar click re-shows instead of hides). Either drop the reset or have the
  toggle read the panel's actual visibility. Decide explicitly; cover with a test.
- **Don't carry over the phantom "smart toggle".** The "remembers last channel
  (Logs vs Debug)" behavior in `dashboard/README.md` was never implemented; only
  the User Logs channel is ever opened. Build only what exists.
- **Sidebar-during-wizard is verified to work.** Revealing the sidebar with the
  wizard webview open does NOT disrupt the wizard (`SidebarProvider`'s
  `onDidChangeVisibility` → `openMainDashboard()` is guarded by
  `!hasOpenWebview()`, and the wizard counts as an open webview).
- **Test-code sync** across all touched surfaces (research listed coverage in:
  `useDashboardActions.test.ts`, `dashboardHandlers-toggles.test.ts`,
  `dashboardHandlersMap.test.ts`, `lifecycleHandlers-showLogs.test.ts`,
  `lifecycleService.test.ts`, `sessionUIState.test.ts`,
  `WizardContainer-layout.test.tsx`, `sidebar/ui/views/UtilityBar.test.tsx`).
- **No package.json change** — `demoBuilder.showLogs` is already registered.

## Kickoff prompt

> Implement "move the Logs toggle into the sidebar as a Utility" per
> `.rptc/backlog/2026-06-12-logs-toggle-to-sidebar.md`. Add a 4th UtilityBar
> icon ("Logs", ViewList) wired UtilityBar → Sidebar → index.tsx
> `sendMessage('openLogs')` → sidebarProvider switch `case 'openLogs'` →
> `handleOpenLogs()` calling the existing `toggleLogsPanel()` (KEEP toggle
> behavior). Remove the three existing Logs buttons (dashboard ActionGrid, the
> generic wizard footer, and ProjectCreationStep's three footer states) plus
> their orphaned handlers, and delete the dead `viewDebugLogs` handler. Keep the
> status-bar / AI `open_view` / error-CTA uses of `demoBuilder.showLogs`. Make a
> deliberate call on the `resetToggleStates` desync (drop it or read real panel
> visibility) and test it. TDD; sync all listed tests; full suite + typecheck +
> lint green.

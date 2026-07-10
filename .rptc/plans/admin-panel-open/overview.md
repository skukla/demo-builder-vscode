# Open Admin Panel from the Project Dashboard

## Context

Demo engineers need to jump from a project to its Commerce Admin Panel. The admin URL cannot be derived from any stored config (PaaS admin paths are custom; ACCS admin lives elsewhere), so the user supplies it. Decisions already made with the user:

- Ship on **develop** (no worktree).
- URL entry via a **Configure screen field** — new optional env var `ADOBE_COMMERCE_ADMIN_URL` on both commerce backends (rides the existing components.json → componentConfigs → .env mechanism; also editable by the AI via `update_project_config`).
- The action is **always visible**; with no URL set it routes to setup (notification + "Open Configure" button).
- Surfaces: **dashboard tile** (ActionGrid, Primary zone) + **project-card kebab** (`ProjectActionsMenu` 'use' group). Not the dashboard More menu (redundant with the tile).

Key pattern reuse: click → post message → handler resolves URL fresh from project state → `validateURL` → `vscode.env.openExternal` (mirrors `handleOpenDaLive` / projects-dashboard `handleOpenLiveSite`). No URL is passed from the webview and no initial-data plumbing is added, so a Configure edit takes effect without a webview reload.

> RPTC re-entry note: if context is cleared after approval, re-invoke `/rptc:feat "Plan is approved, continue to implementation"`; this plan file is the source of truth. On implementation start, mirror this plan to `.rptc/plans/admin-panel-open/overview.md` (project convention).

## Step 1 — Config + resolver (foundation)

1. `src/features/components/config/components.json`
   - Add `"ADOBE_COMMERCE_ADMIN_URL"` to `backends.adobe-commerce-paas.configuration.optionalEnvVars` and `backends.adobe-commerce-accs.configuration.optionalEnvVars` (both currently `[]`).
   - Add to the top-level `"envVars"` section: `{ label: "Admin Panel URL", type: "url", required: false, placeholder: "https://your-instance.adobedemo.com/admin", description: "Link to this project's Commerce Admin Panel (opened from the dashboard)", group: "adobe-commerce" }`.
   - **Trap**: group MUST be `adobe-commerce` (a `CONNECTION_GROUPS` member) and the key must NOT be added to `CONNECTION_FIELDS` (`storeFieldHelpers.ts`) — otherwise the field leaks into the wizard's Catalog tab. `required: false` keeps wizard/Configure completion gating untouched (verified: only required fields drive validity).
   - Optional polish: append the key to the `adobe-commerce` `fieldOrder` in `src/features/dashboard/ui/configure/serviceGroupTransforms.ts` (~line 76) so it sorts deterministically.
2. `src/features/components/config/envVarKeys.ts` — add `export const ADMIN_PANEL_URL = 'ADOBE_COMMERCE_ADMIN_URL';` (this file is the declared single source of truth for env keys).
3. `src/types/typeGuards.ts` — `export function getAdminPanelUrl(project): string | undefined`, next to `getEdsLiveUrl` (line 318), delegating to the existing `lookupComponentConfigValue(project?.componentConfigs ?? {}, ADMIN_PANEL_URL)` from `src/features/components/services/envVarHelpers.ts:36` (pure, browser-safe; `@/features` import from `src/types` is precedented in `types/handlers.ts`).

Tests: `tests/types/typeGuards-project-accessors.test.ts` (template: getEdsLiveUrl suite at line 248) — value present under backend id, present under another component id, absent, empty string.

## Step 2 — Dashboard tile (webview → handler)

1. `src/features/dashboard/ui/components/ActionGrid.tsx` — new always-visible tile in the Primary zone after the Author slot: icon `UserAdmin` (verified in @spectrum-icons/workflow), label "Admin Panel", `dashboard-action-button dashboard-action-button--hero` classes (no inline styles — SOP). New required prop `handleOpenAdminPanel: () => void`.
2. `src/features/dashboard/ui/hooks/useDashboardActions.ts` — `handleOpenAdminPanel` posts `openAdminPanel` with no payload (like `startDemo`).
3. `src/features/dashboard/ui/ProjectDashboardScreen.tsx` — pass-through.
4. `src/features/dashboard/handlers/dashboardHandlers.ts` — `handleOpenAdminPanel`: `context.stateManager.getCurrentProject()` → `getAdminPanelUrl`;
   - URL present → `validateURL` + `vscode.env.openExternal` (mirror `handleOpenDaLive`, line 290; no incognito);
   - URL missing → fire-and-forget `vscode.window.showInformationMessage('No Admin Panel URL is set for this project.', 'Open Configure').then(...)` executing `demoBuilder.configureProject` (do NOT await the toast — matches lines 623/941); return `{ success: true }` for the routed case, `ErrorCode.CONFIG_INVALID` error shape for invalid URL (mirror handleOpenDaLive).
   - Register `openAdminPanel` in the handler map (~line 883).

Tests: `tests/features/dashboard/ui/components/ActionGrid.test.tsx` (add `handleOpenAdminPanel` to defaultProps — required prop, or typecheck fails; tile renders + onPress), `tests/features/dashboard/ui/hooks/useDashboardActions.test.ts`, `tests/features/dashboard/handlers/dashboardHandlers-actions.test.ts` (opens valid URL / notifies + configure route when missing / rejects invalid URL), and **update the count pin** in `tests/features/dashboard/handlers/dashboardHandlersMap.test.ts:133` (31 → 32, fix stale title/comment, add `hasHandler` assertion).

## Step 3 — Project-card kebab (projects home)

1. `src/features/projects-dashboard/ui/components/ProjectActionsMenu.tsx` — `onOpenAdminPanel` in `ProjectActions`; item key `openAdminPanel`, label "Open Admin Panel" in the `use` group; `ICON_MAP` entry (`UserAdmin`, size "S"); add to `actionMap` and **both useMemo dependency arrays** (lines ~185, ~261).
2. `src/features/projects-dashboard/ui/index.tsx` — `handleOpenAdminPanel(project)` posts `openAdminPanel` with `{ projectPath }` (mirror line 244); add to the `projectActions` memo + deps.
3. `src/features/projects-dashboard/handlers/dashboardHandlers.ts` — `handleOpenAdminPanel` mirroring `handleOpenLiveSite` (line 646): `loadProjectFromPath` → `getAdminPanelUrl` → validate + `openExternal`; missing URL → notification whose "Open Configure" action first does `saveProject(project)` (sets the current-project pointer — required because `demoBuilder.configureProject` resolves from that pointer; mirrors `handleOpenAiForProject`, line 615) then executes the command.
4. `src/features/projects-dashboard/handlers/projectsListHandlers.ts` — register; **update count pin** in `tests/features/projects-dashboard/handlers/projectsListHandlers.test.ts:114` (22 → 23).

Tests: `tests/features/projects-dashboard/ui/components/ProjectActionsMenu.test.tsx` (item renders in 'use' group, fires callback; Delete-last assertion unaffected), `tests/features/projects-dashboard/handlers/dashboardHandlers.test.ts` (three behaviors as in Step 2). Icon mocking: `jest.config.js` maps all workflow icons to a shared default-export mock — no mock changes needed.

## Explicitly out of scope

- No wizard UI changes (the field intentionally stays out of the v6 Commerce connect flow).
- No dashboard More-menu entry; no initial-data (`showDashboard.getInitialData`) changes.
- No changes to `CommerceConfig` / project manifest schema — storage is the env-var mechanism only.

## Verification

1. Full gate before push: scoped jest per step during TDD, then whole-repo `npm run lint` + `npx tsc --noEmit` + full `npx jest --no-coverage` (redirect output to a file, never pipe).
2. Live (Extension Dev Host, `npm run compile` or watch:all first):
   - Dashboard of a project with no admin URL → tile visible → click → notification → "Open Configure" opens Configure; add a URL under Adobe Commerce → Save → click tile again (no reload) → browser opens the URL.
   - Projects home → card kebab → "Open Admin Panel" behaves the same (missing-URL path sets the current project and opens its Configure).
   - ACCS project: field appears in Configure (separate "Adobe Commerce" group heading is acceptable), value persists to `.demo-builder.json`, tile works.

# Research: Project-affordance → MCP-tool coverage audit

**Date**: 2026-07-11 · **Mode**: codebase audit · **Status**: complete
**Prompted by**: the `rename_project` gap — an agent asked to rename a project had no
sanctioned path (only shell `mv`, which strands the extension's baked paths). Question:
which OTHER UI affordances have the same gap, and which deserve tools vs skills vs nothing?

## Method

Enumerated every user-facing project affordance from the three surfaces and crossed it
against the MCP tool catalog (`docs/systems/mcp-server.md` §9, post-`rename_project`):

- Projects-list kebab/inline: `projectsListHandlers` (23 keys) + `ProjectActions` + inline rename
- Project dashboard: `dashboardHandlers` map (`dashboardHandlers.ts:939`) + ActionGrid/AppBuilderCard
- Headless-safety probes on the gap candidates (the descriptor bar from
  `.claude/skills/mcp-tool-authoring`: no panel/sendMessage/modal dependence)

## The tiering principle (validated by the rename_project add)

1. **Tool description** = the affordance layer; single-step actions need nothing more.
2. **AGENTS.md section** = short cross-tool loops (e.g. the Console-API subscribe loop),
   rendered conditionally.
3. **Generated skill** = multi-step procedures with traps only.
Blanket "a skill per affordance" is the wrong shape — it duplicates tool descriptions.

## Coverage matrix

### Covered (tool exists — no action)

| Affordance | Tool |
|---|---|
| Start/Stop demo | `start_demo` / `stop_demo` |
| Create / delete / reset / rename project | `create_project` / `delete_project` (confirm) / `reset_eds_project` / `rename_project` (new 2026-07-11) |
| Republish content / full publish | `republish` / `sync_content` |
| Sync storefront (git) | `sync_storefront` |
| Manage APIs | `list_console_apis` + `add_console_apis` |
| Mesh status / delete | `check_mesh` / `delete_mesh` |
| Updates | `apply_updates` |
| Auth / org switch | `get_auth_status`, `sign_in`, `select_org`, … |
| Open Configure / views | `open_view` |
| Config reads/writes | `get_project`, `get_component_config`, `update_project_config` |
| AI files / prompts | `regenerate_ai_files`, `save_ai_prompt`, `delete_ai_prompt`, `verify_ai_setup` |
| Block work | `list_blocks`, `get_block_source`, `promote_block_to_library` |

### GAPS — tool-worthy

| Affordance | Today | Shape of the tool | Effort / caveat |
|---|---|---|---|
| **Deploy mesh** | `handleDeployMesh` → `executeCommand('demoBuilder.deployMesh')` — fire-and-forget shim, returns `{success:true}` before anything runs; command drives progress UI | `deploy_mesh` action returning the real result. Needs a HEADLESS handler over the service layer (`withOrgContext(deployMeshComponent)` + the DeployMeshCommand guard order: lock → auth → org-mismatch), NOT the command shim. Mirror the app-builder D1 runner pattern. | Medium — new headless handler; the verbs check/delete already exist, deploy is the asymmetry agents will hit ("redeploy my mesh"). |
| **Export project settings** | `exportProjectSettings` → `vscode.window.showSaveDialog` — NOT headless | `export_project_settings` READ returning the serialized settings JSON (`extractSettingsFromProject` is pure); let the agent write the file itself. Avoids the dialog entirely. | Small. |
| **Get project URLs** | `openBrowser`/`openLiveSite`/`openDaLive`/`openAdminPanel`/`openDevConsole` all *open a browser* — agent-useless side effect, but each computes a valuable URL (live site, DA.live canvas, Commerce admin via `getAdminPanelUrl`/`deriveAccsAdminUrl`, validated Dev Console deep link) | One `get_project_urls` READ returning `{ storefront?, liveSite?, daLive?, commerceAdmin?, devConsole? }`. Extraction-only; the URL logic already exists and is validated. No writes hiding in the read (admin URL must NOT trigger the Configure prompt path — return null instead). | Small–medium; highest leverage (5 affordances in one read; agents constantly asked "what's the URL"). |
| **App Builder deploy/redeploy/remove** | `deployAppBuilderComponent`/`redeploy…`/`remove…` handlers exist in the dashboard map (D1 runner with guard chain) | Candidate descriptor rows IF the handlers prove headless-safe (they were built on `runGuards`; verify no panel progress dependence). Remove should be `confirm: true` (remote undeploy). | Verify-then-small. The `extend-app-builder-app` generated skill would gain a "deploy via tool" step — `ai-context-authoring` territory + AI_CONTEXT_VERSION bump. |
| **Refresh block library** | `executeCommand('demoBuilder.refreshBlockLibrary')` shim | Same shim caveat as deploy mesh: needs a service-layer headless handler to return a real result. EDS-only guard already in the handler. | Medium; lower priority than mesh (the block-registration skills partly cover the workflow). |

### Skip (deliberate — no tool, no skill)

- **Pin/Unpin, view-mode override, Copy Path** — UI organization; agents get paths from `get_project`.
- **Edit project** — opens the interactive wizard; agents use targeted tools instead.
- **Open AI / Help / Settings** — meaningless or UI-only for an agent.
- **Import/copy-from settings** — dialog-driven; headless creation is `create_project`
  (a `settingsJson` input variant on create_project is a possible later enhancement).
- **reAuthenticate / switchOrg / navigateBack / requestStatus / configure** — covered by
  auth tools, `open_view`, or panel-only by nature.

### Skill-worthiness check

No NEW generated skills warranted by this audit. Every gap above is a single tool call
once it exists; the only skill touch is extending `extend-app-builder-app` if the deploy
descriptor rows land. This confirms the tiering principle — the gaps are tier-1 (tools),
not tier-3 (skills).

## Recommendations (priority order)

1. `get_project_urls` read — smallest effort, broadest payoff, pure extraction.
2. `export_project_settings` read — small, unlocks agent-driven backup/transfer.
3. `deploy_mesh` action — closes the check/delete/deploy asymmetry; medium (headless handler).
4. App Builder deploy/redeploy/remove descriptor rows — after a headless-safety verification pass.
5. `refresh_block_library` — last; needs the same service-layer lift as deploy_mesh.

Every addition follows `.claude/skills/mcp-tool-authoring` (descriptor row, count-pinned
tests, mcp-server.md sync, no writes hiding in reads).

# MCP affordance coverage — close the agent-tool gaps

**Status**: COMPLETE — all five items shipped 2026-07-11 (`feature/mcp-affordance-coverage`).

## Provenance

2026-07-11 audit (`.rptc/research/mcp-affordance-coverage/research.md`), prompted by the
`rename_project` gap: an agent asked to rename a project had no sanctioned path and could
only shell-`mv` the folder, stranding the extension's baked paths. `rename_project`
shipped the same day; this item covers the remaining gaps the audit found.

## Shipped 2026-07-11

- **`get_project_urls`** (read, item 1) — `handleGetProjectUrls` in `dashboardHandlers.ts`,
  READ_DESCRIPTORS row. Computes storefront/liveSite/daLive/commerceAdmin/devConsole from
  the existing getters; no browser, no admin-panel prompt.
- **`deploy_integration` / `redeploy_integration` / `remove_integration`** (item 4) — three
  ACTION_DESCRIPTORS rows over the existing `deployAppBuilderComponent` /
  `redeployAppBuilderComponent` / `removeAppBuilderComponent` handlers (verified
  headless-safe; `remove` is confirm-gated for its remote undeploy). No new handlers needed.
  Note: `addAppBuilderComponent` was deliberately NOT exposed — it punts to the interactive
  Configure webview for input-requiring components (returns success without deploying).
- **`deploy_mesh`** (action, item 3) — extracted the shared UI-free `deployMeshHeadless` core
  (`mesh/services/deployMeshHeadless.ts`); `DeployMeshCommand` now wraps it with the progress
  notification + status bridge + toasts, and the new `handleDeployApiMesh`
  (`mesh/handlers/deployHandler.ts`, wired as `deploy-api-mesh` in `meshHandlers`) runs it
  headlessly. ACTION_DESCRIPTORS row `deploy_mesh` (no arg, no confirm). Command's 5 test
  files kept green as the refactor safety net.
- **`refresh_block_library`** (action, item 5) — same lift: extracted `refreshBlockLibraryHeadless`
  (`eds/services/refreshBlockLibraryHeadless.ts`); `RefreshBlockLibraryCommand` wraps it with the
  progress notification + toasts, and the new `handleRefreshBlockLibraryHeadless`
  (`eds/handlers/refreshBlockLibraryHandler.ts`, wired as `refresh-block-library` in `edsHandlers`)
  runs it headlessly and returns the real result (not the old "dispatched" shim). ACTION_DESCRIPTORS
  row `refresh_block_library` (EDS-only, no arg, no confirm). Command's 3 tests kept green.
- **`export_project_settings`** (action, item 2 — the redesign) — new headless
  `exportProjectSettingsToFile(project, { path?, includeSecrets? })` in `settingsTransferService.ts`
  writes the settings JSON (secrets by default) to a target validated by `assertPathInsideSync`
  (must be inside the project dir — traversal/arbitrary-overwrite rejected; default
  `<project>/<name>.demo-builder.json`) and returns only `{ path, includesSecrets }`. Confirmed the
  original leak finding: `extractSettingsFromProject`'s `includeSecrets` is metadata-only, so the
  serialized `configs` always carries secrets — hence secrets go to the FILE, never the response.
  `handleExportProjectSettings` (dashboard map type `exportProjectSettings`) is the dialog-free
  sibling of the UI `exportProject` (save-dialog, left untouched). ACTION_DESCRIPTORS row
  `export_project_settings` (optional `path`/`includeSecrets`, no confirm — idempotent local backup).

## Goal / Scope

Give agents a sanctioned tool for every project affordance they can plausibly be asked to
perform, per the validated tiering: tool descriptions are the affordance layer; AGENTS.md
sections are cross-tool loops; generated skills are multi-step-with-traps only. **No new
generated skills** — the audit confirmed every gap is a single tool once it exists.

Nothing remains — all five items shipped (see "Shipped 2026-07-11" above). Item 2's
write-a-file redesign confirmed the leak finding it was scoped from: `extractSettingsFromProject`'s
`includeSecrets` is metadata-only (never redacts `configs`), so `export_project_settings` writes
secrets to a path-validated file and returns only `{ path, includesSecrets }` — see
`[[feedback_secrets_in_public_repo]]`.

(Item 4's optional follow-up — extending the generated `extend-app-builder-app` skill to teach
`deploy_integration`/`remove_integration` — was NOT done: the tools self-describe and are
discoverable by MCP listing, so no `ai-context-authoring` / AI_CONTEXT_VERSION bump is warranted
unless existing projects' generated context should proactively teach the loop.)

## Constraints

- Follow `.claude/skills/mcp-tool-authoring` per tool: descriptor row (reads vs actions),
  zod inputSchema, handler still validates, count-pinned descriptor tests,
  `docs/systems/mcp-server.md` §9 sync, short when-to-use description (the agent's
  search surface).
- Explicitly out of scope (audited, skipped deliberately): pin/unpin, copy path, view
  mode, edit-project (interactive wizard), import/copy-from dialogs, open-AI/help/settings.

## Kickoff prompt

> COMPLETE — no work remains. This item shipped all five MCP affordance tools
> (`get_project_urls`, `deploy_mesh`, `deploy_integration`/`redeploy_integration`/`remove_integration`,
> `refresh_block_library`, `export_project_settings`). Ready to archive to `.rptc/complete/`.

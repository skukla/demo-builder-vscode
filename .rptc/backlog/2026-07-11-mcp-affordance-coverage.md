# MCP affordance coverage — close the agent-tool gaps

**Status**: partial — items 1 & 4 shipped 2026-07-11 (`feature/mcp-affordance-coverage`);
items 2, 3, 5 remain (scope sharpened below by implementation findings).

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

## Goal / Scope

Give agents a sanctioned tool for every project affordance they can plausibly be asked to
perform, per the validated tiering: tool descriptions are the affordance layer; AGENTS.md
sections are cross-tool loops; generated skills are multi-step-with-traps only. **No new
generated skills** — the audit confirmed every gap is a single tool once it exists.

Remaining items (priority order; scope sharpened by the 2026-07-11 implementation pass):

2. **`export_project_settings`** — **redesign REQUIRED** (was scoped as a trivial read; it
   is not). Discovery: `extractSettingsFromProject`'s `includeSecrets` flag is
   **metadata-only** — it sets `settings.includesSecrets` but does NOT redact; `configs:
   project.componentConfigs` is always included verbatim. So a read tool returning that JSON
   would leak secrets (API keys, tokens) into the agent's context (public repo — see
   `[[feedback_secrets_in_public_repo]]`). Correct shape: a **write-a-file ACTION**, not a
   read — write `createExportSettings(project, version, includeSecrets ?? true)` to a
   path (agent-provided or a safe default under the project dir), validate the path
   (`PathSafetyValidator` — no traversal/overwrite of arbitrary files), and return
   `{ path, includesSecrets }` only. Secrets go to disk, never into the response. Default
   `includeSecrets: true` (a local backup, like the webview export). This is the safe way to
   "sidestep the save dialog" without the secret-in-context leak.
3. **`deploy_mesh`** (action) — a HEADLESS handler that re-runs `DeployMeshCommand`'s core
   without its UI. The command is heavily UI-coupled (`sendMeshStatusUpdate`, `withProgress`,
   `showErrorMessage`, state persistence), but the actual deploy core is already the shared
   `deployMeshComponent(meshPath, cmdMgr, logger, onProgress, existingMeshId)` service. The
   new handler must replicate the command's sequence sans UI: lock (`DeployMeshCommand.lock`
   is private — extract or add a headless entry) → `ensureProjectAdobeContext` preflight
   (VERIFY headless-safe — it may prompt for interactive sign-in; if so, require auth already
   present via the auth-handoff pattern, like other Adobe tools) → App Builder permission
   gate (`testDeveloperPermissions`) → `ensureMeshApiSubscribed` → `fetchMeshInfoFromAdobeIO`
   (existing mesh id) → `deployMeshComponent` → persist `meshState`/`meshStatusSummary`.
   Return the real `{success, data:{meshId, endpoint}}`. The existing `handleDeployMesh` is an
   `executeCommand` shim that returns before anything runs — do NOT expose it as-is. Highest-
   value remaining (closes the check/delete/deploy asymmetry — `check_mesh`+`delete_mesh` ship
   but not deploy). Best done as its OWN focused cycle: it touches the primary mesh-deploy
   path; extract the shared core so BOTH the command and the handler use it (regression risk).
5. **`refresh_block_library`** (action) — same service-layer lift as deploy_mesh (the current
   handler is an `executeCommand('demoBuilder.refreshBlockLibrary')` shim). Lowest priority;
   the block-registration skills partly cover the workflow.

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

> Continue the MCP affordance-coverage backlog item
> (`.rptc/backlog/2026-07-11-mcp-affordance-coverage.md`). Items 1 & 4 shipped; the
> remaining items are 2, 3, 5 with sharpened scope above. Start with item 3
> (`deploy_mesh` — highest value; extract the shared deploy core from DeployMeshCommand
> so both the command and a new headless handler use it) as its own focused cycle. Item 2
> (`export_project_settings`) needs the write-a-file redesign to avoid the secret-in-context
> leak — read the finding first. Follow `.claude/skills/mcp-tool-authoring` per tool.

# Phase 4 · Step 02 — full functional parity

**Supersedes the build list in `phase-4-step-01-inventory.md`.** That list answered "which
handlers can become tools?" This one answers the question that matters: **what can a person do,
and can an agent do it too?**

## Why step 01's list was too short

Step 01 disqualified 21 handlers because they push their result through `context.sendMessage` and
return `{success: true}`. That rule is false, and the counter-example was already in the repo:

`src/features/ai/server/progressCapture.ts` — `withCapturedProgress(base, sink)` collects the
pushes and `lastCompleteData(events)` reads the payload back. **`createProjectTool.ts:190,226`
uses it in production** to run `storefront-setup-start` headlessly and pull `repoUrl` off the
captured event. A dispatch-only handler is a ~5-line adapter away from being a tool, and the
adapter does not touch the handler.

Two more were wrong from reading only the top of a function:

- `handleRequestStatus` **already returns** `{success: true, data: statusData}` (`:216`). The
  `context.panel` guard at `:53` is the first thing you see and the return is 160 lines below.
- `handleDeleteAdobeProject` **already returns** `{success, data: result}` (`:283`). It was
  disqualified on `confirmDeletion` — but `delete_project` already ships that exact workaround:
  `confirm: true` + `confirmName` over a headless core.

**Blast radius of enriching a return: zero, verified.** `WebviewClient.postMessage`
(`src/core/ui/utils/WebviewClient.ts:177-191`) never sets `expectsResponse`, and
`webviewCommunicationManager.ts:373` only echoes a handler's return when that flag is set. The
webview cannot see these return values. The single exception is `delete-adobe-project`, called via
`webviewClient.request` at `AdobeProjectPicker.tsx:117`, which reads `success`/`cancelled`/`error`
— additive changes are safe.

## The measured gap

~140 user-facing capabilities across 13 feature areas, against 65 tools. Only four things
genuinely require a human: Adobe IMS browser login, GitHub OAuth, the DA.live bookmarklet-and-paste,
and the GitHub App install approval. Almost everything else is mechanically reachable.

---

## The organising principle: every capability gets a tool

Where a capability cannot COMPLETE headlessly, the tool still exists — it performs everything it
can, then **hands back to the extension** with a structured result telling the agent what to say
and which surface to open. The agent stays the driver; the user supplies only the step that
genuinely needs them.

This generalises two conventions already in the codebase: the `needsAuth` handoff, and `open_view`,
which exists for no other purpose than returning control to the UI.

### The `needsUser` convention (new, to be documented in `docs/systems/mcp-server.md`)

```ts
{
  needsUser: {
    reason: 'browser-oauth' | 'secret-entry' | 'file-picker' | 'approval' | 'settings-edit',
    what:   'Sign in to Adobe',                    // the action, in the user's words
    where:  { view: 'dashboard' } | { command: 'demoBuilder.configureProject' },
    tellUser: '…',                                 // verbatim, for the agent to relay
    resumeWith: 'get_auth_status',                 // how the agent confirms completion
  }
}
```

Rules:

1. **Do everything possible first.** A handoff is the last step, not the first. `create_project`
   already models this — it pre-flights auth silently and only then returns `needsAuth`.
2. **Name the surface.** `where` must be openable by `open_view` or `executeCommand`, so the agent
   can offer to open it rather than describing a menu path.
3. **Name the resume check.** Without `resumeWith` the agent has to guess whether the user
   finished.
4. **Never fake completion.** A tool that opens a panel and returns `{success:true}` is the defect
   `handleAddAppBuilderComponent` has today (`:355-358`).

---

## Group 0 — Two defects, fixed before anything is built on them

**0a. `select_*` does not affect `create_project`.** `create_project`'s guard tells the agent
*"Select one first: select_org → select_project → select_workspace"* (`createProjectTool.ts:82`),
then reads `mgr.getCurrentWorkspace()` → `adobeContextResolver` → **`aio console where --json`**,
the machine-global CLI selection. `select_*` writes only `adobeTargetStore`
(`adobeTools.ts:230,263`), and **`adobeTargetStore` has zero references anywhere in
`src/features/authentication/`** (verified). The instruction the tool gives cannot satisfy the
tool. Either make the guard read the session target, or change the message. Do not build more
Adobe tools on top of this until it is settled.

**0b. `check_prerequisites` would report "all installed" on a bare machine.** `prereqManager` is
`undefined` in the headless context (`headlessHandlerContext.ts:27`) → `initializePrerequisiteCheck`
loads no config → the check loop runs zero times → `[].every(...)` is `true`. Constructing
`PrerequisitesManager` (which has **no `vscode.window` references**) in the headless factory is the
fix, and it must land before the tool.

---

## Group 1 — Status and diagnosis (reads)

| Tool | Source | Note |
|---|---|---|
| `get_project_status` | `buildStatusPayload` (`dashboardStatusService.ts:53`) — pure, zero vscode imports | Is the demo running, on what port, is the frontend config stale, is the EDS storefront published. `start_demo`/`stop_demo` ship today with no way to ask whether they worked. Build over the service; leave the handler alone (a test pins its panel guard). |
| `check_prerequisites` | `PrerequisitesManager` + capture adapter | After 0b. Takes `selectedStack` — `getNodeVersionMapping` returns `{}` without it. |
| `get_auth_status` **(enrich)** | `handleCheckGitHubAuth`, `handleCheckDaLiveAuth` | Add GitHub `orgs` and the DA.live `orgName`. The pinned DA.live namespace is reachable nowhere today and every DA.live write depends on it. ⚠️ `handleCheckGitHubAuth` **stores a token** when it finds a VS Code session (`edsGitHubHandlers.ts:79-83`) — do not expose it under a `check_*` name without splitting that write. |
| `check_github_app` | `checkGitHubAppHandler` | Is AEM Code Sync installed on a repo. First thing to check when publishing silently fails. |
| `check_repo_readiness` | `checkRepoReadinessHandler` | Can this repo serve as a storefront. |
| `discover_store_structure` | `handleDiscoverStoreStructureAndPersist` | The LIVE Commerce fetch. `get_store_structure` only reads what was already stored. |
| `validate_component_selection` | merges `checkCompatibility` + `validateSelection` + `loadDependencies` | One question, one tool. |
| `get_component_requirements` | `handleGetComponentsData`, narrowed | Env vars, dependencies, services for one component. `list_components` returns only `{id, name}`. |

## Group 2 — Cloud resource creation (closes the create/delete matrix)

| Tool | Note |
|---|---|
| `create_github_repo` | From a template; needs `templateOwner`/`templateRepo`. Blocks on `waitForContent`. |
| `create_adobe_project` | Structured `AUTH_FORBIDDEN` + quota errors. Must use `requireAdobeAuth`'s `quiet` path. |
| `create_adobe_workspace` | Targets the SELECTED project — see defect 0a. |
| `delete_adobe_project` | Over `teardownConsoleProject` + `createTeardownDeps` (already extracted and DI'd). Replace `confirmDeletion` with `confirm` + `confirmName`, exactly as `delete_project` does. |

After this group an agent can create and destroy all four cloud resources — today it can destroy
three and create none.

## Group 3 — Project configuration (the largest functional gap)

`create_project` produces a **structurally complete but unconfigured** project. It hardcodes
`componentConfigs: {}`, `selectedAddons: []`, `selectedBlockLibraries: []`, no datapack, no
integrations, no store scope. The remaining configuration has no tool except raw
`update_project_config`, which is the one unguarded write on the surface.

| Tool | Covers |
|---|---|
| `set_commerce_connection` | `ACCS_GRAPHQL_ENDPOINT`, website/store/store-view codes. **Secrets hand off** (`reason: 'secret-entry'`, `where: {command:'demoBuilder.configureProject'}`) — the Configure screen shows secrets as "is set" booleans, so they are typed by a person. |
| `set_store_scope` | The three scope codes, validated against `discover_store_structure`. |
| `set_block_libraries` | Selected + custom. Custom libraries are settings-only today → handoff for those. |
| `set_datapack` | Records which datapack seeds the project (the wizard's Sample Data area records, never imports). |
| `set_addons` | e.g. ACO, unreachable today. |
| `configure_project` | Or: ONE tool mirroring `save-configuration`, taking a partial config. **Decide first** — five narrow tools or one wide one. The wizard treats these as one step, which argues for one tool. |

## Group 4 — Integrations

| Tool | Note |
|---|---|
| `add_integration` | Completes deploy/redeploy/remove. The runner is already DI'd; the work is replacing the `needsUserInputs` branch (which today opens a panel and returns success) with a `needsUser` handoff. |
| `rename_integration` | `renameAppBuilderComponent`. |
| `set_console_apis` | Replace/remove. `add_console_apis` is add-only. |
| `set_project_destination` | Sets the Adobe project+workspace an integration deploys to; can also create them. |

## Group 5 — Project lifecycle

| Tool | Note |
|---|---|
| `select_project` (current-project pointer) | An agent cannot change which project is current. |
| `restart_demo` | `start_demo`/`stop_demo` exist; restart does not. |
| `set_project_pinned` | Trivial. |
| `open_url` / extend `open_view` | `get_project_urls` returns URLs and **nothing can open them**. The UI has five open actions. |
| `edit_project` | Wizard edit mode → **handoff** (`where: {command:'demoBuilder.createProject'}`). |
| `import_project_from_file` | Native file picker → **handoff**, unless a path argument bypasses it. |
| `export_project` | Save dialog → **handoff**; distinct from `export_project_settings`. |
| `copy_from_existing` | QuickPick → **handoff**, or accept the source project as an argument. |

## Group 6 — EDS / storefront operations

| Tool | Note |
|---|---|
| `manage_site_access` | `siteAccessManagerHeadless` is already headless; the command wraps it in a QuickPick. |
| `repair_site_configuration` | Fully automatable. |
| `migrate_storefront_names` | Destructive (deletes the old DA site root) → confirm + name echo. |
| `cleanup_dalive_sites` / `manage_github_repos` (bulk) | The single-resource versions exist; bulk is UI-only. Confirm-gated. |
| `github_change_account` | VS Code account picker → **handoff**. |
| `connect_dalive` | Bookmarklet + paste → **handoff**, `resumeWith: 'get_auth_status'`. |
| `cancel_storefront_setup` | The `AbortController` lives in per-call `sharedState`, so an agent can never hold it. **Do not build**; the capability is reachable as `delete_github_repo` + `cleanup_dalive_site`. |

## Group 7 — Prerequisites, updates, settings

| Tool | Note |
|---|---|
| `install_prerequisite` | Real refactor: re-address by prereq **id** (today it indexes into `sharedState`, which is rebuilt per call) and return `{manual: true, url}` instead of `vscode.env.openExternal`. Do after `check_prerequisites`. |
| `get_settings` / `set_setting` | 21 `demoBuilder.*` keys. Reads are free; writes hand off (`reason: 'settings-edit'`). Two keys are functional gates — the Data Installer surface does not exist without `dataInstaller.enabled` + `apiBaseUrl`. |
| Updates | `apply_updates` already covers check+apply. The channel is a setting → handoff. |

## Group 8 — Data Installer

Already scoped: `.rptc/backlog/2026-08-16-data-installer-mcp-write-tools.md`. Nine handlers,
import/export/validate/reset. Unchanged by this plan except that the `needsUser` convention now
gives it a way to hand off credential entry.

---

## Sequencing

1. **Group 0** — the two defects. Nothing else is trustworthy until 0a is settled.
2. **Group 1** — reads. Cheapest, highest daily value, and they make the others verifiable.
3. **The `needsUser` convention** — one tool built with it (`connect_dalive` is the clearest) before it is used widely.
4. **Group 2** — creation. Closes the matrix.
5. **Group 3** — configuration. The largest gap; decide narrow-vs-wide first.
6. **Groups 4–7** — in whatever order the demo work demands.

## What stays human, deliberately

Four things, and the tools should say so rather than pretend otherwise: Adobe IMS browser login,
GitHub OAuth, the DA.live bookmarklet-and-paste, and the GitHub App install approval. Each gets a
`needsUser` handoff naming the surface — the agent initiates, the user completes, the agent
resumes.

## Standing constraints, still in force

- Response ceilings: every new tool needs a row in `tests/features/ai/server/responseCeilings.ts`
  with its reason; the table asserts its own coverage.
- No writes hiding in reads (see the `handleCheckGitHubAuth` warning above).
- Destructive tools carry `confirm`; irreversible ones echo the resource name.
- Adobe-touching tools reuse the existing guard chains; never inline an org check.

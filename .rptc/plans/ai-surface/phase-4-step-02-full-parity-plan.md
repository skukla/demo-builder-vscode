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

- `handleRequestStatus` **already returns** `{success: true, data: statusData}` (`:197`). The
  `context.panel` guard at `:54` is the first thing you see and the return is 160 lines below.
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
| ✅ `get_project_status` | `buildStatusPayload` (`dashboardStatusService.ts:58`) — pure, zero vscode imports | Is the demo running, on what port, is the frontend config stale, is the EDS storefront published. `start_demo`/`stop_demo` ship today with no way to ask whether they worked. Build over the service; leave the handler alone (a test pins its panel guard). |
| ✅ `check_prerequisites` | `PrerequisitesManager` + capture adapter | After 0b. Takes `selectedStack` — `getNodeVersionMapping` returns `{}` without it. |
| ✅ `get_auth_status` **(enriched)** | services directly — NOT the handlers | Adds GitHub `login`+`orgs` and the DA.live `orgName`. ⚠️ **The warning in the original row was wrong and cost two deferrals:** it said the tool could not ship until `handleCheckGitHubAuth`'s token write was split out. That handler was never on this path — `authTools.ts` has always called the services directly, and says so in its own docstring. The write is real, but it belongs to the WIZARD's handler; a tool built over that handler would still need the split. Check the tool before inheriting a warning about it. |
| ✅ `check_github_app` | `checkGitHubAppHandler` | Is AEM Code Sync installed on a repo. First thing to check when publishing silently fails. |
| ✅ `check_repo_readiness` | `checkRepoReadinessHandler` | Can this repo serve as a storefront. |
| ✅ `discover_store_structure` | ~~`handleDiscoverStoreStructureAndPersist`~~ → `handleDiscoverStoreStructure` | The LIVE Commerce fetch. `get_store_structure` only reads what was already stored. Bound to the NON-persisting handler — see the deviation note below. |
| ✅ `validate_component_selection` | merges `checkCompatibility` + `validateSelection` + `loadDependencies` | One question, one tool. Short-circuits after an incompatible pair. |
| ✅ `get_component_requirements` | ~~`handleGetComponentsData`~~ → reads `components.json` via the shared `COMPONENT_SECTIONS` | Env vars (resolved to their meaning), services, dependencies for one component. `list_components` returns only `{id, name}`. |

**Deviation (2026-08-17): `discover_store_structure` does NOT persist.** This table named
`handleDiscoverStoreStructureAndPersist`, which writes the discovered hierarchy onto the current
project. That wrapper's own docstring explains it is wrapped rather than folded in precisely
because the shared handler is also registered by the WIZARD, where `getCurrentProject()` would
"write another project's structure onto it" (`configureHandlers.ts:82-100`). An agent calls a
`discover_*` tool speculatively, often with no project in mind, so the agent surface has exactly
the hazard the wrapper was built to avoid. The tool is a pure read; persisting stays an explicit
step. Revisit if an agent needs `get_store_structure` to reflect a discovery it just ran.

**Two things the live probe caught that every offline check passed (2026-08-17):**

1. The first draft's schema exposed `environmentType`, guessed from the tool name. The handler
   requires **`backendType: 'accs' | 'paas'`** (`edsHandlers.ts:89`) and rejects the call without
   it — so the tool failed 100% of calls while jest, tsc, typecheck:tests and eslint were green.
   The schema and its test agreed with each other and neither agreed with the handler.
2. **PaaS discovery authenticates with an admin username and password carried in the payload**
   (`edsHandlers.ts:118-127`). That is a `secret-entry` handoff, not a parameter — a credential in
   a tool argument lands in the transcript and in whatever logs the agent keeps. The PaaS branch
   now returns `needsUser` and never dispatches; ACCS resolves its IMS token from context and
   dispatches normally. `additionalProperties: false` in the generated schema means a caller
   cannot smuggle the credentials through regardless.

**Group 1 is COMPLETE (2026-08-17).** Every row shipped and was measured against a live server:
`get_project_status` 352 B · `check_prerequisites` 514 B · `check_github_app` 63 B ·
`check_repo_readiness` 35 B · `discover_store_structure` 635 B · `get_component_requirements` 727 B ·
`validate_component_selection` 60 B · `get_auth_status` 218 B. Ceilings recorded for all of them.

**One outage worth carrying forward.** `get_component_requirements` shipped with a raw JSON-Schema
`inputSchema` where the SDK demands zod. The throw happens inside `registerExtraTools`, so it killed
registration for EVERY tool — the whole agent surface was dead for six commits, presenting as a
server that bound its socket and never answered. Nothing offline saw it, because every suite here
uses a fake server whose `registerTool` ignores the schema argument. `realSdkRegistration.test.ts`
now hands the real `McpServer` the real descriptors; it was verified by reintroducing the defect.

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
### DECIDED (2026-08-16): ONE `configure_project`, not the five narrow tools

One tool mirroring `save-configuration` and taking a partial config. The five rows above become
its fields, not separate tools.

Decided on output efficiency, which here is dominated by ROUND TRIPS, not schema bytes:

- **One turn, not five.** Configuring a project is one wizard step and one handler; five tools make
  it five model turns for one user intent.
- **One coherent result.** The agent's real next question is "is this project configured enough to
  proceed, and what is missing?" One tool answers that in the same payload. Five each answer a
  fragment, forcing a sixth read to find out where it stands.
- **One handoff, in context.** Secrets are typed by a person. Five tools return that handoff from
  one call while four others report success, and the agent stitches a mixed picture. One tool
  returns one result: applied, still unset, needs-you.
- **1:1 with the handler.** Five tools are five read-modify-write wrappers over a single
  `save-configuration` — five chances at a lost update and five copies of the guard.

The narrow tools' genuine advantage is that invalid combinations are unrepresentable in the schema.
Buy it back inside the tool: validate the three store-scope codes as a **triple**, **reject unknown
keys** rather than ignoring them (a silently-dropped field is the worst failure here), and return
the **applied diff plus what remains unset** — never a bare success (see the empty-response guard in
`tests/features/ai/server/responseSize.test.ts`).

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
**SHIPPED 2026-08-17** — five built, three refused. The refusals are the plan being wrong, not
the work being skipped; each capability is already reachable.

| Tool | Note |
|---|---|
| ✅ `set_current_project` | Built. NOT `select_project` — that name is the Adobe Console selector (`adobeTools.ts`), and registering it twice throws. `forceNewWindow` forced off via `argDefaults`. |
| ✅ `restart_demo` | Built. `handleRestartDemo` already existed and owns the settle delay. |
| ✅ `set_project_pinned` | Built. |
| ✅ `open_url` | Built in `lifecycleTools.ts`, taking a **TARGET, never a URL** — resolved through the same `getProjectUrls` handler `get_project_urls` uses, so an agent can only open URLs that read already reported. |
| ✅ `edit_project` | Built as a pure handoff that never dispatches; also points at `configure_project`, which covers the common asks without the wizard. |
| ❌ `import_project_from_file` | **Not built.** `showOpenDialog` with no argument bypass, and it prefills the WIZARD — an agent driving that is not the flow. Reachable as `get_project` + `create_project` + `configure_project`. |
| ❌ `export_project` | **Not built.** `export_project_settings` already writes the file headlessly; the only delta is a save dialog choosing the path, which an agent can choose. |
| ❌ `copy_from_existing` | **Not built.** QuickPick, no argument bypass, same wizard-prefill reasoning as the import row. |

## Group 6 — EDS / storefront operations

> **BUILT AND PROBED 2026-08-17** — `get_site_access`, `set_site_admin`, `repair_site_configuration`,
> `connect_dalive` in `src/features/ai/server/siteTools.ts`, plus the extraction below.
> `migrate_storefront_names` is the one planned tool still outstanding. The scoping that
> follows is kept because every one of its calls held up under implementation.
>
> **The extraction landed first, as its own commit-sized step.**
> `repairSiteConfigForProject(project, context, logger, onProgress?)` now lives in
> `features/eds/services/` with two callers — the command (which adds only the progress
> notification) and the tool (which passes none). Each assembled dependency is pinned by a test
> that was FALSIFIED before being trusted: dropping the package's `byomOverlayUrl`, passing a
> blank email through, and building `ConfigurationService` over a different credential each
> failed exactly one assertion and nothing else. A fourth candidate assertion — that
> `onProgress` is OMITTED rather than passed as `undefined` — could not be falsified, because
> the two are indistinguishable to `onProgress?.()`. It was deleted and the conditional spread
> with it, rather than left as a test that cannot fail.
>
> **Probed live the same day, no defects.** 131 / 140 / 241 / 444 bytes, ceilings recorded from
> those numbers, the storefront's admin roster byte-identical before and after the whole run —
> including across the re-register, which is `pinSiteAdmin`'s merge-not-replace working rather
> than nothing having happened. `repair_site_configuration` returned `nextStep: 'republish'` and
> did NOT publish, the one claim about it no fixture could ever have supported. Full record in
> the handoff.
>
> **SCOPED 2026-08-17. Read this before estimating what is left.**
>
> **Nothing in this group is dispatchable.** Groups 1–5 were mostly ten-line descriptor rows
> because every planned tool's handler was already in a handler map. Group 6 is the exception the
> build-sequencing section did not anticipate: `edsHandlers` contains none of these operations.
> They are COMMANDS calling services with `(project, vscode.ExtensionContext, logger)`, not
> `MessageHandler`s over a `HandlerContext`. So each tool is a bespoke module, and the group costs
> roughly 3–4× per tool what Groups 4–5 did.
>
> **"Already headless" ≠ dispatchable.** `siteAccessManagerHeadless` and `repairSiteConfigHeadless`
> are UI-free, which is what makes them USABLE from a tool — it is not what makes them reachable
> by a descriptor row. Two different properties; the row above conflated them.
>
> **`repair_site_configuration` needs an EXTRACTION FIRST.** Its params are assembled inside
> `RepairSiteConfigurationCommand.runRepair` (`ConfigurationService`, the DA.live token provider,
> the user email, the BYOM overlay resolver, the progress reporter). A tool must not rebuild that
> — pull it into a shared `repairSiteConfigForProject(project, context, logger)` beside the
> headless service and give it two callers. Doing this on a thin context is how the duplicate
> ships instead of the extraction.
>
> **`github_change_account` has no target and cannot be built as specified.** `HandoffTarget`
> accepts `{view}` or `{command}`, and there is NO Demo Builder command for switching GitHub
> accounts — verified against `package.json`, whose only matching ids are `manageSiteAccess`,
> `repairSiteConfiguration`, `migrateStorefrontNames`, `openDaLiveBookmarkletSetup`,
> `cleanupDaLiveSites`, `manageGitHubRepos`. It needs a design decision (add a command, or widen
> the handoff type), not an implementation. Do not invent an id for it.
>
> **`connect_dalive`'s target IS real:** `demoBuilder.openDaLiveBookmarkletSetup`, verified in the
> same pass.
>
> **The bulk pair should NOT be built** — same call this plan already made for
> `cancel_storefront_setup`. `list_github_repos` + `delete_github_repo` and `list_dalive_sites` +
> `cleanup_dalive_site` already give an agent the capability; looping is what an agent is good at.
> Neither bulk command has a headless core, so building one means a SECOND implementation of a
> destructive path for a convenience the surface already covers.
>
> **Suggested slice order:** `get_site_access` + `set_site_admin` (confirm-gated) →
> `repair_site_configuration` (after the extraction) → `connect_dalive` (pure handoff).
> `migrate_storefront_names` last: it is destructive and needs its own confirm + name-echo design.

| Tool | Note |
|---|---|
| ✅ `get_site_access` + `set_site_admin` | **Built.** The split was right: the read is the far more common call (an agent asks "who can fix this?" long before it asks to change anything), so it carries no confirm gate while the write does. `get_site_access` returns UNMASKED addresses, deliberately — the use of the tool is naming who can grant a role, and a masked address can neither be relayed to the user nor passed to `set_site_admin`. That is not the `get_project` secret case: an address is not a credential, and the masking that exists in this codebase serves the diagnostics report, whose output is written to be pasted into tickets. |
| ✅ `repair_site_configuration` | **Built, after the extraction.** Confirm-gated — the write re-mints the site's publish key and can drop admin grants nothing in the app can restore. **Does NOT publish**: that separation is `repairSiteConfigHeadless`'s own and this surface is the reason it gives, so the result carries `nextStep: 'republish'` on success rather than reading as finished. An agent that stopped at `repaired` would report a storefront fixed that still serves the old config. |
| ✅ `connect_dalive` | **Built** as a pure handoff — `demoBuilder.openDaLiveBookmarkletSetup`, `resumeWith: 'get_auth_status'`. Both ids read from source (`package.json` and `authTools.ts`), not from memory. |
| `migrate_storefront_names` | **Still outstanding.** Destructive (deletes the old DA site root) → confirm + name echo. |
| ❌ `cleanup_dalive_sites` / `manage_github_repos` (bulk) | **Do not build** — see above. The singular tools plus their list tools already cover it. |
| ⛔ `github_change_account` | **Blocked, not deferred** — no command id exists to hand off to. |
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

## Output design — decide this BEFORE writing rows

**The trap:** these tools dispatch to handlers built for a WEBVIEW, and `defaultShape` passes the
payload through unchanged. Every one of phase 2's four worst offenders was a pass-through. Adding
~30 rows on the default recreates that problem thirty times and pays to fix it afterwards; phase 2
spent real effort recovering 79% on four tools, and none of it had to happen.

### A projector library, applied by default

Four reusable projectors cover nearly everything phase 2 hand-wrote. Build them once in
`readDescriptors.ts` (or a sibling) so a new row is `shape: leanList(...)` rather than a bespoke
function:

| Projector | Rule | Earned by |
|---|---|---|
| `leanList(project, pageSize)` | page size + intact envelope, each row projected | `find_datapacks`, `list_adobe_projects` |
| `indexDetail(idArg, previewFn)` | index carries identity + a short preview; full payload on request | `list_ai_prompts`, `get_block_authoring_shape` |
| `verdictOnly(computeFn)` | return the ANSWER, not the inputs to it | `who_created` → `deletable` |
| `legend(field)` | repeated `{code,name}` → a code per row + one legend | `list_console_apis` |

### Five rules, each earned by a measurement

1. **Answer the question; do not ship the data.** `who_created` was 46% of one response and the
   agent could not use it — the comparison needs a token claim only the extension can read.
   `deletable` was ~40x smaller and strictly more useful.
2. **A page size on every list, including indexes.** `get_block_authoring_shape` HAD an
   index/detail split and still measured 21,992 bytes at 300 components. The split bounds the
   detail call, not the catalogue's growth.
3. **Counts where the array is detail.** `dataTypes` → `dataTypeCount`, with `get_datapack` for
   the full list.
4. **Never fabricate an envelope field.** `total: 20` for a 23-row catalogue came from a
   `?? items.length` fallback. Omit what the service does not give.
5. **Write the ceiling BEFORE the tool.** `responseCeilings.ts` already fails on a tool with no
   recorded size, which turns the ceiling into a design constraint instead of a postmortem.

### One structural choice outweighs any projector

**Prefer the SERVICE over the HANDLER when the handler's payload is webview-shaped.**
`get_project_status` built over `buildStatusPayload` is both cheaper to run and leaner to return
than dispatching through `handleRequestStatus`. Reach for `dispatchHandler` when the handler's
payload is already the answer; reach for the service when it is not.

### `needsUser` stays tight

It is returned often. Five fields only — `reason`, `what`, `where`, `tellUser`, `resumeWith`.
Never echo back state the agent already has.

---

## Build sequencing — batch by FILE, not by feature group

**Every planned tool's handler is already in a dispatchable handler map** (checked: all 20
sampled resolved, across `ProjectCreationHandlerRegistry`, `dashboardHandlers`, `edsHandlers`,
`configureHandlers`, `projectsListHandlers`, `prerequisitesHandlers`). So these are ~10-line
descriptor rows, not bespoke tools — which moves the cost off the tools entirely.

What actually costs: the two defects, the shared primitives, the few handlers needing an edit,
group 3's design decision, and **live verification cycles**. Adding 15 rows costs barely more than
adding 3; verifying them one at a time costs 15x.

| Wave | What | Why here |
|---|---|---|
| **1** | Both defects · the `needsUser` type · the capture-adapter helper · the projector library | Small, few files, and nothing built later is trustworthy until defect 0a is settled |
| **2** | **Every descriptor row at once** — each tool whose handler already returns its payload or works through the capture adapter | The win: one file, one test file, one ceiling batch, **one F5 verification pass** |
| ↳ 2a ✅ | `check_github_app` · `check_repo_readiness` · `discover_store_structure` in `statusDescriptors.ts`, live-measured | Done 2026-08-17. Batched deliberately small because it also had to prove three bindings (plain return · forced-arg · capture) before the bulk drop rides on them — and two of the three turned up defects |
| **3** | Handlers needing a real edit — `add_integration`'s panel branch, `install_prerequisite`'s id addressing | Genuine code, but few |
| **4** | Group 3 configuration | Design decision first; the only genuinely new surface |

**Two traps, both paid for in this session:** do not verify per-tool (batch the F5 — each
round-trip costs real coordination), and do not trust a script's classification (reading promoted
two handlers every script had missed, and one script ran `republish` against a live storefront).

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

## Testing strategy — what "done" means for one tool

The infrastructure exists (33 recorded ceilings, 8 suites asserting them, the stub harness in
`responseSize.test.ts`). What was missing is the CONTRACT: four assertions per tool, and one
suite-level guard that does not exist yet and matters most.

### Per tool, four assertions

| # | Assertion | Where | Why |
|---|---|---|---|
| 1 | **Shape** — the response carries the fields its description promises | the feature's own `fakeServer` suite | House pattern; already used by 8 suites |
| 2 | **Size** — within its recorded ceiling **under an OVERSIZED payload** | `responseCeilings.ts` + the suite | Oversized is the point. Real fixtures hid three unbounded lists; 300 projects, 300 components and 900 entries found them |
| 3 | **Honesty** — never reports success it did not achieve | the suite | See the guard below |
| 4 | **Live** — one batched probe per wave, not per tool | `mcp-live-probe` | Live testing found every bug tests missed; batching keeps it affordable |

### The guard that does not exist yet: no tool may return bare success

**Every MCP tool response must be exactly one of three things:**

1. a RESULT that carries the outcome,
2. a `needsUser` handoff, or
3. an error.

**A bare `{success: true}` with no payload is none of them** — it is a tool that cannot fail, and
it is the defect `handleAddAppBuilderComponent` ships today: on a guard failure it runs
`demoBuilder.configureProject` and returns success while nothing was added. An agent cannot detect
that, and neither can a human reading the transcript.

Add this to `responseSize.test.ts`, which already drives every descriptor row through the real
dispatch path with a stub map:

```ts
// Drive each ACTION row with a handler that returns a bare success and assert the
// tool does not pass it through as an accomplishment.
it.each(ACTION_DESCRIPTORS.map(d => d.tool))('%s never reports bare success', async (tool) => {
    const out = JSON.parse(await harness(ALL, { success: true }).call(tool));
    // Either it carries an outcome, or it hands off, or it errors — never "{}".
    expect(out).not.toEqual({});
});
```

The exemption list is the honest part: a handful of tools legitimately have nothing to report
(`stop_demo` returns a status). Those are named explicitly, the way `responseSize.test.ts` already
names its pass-through set — so a NEW bare-success tool fails, and the existing ones are a
decision rather than an accident.

### Testing a `needsUser` handoff

Three assertions, because each rule of the convention can fail silently:

1. **It hands off instead of faking.** Given the interactive precondition, the response carries
   `needsUser` and NOT `success: true`.
2. **It did everything it could first.** The handoff is returned only after the automatable work
   ran — assert the service was called, not skipped.
3. **The handoff is actionable.** `where` names a view `open_view` accepts or a real command id,
   and `resumeWith` names a tool that exists. Both are checkable against the live catalogue, which
   makes them a cheap suite-level assertion rather than prose.

### What live verification is for, and what it is not

Tests prove a tool matches its fixtures. Only the live probe proves it matches reality — and this
session's record is unambiguous: fixtures invented from the writing side described 4 of 78 blocks;
a path prefix was wrong in both the code and the fixture that "verified" it; three unbounded lists
were invisible until driven with production-scale data.

So: one probe pass per WAVE, against a real project, checking the batch together. Not per tool —
each F5 round-trip costs real coordination, and the earlier waves' tools are re-verified for free
by being on the same socket.

---

## Standing constraints, still in force

- Response ceilings: every new tool needs a row in `tests/features/ai/server/responseCeilings.ts`
  with its reason; the table asserts its own coverage.
- No writes hiding in reads (see the `handleCheckGitHubAuth` warning above).
- Destructive tools carry `confirm`; irreversible ones echo the resource name.
- Adobe-touching tools reuse the existing guard chains; never inline an org check.

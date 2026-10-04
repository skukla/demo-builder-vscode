# Audit: Demo Builder's generated AI files against the code and the evidence (AI-8)

Researched 2026-10-03 in the `feature/erp-integration` worktree (branch at read time
`loop/2026-10-04-night3-a`, head `4be2f2567`, `AI_CONTEXT_VERSION = 34` at
`src/core/constants.ts:250`). Read-only. Another agent was editing
`contentAuthoringTools.ts` (the `write_page` confirm gate) the same night; line numbers are as
read on 2026-10-03.

**Scope.** The files every SC's project gets: the 15 skill templates
(`src/features/project-creation/templates/skills/*.md`), the per-project `AGENTS.md`
(`agentsMdSections.ts`, 16 builders composed in `aiContextWriter.ts:63-78`), the home
`AGENTS.md` (`homeAiContextWriter.ts`), and `ai-defaults.json` (its `description` fields are
printed into `AGENTS.md` by `buildToolServers`). Not in scope: this repo's own `CLAUDE.md` files
(AI-8 steps 2, 3 and 5), which need their own pass.

**Method.** Every tool name in the generated files was checked against the registered tool list
(157 names, extracted from `registerTool(...)` calls and descriptor `tool:` rows). Every name
matched; the only non-matches were external MCP tools (Playwright, dropins) and response field
names. Then each behavioural claim was checked against the code it describes. "Correct" means
the code says so; nothing was run live.

## The answer in three sentences

The generated files are mostly correct on tool names and arguments. But a handful of claims are
wrong in ways that will mislead an agent: the mesh `.env` "trap" was fixed on 2026-08-04, the
"configure then restart" recipe never rewrites the frontend `.env`, `open_view view="projects"`
names a view that does not exist, and two skills contradict each other on whether product-page
customisations reach real product URLs. On the evidence, the biggest win is cutting
`AGENTS.md`'s 3.6 KB PDP Routing section (a quarter of the file) to a few lines and moving
architecture history out of agent-facing text.

## What the evidence says helps agents

| Source | What it found | Read |
|---|---|---|
| Gloaguen et al., *Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?* (arXiv 2602.11988) | Context files "do not generally improve task success rates" and raise inference cost "by over 20% on average". Repository overviews are unhelpful. Instructions ARE followed. Useful for "non-standard coding practices". | abstract, 2026-10-03 |
| Li et al., *SkillsBench* (arXiv 2602.12670) | Curated skills raised pass rate 33.9% → 50.5% across 18 model/harness setups; focused skills (at most three modules) beat large or exhaustive bundles. | abstract, 2026-10-03 |
| Theo, "Delete your CLAUDE.md" and "My AGENTS.md & SKILLS.md Breakdown" (via the AI-8 item) | Don't restate what the code shows; stale files actively hurt; a skill `description` should be trigger words, not an explanation; concrete examples beat prose. | the item's own transcript notes; not re-watched |
| Our own surveys, cited in code | Agents used 20 of 104 tools, mostly the ones the bundle NAMED (`agentsMdSections.ts:146-153`). A `dropins` tool was found by name on the first call when the question needed it (`:494-506`). | code comments; the surveys themselves not re-read |

Taken together: **name the tools and the traps an agent cannot find on its own; do not describe
architecture, history, or anything that changes.** Skills (loaded on demand) are where depth
belongs; `AGENTS.md` (always loaded) should be short.

Caveat the item asks to keep: the paper measured single-issue SWE-bench tasks. Our agents run
long sessions against live cloud services, where a wrong tool call costs more than tokens. That
makes "name the tool and the trap" more valuable here, not less, and makes architecture prose no
more valuable.

## The audit table

Verdicts: **correct**, **stale** (was true, no longer), **wrong** (not true now, and the code
shows it), **unverifiable** (needs a live run or an outside system).

### Per-project AGENTS.md (`agentsMdSections.ts`)

| Claim | Verdict | Evidence | Suggested fix |
|---|---|---|---|
| Header: sessions in this directory are scoped to this project; `get_current_project` reports `scope: "session-directory"` (`:75-77`) | correct | `currentProjectTool.ts:72` | keep |
| Overview: `**Status:** stopped/running` (`:82`) | stale by design | written at generation, regenerated on activation only; real file says `stopped` (`justrite/AGENTS.md:12`). The section's own comment argues baked values rot (`:157-162`) | cut the Status line; `get_project_status` answers it live |
| Read `diagnose-demo` first when something is wrong (`:100-102`) | correct | skill exists, always delivered (`skillsWriter.ts:95-110`) | keep |
| Querying Commerce: call `get_commerce_endpoints`; it returns GraphQL, Catalog Service, mesh, which one the storefront uses, and headers (`:186-189`) | correct | `commerceEndpointsTool.ts:95, 168, 189-190` | keep, and ADD `run_commerce_query`, which sends the query with headers attached (`commerceQueryTool.ts:194-195`). The section still tells the agent to assemble requests itself |
| Storefront: local path is a git clone; edit here (`:207`) | correct | `executorEdsPhase.ts` records path and repo | keep |
| "Helix picks up pushes ... for preview. For live: push changes to GitHub — Helix picks up the update automatically." (`:228-229`) | contradicts `diagnose-demo` and `sync-changes` | those say "pushed is not published" (`diagnose-demo.md:137-148`, `sync-changes.md:36-38`). For CODE, Code Sync serves a push on both preview and live (aem.live behaviour, not re-verified here); for CONTENT, a publish is needed | pick one rule and say it once: code goes live on push; DA.live pages need `publish_page` |
| Typography: `--type-*` properties in `styles/styles.css` (`:238-245`) | correct for the shipped template | live read of `boilerplate-b2b-template/styles/styles.css`: 74 `--type-*` occurrences | keep (it is a rule the agent cannot infer and was written from a failure) |
| PDP Routing: four layers, pre-warming at create/reset publishes "every SKU" (`:273`) | partly wrong | pre-warm is ACCS-only in v1; PaaS relies on the 404 fallback (`catalogPrewarmService.ts:22-26`) | see "cut" below |
| PDP Routing: a SKU added after setup is published by the smart-404 on first visit (`:276, :280`) | wrong per the code's own comment | "subject to the SAME 401 on a site with a pinned admin" and storefront setup pins one (`catalogPrewarmService.ts:17-20`). Not live-tested | remove the claim, or verify live first |
| PDP Routing: log line `[Catalog Prewarm] Complete: N/N succeeded` (`:273, :286`) | correct | `catalogPrewarmService.ts:340-343` | keep only if the section stays |
| PDP Routing: overlay registered with `suffix: ".html"` (`:274, :289`) | correct | `configurationService.ts:230` | — |
| PDP Routing: "see `reference_commerce_prerender_unfit` memory entry" (`:292`) | wrong for the reader | that is the owner's Claude memory file; no SC's agent can read it | delete |
| PDP Routing: "see `docs/architecture/eds-byom-pdp-routing.md` ... ADR-005" (`:297`) | wrong path for the reader | the files exist in THIS repo (`docs/architecture/…`), not in the SC's project | delete, or give the public GitHub URL |
| PDP Routing: "Phase 2 LIVE since 2026-06-09", "colleague's workaround", issue #262 (`:275-276, :295`) | correct but internal history | — | cut; history is not an instruction |
| Block Libraries: edit in `blocks/`, then `sync_storefront` (`:372-374`) | correct | `storefrontSyncService.ts:10-16` | keep |
| Block Libraries: "Library promotion is a planned future Demo Builder feature" (`:380-382`) | confusing | `promote_block_to_library` exists and is named in five other places; it registers a block in the DA.live authoring library, not the block-library source repo. Two meanings of "library" collide | say "pushing an edit back to the source block library is not supported" and stop |
| Adobe I/O: `select_org → select_project → select_workspace`; ORG_MISMATCH shape `{error_type, non_retryable: true}`; don't retry (`:421-430`) | correct | `adobeTools.ts:57-62`; proxy honours it (`mcpProxyRetry.ts:51-57`) | keep (a trap the agent cannot infer) |
| App Builder Integrations: deploy from the integration's own `components/<id>/` directory (`:453-454`) | stale | `deploy_integration` / `redeploy_integration` deploy one integration by id under the right org (`actionDescriptors.ts:200-203`) | name `deploy_integration`; drop the run-it-yourself wording |
| Adding Adobe API Access: `list_console_apis` flags managed codes; `add_console_apis` takes `componentId` (`:472-478`) | correct | `readDescriptors.ts:452-456`, `actionDescriptors.ts:873-877` | keep |
| Your MCP Servers: prints each `ai-defaults.json` `description` verbatim (`:538-540`) | correct mechanism; content problem | the Playwright description includes package-pinning rationale ("Tilde range, not caret ...", `ai-defaults.json:23`) and a verification date. This section is the second-largest in a real file (1.9 KB) | split the field: a short agent-facing `description`, and move the rationale to a `$comment` or the schema |
| `ToolSearch` takes a server prefix like `mcp__dropins__` (`:543-545`) | unverifiable here | Claude Code behaviour; the code comment cites a battery run (`:494-499`) | keep |
| Try asking Claude (`:550-565`) | correct | — | cut: examples for a human, read by an agent every turn |
| Finding Adobe Documentation: Wayfinder router pinned to a commit (`:46-47, :586`) | correct | — | keep |
| Reporting Back to the User (`:592-601`) | correct | — | keep (the agent cannot infer the audience). Note it is pasted twice: `homeAiContextWriter.ts:342-351` is a verbatim copy; one shared builder would do |
| Notes: "Component .env files hold all mutable configuration" (`:612`) | wrong | configuration lives in `.demo-builder.json` `componentConfigs` (`configureProjectTool.ts:194-205`); `.env` is generated from it; backends have no folder and no `.env` (`components.json`, no `source`) | "Settings live in the project; `.env` files are generated from them" |
| Notes: "Do not edit .demo-builder.json — use update_project_config" (`:613`) | stale | `update_project_config`'s own description says to set a value use `configure_project`; it is the raw whole-file write (`src/mcp-server.ts:180-188`) | name `configure_project` |
| Notes: "Sync operations are available as MCP tools via .claude/mcp.json" (`:614`) | correct but useless | both `.mcp.json` and `.claude/mcp.json` are written (`mcpConfigWriter.ts:87-88`) | cut |
| Notes: `get_auth_status` first; `sign_in(provider:"dalive")` returns immediately, poll `dalive.authenticated` (`:615-618`) | correct | `authTools.ts:201-202` | keep |
| Notes: confirm-gated tools may also show a consent dialog (`demoBuilder.ai.requireAgentConsent`); "user declined" means it did not run (`:619-622`) | correct | `package.json:426`. Covers `write_page`'s new gate generically, so no text change is needed for it | keep |
| Notes: `reset_project` resets either kind; confirm-gated; headless refuses while running (`:623-628`) | correct | `resetProjectTool.ts:1-25, 142-175` | keep |

### Home AGENTS.md (`homeAiContextWriter.ts`)

| Claim | Verdict | Evidence | Suggested fix |
|---|---|---|---|
| `create_project_from_file` takes an absolute path; the file never carries credentials or the Adobe workspace (`:260-261`) | correct | `createProjectFromFileTool.ts:103, 265-267` | keep |
| "the project tools accept a `projectName` argument" (`:264-266`) | partly | true for `sync_storefront`, `promote_block_to_library`, `get_component_config` (`src/mcp-server.ts:166, 215, 299`); descriptor tools such as `deploy_mesh` act on the CURRENT project and take no `projectName` (`actionDescriptors.ts:806-816`) | say which tools take a name, or say "most act on the current project" |
| "Storefront edits are auto-committed and pushed by a hook" (`:281`) | correct for Edge Delivery only | hook pushes only the manifest's `eds-storefront` (`claudeSettingsWriter.ts:396-407`) | add "(Edge Delivery storefronts only; headless clones are not pushed)" |
| Active-project directive, with and without a name (`:311-335`) | correct | written from a measurement (`:289-310`) | keep |

### Skills

| File | Claim | Verdict | Evidence | Suggested fix |
|---|---|---|---|---|
| add-component | `configure_project env={...}` then restart the demo to apply (`:14-15, :29`) | wrong (static read; confirm live) | `configure_project` writes `componentConfigs` and saves (`configureProjectTool.ts:194-205, 337`); nothing it calls regenerates a frontend `.env`. Starting the demo only hashes existing `.env` files (`startDemo.ts:328-358`). The only `.env` regenerators: Configure save, reset, mesh deploy, mesh setup, App Builder runner (grep of `regenerateComponentEnvFile` callers) | either make `configure_project` regenerate the affected `.env` (a code change), or tell the agent the value lands on the next Configure save or reset |
| add-component | restart: "run `npm run dev` in the component directory" (`:22`) | stale | `restart_demo` exists and owns the settle delay (`actionDescriptors.ts:714-717`) | name `restart_demo` |
| add-component | `.env.local` for Next.js (`:27`) | wrong for our headless | file is `.env.local` only when the component id contains `nextjs`; ours is `headless` (`envFileGenerator.ts:293-294`) | ".env" |
| add-component | description: "Adds or enables a component" | wrong in intent | no tool adds a component; this only sets env values | rename/retarget the skill or delete it; `update-credentials` covers the same job |
| commerce-block-mapper | drop-in block names `product-details`, `product-list-page`, `commerce-cart`, `commerce-checkout` (`:49-52`) | correct | live read of `boilerplate-b2b-template/blocks` | keep |
| commerce-block-mapper | `commerce-search` drop-in "where available" (`:53`) | wrong | no such block in the template (same live read) | drop |
| commerce-block-mapper | "Reuse the existing `aem-block-developer` skill" (`:63`) | correct for Edge Delivery projects | delivered as an Adobe bundle copy (`skillsWriter.ts:183-193`); present in a real project's `.claude/skills/` | keep |
| commerce-block-mapper | drop-in config "via `.demo-builder.json` and component `.env`" (`:44`) | wrong | the Edge Delivery storefront's config is `config.json` / Configuration Service; its only env var is `MESH_ENDPOINT` (`components.json`) | "via the storefront's config" |
| commerce-block-mapper | `te-distributor`, `te-samples`, `te-stock-cart` "from the TE project" (`:71`) | unverifiable, and not in any SC's project | — | cut |
| commerce-block-mapper | Phase 2 LIVE: `/products/default` customisations reach every real PDP (`:26-30`) | correct per AGENTS.md; contradicted by register-custom-block | see register-custom-block row | keep one version |
| commerce-block-mapper | 60-75% / 85-90% fidelity (`:22`) | unverifiable | no measurement cited | mark as a rough guide, or cut the numbers |
| connect-authenticated-site | `@playwright/mcp` lives in `<project>/.demo-builder-mcp/node_modules/` (`:18`) | correct | `aiDefaultsInstaller.ts:44` | keep |
| connect-authenticated-site | `.scraped/` is gitignored (`:32, :48`) | wrong | Demo Builder adds only `.mcp.json`, `.claude/mcp.json`, `.claude/settings.json` (`mcpConfigWriter.ts:220-224`); a real project's `.gitignore` has nothing else. Low risk at the project root (not a git repo, checked on `justrite`), but `auth.json` is a session credential and a save inside the storefront would be auto-pushed | "save under the project root, never inside `components/`"; or add `.scraped/` to the storefront's ignore list |
| connect-authenticated-site | Playwright MCP "storage-state APIs" save `auth.json` (`:32`) | unverifiable | external package | check against the pinned `@playwright/mcp` version |
| create-eds-project | "VS Code must be open on an existing Demo Builder project" (`:8-10`) | stale | contradicted by the same file's notes (`:104-107`) and the always-root model (`executor.ts:459-465`) | delete the sentence |
| create-eds-project | invalid package/stack returns `validStacksForPackage` (`:25-27`) | correct | `createProjectPackage.ts:90, 106` | keep |
| create-eds-project | `needsAuth: 'adobe' / 'github' / 'dalive'` (`:43`) | correct | `createProjectTool.ts:128, 220, 235` | keep |
| create-eds-project | `sign_in ... confirm=true` (`:47`) | correct | `authTools.ts:207-217` | keep |
| create-eds-project | failure returns `{created:false, stage, error, phases, rerunSafe:true}` (`:71`) | partly | true for EDS (`createProjectTool.ts:487-490, 539-542`); a headless failure returns only `{created:false, error}` (`:373`) | say the headless shape, or make it return the same fields |
| create-eds-project | the new project becomes current (`:80-81`) | correct | `executor.ts:460-462` | keep |
| create-eds-project | `open_view view="projects" confirm=true` (`:83`) | wrong | the enum is `projects_list`, `dashboard`, `configure`, `logs` (`viewTools.ts:34-42`) | `view="projects_list"` |
| create-eds-project | `create_project_from_file`: `filePath`, `fromFile.applied/notApplied`, `stillNeeded.credentials` (`:87-100`) | correct | `createProjectFromFileTool.ts:103, 265-267` | keep |
| create-eds-project | name and description say "EDS" but cover headless too | naming | — | rename to `create-project` (needs the removal-matrix path in `skillsWriter`) |
| demo-data-injector | read the product mix and sample SKUs with `get_component_config` (`:25, :45`) | wrong | it reads a config file by path (`src/mcp-server.ts:163-167`); product data comes from `run_commerce_query` | name `run_commerce_query`; mention datapacks (`import-datapack`) as the way to change what products exist |
| demo-data-injector | constants `TIERS`, `DISTRIBUTORS`, `TESTIMONIALS` (`:54`) | unverifiable | from one past project | cut |
| diagnose-demo | symptom table tool names and their purposes (`:16-31`) | correct | all names registered; descriptions match (`readDescriptors.ts:565-569, 599-603`, `statusDescriptors.ts:38, 77-78`) | keep |
| diagnose-demo | `get_site_access` statuses `ok`, `not_authorized`, `no_credential`, `no_site` (`:44-49`) | incomplete | the type also has `failed` (a 401 session, or a failed read) and `invalid` (`siteAccessManagerHeadless.ts:51-57, 195-197`); a headless project gets an "applies only to EDS" error, not `no_site` (`siteTools.ts:98-102, 134`) | add the `failed` row ("sign in again / check Debug Logs") |
| diagnose-demo | `repair_site_configuration` is confirm-gated, reports `lostGrants`, answers `nextStep: "republish"` (`:51-59`) | correct | `siteTools.ts:267, 323`; `siteConfigRegistrar.ts:80` | keep |
| diagnose-demo | `get_store_structure` verdicts `ok` / `missing` / `not-configured` (`:66-70`) | correct | `storeStructureReader.ts:37, 158-159` | keep |
| diagnose-demo | `check_repo_readiness` can return `undetermined` with a reason (`:28`) | correct | `checkRepoReadinessHandler.ts:54` | keep |
| diagnose-demo | `GET /V1/categories/list` to see all categories (`:86-90`) | unverifiable as an instruction | the only REST tool, `run_commerce_rest`, signs with the ERP integration's credential (`commerceRestTool.ts:45-48`), so most projects have no way to send it | say how, or point to the Admin |
| diagnose-demo | "Nothing in this extension force-pushes or rewrites a storefront branch" (`:122`) | correct in effect | the reset's ref update writes a commit whose parent is the current head (2026-09-15 research §3, `githubFileOperations.ts`), so history is kept; not re-read today | keep |
| diagnose-demo | push and publish: the hook pushes on Write/Edit inside the storefront; `sync_storefront` or `sync_content` publishes (`:142-148`) | partly | the hook is right (`claudeSettingsWriter.ts:109, 225, 345`). `sync_storefront` publishes only `/` (`storefrontSyncService.ts:154-161`); `sync_content` publishes EVERYTHING and is confirm-gated (`storefrontTools.ts:159-169`). Neither is said. Contradicts AGENTS.md (row above) | say: code is live on push; a page needs `publish_page`; `sync_content` is the whole site and asks first |
| diagnose-demo | mesh `.env` trap: `deploy_mesh` does NOT regenerate `.env`; Configure first (`:150-160`) | stale since 2026-08-04 | `deploy_mesh` regenerates the mesh `.env` from the manifest before deploying (`deployMeshHeadless.ts:157-191`; commit `87f73a695`, 2026-08-04) | delete the section; it now teaches a false ordering rule |
| diagnose-demo | Debug Logs channel, "Demo Builder: Diagnostics" command (`:164-170`) | correct | `package.json:57` | keep |
| extend-app-builder-app | `list_console_apis` → `add_console_apis` with `componentId` (`:30-40`) | correct | as above | keep |
| extend-app-builder-app | ask `commerce-extensibility`'s `search-commerce-docs` first (`:43-48`) | correct name | listed in `ai-defaults.json:12`; behaviour external | keep |
| extend-app-builder-app | deploy with `aio app deploy` from the folder (`:49-52`) | stale | `deploy_integration` exists (`actionDescriptors.ts:200-203`) and runs the guard chain under the project's org | name `deploy_integration` first |
| header-nav-footer | boilerplate ships `header`, `footer`, `commerce-mini-cart` (`:36-40`) | correct | live read of template blocks | keep |
| header-nav-footer | boilerplate ships `nav` and `breadcrumb` blocks (`:37-39`) | wrong | neither is in `boilerplate-b2b-template/blocks` (live read 2026-10-03) | drop both; nav is the header's fragment |
| header-nav-footer | search wires to a `commerce-search` drop-in (`:56`) | wrong | no such block | drop |
| header-nav-footer | nav lives in `nav.docx` or `nav.md` (`:60`) | wrong for DA.live | DA.live documents are HTML (`read_page` returns "source HTML", `contentAuthoringTools.ts:311`) | "the `nav` page in DA.live (`read_page` / `write_page`)" |
| import-datapack | six-call sequence; `start_datapack_import` returns an `activationId` (`:14-29`) | correct | `dataInstallerDescriptors.ts:218-228` | keep (the model of a good skill: ordered calls plus traps) |
| import-datapack | `outcome` values `watching`, `success`, `unwatchable` (`:34-38`) | incomplete | also `partial`, `error`, `never-registered`, `stopped`, `still-running` (`data-installer/types.ts:200-212`) | list all, or say "anything but `success` is not success" |
| import-datapack | required `datapackName`, `version` (no "latest"), `commerceInstance`, `dataTypes` ≥1; website/store both or neither (`:57-88`) | correct | `dataInstallerDescriptors.ts:57-95` | keep |
| import-datapack | export needs `confirmName`; `list_datapack_export_items` paged with `totalCount`; data types per `operationMode` in dependency order (`:106-122`) | correct | `dataInstallerDescriptors.ts:171-176, 246-260`; `readDescriptors.ts:685-691` | keep |
| import-datapack | `get_settings` reports the URL as `{configured: true|false}` (`:153-156`) | correct | `settingsTools.ts:83, 102` | keep |
| refine-visual-match | token families `--color-*`, `--type-*`, `--spacing-*`, `--shape-*`, `--grid-*` (`:53`) | correct | live read: 60/74/43/19/16 occurrences | keep |
| register-custom-block | `promote_block_to_library` args and result fields `docPage`, `sheet`, `componentDefinition`, `publish` (`:12-38`) | correct | `src/mcp-server.ts:289-325`; `blockToolHandlers.ts:300-307` | keep |
| register-custom-block | PDP-targeted blocks will NOT appear on real product URLs; "Phase 2 will close this gap" (`:58-60`) | stale | Phase 2 is described as live in AGENTS.md (`agentsMdSections.ts:275`) and in `commerce-block-mapper.md:26-30` | delete the caveat |
| register-custom-block / remove-custom-block | block path `components/eds-storefront/blocks/<blockId>/` | correct | clone path `components/<id>` (`componentInstallation.ts:54-71`) | keep |
| remove-custom-block | the hook pushes on "Write/Edit/Delete" (`:48`) | wrong | matcher is `Write|Edit` (`claudeSettingsWriter.ts:109, 225`); deleting a folder from a shell is not seen | "after deleting the folder, call `sync_storefront`" |
| scrape-reference-site | palette command "Demo Builder: Open AEM Modernization Agent" (`:30`) | correct | `package.json:111-112` | keep |
| scrape-reference-site | `.gitignore` excludes `.scraped/` (`:55`) | wrong | see connect-authenticated-site | as above |
| scrape-reference-site | Slack channel and access path for the Mod Agent (`:31-32`) | unverifiable | external | ask the owner whether an internal channel name belongs in a public repo's generated text |
| sync-changes | "Page content (`.md` file in DA.live) → `sync_content`" (`:14`) | wrong | DA.live pages are HTML; the page tools are `write_page` / `publish_page` (both confirm-gated as of 2026-10-03); `sync_content` publishes the whole site (`storefrontTools.ts:159-169`) | "a page → `write_page` / `publish_page`; the whole site → `sync_content` (asks first)" |
| sync-changes | "Block changes to push back to source library → `promote_block_to_library`" (`:18`) | wrong | the tool registers a block in the DA.live authoring library (`register-custom-block.md:12`). The phrase is pinned in the tool's own description and a test (`src/mcp-server.ts:294-297`) | fix both together: "make a block draggable in DA.live" |
| sync-changes | hook fires on Write/Edit under the storefront and runs `git add -A && git commit -m "AI: sync files" && git push` (`:26-32`) | correct | `claudeSettingsWriter.ts:134, 225, 345` | keep |
| sync-changes | `sync_storefront` pushes and publishes (`:15, :54-56`) | partly | publishes `/` only (`storefrontSyncService.ts:154-161`). Note `sync_content`'s own tool description says the opposite, "only commits and pushes" (`storefrontTools.ts:166-167`): that tool text is wrong | say "publishes the home page only"; fix the `sync_content` description |
| sync-changes | `deploy_mesh` spawns `aio api-mesh:update`, falls back to create (`:57-59`) | correct | `meshDeployment.ts:80-90` | keep |
| sync-changes | "Component `.env` credential → `configure_project`, then restart" (`:17`) | wrong twice | secrets are refused by `configure_project` (`configureProjectTool.ts:294-310`), and see the add-component restart row | "a setting → `configure_project`; a secret → the user, in Configure" |
| update-credentials | Commerce URL / store view / ACCS endpoint "in the backend component `.env`" (`:15-18`) | wrong | backends have no folder and no `.env`; the values live in the project under the backend's id and are written into the headless frontend's and the mesh's `.env` (`components.json`) | "in the project's settings for the backend" |
| update-credentials | `MESH_ENDPOINT` "in the mesh component `.env`" (`:17`) | wrong | it is a frontend variable (headless and eds-storefront list it; the mesh components do not) | "the frontend's" |
| update-credentials | secrets are refused by `configure_project`; hand to the user in Configure → Connection (`:27-30`) | correct | `configureProjectTool.ts:294-310`; label at `ConfigureSectionBody.tsx:209` | keep |
| update-credentials | `get_component_config` "will not show" a secret; "a secret shows as absent" (`:21, :38`) | wrong in detail | regenerated `.env` files do contain secrets (`envFileGenerator.ts:357-373`); the tool MASKS them (`src/mcp-server.ts:164`) | "shows masked" |
| ai-defaults.json | Playwright `description`: dev rationale for the version range (`:23`) | wrong audience | printed into every Edge Delivery project's AGENTS.md | see AGENTS.md row |
| ai-defaults.json | dropins tools take `projectDir` = the storefront path (`:35`) | unverifiable | external package | keep (it is a trap) |

**Not covered by any generated file** (gaps, not errors): page authoring
(`read_page`, `write_page`, `publish_page`, `delete_page`, `list_content`), the catalog menu
(`build_catalog_menu`, `remove_catalog_menu`, both confirm-gated as of 2026-10-03), datapack-free
Commerce reads (`run_commerce_query`), and Export (`export_demo_bundle`). The agent can still find
them in the tool list, and the confirm gates explain themselves on refusal.

## Recommendations (the owner decides)

**Keep** — things an agent cannot find on its own, most written after a real failure:
the session-scope line, the diagnose-demo pointer, Querying Commerce (plus
`run_commerce_query`), the typography and token rule, the ORG_MISMATCH rule, Console-API
access, Notes on auth/consent/reset, Reporting Back, the documentation router, and the skills
`import-datapack`, `diagnose-demo` (after fixes), `register-custom-block`,
`remove-custom-block`, `update-credentials` (after fixes).

**Cut** (about 5 KB of a 14 KB file, measured on `justrite/AGENTS.md`):
- PDP Routing, 3.6 KB, a quarter of the file. Replace with three lines: product URLs route
  automatically; do not create product pages or folder mappings; if PDPs 404, read
  `diagnose-demo`. Move the four layers into `diagnose-demo` if anything.
- Status line, Try asking Claude, the `.claude/mcp.json` note.
- Internal history and references the reader cannot open: phase names and dates, memory-entry
  and `docs/architecture` paths, the TE project.
- The Playwright description's dev rationale.

**Fix** — every row marked wrong or stale above. The four that will cause a wrong action:
1. diagnose-demo's mesh `.env` trap (stale, teaches a false ordering);
2. add-component / update-credentials / sync-changes "configure then restart" (the value never
   reaches the frontend `.env`; needs a code decision, see below);
3. `open_view view="projects"` (the call fails);
4. register-custom-block's "real PDPs won't show it" against commerce-block-mapper's "they
   will" (one of them is wrong; AGENTS.md sides with commerce-block-mapper).

**Add** — `run_commerce_query` in Querying Commerce; one line in sync-changes for page edits
(`write_page` / `publish_page`); a sentence on headless: no auto-push, no sync.

**Skill descriptions** (AI-8 step 5, applied to the shipped skills only): most are trigger-
shaped already ("Use when ..."). Two explain rather than trigger: `add-component` (and its job
overlaps `update-credentials`) and `commerce-block-mapper` (two sentences of rationale before the
trigger). `create-eds-project`'s name says EDS and the skill covers headless.

**The "surprise" instruction** (AI-8 step 6): not in the generated files. Adding it would
harvest feedback, but it costs every SC's agent a standing instruction, and the result lands in
the SC's session, not with us. Recommendation: no, unless there is a channel that brings what
agents flag back to the owner.

## Owner decisions

1. **Cut PDP Routing to three lines** (and move detail to `diagnose-demo`)? Recommended: yes.
2. **"configure then restart" never updates the frontend `.env`.** Fix the CODE (make
   `configure_project` regenerate the affected `.env` files, which makes the skills true) or fix
   the TEXT (tell agents the value lands on the next Configure save)? Recommended: fix the code;
   an agent has no other way to change a running headless demo's settings. Confirm live first:
   set a value with `configure_project`, then read the component's `.env`.
3. **The smart-404 claim for new SKUs**: verify live on a site with a pinned admin before the
   text says anything either way? Recommended: yes; until then, remove the claim.
4. **`promote_block_to_library`'s description** ("push back to source library") is pinned by a
   test and is misleading. Change the tool text and the test along with the skill?
   Recommended: yes.
5. **Internal names in generated text** (the Mod Agent Slack channel, the TE project): keep or
   drop, given the repo is public and the text lands in every SC's project? Recommended: drop
   the TE project; owner to rule on the Slack channel.
6. **The "surprise" harvesting line**: add or not? Recommended: not until there is a way back.
7. **Measure before and after**: run the evaluation battery (AI-1q) on the trimmed AGENTS.md, as
   the paper's own advice ("rigorously evaluated before deployment") asks? Recommended: yes, for
   the cuts; the factual fixes need no measurement.

Every change here is a generated-bundle change: bump `AI_CONTEXT_VERSION` (34 today) and change
creation and regenerate together (the `ai-context-authoring` skill).

## Related findings outside the generated files

- `sync_content`'s tool description says `sync_storefront` "only commits and pushes"
  (`storefrontTools.ts:166-167`); the code publishes `/` (`storefrontSyncService.ts:154-161`).
- The Reporting Back section exists twice, byte for byte (`agentsMdSections.ts:592-601`,
  `homeAiContextWriter.ts:342-351`). Verified duplication; not fixed (read-only task).

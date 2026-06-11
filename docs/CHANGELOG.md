# Changelog

All notable changes to the Adobe Demo Builder VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-beta.115] - 2026-06-11

### Fixed

- **AEM Assets binding for first-time DA.live users.** DA.live returns HTTP `401` (not `404`) when `/config/<org>/` has never been written for a user — the existing 404-only handling branch in `applyOrgConfig` missed this, bailed out, and the AEM Assets binding (`aem.repositoryId`) never got written into the DA.live org config. Storefronts created by first-time DA.live SCs shipped without an AEM Assets entry in their DA.live Library, while SCs with prior DA.live presence saw it working (their GET returned 200, the read-modify-write succeeded). Adds a new branch in `daLiveContentOperations.applyOrgConfig`: when GET returns 401, probe write access via `HEAD /list/<org>/` first. If write access is confirmed, treat the 401 as first-time-owner and create the config sheet fresh. If write access is denied, refuse — protecting the existing "don't write skeleton config to an org someone else owns" safety property. The same `hasWriteAccess` helper used by the list-orgs handler moved from `handlers/edsDaLiveOrgHandlers.ts` to `services/daLiveOrgOperations.ts` so the cross-service call doesn't invert the layering. Field-verified by Leah's browser hitting `401` at the same endpoint; new SCs joining the team get AEM Assets in their DA.live Library on first storefront create going forward.

- **Discovery service errors preserve HTTP status code + response body.** Store discovery failures previously surfaced the service's `error` field verbatim — but that field reads "Token is invalid or expired" for many distinct underlying causes (token rejection, email-domain allowlist rejection, service-side bugs masquerading as auth). `fetchViaDiscoveryService` now captures status code, statusText, and the parsed-or-raw body into the surfaced error, formatted as `<status> <statusText> — <body>`. Field-confirmed by Leah whose local token check reported "valid for 21h 32m" milliseconds before the discovery service rejection — the contradiction was the diagnostic key; the new format makes the underlying cause selectable at log-read time (401 = token; 403 = allowlist; 5xx = service-side). Next field retry will tell us exactly which path is failing.

- **Discovery service error classifier uses structural checks instead of substring matches.** `discoverStoreStructure`'s catch block was classifying errors via `message.includes('abort'|'timeout'|'fetch failed'|'ECONNREFUSED')` — which collided with service-response error bodies that happened to contain those words and swallowed the HTTP status code the previous fix went out of its way to preserve. Now keys on `error.name === 'AbortError'` for abort/timeout and `error instanceof TypeError && error.message === 'fetch failed'` for network failures. The friendly-message paths (`"Connection timed out."`, `"Cannot reach the Commerce instance."`) still fire for real timeouts and network errors; service-response errors with sloppy bodies no longer get misclassified.

- **MCP server dual-listen — AI Verification works in both workspace modes.** Switching projects via the home grid reloads VS Code's workspace folder to the project folder, and the in-extension MCP server's socket path follows the workspace. A previous fix (beta.114's per-project `.mcp.json` writes `DEMO_BUILDER_MCP_SOCKET` keyed to `path.dirname(project.path)` — the projects-root socket) closed the case where the workspace was the projects root, but introduced a mismatch when the workspace is the project folder (which is exactly what `vscode.openFolder` produces during a home-grid project switch). The proxy targets the projects-root socket while the server listens on the project-folder socket; the proxy hits `ENOENT`, retries through its ~23s window, and the inspector's 15s budget fires first — surfacing as `demo-builder · timed out` in AI Verification. The in-extension server now listens on **both** the workspace-folder socket and the projects-root socket when they differ (single-binds when they match). Both sockets route into the same per-connection handler; the bound path is purely a discovery mechanism for the proxy. Tactical workaround for the workspace-reload model; the long-term fix (decouple project from workspace folder) is tracked in backlog with the dual-listen shim's cleanup obligation written into its acceptance criteria. Field-confirmed via Leah's AI Verification showing `demo-builder · timed out` alongside `commerce-extensibility · 11 tools` and `playwright · 23 tools` (which both succeeded — isolating the issue to demo-builder's socket routing).

## [1.0.0-beta.114] - 2026-06-10

### Fixed

- **Prerequisite check honors the user's optional-dependency picks.** `checkHandler.initializePrerequisiteCheck` previously built the project's component selection from `stack.dependencies + stack.optionalDependencies`, slamming all of the stack's optional deps (notably `eds-accs-mesh` for the `eds-accs` stack) into the selection regardless of what the user actually configured in the Architecture Modal. A stale comment ("prerequisites run before the Architecture Modal") was load-bearing for the original implementation, but the modal moved into WelcomeStep — by the time prerequisites runs, the user has already made a real opt-in choice. The handler now consumes a new `selectedOptionalDependencies` field on the `check-prerequisites` payload (forwarded from `usePrerequisiteState`) and uses it directly. A CitiSignal + EDS+ACCS demo without mesh no longer triggers the api-mesh prereq or surfaces App-Builder gating downstream. The `wizardHelpers.buildProjectConfig` path already used the user's actual selection; this aligns the prereq handler with the same source of truth.

- **Architecture Modal — cross-package optional-deps leak.** The modal-open handler (`useModalState.handleCardClick`) carried the existing `selectedOptionalDependencies` into modal state for the newly clicked package, even when the new package didn't require or offer the deps. Repro: pick Custom (mesh auto-added) → back out → pick CitiSignal → mesh quietly survives in the wizard state for a package that doesn't offer it. The handler now mirrors `handleStackSelect`'s clear-on-no-mesh behavior — sets modal optional deps to `[]` and propagates the cleared value to the parent via `onOptionalDependenciesChange`. Eliminates the silent inheritance.

- **Token validation timeout (`TIMEOUTS.QUICK` → new `TIMEOUTS.TOKEN_VALIDATION`).** The Adobe IMS token-read in `tokenManager.inspectToken` (`aio config get ims.contexts.cli.access_token --json`) was capped at 5s, which routinely failed on slow networks — the 3-attempt retry loop's exponential backoff exited cleanly but the timeout itself was too tight, producing a "token expired, please re-authenticate" cascade where the underlying token was valid the whole time. Bumped to 10s (matching the precedent set by the v1.5.0 `CONFIG_WRITE` bump). The retry loop is unchanged; worst-case bounded auth wall-clock now sits at ~33s, well inside the legitimate auth flow's wall-clock budget.

## [1.0.0-beta.113] - 2026-06-10

### Added

- **Thin-layer storefront cutover (ADR-006 — live for CitiSignal, custom, and b2b).** Reinstates the v1 template-patch system as a generic `codePatchRegistry` with definitions externalized to a `skukla/eds-demo-patches` repo (matching the precedent `contentPatchRegistry` set for content patches). Pipeline integration spans canonical-phase patches (pre-reset, via `fileOverrides` so they land in the same atomic Git Tree commit) and block-phase patches (post-install, via per-file commits with idempotent SHA threading). A unified `patchReportHelper` surfaces unapplied content + code patches in a single warning toast (`reportUnapplied`), replacing the silent debug-log path content patches used previously — CREATE, RESET, and IMPORT flows all surface the toast via `vscode.window.showWarningMessage`. The `EdsStorefrontMetadata.lkgSource` field marks a storefront as thin-layer; when present, the update checker reads the verified canonical SHA from the patches repo's `last-known-good` file (`lkgReader`) instead of comparing against the template's `main`. Storefronts pin to the LKG SHA at **both create and reset** via the new `lkgPinHelper.ts` (create path) and `buildArchiveUrl` SHA-vs-branch helper exported from `githubFileOperations` (reset path) — create and reset produce byte-identical thin-layer repos. **Multi-canonical support** via an optional `lkgFile` field on `CodePatchSource`: most ledgers share the patches-repo root `last-known-good` (citisignal and custom both track `hlxsites/aem-boilerplate-commerce`), while `b2b` tracks `adobe-commerce/boilerplate-b2b-template` and points at `b2b/last-known-good`. The drift gate in `skukla/eds-demo-patches` clones each unique canonical once per run and advances each LKG pointer independently. Three demo packages drive the pipeline today: CitiSignal (PaaS + ACCS), `custom` (PaaS + ACCS), and `b2b` (PaaS + ACCS).

- **`demoBuilder.byom.overlayUrl` setting — universal BYOM overlay registration.** Adds a workspace-level setting that, when populated, gets registered with the AEM Configuration Service as `content.overlay` whenever an EDS storefront is created or reset. The setting takes precedence over any `byomOverlayUrl` baked into `demo-packages.json`; storefronts without the setting configured behave as before. URL validation requires `https://` (or `http://` on a loopback host for local dev) and a 2048-character cap; rejected values log a fingerprint, never the raw URL, so a paste with a query-string secret doesn't leak. Wired into storefront create (`storefrontSetupHandlers`), reset (`edsResetUI`), and the AI reset tool (`edsResetTool`). Block library refresh is intentionally not wired — it runs the EDS content pipeline only, not the Configuration Service path. Companion work tracks separately as a `render-pdp` action in the shared `accs-discovery-service` App Builder app.

- **Wizard step-name tooltips in the collapsed timeline rail.** At narrow viewports (<=1280px) where the SETUP PROGRESS rail collapses to an icons-only column, each step now surfaces its name via a CSS-only `::after` tooltip. The current step's tooltip is persistent so "where am I in the wizard" is always answered without hover; other steps show their tooltip on pointer hover or keyboard focus. Tooltip styling uses Spectrum gray tokens (`gray-200` background / `gray-800` foreground / `gray-300` border) that invert correctly in both light and dark themes; offset, padding, and border-radius use Spectrum dimension tokens (`size-50` / `size-75` / `size-100`).

### Changed

- **Wizard `TwoColumnLayout` has a `rightMinWidth` floor and a vertical stacking breakpoint.** The primitive's right (summary) column gains a default 300px `min-width` so it stays legible while the left column gives up space first (the left's existing 800px `max-width`). At viewports <= 1180px the two columns stack vertically — summary slides under the active column — so the right column never falls below its floor. Affects `AdobeProjectStep`, `AdobeWorkspaceStep`, `ComponentConfigStep`, `GitHubRepoSelectionStep`, and the post-create `ConfigureScreen` uniformly (they all consume the same primitive).
- **Wizard SETUP PROGRESS rail collapses to icons at <=1280px viewport.** Frees ~224px for the main content column. Step labels move into the new tooltips. The rail's `overflow-y` is set to `visible` in collapsed mode so the tooltips escape the 56px column (otherwise the CSS-spec'd `overflow-x: auto` cascade would clip them at the rail's right edge).
- **Prerequisites step: tightened outer margins on the prereqs box** (`margin-top` 20px → 12px, `margin-bottom` 30px → 16px, both via Spectrum dimension tokens). Recovers 22px of vertical space so the Recheck button sits with visible breathing room above the wizard footer at common laptop window heights without falling below the scroll fold.

### Fixed

- **Wizard "Create Repository" button now pins to LKG on the create path** (ADR-006 Step 4b gap fix). The wizard's pre-create-repo button path (`usePreCreatedRepo` branch in `storefrontSetupPhase1.executePhaseGitHubRepo`) was the third of three Phase 1 branches and didn't call the LKG pin step — only the in-Phase-1 `executePhaseNewRepo` and the explicit-reset branch did. As a result, freshly-created b2b storefronts had only the 2 block-phase patches applied; the 3 canonical-phase SKU/slash patches (`product-link-sku-encoding`, `product-link-sku-slash-encoding`, `aem-assets-sku-sanitization`) silently no-op'd. The same gap also affected CitiSignal create flows (its canonical-phase patches were skipped too — masked by the larger block-phase coverage). The fix adds `pinIfThinLayer` to the pre-created branch and extracts an `announcePinAndComplete` helper so the two fresh-create branches share one pin + progress sequence. Regression coverage in `tests/features/eds/handlers/storefrontSetupPhase1-pin.test.ts`.

### Removed

- **Reverted: commerce-connect Slice 1 (PR #44).** The "Join shared storefront" / repoless satellite work merged on develop on 2026-06-09 was reverted on 2026-06-10 ahead of this release so a release build wouldn't carry an unfinished feature. The branch is preserved on origin as `claude/commerce-connect-slice-1-plan-bgVlb` (tip `bddc3aec`); restoring requires either `git checkout` the branch or `git revert` the revert commit (`6985e09b`). Net effect: 116 files reverted, including all `JoinStorefrontScreen`, `resolveJoinLink`, `storefront-share.json` marker, satellite phase machinery, and `JoinDescriptor` plumbing. No user impact (feature never reached a release).

## [1.0.0-beta.112] - 2026-06-07

### Added

- **In-extension MCP server with the full agent tool surface.** The standalone `dist/mcp-server.js` retires. A long-lived in-extension server now owns project state and a per-workspace Unix domain socket; per-project `.mcp.json` files install a thin stdio→UDS proxy that the agent spawns. The server exposes the agent's full project toolset — `list_projects`, `get_project`, `get_component_config`, `update_project_config`, `sync_storefront`, `list_blocks`, `get_block_source`, `promote_block_to_library`, `remove_block_from_library`, plus `get_current_project` — without the extension having to keep a sidecar process alive. Per-connection logging gives every spawned proxy its own log line so timeouts and disconnects are diagnosable. (#2)
- **Sidebar redesign — labeled-zone tiles, wizard timeline moved out.** UtilityBar reorganized into named zones (Quick Actions, Projects, AI). The wizard-step timeline that previously crowded the sidebar moves to the wizard surface itself. StatusDot now always renders so a tile never appears "empty" while data loads. (#3, #34, #35)
- **Always-root home Chat.** "Open AI" from the home grid opens Claude Code anchored at the projects root rather than the per-project workspace. Slice 2 retires the workspace-anchored launch path entirely for the home chat: the projects root is the durable, predictable workspace. Per-project launches still go through the pending-launch replay. (#36)
- **Home-level AI context.** `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.claude/skills/`, and `.claude/settings.json` are now generated at the projects root the first time the home chat opens. The home context carries all skills (not a per-project subset) so a single home Chat can act across every project; the AGENTS.md template uses a `<project-name>` placeholder with an explicit "don't parrot the placeholder" instruction so Claude announces the real project from `get_current_project`.
- **Auto-commit/push storefront edits from the home Chat.** A PostToolUse hook in `.claude/settings.json` commits and pushes Edit/Write changes inside the storefront tree the moment they land. Parses tool-input with `node -e` instead of jq/python3/grep so the hook has no host dependency.
- **Per-step progress for "Regenerate AI files".** The AI Capabilities modal's regenerate action now reports `creationProgress` per step (install storefront deps → write AGENTS.md → write MCP config → write skills → finalize) with a determinate progress ring once a percentage is known. The pre-progress fallback uses neutral copy ("Checking AI setup…") so the same modal frame covers both verify-on-mount and click-to-regenerate without misleading users. (#39)
- **Collaborator-gated early-access update channel.** `Demo Builder: Check for Updates` gains an "Early Access" channel alongside Stable. Eligibility checks the user's collaborator status against the source repo before exposing pre-release builds, so the channel can ship publicly without leaking unreleased work to non-collaborators. (#41)
- **EDS site-scraping Phase 1 + capability discovery overhaul.** New scraping path collects deployable assets from an existing EDS site so a brand-new project can be seeded from a live demo. The AI capability discovery surface (formerly the AI tile) is reframed around what the AI can do in this project — MCP servers as the primary signal, skills as a collapsible summary — and lives behind the new "View AI Capabilities" link.
- **`remove_block_from_library` MCP tool.** Symmetric counterpart to `promote_block_to_library` — removes a block entry from `component-definition.json`, deletes its `.da/library/blocks/<id>.html` doc page, removes its row from `.da/library/blocks.json`, and republishes. Lets the agent walk back a custom block it added.
- **`promote_block_to_library` MCP tool (8th project tool).** Registers a custom block in DA.live's authoring picker so a block created via AI is immediately drag-and-droppable in the DA.live editor. Four sub-steps: append entry to `component-definition.json` (commit + push); upsert the doc page at `.da/library/blocks/<id>.html` (overwrite-always — supports AI variant iteration); append a row to `.da/library/blocks.json` (read-merge-rewrite — idempotent on `name` collision); publish via Helix Admin (preview + publish). Inputs validated by Zod: `projectName`, `blockId` (regex `^[a-zA-Z0-9_-]+$`), `title`, `unsafeHTML` (≤100K chars), and optional `description` (≤1,000 chars) — persisted to `component-definition.json::components[].description` and rendered as a picker-tile tooltip by the EDS authoring runtime. (#4)
- **`register-custom-block` skill** — 10th demo-builder skill. Instructs AI agents to call `promote_block_to_library` after writing block source files so the block appears in DA.live's picker. Linked from `commerce-block-mapper.md` and `header-nav-footer.md`.
- **"Refresh Block Library" dashboard action.** EDS-only kebab item under the More menu (between Components and Dev Console). Triggers `executeEdsPipeline({ includeBlockLibrary: true, skipContent: true, skipPublish: false, blockCollectionIds: [] })` — the empty array is load-bearing: it routes the rebuild to read `component-definition.json` from the USER's repo (not the template), so MCP-promoted blocks survive the destructive rebuild.
- **Public `appendBlockToLibrary`, `upsertBlockDocPage`, `ensureBlockDocPages` on `DaLiveContentOperations`.** `appendBlockToLibrary` does read-merge-rewrite of the library sheet (idempotent). `upsertBlockDocPage` (new) is overwrite-always — used by the MCP promote flow so AI variant edits land on the published page. `ensureBlockDocPages` (now public) stays non-destructive — used by the template rebuild path to preserve human-authored doc pages.
- **`ErrorCode.INVALID_OPERATION`** — surfaced when a project-shape-gated action runs against an inapplicable project (e.g., the EDS-only Refresh Block Library kebab item invoked on a non-EDS project).
- **In-place project Dashboard rendering.** Clicking a project from the home grid renders its Dashboard in the existing tab; the workspace is anchored only when the user takes an action that needs the per-project context. Combined with landing on the Dashboard after a workspace reload, this removes the long round-trip every project click used to incur. (#31)
- **Diagnostics in the palette + MCP tool surface in the report.** `Demo Builder: Diagnostics` is now a palette command, and its output enumerates the MCP servers, their tool counts, and per-server status — the same view available in the AI Capabilities modal — so a user can paste a diagnostics dump into a bug report without leaving the palette.
- **Explicit "Paste Token" notification for the DA.live token input.** The token entry box now opens only after an explicit notification action, so it never appears unprompted during unrelated EDS flows.
- **User-friendly handoff convention for agents.** A shared convention for how an agent should announce a handoff between skills (what it did, what it expects next) so chained agent runs read coherently.
- **CI: typecheck + lint + test workflow.** GitHub Actions runs typecheck, lint, and the Jest suite on every push/PR. Replaces the previous local-only gate.

### Changed

- **Drop the AI tile, promote "Author in DA.live" to Primary.** The dashboard's AI tile has been folded into the "View AI Capabilities" link in the status grid; the slot it freed promotes the more frequently used "Author in DA.live" action.
- **Adobe-setup StepLogger ID canonicalized to `adobe-auth`.** Wizard step IDs and log channel keys for the unified Adobe setup step now align so a single logging context covers the whole step.
- **Block library lifecycle documentation.** `src/features/eds/README.md` adds a "Block library lifecycle (post-setup)" subsection describing the three paths: initial destructive setup (`createBlockLibrary`), incremental promote via the MCP tool (`appendBlockToLibrary` + `upsertBlockDocPage`), and user-initiated destructive refresh via the dashboard kebab.
- **`upsertBlockDocPage` return type collapsed to `'written' | 'failed'`.** The previous `'created' | 'overwritten' | 'failed'` shape forced an extra DA.live HEAD round-trip on every promote call just to label the result. The MCP handler treated both as success and never surfaced the distinction, so the probe was pure overhead. The doc page is still overwritten unconditionally — only the return label changed.

### Fixed

- **Prompt Library: load merged prompt list on mount.** `AiOverviewScreen` previously seeded `userPrompts` from `project.aiPrompts` only — which is the per-project subset — so pinned (globalState) prompts were invisible until the user edited or added one. The screen now calls `list-ai-prompts` on mount and seeds from the merged response, matching the post-action behavior.
- **MCP socket points at the projects root, not the project path.** Under the always-root home Chat model, the in-extension MCP server listens on a socket keyed to the open workspace folder. Per-project `.mcp.json` files were keying the proxy socket to the per-project path instead, producing `demo-builder timed out` for every project loaded after a Chat reload. The writer now resolves the socket to `path.dirname(project.path)` so the proxy reaches the live server. Existing `.mcp.json` files written before this fix need to be regenerated via the "Regenerate AI files" action.
- **Home AGENTS.md no longer parrots a hardcoded project name.** The "Working on <project-name>…" example previously hardcoded a literal project name, which Claude was copying verbatim into responses ("Working on citisignal-b2b…" on every project). Replaced with a `<project-name>` placeholder and an explicit "do NOT parrot the placeholder" instruction; Claude now substitutes the actual name from `get_current_project`.
- **AI Capabilities modal: neutral loading copy.** The modal's busy-without-progress fallback previously read "Reinstalling storefront dependencies and rewriting AI files. This can take up to a minute." That copy fits the regenerate flow but the modal is also busy during the verify-ai-setup that runs on every dashboard mount — no install, no rewrites, no minute. Neutral copy ("Checking AI setup…") fits both; the per-step LoadingDisplay still surfaces once `creationProgress` arrives.
- **MCP proxy reconnect cascade no longer exhausts file descriptors.** The proxy was retrying connection at full speed when the server socket went away (extension reload, server restart), opening so many failed sockets that the host hit its EMFILE ulimit. Reconnect now backs off exponentially with a cap, and a single in-flight retry is enforced per proxy. (#40)
- **AI "Verifying" badge color matches transient-state convention.** Was rendered in the same color as "Ready", giving no signal that a verify was in flight. Now blue, matching the convention used elsewhere for transient/loading states. (#38)
- **Drop the redundant "AI Ready" label to "AI".** The status grid already shows a colored dot for health; the trailing " Ready" suffix on every row was noise. (#35)
- **StatusDot always renders.** Falls back to a default color when no status is set, and uses inline display so it never collapses to zero width in a narrow column. (#34)
- **AI Capabilities modal title.** Was using a placeholder string; now reads "AI Capabilities". (#30)
- **A pending Chat replay no longer suppresses the cold-start projects list.** The pending-launch replay handler was running before the projects list rendered, leaving the home grid blank on first open if a Chat launch was queued. The handler now defers until after the cold render. (#31)
- **MCP proxy stays connected across a VS Code reload.** The socket the proxy connected to was being held by the previous extension host process; the proxy now reconnects to the new server's socket after a reload window instead of failing the first request.
- **`crypto.randomBytes` for OAuth state (Node 18 compat).** `crypto.randomUUID` is available everywhere we target, but the DA.live OAuth flow runs in a context that occasionally lacks WebCrypto. `randomBytes(16).toString('hex')` is the safe replacement.
- **GitHub App installation verified before declaring code sync ready.** The setup flow was marking the AEM Code Sync step complete as soon as the OAuth flow finished, even if the App hadn't been installed on the target repo. Now probes for the installation before claiming success.
- **DA.live token recognized when obtained via the `da-auth` skill.** The token mirror now bridges both ways — extension-stored token reaches the skill cache, and a skill-acquired token reaches the extension. Resolves the "agent says signed in, extension says not" split.
- **DA.live and GitHub tokens resolved from the live session for promote/sync.** The MCP promote and storefront-sync paths were reading tokens from extension state only; now they fall back to the live Claude session's resolved tokens so an agent run that signed in mid-conversation doesn't have to wait for an extension restart.
- **DA.live agent sign-in opens a native token input (no webview).** The previous webview-based input collided with the chat surface; the native VS Code input box keeps focus and dismissal predictable.
- **`remove-custom-block` skill classified as demo-builder.** Was previously bucketed under "unknown" in the skill inspector because the skill frontmatter shape changed; classifier updated. (#29)
- **OAuth timeout timer cleared when the flow settles.** A success path was leaving the timer armed, which fired a spurious "OAuth timed out" later in the session.
- **Encode dots in cwd when probing the Claude Code session store.** Session-store filenames URL-encode the workspace path; dots in the path were being passed through and missing the right session.
- **Diagnostics "installed" check uses exit code, not just no-throw.** A non-zero exit with no thrown error was being treated as "installed" for a few tools; now requires exit code 0. Also runs `git`/`fnm` version checks through a shell so PATH resolution matches what the user sees in a terminal. (#26, #25)
- **Throttle update check; gate `claude --continue` on prior session.** Update checks no longer run on every activation tick (throttled to a sane interval). `claude --continue` is only invoked when a session for the current workspace actually exists; otherwise the launch falls through to a cold spawn instead of erroring.
- **Lint: consolidate duplicate imports, drop unused vars.** A pass over the lint report so the rules can stay strict in CI.

### Refactored

- **Soft-deprecation cleanup pass.** Removed deprecated `TokenManager.getAccessToken` (L4c), deprecated `ComponentInstance.endpoint` (`meshState` is now the sole source — L3.3), dead `ComponentHandler` class, deprecated `RawComponentRegistry.components` v2.0 field, deprecated `componentHasEnvVars` (callers migrated to `hasComponentEnvVars`), deprecated `createBundleUris`/`BundleUris` aliases, deprecated `getWebviewHTMLWithBundles` alias, empty deprecated `webviewHTMLBuilder` stub, deprecated `getProjectDirectory` (inlined into `getTerminalCwd`), zero-caller deprecated `resetViewModeOverride`, the unwired DA.live Org Config feature, deprecated `resetLogsViewState` (replaced by `sessionUIState.reset()`), deprecated `DebugLogger.toggle()`, mesh back-compat handler re-exports + dead static alias, deprecated `HandlerRegistryMap` type, deprecated `ErrorDisplay` component, legacy `WizardStep` union IDs with no real callers, write-only deprecated `existingRepoVerified` field, redundant `editMode` boolean (subsumed by `wizardMode`), the `method` option on `helix.callHelix` (always GET in practice), and a sweep of ts-prune-flagged dead exports.
- **Home context carries all skills for the single home Chat.** The skill writer for the home AGENTS.md no longer filters skills by per-project shape — the home Chat acts across all projects.
- **Parse hook tool-input with `node -e` instead of jq/python3/grep.** The PostToolUse git-sync hook had three forks of shell parsing for the same input; `node -e` is the one runtime the extension already guarantees.
- **Cyclomatic complexity reduced via helper extraction (EDS).** Several EDS pipeline functions were over the lint threshold; split into small named helpers without changing behavior.
- **Test SOPs: injection seams over leaf-module mocks.** Codified the project's testing standard — production code carries explicit injection seams; tests inject through them instead of `jest.mock`-ing leaf modules. Migrated the 6 `demo-packages.json` leaf mocks to the seam and emptied the allowlist.
- **Oversized test files split below the max-lines threshold.** `useDashboardStatus.test.ts` and several EDS/components/AI test files split into per-aspect files so the CI size check can stay strict. (#5)

### Security

- **`unsafeHTML` sanitization at the MCP boundary.** `promote_block_to_library` now runs AI-supplied `unsafeHTML` through `sanitize-html` before writing it to either `component-definition.json` or `.da/library/blocks/<id>.html`. Strips `<script>`, event handlers (`on*`), `javascript:` URLs, framing tags (`<iframe>`, `<object>`, `<embed>`), and disallowed schemes. Allowlist permits the EDS authoring block vocabulary plus `class`/`id`/`data-*`/`aria-*`. Defense-in-depth: the trust boundary intentionally extends to the AI for this tool, but the sanitizer blunts prompt-injection / confused-deputy paths from poisoning the user's published doc page and committed component definition.

## [1.0.0-beta.111] - 2026-05-28

### Added

- **Chat-first AI experience.** The Claude Code terminal opens as an editor tab next to Project Dashboard. A new wand icon in the sidebar `UtilityBar` is the single AI entry point: cold click launches the chat directly; with a chat alive, opens a QuickPick of the merged prompt list (pinned first) + "Manage prompts…". Selecting any prompt focuses the live terminal and injects via bracketed paste; "Manage prompts…" opens the Prompt Library. New commands: `demoBuilder.openAiExperience` and `demoBuilder.aiMenu`.
- **Prompt Library webview.** The former AI surface (`AiOverviewScreen`) repurposed as a roomy on-demand prompt-management surface, reached via the wand QuickPick's "Manage prompts…" row or the `Demo Builder: Manage AI Prompts` palette entry. Full multi-line CRUD via `PromptEditDialog`. Pinned prompts persist globally (`demoBuilder.ai.globalPrompts`) and appear in every project; unpinned prompts persist in the current project's `.demo-builder.json`. Pinning is a cross-scope move; listing returns the merged deduped collection.
- **Terminal prompt delivery.** On spawn, the prompt rides `claude --continue -- '<prompt>'` (race-free; auto-submits). On reuse, the prompt is injected into the live REPL via bracketed paste (CSI 200~/201~) — pre-fills the input for the user to send. Clipboard write remains the always-on fallback, with a once-ever tip toast explaining the contract.
- **Workspace-anchored project launches.** When the home-grid kebab "Open AI" or a Prompt Library prompt is clicked for a project that's NOT the current workspace, Demo Builder writes a pending-launch record (`PENDING_CLAUDE_LAUNCH_KEY`) and calls `vscode.openFolder`; an activation handler replays the launch against the now-anchored workspace so per-project skills / `.mcp.json` / `AGENTS.md` load correctly.
- **AI health/capability split on the Project Dashboard.** A passive "AI Ready" badge (driven by `verify-ai-setup`) communicates health only. A separate "View Skills (N)" link in the dashboard status grid opens the new `AiSkillsModal` — a lean name-only list of installed skills with a "Regenerate AI files" action. The dashboard "AI" tile now launches the chat surface, not the Prompt Library.
- **AI inventory backend.** Three `vscode-free` inspector services in `src/features/ai/` populate an `inventory` payload on `AiVerificationResult`:
  - `skillInspector` walks `.claude/skills/`, parses YAML frontmatter, classifies skills as `demo-builder`, `adobe`, or `unknown`.
  - `mcpInspector` spawns each `.claude/mcp.json` server via `@modelcontextprotocol/sdk` (stdio client) and returns its tool list. 5-minute TTL cache (success-only). 15s per-server timeout. SDK env allowlist (`PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `LANG`, `TMPDIR`) — extension host secrets do NOT leak to spawned children.
  - `sessionMcpDetector` reads `~/.claude.json::claudeAiMcpEverConnected` cross-referenced with `~/.claude/mcp-needs-auth-cache.json` (best-effort; undocumented Claude Code internal state).
  - `gatherInventory(projectPath)` orchestrates the three via `Promise.allSettled` so one inspector failing degrades to an empty list with a matching `*Error` field for the UI.
  - `inspect-mcp` message handler forces a cache-clearing refresh (per-server or all).
- **AI context file generation at project creation.** At finalization (Phase 6), three writers generate AI agent context files for each project:
  - `AGENTS.md` (project root) — universal AI context (Claude/Copilot/Cursor/Gemini); 8 sections covering endpoints, storefront paths, block libraries, and example prompts.
  - `CLAUDE.md` (root + `.claude/`) — one-line `see @AGENTS.md` pointer files.
  - `.claude/mcp.json` and `.mcp.json` — Demo Builder MCP server entry.
  - `.claude/settings.json` — PostToolUse git-sync hook for EDS storefronts.
  - `.claude/skills/` — three Demo-Builder-specific lifecycle skills (`add-component.md`, `sync-changes.md`, `update-credentials.md`).
  - All three writers run concurrently via `Promise.allSettled`; failures are collected and thrown as a single combined message.
- **Standalone MCP server** (`dist/mcp-server.js`). Separate Node.js stdio process (no VS Code dependency) exposing 7 tools to AI agents: `list_projects`, `get_project`, `get_component_config`, `update_project_config`, `sync_storefront`, `list_blocks`, `get_block_source`. Discoverable via consent-gated `~/.claude.json` registration on extension activation, and via project-local `.mcp.json` written during project creation.
- **Adobe AEM skills auto-installed when EDS Storefront is chosen.** `skillsWriter.ts` copies `aem-block-developer`, `aem-content-modeler`, `aem-dropin-developer`, `aem-project-manager`, `aem-researcher`, `aem-tester` from `node_modules/@adobe-commerce/commerce-extensibility-tools/dist/` into `.claude/skills/aem-*` when the component declares an `aiSkillBundle` in its definition.
- **`AdobeMcpUpdateChecker`.** `Demo Builder: Check for Updates` now surfaces updates to `@adobe-commerce/commerce-extensibility-tools` alongside the existing fork / template / component / add-on sources. Applying the update runs `npm update` in the storefront and re-runs `generateAIContextFiles` so the skill bundle stays in sync.
- **Kebab "Copy prompt" item** on every prompt card in the Prompt Library. Dispatches the `copyAiPrompt` handler, which writes the prompt body to the clipboard and shows a brief confirmation toast. Logs the prompt name only — never the body.
- **Store discovery cascade auto-selection.** When website/storeGroup/storeView discovery returns a single deterministic option at any level, the wizard auto-selects it and advances to the next level. EDS handler refactor consolidates the discovery flow into a single `handleDiscoverStoreStructure` handler.
- **ADR-004: Claude Code (CLI) as the AI Harness** (`docs/architecture/adr/004-claude-code-harness.md`). Documents the harness decision and three amendments: workspace anchoring (2026-05-24b), terminal prompt delivery via launch arg (2026-05-26), and extension-surface retirement (2026-05-27).

### Removed

- **Extension surface for Claude Code.** `demoBuilder.ai.surface` and `demoBuilder.ai.dockToRight` settings removed. The wand QuickPick requires inserting prompts into the LIVE chat; the Claude Code VS Code extension's URI handler opens a new chat on every launch, with no public API to inject into the running one — that contract can't work with a per-launch-new-chat surface. The terminal surface is now the only path. Also removed: the `vscode://anthropic.claude-code/open` URI launch, `claudeCode.preferredLocation` synchronization, every once-ever flag/dialog tied to the extension surface (extension-detected offer, mismatch warning, sessions-browser auto-open, first-launch dialog, dock-to-right offer), the `handleBrowseClaudeSessions` and `handleMarkSessionsBrowserAutoShown` handlers, and the `migrateHarnessSetting` migration code. `verify-ai-setup` no longer carries `extensionInstalled`, `onboardingCompleted`, `sessionsBrowserAutoShown`, or `surface` fields. `resetAiOnboardingState` clears the legacy flag/setting keys so users upgrading from any prior Demo Builder version don't carry dead state forward.
- **Dormant VS Code chat participant.** `vscodeChatParticipant.ts` and its tests deleted.
- **External MCP entries from generated configs.** Adobe-hosted MCPs (DA.live, Commerce, AEM Content) live at Claude Code's session level via its catalog; Demo Builder's per-project entries duplicated those (with worse, unauthenticated versions) and were not loading.
- **`.cursor/mcp.json` and `.codex/mcp.json`** generation. Cursor and Codex read `.mcp.json` natively.
- **Skill templates trimmed from 13 to 3.** Removed `add-block`, `add-custom-block`, `configure-eds`, `create-block`, `edit-block-library`, `modify-content`, `update-styles`, `use-aem-content-mcp`, `use-commerce-dev-mcp`, `use-da-live-mcp`. EDS storefront skills now come from Adobe's `@adobe-commerce/commerce-extensibility-tools` package.
- **Unused `helixToken` plumbing.** Removed once the only consumer (aem-eds MCP entry) was removed.
- **Settings hard-deleted**: `demoBuilder.ai.externalMcpServers`, `demoBuilder.ai.mcpConfigTargets`, `demoBuilder.ai.includeBoilerplateSkills` (no soft deprecation).

### Changed

- **`AGENTS.md` replaces `.claude/CLAUDE.md`** as the primary AI context file — universal across Claude / Copilot / Cursor / Gemini. Root `CLAUDE.md` and `.claude/CLAUDE.md` become one-line `see @AGENTS.md` pointer files.
- **`BaseCommand.createTerminal(name, cwd?, location?)`** extended with an optional third `location` argument so callers can request editor-area terminals (used by the chat-first flow). Backward-compatible — existing call sites without `location` keep panel placement.

### Refactored

- **Shared sanitization module.** `sanitizeTemplateValue`, `sanitizeGithubSlug`, and `sanitizeUrl` extracted from `aiContextWriter.ts` and `skillsWriter.ts` into `src/features/project-creation/services/sanitization.ts`.
- **Oversized AI test file splits.** `AiOverviewScreen.test.tsx`, `aiHandlers.test.ts`, and `mcpServer.test.ts` split along describe boundaries using a `*.testUtils` + per-aspect-sibling pattern. The 7 remaining non-AI oversized test files are tracked in `.rptc/backlog/2026-05-27-oversized-test-file-splits.md`.

### Security

- **`sanitizeUrl` protocol + bracket validation.** `aiContextWriter.ts` validates Commerce and MCP endpoint URLs against an `https://` allowlist before interpolating them into Markdown output. Non-https values (e.g. `javascript:`) are replaced with `[invalid URL]`. URLs that pass the `https://` check are additionally stripped of `]()` characters to prevent Markdown link injection.
- **Full symlink-resistant path traversal protection in MCP server.** `assertInsideProject` canonicalizes both `projectPath` and the resolved path via `fs.realpath` before the prefix check. Prevents symlink-based escapes from the project directory; fixes legitimate access failures on macOS where `/tmp/proj` resolves to `/private/tmp/proj`.

### Migration Notes

- **Existing projects.** Open the project, then trigger `Regenerate AI files` (reached from the dashboard's `AiSkillsModal` via the "View Skills" link, or the palette) to migrate to the new shape (AGENTS.md + pointer files + slim MCP config + 3 lifecycle skills + Adobe AEM bundle if applicable). Demo Builder does not delete legacy AI files — remove `.cursor/mcp.json`, `.codex/mcp.json`, and any dropped skill files from `.claude/skills/` manually.

### Known Limitations

- **MCP config files contain machine-specific paths.** `.claude/mcp.json` and `.mcp.json` hold absolute paths to the Demo Builder MCP server binary. These files are automatically added to `.gitignore`. No credentials are written to these files — only machine paths.
- **PostToolUse hook env var unverified.** The generated git-sync hook reads `$CLAUDE_TOOL_INPUT` for the modified file path. This variable name has not been confirmed end-to-end with Claude Code hooks. If wrong, the hook silently does nothing.

## [1.0.0-beta.110] - 2026-04-14

### Changed
- **Build: webpack → esbuild for webview bundles**: Replaces webpack's 4-bundle code-split output (runtime + vendors + common + feature) with a single self-contained esbuild IIFE bundle per webview entry point. VSIX size drops from 15.3 MB to 5.8 MB (62% reduction, 528 files → 68 files).

## [1.0.0-beta.109] - 2026-04-13

### Fixed
- **Config Service lookup key**: `buildSiteConfigParams` now uses DA.live org/site as the Configuration Service lookup key instead of GitHub repo identifiers. The da.live editor resolves preview URLs from the DA.live site path; using GitHub identifiers caused "invalid fstab" errors when the site name differed from the repo name.
- **fstab input validation**: `generateFstabContent` validates `daLiveOrg` and `daLiveSite` for characters unsafe in URL path segments (newlines, whitespace, colons) before constructing the mountpoint URL.
- **EDS Reset bounded loop**: Replaced `while(true)` with `while(pipelineAttempt <= MAX_REAUTH_ATTEMPTS)` to make the DA.live re-auth retry bound explicit.

### Security
- **SSRF protection in useAutoStoreDetect**: URL protocol is validated to `http:` or `https:` before forwarding `baseUrl` to store discovery, preventing Server-Side Request Forgery via `file://`, `ftp://`, or other non-HTTP schemes in component config fields.
- **SSRF protection in extractResetParams**: `repoOwner`, `repoName`, `daLiveOrg`, and `daLiveSite` are validated against the slug allowlist (`^[a-zA-Z0-9_-]+$`) before they reach Helix Admin API and DA.live URL construction. Invalid slugs return `CONFIG_INVALID` without making any outbound request.

### Refactored
- **EDS Reset static imports**: Removed all 24 dynamic `await import()` calls in `edsResetService.ts`, replacing them with static top-level imports for tree-shaking and load-time consistency.
- **EDS Reset helper extraction**: Decomposed oversized functions in `edsResetService.ts` into focused private helpers: `reinstallBlockLibraries`, `collectLibrarySources`, `installWithBlockLibraries`, `installInspectorOnly`, `publishConfigAndRegisterSite`, `handlePipelineAuthRetry`, `runContentPipeline`, `finalizeReset`, and `assertValidGitHubSlug`.
- **EDS Reset mesh helpers extracted**: `redeployApiMesh` and `deployMeshAndPersist` moved to `edsResetMeshHelper.ts`, keeping `edsResetService.ts` within a manageable size and isolating the Adobe I/O auth re-validation logic.
- **EDS Reset params extracted**: `EdsResetParams`, `EdsResetProgress`, `EdsResetResult`, `ExtractParamsResult`, `assertValidGitHubSlug`, and `extractResetParams` moved to `edsResetParams.ts`. Re-exported from `edsResetService.ts` for backward compatibility.
- **EDS Reset repo helpers extracted**: `resetRepoToTemplate`, `reinstallBlockLibraries`, `collectLibrarySources`, `installWithBlockLibraries`, `installInspectorOnly`, and `fetchPlaceholderFiles` moved to `edsResetRepoHelper.ts`. Brings `edsResetService.ts` to ~330 lines.
- **`mapPipelineProgress` extracted**: Inline progress-mapping callback in `runContentPipeline` extracted to a named function.
- **`handleResetError` extracted**: Catch block in `executeEdsReset` extracted to a named function, trimming the function under 50 lines.
- **ArchitectureModal Extraction**: Extracted step content into `ArchitectureStepContent` and `BlockLibrariesStepContent` sub-components. Extracted modal state management into `useModalState` hook. Generalized step navigation from hardcoded 2-step to computed N-step sequence.
- **useComponentConfig Narrow Interface**: Replaced `WizardState` dependency with specific props (`selectedStack`, `componentConfigs`, `packageConfigDefaults`), making the hook reusable outside the wizard context.
- **Prop Grouping**: Grouped related props into domain-specific objects (ArchitectureStepContent) to reduce prop drilling.
- **BlockLibrariesStepContent prop rename**: Event handler props renamed from `handle*` to `on*` convention (`onBlockLibraryToggle`, `onCustomLibraryToggle`, `onOpenCustomSettings`).

### Added
- **storeFieldHelpers**: Shared helpers (`isWebsiteCodeField`, `isStoreCodeField`, `CONNECTION_FIELDS`, `STORE_GROUP_IDS`) for routing store config field rendering across components.
- **useAutoStoreDetect**: Hook that watches connection fields and triggers store discovery automatically when all required fields are filled.
- **`storeDiscoveryData` on `WizardState`**: New optional field (`storeDiscoveryData?: CommerceStoreStructure`) persists the discovered store structure (websites, store groups, store views) across wizard steps.
- **`currentComponentConfigs` on `SharedState`**: New optional field (`currentComponentConfigs?: ComponentConfigs`) syncs user-entered component config values from the webview to the extension host, enabling credential access during store discovery without re-passing them in each postMessage payload.
- **Customer Group removed from `optionalEnvVars`**: Removed `ACCS_CUSTOMER_GROUP` and `ADOBE_COMMERCE_CUSTOMER_GROUP` from component service group `optionalEnvVars` lists. The storefront auth dropin manages customer group headers at runtime.

### Changed
- **Connect Commerce wizard step**: Replaces "Settings Collection" with a simplified single-column layout and progressive disclosure. Repositioned after Adobe auth steps so Commerce connection happens right after workspace selection. Shows for all flows (no longer conditional on `showWhenNoStack`).

## [1.0.0-beta.108] - 2026-03-25

### Changed
- **AEM Assets Enabled by Default**: EDS storefronts now default to AEM Assets enabled (`commerce-assets-enabled: true`). All demo backends have AEM Assets integration configured; users can disable in Configure if needed.
- **Customer Group Field**: Removed auto-populated default hash from `ACCS_CUSTOMER_GROUP` and `ADOBE_COMMERCE_CUSTOMER_GROUP`. The storefront auth dropin handles customer group headers automatically at runtime. Field remains optional for B2B Shared Catalog edge cases.

### Added
- **Multi-Site Research Documentation**: Comprehensive design research for multi-site storefront feature including repoless architecture, Commerce store structure discovery, per-site configuration, and content data management (`docs/research/`).

## [1.0.0-beta.107] - 2026-03-24

### Added
- **Optional API Mesh**: API Mesh is now optional and driven by demo package configuration. Each package declares `requiresMesh` (true/false/'optional'). Storefronts can override at the storefront level.
- **Mesh Toggle in Architecture Modal**: Custom projects show an "Include API Mesh" toggle. Curated packages respect their definition without user choice.
- **Conditional Wizard Steps**: Adobe Auth, I/O Project, and Workspace steps are hidden when no mesh is selected. Timeline updates live as the user toggles mesh.
- **Merged Config Generator**: `mergeComponentConfigs()` replaces component-specific lookups. The config generator no longer knows which component owns which env var.
- **Tests for Mesh Resolution**: 8 tests for `getResolvedMeshRequirement`, 8 tests for `mergeComponentConfigs`.

### Changed
- **Progress Step Refactoring**: Deployment phases split from 5 → 7 (repository, storefront-code, code-sync, site-config, content, block-library, publish). Reset steps expanded from 6-7 → 11-12.
- **Wizard Step Rename**: "Deploy Mesh" → "Create Project" throughout the wizard.
- **Review Step Layout**: Project Configuration spans full width when no Adobe I/O section.
- **Storefront Setup Payload**: Now includes explicit `dependencies` field for mesh-aware auth decisions.

### Fixed
- **Inspector Tagging**: Fixed `SDK_CONFIG is not defined` — was referencing wrong constant (`SDK_SOURCE`).
- **Block Doc Page 404s**: Downgraded from warning to debug level (expected for blocks without CDN doc pages).
- **ConfigService 409**: Logged at info level instead of error (handled scenario: delete + re-create).
- **Phase 5 Config Sync**: Removed `meshState.endpoint` guard that blocked config.json push for meshless projects.
- **Review Step Continue**: Adobe I/O selections only required when mesh is in dependencies.
- **BrandGallery Truthy Bug**: `pkg.requiresMesh` used strict `=== true` instead of truthy check that matched `'optional'`.
- **Stack Change Propagation**: `handleStackSelect` now propagates optional deps immediately for live timeline updates.

## [1.0.0-beta.106] - 2026-03-18

### Added
- **Custom Block Library Docs**: Documentation for creating standalone block libraries compatible with the Demo Builder (`docs/systems/custom-block-libraries.md`)

### Fixed
- **Folder Mapping Re-Auth**: 401 responses from the Configuration Service now throw `DaLiveAuthError`, triggering the existing mid-pipeline re-auth prompt instead of silently skipping folder mapping. Non-auth failures are logged at error level with a visible UI warning about product detail page impact.
- **CLI Warning Stripping**: `aio` CLI upgrade warnings mixed into stdout no longer break JSON parsing. Uses JSON-character filtering to keep only parsable content, with stderr fallback for CLI versions that write JSON to stderr.
- **Org Mismatch Detection**: When the CLI org context doesn't match the authenticated org (causing 403 on project listing), the error message now tells the user to run `aio console org select` instead of showing the generic "Failed to load projects."
- **Case-Insensitive Org Matching**: Organization name resolution now uses case-insensitive, whitespace-trimmed matching with ID fallback, preventing silent fallback to a broken org context.
- **Inspector SDK Lint Errors**: Vendored `scripts/demo-inspector-sdk/` files are now added to `.eslintignore` during storefront setup, preventing GitHub Actions build failures.
- **Custom Block Library Settings Sync**: Adding a custom block library via VS Code settings while the Architecture Modal is open now immediately shows the new library without needing to close and re-open the modal.

## [1.0.0-beta.100] - 2025-03-13

### Added
- **Upstream Sync System**: Detect and sync forked source repos with their upstream via GitHub merge-upstream API
- **Add-on Update Detection**: Block library and Demo Inspector SDK commit-SHA comparison against source HEAD
- **B2B Feature Packs**: Bundle blocks, config flags, initializers, and dependencies into installable feature packs
- **B2B Commerce Demo Package**: New B2B demo package with addon and config flag injection
- **Isle5 Demo Package**: Branded demo package with native block library
- **Demo Inspector SDK Vendoring**: Vendor SDK files and tagging script into storefront at project creation
- **Block Library Selection UX**: Multi-step architecture modal for selecting block libraries during project creation
- **Global Block Library Selection**: Dynamic block discovery with settings-based custom library support
- **Config-Driven Block Collections**: Block collection source and handler extraction driven by configuration
- **DA.live Bookmarklet Setup**: New command for DA.live bookmarklet setup with extracted `openUrl` utility
- **Content Patches**: ACCS content patch to replace Orchard7 with Orchard1-1 on index page
- **Auth Route Stub Pages**: Create stub pages for auth routes missing from source content
- **Column-Based Brand Tiles**: Column layout with compact expansion and settings sync for brand selection

### Changed
- **Block Library Sources**: Switched Isle5 source from fork to upstream repo; renamed library IDs for clarity
- **Authentication Performance**: Update `console.where` cache instead of clearing after entity selection
- **Projects Dashboard**: Sort projects alphabetically for deterministic grid ordering
- **Update Pipeline**: Shared `githubApiClient` module centralizes GitHub API calls across all update services
- **Update Pipeline**: Removed dead code and simplified update service internals

### Fixed
- **EDS Content Copy**: Filter CDN doc page copy to installed blocks only; fall back to CDN index when DA.live list API returns 0 files
- **EDS Content Enumeration**: Enumerate content via DA.live list API to include nav/footer fragments
- **EDS Block Installation**: Preserve template blocks during block library installation; merge component-models.json and component-filters.json
- **EDS Block Deduplication**: Deduplicate blocks across multiple block libraries
- **EDS Rate Limits**: Batch preview DELETEs and handle 429 rate limits from Helix Admin API
- **EDS Auth Recovery**: Add DA.live re-auth recovery to EDS reset pipeline and DaLiveAuthError recovery to phases 2-3
- **EDS DA.live Token**: Use DA.live token for all DA.live API calls in content setup
- **EDS Helix DELETE**: Use DA.live Bearer token for DELETE operations to bypass "source exists" restriction
- **EDS Patch Fetches**: Deduplicate concurrent external patch fetches
- **EDS Navigation**: Patch nav registration link to match create-account path
- **EDS DA.live Org**: Sync DA.live default org into input field on async arrival
- **EDS Block Doc Pages**: Add section wrapper to block doc pages and always overwrite; copy pages from content sources for Custom projects
- **EDS CDN Probe**: Probe customer auth pages in CDN fallback content copy
- **EDS Mid-Pipeline Auth**: Add mid-pipeline auth guard for mesh redeployment and fix config service registration
- **Updates**: Decouple npm install from buildScript gate and check extraction exit code
- **Updates**: Add repoUrl fallback for components not in components.json
- **Brand Tiles**: Preserve JSON config order for brand tiles instead of alphabetical sort
- **B2B**: Rename B2B brand card to "B2B Boilerplate"

### Security
- **Helix API Keys**: Migrate from globalState to SecretStorage

### Refactored
- **Authentication**: Decompose entity services, simplify perf tracking, consolidate DaLiveAuth; consolidate auth guards and remove dead code
- **EDS**: Remove bulk unpublish dead code and simplify to page-by-page DELETE; remove unused selectedAddons parameter
- **Inspector**: Remove git submodule infrastructure (dead code after inspector removal); remove demo inspector from extension and clean up stale docs
- **ESLint**: Resolve all ESLint errors and warnings across codebase

### Performance
- **EDS Unpublish**: Batch Helix live partition unpublish with concurrency 5

### Fixed (Prior Unreleased)
- **Prerequisites Node.js Installation**: Fixed fnm list ENOENT errors by adding shell context to all fnm list commands
- **Prerequisites UI**: Added milestone substep display showing "(Step X of Y)" for multi-step operations with progress milestones
- **Authentication Flow**: Fixed fnm ENOENT errors during environment setup when VS Code launched from Dock (non-terminal launch)
- **Adobe CLI Commands**: Fixed all aio commands (auth, config, org/project selection, mesh deployment) failing with ENOENT when VS Code launched from Dock

## [1.3.0] - 2025-01-10

### Added
- **Enhanced Debugging System**: 
  - New diagnostics command (`Demo Builder: Diagnostics`) for comprehensive system analysis
  - Dual output channel architecture: "Demo Builder: Logs" for user messages, "Demo Builder: Debug" for detailed diagnostics
  - Command execution logging with stdout, stderr, exit codes, and timing information
  - Environment variable and PATH logging for troubleshooting platform-specific issues
  - Export debug log capability for sharing diagnostic reports
- **Adobe Authentication Debugging**:
  - Detailed logging of `aio config` commands and responses
  - Token expiry parsing with step-by-step debugging
  - Browser launch command tracing with environment context

### Changed
- **Adobe Setup UX Improvements**:
  - Workspace selection now auto-advances to next step (consistent with project selection behavior)
  - Authentication success message always displays for 2 seconds on initial load
  - Removed redundant "Loading your projects..." text from authentication success screen
  - Redesigned "Ready to proceed" section to match UI consistency (removed green background)
- **Unified Logging System**:
  - Consolidated from 4 output channels to 2 clean channels
  - Logger class now wraps DebugLogger for backward compatibility
  - ErrorLogger uses unified DebugLogger while maintaining status bar features
  - viewStatus command uses main logger instead of creating separate channel

### Fixed
- **Adobe Setup Flow Issues**:
  - Fixed inconsistent auto-advance behavior between project and workspace selection
  - Fixed authentication success message not showing when already authenticated on initial load
  - Eliminated double-loader display after authentication success
  - Fixed "Ready to proceed" styling to be consistent with rest of UI
- **Logging System Issues**:
  - Eliminated duplicate "Demo Builder" output channels
  - Fixed ErrorLogger creating redundant output channel
  - Resolved Logger class initialization issues

## [1.2.0] - 2025-01-09

### Added
- **Unified Progress Tracking System**: Real-time progress bars during prerequisite installation with different strategies:
  - Exact progress parsing for fnm (shows actual download percentages)
  - Milestone-based progress for brew and npm installations
  - Synthetic time-based progress for operations without output
  - Immediate completion for fast operations
- **Comprehensive Documentation System**: 
  - Created detailed prerequisites system documentation (`docs/systems/prerequisites-system.md`)
  - Added documentation index (`docs/README.md`) for better navigation
  - Organized docs into architecture/, systems/, development/ directories
- **Build Automation**: 
  - Added `postinstall` script for automatic compilation after `npm install`
  - New `npm run setup` command combining install and compile steps
  - Ensures consistent builds across different development environments
- **Centralized CSS System**: Created `custom-spectrum.css` with 850+ lines of reusable CSS classes for React Spectrum components
- **Class Name Utilities**: Added `classNames.ts` utility module with `cn()` function for composing CSS classes
- **Per-Node-Version Prerequisites**: Support for installing prerequisites in specific Node.js versions
- **Prerequisite Continuation**: Ability to continue prerequisite checking from a specific index after installation
- **Version-to-Component Mapping**: Shows which components require which Node.js versions during prerequisite checking
- **Enhanced Sub-Prerequisites Display**: Sub-prerequisites (plugins) now only appear when actively checking or completed
- **Graph-Based Dependency Architecture**: Documented future architecture for flexible entity relationships (see `docs/architecture/graph-based-dependencies.md`)

### Changed
- **Complete Style Migration**: Migrated all 118+ inline `UNSAFE_style` declarations to `UNSAFE_className` with CSS classes
- **Prerequisite Status Messages**: Changed initial status from "Checking version..." to "Waiting..." for unchecked prerequisites
- **Sub-Prerequisites UI**: Removed bullet points from sub-prerequisites, maintaining indentation for hierarchy
- **Improved Scrolling**: Better auto-scroll behavior during prerequisite checking with proper alignment
- **Prerequisites JSON Structure**: Enhanced with `perNodeVersion`, `plugins`, and component requirements support
- **Documentation Structure**: Reorganized all documentation for better discoverability and maintenance

### Fixed
- **Progress Bar Display**: Fixed unified progress data not being passed to UI state, preventing progress bars from showing
- **Prerequisite Check Flow**: Fixed issue where Git prerequisite showed "Checking version" while waiting
- **Plugin Display Logic**: Fixed premature display of "not installed" status for unchecked plugins
- **Scroll Positioning**: Fixed last prerequisite item visibility during checking
- **fnm Shell Configuration**: Automatically configures shell profile after fnm installation (adds to .zshrc/.bashrc)
- **Cross-System Consistency**: Fixed issues where extension wouldn't work on different systems due to missing build artifacts

### Technical Improvements
- **Maintainability**: All styles now centralized in CSS files rather than scattered inline styles
- **Performance**: CSS classes cached by browser, reducing re-render overhead
- **Type Safety**: Added TypeScript interfaces for prerequisite plugins and enhanced checking
- **Code Organization**: Created dedicated utilities directory for shared functions

## [1.0.0] - Previous Release

Initial release of Adobe Demo Builder VS Code Extension.
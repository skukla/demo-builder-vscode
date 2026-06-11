# Backlog — Future Work

Plans for features, fixes, and improvements that aren't active yet. Each file is a self-contained plan with the context, scope, and kickoff prompt needed to pick the work up later — possibly months later, possibly by a different agent.

This directory is the **single source of truth** for "what's next." If it belongs here it should not also live in TODO files, the CHANGELOG, or scattered code comments.

## Conventions

- **Shape**: a single file `<topic-slug>.md` for an idea, OR a directory `<topic-slug>/` for an already-structured RPTC plan that's paused (overview + step files).
- **Filename**: `<topic-slug>` or `YYYY-MM-DD-<topic>` — date prefix when the deferral date matters (e.g., the item was scoped during an audit and you want the snapshot date visible).
- **Required sections** (for single-file entries): Provenance · Goal/Scope · Execution plan · Constraints · Kickoff prompt.
- **Promotion**: when an item becomes active, move it to `.rptc/plans/<topic-slug>/`.

## Lifecycle

```
draft  →  ready  →  active  →  shipped/dropped
  │         │          │            │
  │         │          │            └─ move the file to .rptc/complete/ (archive;
  │         │          │               git history holds the full implementation record)
  │         │          └─ move to .rptc/plans/<topic-slug>/ (multi-step) OR
  │         │             promote in place when starting work
  │         └─ ready for execution; pick up any time
  └─ idea capture, may still change shape
```

## Active backlog

### Multi-locale storefront — Phase 1 ([`2026-05-19-multisite-multilocale.md`](2026-05-19-multisite-multilocale.md))

Phase 1 implementation plan for serving multiple locales (and eventually multiple brands) from a single Demo Builder project. Repurposes the wizard `settings` step as **Business Structure** with progressive sections for Connection, Primary Store, Regions & Locales, and (Phase 2, reserved) Additional Brands. Covers PaaS, ACCS, and the ACO addon. Research base: [`docs/research/2026-05-19-multisite-multillocale-research.md`](../../docs/research/2026-05-19-multisite-multillocale-research.md). Architecture seam: [ADR-003](../../docs/architecture/adr/003-multisite-architecture-seam.md). Phase 2 (repoless multi-brand) deferred.

### Structural baseline ([`2026-05-21-structural-baseline.md`](2026-05-21-structural-baseline.md))

Numbers-first measurement pass to map the codebase's actual size, complexity, and coupling after ~1 year of AI-assisted development. **Run after Cycle D ships.** Produces a report that informs subsequent trim cycles.

### Legacy / soft-deprecation cleanup ([`2026-05-21-legacy-soft-deprecation.md`](2026-05-21-legacy-soft-deprecation.md))

~30 inventoried items across `src/` — `@deprecated` JSDoc, "Kept for backward compatibility" type variants, deprecated API aliases. Spans many features. **3 zero-caller deletions are ready any time** if a small trim task is wanted between cycles. Full execution plan in batches L1–L5.

Downstream of the structural baseline — the baseline will probably surface higher-leverage trim targets, and the legacy items may rank lower than they appear today.

### Helix `previewCode` race ([`2026-05-21-helix-previewcode-race.md`](2026-05-21-helix-previewcode-race.md))

Spurious `400 Bad Request` warnings from `HelixService.previewCode` fire when the call lands before Helix's code mirror has indexed a just-pushed commit. Non-fatal (caught and logged), but noisy in the Logs channel during project creation. Single-batch fix: retry-with-backoff on `400` only, 3 attempts (1s/3s/7s). Self-contained; pick up any time.

### Monorepo independent release tracking ([`monorepo-independent-release-tracking/`](monorepo-independent-release-tracking/overview.md))

Full RPTC plan (overview + 3 steps) drafted 2025-12-16, never executed. Adds tag-prefix support (`backend@1.0.0`, `optimizer@2.0.0`) so multiple Adobe Commerce components in a single repo can have independent release lifecycles. Paused while the AI Layer Pivot cycles took priority; pick up when monorepo components become a real need.

### Oversized test-file splits — non-AI areas ([`2026-05-27-oversized-test-file-splits.md`](2026-05-27-oversized-test-file-splits.md))

7 test files exceed the 500-line `max-lines` rule (EDS services, components/dashboard, project-creation). Split them along `describe` boundaries using the `*.testUtils` + per-aspect-sibling pattern established for the AI tests on `feature/chat-first-ai`. Behavior-preserving. The 3 AI-adjacent files were already split; all test lint **errors** are already fixed — these are the remaining `max-lines` **warnings**. `blockCollectionHelpers.test.ts` (1216) is the priority. Self-contained; pick up any time.

### EDS site-scraping capability ([`2026-05-28-eds-site-scraping.md`](2026-05-28-eds-site-scraping.md))

Demo Builder ships a scraping capability for client URLs → working EDS blocks at 90-95% visual fidelity. Two workflows: Mod Agent (browser, best quality, semi-automated handoff via GitHub) and Playwright MCP (fully automated, IDE-only, lower ceiling). User picks at scrape time. **Gated on Mod Agent access** — Steve's request filed 2026-05-28; users will need to request via Slack `#aem-agent-experience-modernization-users` (~10 min provisioning). Phase 1 is ~1 day of config + markdown; Phase 1.5 (GitHub OAuth to programmatically install AEM Code Connector + AEM Code Sync apps) is ~1-2 weeks of real engineering — defer until Phase 1 validates and Workflow A friction is observed firsthand. Phase 2 adds Claude Code subagents for gap areas Mod Agent doesn't cover (commerce dropins, demo data, header/footer, auth variants, visual diff). All in `demo-builder-vscode` — no separate package.

### Decouple project from VS Code workspace folder ([`2026-05-30-decouple-project-from-workspace.md`](2026-05-30-decouple-project-from-workspace.md))

Switching projects from the home grid reloads the workspace folder (`vscode.openFolder`), which reactivates the extension host. The auto-update throttle (shipped 2026-05-30) silences the most visible re-execution, but the cold-load is still architectural. Goal: render the picked project's dashboard in-place without a window reload; anchor the workspace only when a workspace-requiring action (terminal, AI Chat, MCP) fires. Multi-day work — touches `StateManager`, MCP server lifecycle, terminal/AI Chat anchoring, file watchers. Scope guardrails and full audit checklist in the plan file.

### Workspace-independent entry point for global MCP ops ([`2026-05-30-global-mcp-entry-point.md`](2026-05-30-global-mcp-entry-point.md))

Filed when the in-extension MCP migration retired the standalone binary + global `~/.claude.json` registration. The full tool surface is reachable from inside any open project, but the one awkward case is invoking a genuinely global op (`create_project`, `list_projects`) when the user is **not** inside a project workspace (brand-new user, or `claude` from an arbitrary directory). No socket exists, because the in-extension server is per-workspace. Proposed work: proxy discovery mode for the stdio↔socket forwarder (enumerate live sockets in `/tmp/demo-builder-mcp/`, connect to a running extension window, or exit cleanly with a "open Demo Builder in VS Code first" message); plus a global `~/.claude.json` entry pointing at the proxy. Self-contained; pick up any time.

### AI Ready: surface skills drift as amber ([`2026-06-01-ai-ready-skills-drift.md`](2026-06-01-ai-ready-skills-drift.md))

Skills are scaffolded into `.claude/skills/` at project creation; new skill templates shipped by the extension never reach existing projects until "Regenerate AI Files" is invoked manually. Users have no signal of the drift until an agent fails to load an expected skill mid-task. Goal: detect missing (and optionally outdated) skill files in the verify path, surface as a new yellow "Skills outdated" branch on the AI Ready badge with the drift list rendered in `AiCapabilitiesModal`. Single-day work — detector in `skillsWriter.ts`, one branch in `useDashboardStatus.ts` `aiReady` memo, list-rendering in the modal. First slice: missing files only; hash-based content drift deferred.

### Progress reporting for "Regenerate AI files" ([`2026-06-02-regenerate-ai-files-progress.md`](2026-06-02-regenerate-ai-files-progress.md))

The dashboard's "Regenerate AI files" action swaps in a static full-height spinner with fixed text — no per-step feedback during the slow part (a storefront `npm install`), so it looks stalled. Reuse the wizard's existing `ProgressTracker` + `LoadingDisplay` slice (NOT the heavier `ProgressUnifier`) to emit per-step `currentOperation` / `progress` / `message` events through the dashboard webview channel. **Sequencing:** queued after the home-AI Chat phase — that phase may add a "refresh the home context" step to regeneration, so build the progress UI once over the final step set rather than revise it.

### Retire `legacyLookupKey` infrastructure — DA/repo unification cleanup ([`2026-06-08-rename-existing-da-content-to-repo-name.md`](2026-06-08-rename-existing-da-content-to-repo-name.md))

The user-facing piece — wizard always producing matching names + auto-migration on reset for existing mismatched storefronts — shipped in commits `23efd831` and `b2169699` (2026-06-08). This entry is now scoped to the follow-up cleanup batch: retire `SiteRegistrationParams.legacyLookupKey`, the `cleanUpLegacyRegistration` branch in `ConfigurationService.updateSiteConfig`, the fourth argument to `buildSiteConfigParams`, and the `daLiveSite` field on `eds-storefront` manifest metadata. Single-day deletion-only commit. Pick up after telemetry confirms no `storefrontNameMigration` activations across the SC team for 30+ days (every active storefront has been reset on a post-migration build).

### Jest worker process force-exits during parallel test runs ([`2026-06-09-jest-worker-force-exit.md`](2026-06-09-jest-worker-force-exit.md))

Broad Jest sweeps emit "A worker process has failed to exit gracefully and has been force exited" after all tests pass. `--detectOpenHandles` reports zero open handles. Pre-existing — visible on multiple branches today including PR #44 merge verification, BYOM Phase 1 ship, and the auth-fix branch. Likely smoking gun: `setTimeout(..., 180_000)` in `useMeshDeployment.ts:211` that may not be cleared when its test unmounts. ~30 min to investigate, ~10 min to fix if confirmed. Medium priority — not blocking, but the noise floor obscures genuine new leakage from future work.

### Rebuild BuildRight on the thin-layer model ([`2026-06-10-buildright-eds-disposition.md`](2026-06-10-buildright-eds-disposition.md))

Spun out of the thin-layer storefront evaluation (resolved 2026-06-10 — [ADR-006](../../docs/architecture/adr/006-thin-layer-storefront-customization.md) retired the two citisignal forks in favor of canonical + a code-patches layer). **Disposition decided 2026-06-10 (owner): complete rebuild** — no audit or migration of the existing `buildright-eds` codebase. Express BuildRight as a Demo Builder package on canonical (branded block library + brand CSS + DA content) using the ADR-006 mechanisms. Gated on the ADR-006 implementation existing first; the old repo archives when the rebuild ships.

### PDP empty-data redirect to native /404 ([`2026-06-09-pdp-graceful-empty-state.md`](2026-06-09-pdp-graceful-empty-state.md))

Deferred during BYOM PDP routing Phase 1. When an SC deletes a SKU, the cached PDP URL still serves the template and the drop-in queries Commerce, gets nothing back. **Originally framed as "custom Product not available message"; reframed same day** — the honest UX for a deleted SKU is the storefront's native `/404`: same chrome, same status semantics, browser URL bar updates to reflect reality. Detect empty Commerce data → `window.location.replace('/404')`. Cleanup tooling (Refresh PDPs action, action-side telemetry) was rejected as overkill; redirect handles the visible UX without that infrastructure. **Investigate first**: check if `@dropins/storefront-pdp` exposes an empty-state callback; building a DOM-polling wrapper without checking is the wrong order. Phase 0 investigation 15–30 min, implementation 0–2 h depending on what we find. Lives as a Demo Builder code patch (per ADR-006, 2026-06-10 — the thin-layer evaluation retired the forks, so storefront-side behavior changes ship via the code-patches layer).

### Pre-existing SOP-scan findings — code-pattern cleanup pass ([`2026-06-10-sop-pre-existing-patterns.md`](2026-06-10-sop-pre-existing-patterns.md))

Inventory of ~20 pre-existing code-pattern violations surfaced by an SOP scan run between Step 5a and the patches-repo workstream on the ADR-006 thin-layer initiative. The one ADR-006-related finding (`templateUpdateChecker` nesting from Step 3) was fixed inline in `9b78c9dc`; this entry collects everything else so it doesn't get lost. Four small batches, ~2 hours total: S1 `helixService.ts` (deep chains + `Object.keys` patterns in `parseBulkJobResponse`), S2 `executor.ts` + `featurePackInstaller.ts` (componentInstances `Object.keys || {}` duplicates), S3 nested ternaries in `GitHubServiceCard.tsx` + `DaLiveServiceCard.tsx` (identical 4-level shape, parallel extraction), S4 long validation chains + one magic timeout. Behavior-preserving; pick up any time the codebase wants a refresh pass. NOT in scope: `daLiveContentOperations` god-file decomposition and `executeEdsPipeline` complexity 27 (both belong to the structural baseline cycle).

### DaLivePermissions log message chops the owner name ([`2026-06-10-dalive-permission-log-typo.md`](2026-06-10-dalive-permission-log-typo.md))

Surfaced by the ADR-006 Step 5b smoke test. The `[DaLiveConfig] Granting access to <user> for <owner>/<repo>` info line drops the first character of the owner — printed `ukla/citisignal-b2b` instead of `skukla/citisignal-b2b`. Cosmetic only; the actual permission grant works (subsequent log lines correctly use `skukla`), so the bug is a string-slice in the log path, not in the API call. Single-file, single-line fix; ~5 minutes including a one-line test assertion. Pick up any time.

### Engine-aware AI launch + detect + opt-in install ([`claude-cli-detection-and-install/`](claude-cli-detection-and-install/overview.md))

**⚠️ Blocked on [`2026-06-11-prereqs-architecture-reframe.md`](2026-06-11-prereqs-architecture-reframe.md).** The plan as drafted puts the Claude install surface on the per-project `AiCapabilitiesModal`, which doesn't reach an AI-first user before they have a project. A follow-on conversation identified the real issue: nearly every "project prerequisite" today is actually extension-wide, and there's no global surface for tools at that scope. Owner decided to do Path A (reframe the prereq architecture) rather than ship Claude through a parallel global surface. Once the reframe lands, Claude becomes the first Tier-2 (feature-specific) item to slot into the new model.

Field issue origin: Leah had Claude Desktop but not the Claude Code CLI; clicked "Open in Claude Code" and got `command not found` in a terminal with no extension-side signal. The "AI Ready" badge was green throughout because it only inspects project files and the in-extension MCP server, not the CLI binary on PATH. Scope expanded mid-design (owner confirmed) to **engine-aware** structure for future Codex support: an engine registry keyed by `demoBuilder.ai.engine`, parameterized launch/install/detect paths, `openInClaude.ts` → `openInAi.ts` rename, modal copy interpolated from the configured engine's display name. Plan locks in (a) single conditional second action button on `AiCapabilitiesModal` matching the existing single-action vocabulary, (b) lazy-gate notification in `openInAi.ts` mirroring the AEM Code Sync install prompt, (c) opt-in Homebrew install delegating to the existing prereq install runner (visual experience matches fnm/Node installs). Codex value stays absent from the enum until separate convention-layer plan picks up `.claude/` dir conventions + session-store probing + skill discovery format; convention coupling map captured in the plan's "Scope boundary" section so the follow-up is well-scoped. ~150-200 lines + 9 test deltas. Picks up after the prereq reframe ships.

### Prereqs architecture reframe — two-tier (Path A) ([`2026-06-11-prereqs-architecture-reframe.md`](2026-06-11-prereqs-architecture-reframe.md))

Audit of `prerequisites.json` shows the "project prerequisites" framing is wrong — nearly every entry (Homebrew, fnm, Git, Node, aio-cli) is actually extension-wide in scope; the "project" frame is a UX shortcut driven by the wizard being the first encounter point. The Claude detection plan exposed the gap: there's no global surface for extension-wide tools, so anything that needs to be discoverable before a user has a project (the soup-to-nuts AI-first promise) doesn't have a home. **Owner-confirmed direction: Path A** — reframe to two tiers, build a non-dismissable first-run welcome panel, repoint the wizard step at project-specific work only, share one install runner across surfaces. **Research complete + 16 decisions locked** through a design-discussion thread (welcome panel non-dismissable, single `prerequisites.json` with `scope` discriminator, `componentRequirements` repurposed as Tier-2 feature→tool map, no sidebar indicator, no uninstall surface, AI engine selection via radio at welcome time + `demoBuilder.ai.engine` setting, no auto-uninstall on engine switch, schema rewrite as Plan Step 1, Claude plan sequenced after this reframe). Three plan-cycle research items remain (`perNodeVersion` runner path, wizard step auto-advance, activation-interrupt precedent). Ready for `/rptc:plan` in a fresh session. Estimated `.116` target. The Claude detection backlog plan ([`claude-cli-detection-and-install/`](claude-cli-detection-and-install/overview.md)) consumes this reframe's primitives and becomes a thin "fill in engine-specific bits" plan once this lands.

### Experience Workspace as default authoring shell + Quick Edit patches ([`2026-06-11-experience-workspace-default-shell.md`](2026-06-11-experience-workspace-default-shell.md))

Field discovery — owner and Leah found DA.live content authoring can run inside Adobe Experience Workspace (the new canvas/WYSIWYG editor) via a single config key change. Pushed from `.115` (already shipped) to `.116` for full-scope integration. The architectural insight: Workspace is NOT a new shell at `experience.adobe.com` — it's a new route at `https://da.live/canvas#/<org>/<site>/<path>` using the same IMS auth (`darkalley` client_id), so switching is mostly a different value written to the `editor.path` config key we already write today (`applyDaLiveOrgConfigSettings`). **The bulk of the work is Quick Edit patches**: all four active EDS templates (CitiSignal/Custom on `hlxsites/aem-boilerplate-commerce`, B2B on `adobe-commerce/boilerplate-b2b-template`, BuildRight on `skukla/buildright-eds`, Isle5 on `stephen-garner-adobe/isle5`) are missing Quick Edit, which Workspace requires for iframe-preview-sync. Patches need to land in `skukla/eds-demo-patches` and apply to every create/reset path — **with load-bearing idempotency**: a storefront that ALREADY has Quick Edit must produce no errors, no overwrites. Hybrid setting model locked in (global `demoBuilder.daLive.authoringShell` enum + per-project Configure-screen override + Apply re-writes config). Five design questions remain for `/rptc:plan` (patch schema vs marker-only idempotency, multi-row UE config UI in scope or deferred, per-project override storage location, Configuration Service write failure handling, existing-project migration path). Tradeoff with single-row Workspace ship: the one-click UE punch-out button from inside the editor goes away (UE remains accessible via direct URL — documented in AGENTS.md). Scope estimate: ~330 lines + 2 patches + ~1.5-2 days. Estimated `.116` target.


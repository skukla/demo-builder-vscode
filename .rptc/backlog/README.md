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

> **Index last reconciled: 2026-06-19** against `develop` + active branches. Backlog descriptions drift from reality between audits — when in doubt, trust the code and `git log`, not this file.

## Recently shipped (archived to `../complete/`)

Verified merged to `develop` and moved out of `.rptc/plans/` during the 2026-06-19 reconciliation. Listed here only as a pointer; git history holds the record.

- **Thin-layer storefront (ADR-006)** — code-patch engine v2, LKG-pinned create/reset, CitiSignal cutover to canonical; the two storefront forks are retired. (`7ddb6c3d`, `d5c2340c`, `5cfb5b68`, `8cee8984`)
- **Content-copy completeness (ADR-010)** — follow document references so dropped content (e.g. `/customer/nav`) is copied; post-copy completeness audit. (`68165492`, `793a565f`, `0cd032ae`)
- **Adobe org-context self-heal** — `ensureOrgContext` + proactive mismatch detection + forced-switch recovery; in-app org picker removed. (merge `493aef17`) — see residual below.
- **IMS org-mismatch notification** — action-time org-context gate + Switch IMS Org feedback. (PR #51, `15bc2c2b`)
- **Unify mesh deploy pipeline** — dashboard deploy delegates to the shared deploy core. (PR #52, `d7f993e2`, `b2f21a57`)
- **PDP reversible SKU encoding (ADR-007)** — Helix-safe `_HH` encoding for PDP URLs. (merge `fb978281`)
- **Experience Workspace default authoring** — per-project authoring experience as a Configure setting. (merge `92101734`)

Also resolved since last index (were listed as pending): **jest worker force-exit** (`.unref()` now on the mesh timeout), **oversized test-file splits** (`35418a26`, `4fd26bf7` — `blockCollectionHelpers.test.ts` now 530 lines), **regenerate-AI-files progress** (`creationProgress` wired into `aiHandlers.ts`), **B2B feature-pack dropin delivery** (shipped via the hybrid CitiSignal package), **logs-toggle → sidebar**. The **DaLive permission-log "typo"** was a false positive — current code logs the owner correctly.

---

## Active backlog

### A. In flight (active front)

#### App Builder app family — attach a deployable app to a demo ([`2026-06-17-appbuilder-app-deploy-spine.md`](2026-06-17-appbuilder-app-deploy-spine.md))

Add a custom Adobe App Builder app to a demo project as a first-class, deployable component — the App Builder analog of the component-first direction. **Decided model** (from [`../research/app-builder-app-structure/research.md`](../research/app-builder-app-structure/research.md)): one workspace per demo = the API Mesh (separate artifact) + **one** custom app, with multiple integration domains as **packages inside that one app** — so the singleton `meshState` shape fits and no keyed app array is needed. **Build principle:** reuse existing primitives (org targeting, command plumbing, clone/install, the block-library additive pattern), share the mesh deploy scaffold where duplication is real, and hold off on a generalized deployable framework until a 3rd deployable type appears (Rule of Three). Effort 1 (remove the dormant `integration-service` + `appBuilderApps` mechanism) shipped earlier (`c98e5125`); Effort 2 (discovery least-privilege token) **DECLINED 2026-06-15** (no attacker exposure it closes; VS Code Secret Storage is the cheap fix if at-rest plaintext ever matters).

Five sequenced slices; **slice 1 gates the rest**:

1. **Deploy spine — ✅ LANDED on `develop`** ([`2026-06-17-appbuilder-app-deploy-spine.md`](2026-06-17-appbuilder-app-deploy-spine.md), `20fae62f`). `app-builder` registry category + `deployAppComponent` (sibling of mesh, idempotent `aio app deploy`) + singular `appState` + the dead `appBuilder` field wired through install/persist + block-library-style additive add/remove + role-gate extension + dashboard `AppBuilderCard`. Public git URL only. **Caveat:** Step-7 live `aio` probes (deploy-prune default, `app delete action` undeploy, trigger/rule orphan-on-rename) deferred to a live workspace.
2. **Curated catalog — NEXT** ([`2026-06-17-appbuilder-app-curated-catalog.md`](2026-06-17-appbuilder-app-curated-catalog.md)). Pick a vetted baseline instead of typing a URL; same deploy engine, pure addition. `feature/appbuilder-app-curated-catalog` is stacked on slice 1 (no work yet) — rebase onto the post-merge `develop` to continue.
3. **Package-bound — blocked on 1+2** ([`2026-06-17-appbuilder-app-package-bound.md`](2026-06-17-appbuilder-app-package-bound.md)). Auto-attach an app to a demo template via a `nativeForPackages`-style association; mostly config.
4. **Scaffold-and-author — blocked on 1** ([`2026-06-17-appbuilder-app-scaffold-author.md`](2026-06-17-appbuilder-app-scaffold-author.md)). `aio app init` + AI authoring; the only slice with real new surface (code home + repo-creation decision). Needs a design pass before its plan locks.
5. **App-only / no-storefront project — partial on 1, parallel** ([`2026-06-17-appbuilder-app-only-project.md`](2026-06-17-appbuilder-app-only-project.md)). Frontend-optional stack schema work; heaviest, least-coupled slice.

#### Hybrid storefront — Tier 2 (B2B+B2C in one site) ([`hybrid-storefront-model/`](../plans/hybrid-storefront-model/overview.md) — still in `.rptc/plans/`)

One CitiSignal storefront serves both B2C individuals and B2B company accounts by customer type at login, on the `boilerplate-b2b-template` base with branding as an overlay (no fork). **Functionally complete** on `develop` — hybrid merge (`b9c31575`), B2B-readiness detection (`24656460`, `c3cd0bbd`), account-chrome overlay, config-flag injection (ADR-009, `bd90c96d`). **⛔ Gated on live login-UX verification**: confirm an individual customer sees no B2B nav rows, a company user does, and B2C is not regressed. The one plan dir that legitimately stays active. Step checks in [`step-02.md`](../plans/hybrid-storefront-model/step-02.md).

### B. Sequencing / blocked

#### Prereqs architecture reframe — two-tier (Path A) ([`2026-06-11-prereqs-architecture-reframe.md`](2026-06-11-prereqs-architecture-reframe.md))

Reframe `prerequisites.json` from "project prerequisites" to two tiers (extension-wide vs. feature-specific), build a non-dismissable first-run welcome panel, repoint the wizard step at project-specific work only, share one install runner. **Research complete + 16 decisions locked; ready for `/rptc:plan`** — no plan dir or code yet. (The original `.116` target slipped; we're on `.121`.) Unblocks the Claude CLI detection plan below.

#### Engine-aware AI launch + detect + opt-in install ([`claude-cli-detection-and-install/`](claude-cli-detection-and-install/overview.md))

**⚠️ Blocked on the prereqs reframe above.** Engine-aware structure (engine registry keyed by `demoBuilder.ai.engine`, `openInClaude.ts` → `openInAi.ts`), lazy install-gate notification, opt-in Homebrew install. Confirmed not started (no `demoBuilder.ai.engine` / `openInAi.ts` in code). Becomes a thin "fill in engine-specific bits" plan once the reframe lands.

#### Adobe org-context — residual workstreams ([`2026-06-15-adobe-org-context-self-heal-consolidation.md`](2026-06-15-adobe-org-context-self-heal-consolidation.md))

Core self-heal **shipped** (see Recently shipped). Residual scope from the original consolidation, **verify against current code before picking up**: (B) concurrency safety — re-pin under an exclusive lock spanning select→command and/or per-project `aio` config isolation; (C) human org-picker (real `get-organizations`/`select-org`) + typed non-retryable `ORG_MISMATCH` for agents + AGENTS.md/skills guidance. Was the FIX-FIRST gate for the App-Builder-deployable + workspace work; the gate is cleared now that the self-heal landed.

### C. Ready to pick up (small, verified still pending)

#### Dashboard IMS org-check launches a surprise browser ([`2026-06-20-dashboard-org-check-surprise-browser.md`](2026-06-20-dashboard-org-check-surprise-browser.md))

Opening the project dashboard randomly launches a browser — located 2026-06-20 to the async IMS
org-context check (`handleRequestStatus` → `runOrgContextCheck` → `getOrganizations`). When the Console
SDK is unavailable it drops to the `aio` CLI path, which can open a browser for interactive auth (and
stalls 14.5s). Fix: the background check must use a quick non-interactive probe and never launch a
browser un-prompted; separately, find why the SDK is unavailable. Subsumed by the org-context residual
workstreams.

#### Project MCP servers fail MODULE_NOT_FOUND — stale `.mcp.json` path ([`2026-06-20-mcp-stale-storefront-node-modules-path.md`](2026-06-20-mcp-stale-storefront-node-modules-path.md))

`commerce-extensibility` + `playwright` MCP servers die with MODULE_NOT_FOUND pointing at
`components/eds-storefront/node_modules/...` — the **pre-isolation** path. `mcpConfigWriter` now anchors
MCP args to the isolated `.demo-builder-mcp/node_modules/` dir; the failing project's `.mcp.json` looks
generated before that change and never regenerated (storefront `npm install` aborts on b2b @dropins, so
those packages never land in the storefront tree). Investigate the project's actual `.mcp.json`; likely
fixed by Regenerate AI files + a drift signal (same family as skills-drift).

#### Republish affected projects when an EW-URL-affecting setting changes ([`2026-06-12-republish-on-ew-url-setting-change.md`](2026-06-12-republish-on-ew-url-setting-change.md))

`demoBuilder.daLive.*` settings (`ewCanvasBranch`, `authoringExperience`) only reach a project's published DA config via the Configure save path; changing them in VS Code Preferences leaves existing projects' `editor.path` stale (no `onDidChangeConfiguration` listener). Add a debounced listener that detects affected EDS projects (respecting per-project authoring overrides), prompts to confirm, then reuses `applyDaLiveOrgConfigSettings` → `republishStorefrontConfig`. Designed, decisions locked; not started. Branch exists: `feature/republish-on-ew-url-setting-change`.

#### Helix `previewCode` race ([`2026-05-21-helix-previewcode-race.md`](2026-05-21-helix-previewcode-race.md))

Spurious `400 Bad Request` from `HelixService.previewCode` when the call lands before Helix's code mirror has indexed a just-pushed commit. Verified still pending — `previewCode()` has no retry. Single-batch fix: retry-with-backoff on `400` only, 3 attempts (1s/3s/7s).

#### Pre-existing SOP-scan findings — code-pattern cleanup pass ([`2026-06-10-sop-pre-existing-patterns.md`](2026-06-10-sop-pre-existing-patterns.md))

~20 pre-existing code-pattern violations across `helixService.ts`, `executor.ts`, `featurePackInstaller.ts`, `GitHubServiceCard.tsx`, `DaLiveServiceCard.tsx`. Verified none of the four batches (S1–S4) have shipped (e.g. duplicate `Object.keys(project.componentInstances || {})` still in `executor.ts`). Four small batches, ~2h. Behavior-preserving.

#### Harden `updateSiteConfig` — sheet-preservation + 401 guards ([`2026-06-11-updatesiteconfig-weak-guards.md`](2026-06-11-updatesiteconfig-weak-guards.md))

`DaLiveContentOperations.updateSiteConfig` silently "starts fresh" on any GET failure, has no 401 write-access probe, and hardcodes `:names: ['data','library']` — so a transient error or an existing `permissions` sheet can drop site-level permissions. Verified still present. Refactor to reuse the hardened `writeMergedDataConfig` discipline + regression tests.

#### AI Ready: surface skills drift as amber ([`2026-06-01-ai-ready-skills-drift.md`](2026-06-01-ai-ready-skills-drift.md))

New skill templates shipped by the extension never reach existing projects until "Regenerate AI Files" runs; users get no signal. Verified still pending (no `detectSkillsDrift` in `skillsWriter.ts`). Detector + a yellow "Skills outdated" branch on the AI Ready badge + list in `AiCapabilitiesModal`. First slice: missing files only.

#### Sync Storefront — auto-resolve managed-file conflicts ([`2026-06-11-sync-storefront-auto-resolve-managed-conflicts.md`](2026-06-11-sync-storefront-auto-resolve-managed-conflicts.md))

When ALL conflicting files are Demo-Builder-managed (`config.json`, `fstab.yaml`, …), auto-resolve to the remote authoritative copy; only surface the manual merge editor when the user's own content conflicts. Verified still pending (no managed-file predicate in `syncStorefront.ts`). **Highest-risk line: rebase inverts ours/theirs** (take remote = `--ours` mid-rebase). Rare edge.

#### Workspace-independent entry point for global MCP ops ([`2026-05-30-global-mcp-entry-point.md`](2026-05-30-global-mcp-entry-point.md))

Invoking a genuinely global op (`create_project`, `list_projects`) when the user is not inside a project workspace has no socket to reach (the in-extension server is per-workspace). Proposed: proxy discovery mode for the stdio↔socket forwarder + a global `~/.claude.json` entry. Deferred — multi-window semantics unresolved.

#### Sanitize MCP stderr tail in AI-verification log ([`2026-06-11-sanitize-mcp-stderr-in-verify-log.md`](2026-06-11-sanitize-mcp-stderr-in-verify-log.md))

`handleVerifyAiSetup` (`aiHandlers.ts`) logs each MCP server's stderr tail via `warn`, bypassing `sanitizeErrorForLogging`. Safe for extension-generated servers; a footgun if a user hand-adds a credential-bearing third-party MCP server. Verified still using unsanitized `.warn`. Low priority — no active leak.

### D. Deferred by design (gated on an external condition)

#### Retire `legacyLookupKey` infrastructure — DA/repo unification cleanup ([`2026-06-08-rename-existing-da-content-to-repo-name.md`](2026-06-08-rename-existing-da-content-to-repo-name.md))

Phase 1 (matching names + auto-migration on reset) shipped (`23efd831`, `b2169699`). This entry is now the cleanup batch: retire `SiteRegistrationParams.legacyLookupKey`, the `cleanUpLegacyRegistration` branch, the 4th arg to `buildSiteConfigParams`, the `daLiveSite` manifest field. **Verified these symbols still exist.** Single-day deletion. Pick up only after telemetry confirms no `storefrontNameMigration` activations for 30+ days.

#### Rebuild BuildRight on the thin-layer model ([`2026-06-10-buildright-eds-disposition.md`](2026-06-10-buildright-eds-disposition.md))

Disposition decided 2026-06-10: **complete rebuild** — express BuildRight as a Demo Builder package on canonical (branded block library + brand CSS + DA content) using the ADR-006 mechanisms. ADR-006 has now shipped, so this is unblocked; the old `buildright-eds` repo archives when the rebuild ships. BuildRight is currently `hidden: true` in the picker.

#### PDP empty-data redirect to native /404 ([`2026-06-09-pdp-graceful-empty-state.md`](2026-06-09-pdp-graceful-empty-state.md))

When an SC deletes a SKU, the cached PDP serves the template and the drop-in gets no data. Honest UX = redirect to the storefront's native `/404`. **Investigate first**: does `@dropins/storefront-pdp` expose an empty-state callback before building a DOM-polling wrapper. Ships as a Demo Builder code patch (ADR-006). Phase 0 investigation 15–30 min.

### E. Larger / untouched

#### Multi-locale storefront — Phase 1 ([`2026-05-19-multisite-multilocale.md`](2026-05-19-multisite-multilocale.md))

Serve multiple locales (eventually multiple brands) from a single project. Repurposes the wizard `settings` step as **Business Structure** (Connection, Primary Store, Regions & Locales, reserved Additional Brands). Covers PaaS, ACCS, ACO addon. Research: [`docs/research/2026-05-19-multisite-multillocale-research.md`](../../docs/research/2026-05-19-multisite-multillocale-research.md); seam: [ADR-003](../../docs/architecture/adr/003-multisite-architecture-seam.md). Phase 2 (repoless multi-brand) deferred.

#### Decouple project from VS Code workspace folder ([`2026-05-30-decouple-project-from-workspace.md`](2026-05-30-decouple-project-from-workspace.md))

Switching projects from the home grid reloads the workspace folder, reactivating the extension host. Goal: render the picked project's dashboard in-place without a window reload; anchor the workspace only when a workspace-requiring action fires. Multi-day — touches `StateManager`, MCP server lifecycle, terminal/AI Chat anchoring, file watchers.

#### EDS site-scraping capability ([`2026-05-28-eds-site-scraping.md`](2026-05-28-eds-site-scraping.md))

Scrape client URLs → working EDS blocks at 90–95% fidelity. Two workflows (Mod Agent; Playwright MCP). **Gated on Mod Agent access** (request filed 2026-05-28). Phase 1 ~1 day of config; Phase 1.5 (GitHub OAuth to install AEM Code Connector/Sync) ~1–2 weeks — defer until Phase 1 validates.

#### Monorepo independent release tracking ([`monorepo-independent-release-tracking/`](monorepo-independent-release-tracking/overview.md))

Full RPTC plan (overview + 3 steps) drafted 2025-12-16, never executed. Adds tag-prefix support (`backend@1.0.0`, `optimizer@2.0.0`) for independent release lifecycles in one repo. Pick up when monorepo components become a real need.

### F. Maintenance cycle anchors

#### Structural baseline ([`2026-05-21-structural-baseline.md`](2026-05-21-structural-baseline.md))

Numbers-first measurement pass to map the codebase's actual size, complexity, and coupling after ~1 year of AI-assisted development. **Run after Cycle D ships.** Produces a report that informs subsequent trim cycles.

#### Legacy / soft-deprecation cleanup ([`2026-05-21-legacy-soft-deprecation.md`](2026-05-21-legacy-soft-deprecation.md))

~30 inventoried items across `src/` — `@deprecated` JSDoc, "kept for backward compatibility" variants, deprecated API aliases. **3 zero-caller deletions are ready any time** for a small trim task. Downstream of the structural baseline (which will likely re-rank these). Full plan in batches L1–L5.

#### Oversized test-file splits — non-AI areas ([`2026-05-27-oversized-test-file-splits.md`](2026-05-27-oversized-test-file-splits.md))

⚠️ **Mostly resolved** — `blockCollectionHelpers.test.ts` and the priority files were split (`35418a26`, `4fd26bf7`). Re-audit current `max-lines` warnings before treating this as active; keep only if any of the original 7 files still exceed 500 lines.

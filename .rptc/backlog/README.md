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

> **Index last reconciled: 2026-07-07** (§C re-audited against `develop`; 3 shipped items archived). Backlog descriptions drift from reality between audits — when in doubt, trust the code and `git log`, not this file.

## Recently shipped (archived to `../complete/`)

Verified merged to `develop` and moved out of `.rptc/plans/` during the 2026-06-19 reconciliation. Listed here only as a pointer; git history holds the record.

- **Thin-layer storefront (ADR-006)** — code-patch engine v2, LKG-pinned create/reset, CitiSignal cutover to canonical; the two storefront forks are retired. (`7ddb6c3d`, `d5c2340c`, `5cfb5b68`, `8cee8984`)
- **Content-copy completeness (ADR-010)** — follow document references so dropped content (e.g. `/customer/nav`) is copied; post-copy completeness audit. (`68165492`, `793a565f`, `0cd032ae`)
- **Adobe org-context self-heal** — `ensureOrgContext` + proactive mismatch detection + forced-switch recovery; in-app org picker removed. (merge `493aef17`) — see residual below.
- **IMS org-mismatch notification** — action-time org-context gate + Switch IMS Org feedback. (PR #51, `15bc2c2b`)
- **Unify mesh deploy pipeline** — dashboard deploy delegates to the shared deploy core. (PR #52, `d7f993e2`, `b2f21a57`)
- **PDP reversible SKU encoding (ADR-007)** — Helix-safe `_HH` encoding for PDP URLs. (merge `fb978281`)
- **Experience Workspace default authoring** — per-project authoring experience as a Configure setting. (merge `92101734`)
- **MCP affordance coverage** — all five agent-tool gaps closed 2026-07-11: `get_project_urls`, `deploy_mesh`, `deploy_integration`/`redeploy_integration`/`remove_integration`, `refresh_block_library`, and `export_project_settings` (write-a-file action; secrets to disk, not the response). ([`../complete/2026-07-11-mcp-affordance-coverage.md`](../complete/2026-07-11-mcp-affordance-coverage.md))
- **Wizard org-context follow-ups** — 2026-07-13. Shipped the real residual: `testDeveloperPermissions` now targets the token org via `withOrgContext` + a defensive project omit on auth cache-miss ([`../complete/2026-07-01-wizard-org-project-mispairing.md`](../complete/2026-07-01-wizard-org-project-mispairing.md)). The multi-org guard item was **closed as overtaken** — its premise contradicts the canonical single-reachable-org model ([`../complete/2026-07-01-wizard-multi-org-selection-guard.md`](../complete/2026-07-01-wizard-multi-org-selection-guard.md)).

Also resolved since last index (were listed as pending): **jest worker force-exit** (`.unref()` now on the mesh timeout), **oversized test-file splits** (`35418a26`, `4fd26bf7` — `blockCollectionHelpers.test.ts` now 530 lines), **regenerate-AI-files progress** (`creationProgress` wired into `aiHandlers.ts`), **B2B feature-pack dropin delivery** (shipped via the hybrid CitiSignal package), **logs-toggle → sidebar**. The **DaLive permission-log "typo"** was a false positive — current code logs the owner correctly.

---

## Active backlog

### A. In flight (active front)

#### App Builder app family — attach a deployable app to a demo ([`2026-06-17-appbuilder-app-deploy-spine.md`](2026-06-17-appbuilder-app-deploy-spine.md))

Add a custom Adobe App Builder app to a demo project as a first-class, deployable component — the App Builder analog of the component-first direction. **Decided model** (from [`../research/app-builder-app-structure/research.md`](../research/app-builder-app-structure/research.md)): one workspace per demo = the API Mesh (separate artifact) + **one** custom app, with multiple integration domains as **packages inside that one app** — so the singleton `meshState` shape fits and no keyed app array is needed. **Build principle:** reuse existing primitives (org targeting, command plumbing, clone/install, the block-library additive pattern), share the mesh deploy scaffold where duplication is real, and hold off on a generalized deployable framework until a 3rd deployable type appears (Rule of Three). Effort 1 (remove the dormant `integration-service` + `appBuilderApps` mechanism) shipped earlier (`c98e5125`); Effort 2 (discovery least-privilege token) **DECLINED 2026-06-15** (no attacker exposure it closes; VS Code Secret Storage is the cheap fix if at-rest plaintext ever matters).

**Active plan (between slices 3 and 4):** [`appbuilder-shell-app`](../plans/appbuilder-shell-app/overview.md) — the "first app": blank-shell catalog entry (`skukla/app-builder-shell`), Developer Agent tooling un-gated to all App Builder-adjacent projects, runtime API access for AI (`list_console_apis`/`add_console_apis` + persisted `additionalConsoleApis`), AI guidance. Steps 1–3 + guidance shipped 2026-07-09; live Firefly walkthrough pending.

Five sequenced slices; **slice 1 gates the rest**:

1. **Deploy spine — ✅ LANDED on `develop`** ([`2026-06-17-appbuilder-app-deploy-spine.md`](2026-06-17-appbuilder-app-deploy-spine.md), `20fae62f`). `app-builder` registry category + `deployAppComponent` (sibling of mesh, idempotent `aio app deploy`) + singular `appState` + the dead `appBuilder` field wired through install/persist + block-library-style additive add/remove + role-gate extension + dashboard `AppBuilderCard`. Public git URL only. **Caveat:** Step-7 live `aio` probes (deploy-prune default, `app delete action` undeploy, trigger/rule orphan-on-rename) deferred to a live workspace.
2. **Curated catalog — ✅ SHIPPED** ([`../complete/2026-06-17-appbuilder-app-curated-catalog.md`](../complete/2026-06-17-appbuilder-app-curated-catalog.md), `94b633cf` + rename `65c40b04`). Delivered via the wizard **"Add-an-Integration"** feature: declarative `config/app-builder-components.json` catalog (seeded `commerce-paas-mesh`/`commerce-eds-mesh`/`headless-commerce-mesh`) + `appBuilderComponentCatalogLoader` (catalog pick AND custom-URL entry coexist) + wizard/configure selection UI + `executor.ts` deploy routing. Resolved the open question: curated mesh baselines live in this catalog. Verified on `develop` 2026-07-07 (index was stale).
3. **Package-bound — ⛔ GATED on the first real bound integration** ([`2026-06-17-appbuilder-app-package-bound.md`](2026-06-17-appbuilder-app-package-bound.md), rewritten 2026-07-09 after a staleness audit — [`../research/appbuilder-slice3-staleness/research.md`](../research/appbuilder-slice3-staleness/research.md)). Mechanism + schema fields exist; `onlyForPackages` exclusion is live. But the auto-include pieces are production-dead (no seeding, no locked UI, no summary visibility), the proposed `citisignal-headless` binding target doesn't exist as a package id, and the only bindable entries (meshes) would be behaviorally redundant. Real scope is in the rewritten item; pick up when a `kind:'integration'` app purpose-built for a package exists (shell lineage, slice 4, or BuildRight rebuild).
4. **Scaffold-and-author — ❌ RETIRED, subsumed by shell instancing** ([`2026-06-17-appbuilder-app-scaffold-author.md`](2026-06-17-appbuilder-app-scaffold-author.md), verdict at the top of the item). Shell instancing (2026-07-16, `feature/shell-instancing` — [`2026-07-16-shell-instancing-named-ai-integrations.md`](2026-07-16-shell-instancing-named-ai-integrations.md)) delivers create-new-and-author-with-AI via named shell instances; the `aio app init` scaffold mode is not being built.
5. **App-only / no-storefront project — partial on 1, parallel** ([`2026-06-17-appbuilder-app-only-project.md`](2026-06-17-appbuilder-app-only-project.md)). Frontend-optional stack schema work; heaviest, least-coupled slice.

#### Deterministic integrations + custom-app lifecycle ([`2026-07-13-deterministic-integrations.md`](2026-07-13-deterministic-integrations.md))

Integrations are deterministic units — adding one adds exactly that thing. **Layer 1 ✅** (`48f637d3`, `5aa064c8`; custom/import picker + re-edit on `feature/mcp-affordance-coverage`): api-access is **informational for mesh/catalog** (no picker — APIs shown, mesh enables in-modal, catalog subscribes at deploy) and an **interactive picker for custom/import** (pick any entitled API up front; re-editable from the result row via `api-edit` mode). Dashboard **Manage APIs** owns deployed-integration API management. **Layer 2 ✅** (`69ea4831`): kind picker regrouped into 4 flat cards (API Mesh · Pre-built integration · Build custom · Import a repo), shell out of the catalog. **Layer 3** → split to [`2026-07-13-promote-app-to-repo.md`](2026-07-13-promote-app-to-repo.md). Supersedes the earlier kind-aware item. User-confirmed 2026-07-13; Layer 1 revised for custom/import 2026-07-14.

#### Promote a shell-built custom app to a repo ([`2026-07-13-promote-app-to-repo.md`](2026-07-13-promote-app-to-repo.md))

Layer 3 of deterministic-integrations, scoped out. A dashboard action on a blank-shell-built custom app that creates a new GitHub repo (owner picker via `getUserOrgs`) and pushes the app's local dir (fresh history, `.env`/secrets excluded), recording the repo on the component — so it can later be imported via "Import a repo". Reuses `GitHubRepoOperations` / `GitHubTokenService` / the deploy-action pattern. Real forks: public-vs-private repo, secrets hygiene (non-negotiable). Gated on the shell build-out maturing.

#### Custom integration — language standard + singular→packages model ([`2026-07-15-custom-integration-language-and-model.md`](2026-07-15-custom-integration-language-and-model.md))

User-confirmed 2026-07-15: the product noun for the custom, action-carrying integration is **"custom integration"** (ERP / CRM / Firefly), never "App Builder app" (that's the impl substrate). The user-facing string rename **shipped this session** (KindStage/CustomStage/IntegrationsStep/AppBuilderCard/integrationRows/deployApp/appDeployment/appComponentManager + the blank-shell catalog name); internal identifiers kept. Backed by deep research ([`../research/app-builder-integration-model/research.md`](../research/app-builder-integration-model/research.md), six agents) that **corrected the model**: NOT "one app, many packages" but **many separate App Builder apps → one shared Adobe I/O workspace, isolated by per-integration OpenWhisk package renaming**. Six items: (1) language ✅ + (2) `appState` persist ✅ (`f91669cb`) shipped. **(3) ADR-011 D3 = keystone — ✅ MERGED to develop `5d6f4956` 2026-07-16**: the keyed map is serialized (legacy manifests migrate on load), the singular write path is retired, the dashboard renders one integrations list (mesh first row), mesh unified. (4) integration display **name** — folded into D3, shipped with it. (5) **remote Adobe I/O project rename** — none today, but `@adobe/aio-lib-console` `editProject` is installed/unwired; small independent fix. (6) **integrations grid UX** ("project within a project") — reuses keyed data + status maps + `.projects-grid`; frame as co-tenant cards in one workspace; gated on D3. Plus a doc correction. Cross-links §A slices + §E.

#### Shell instancing — N AI-built integrations via name-derived ids ([`2026-07-16-shell-instancing-named-ai-integrations.md`](2026-07-16-shell-instancing-named-ai-integrations.md))

**✅ IMPLEMENTED 2026-07-16 on branch `feature/shell-instancing`** — plus user-added **rename-after-add** (display-name rename on wizard instance rows + dashboard integration rows; the id/folder/ow.package stays immutable), the **§E fold-in** (edit-mode sources DERIVED from the keyed map — `Project.appBuilderComponentSources` deleted; `additionalConsoleApis` manifest-persisted), and the AI-built row discriminator fixed to shell-source match. D4's `aio app init` scaffold mode is **subsumed** (see the item). Original scope: user requirement from D3 live testing: build BOTH an ERP and a Firefly integration via AI. Today impossible (the blank shell's fixed id `app-builder-shell` = one instance per project). Fix: shell repo becomes a **template** — the "Build custom" flow prompts for a name (per the wizard prototype), derives a collision-checked instance id, clones the shell under it. Everything downstream is already id-generic post-D3 (keyed `name` field, `deriveOwPackage` isolation, per-id lifecycle/MCP). Net-new: name-first add flow + instantiation + name threading + per-integration AI addressing. Riders: pulls [`promote-to-repo`](2026-07-13-promote-app-to-repo.md) forward (N local-only codebases); partially subsumes D4 scaffold-and-author. Intersects §E source persistence — solve together.

#### Mesh create-vs-update remote probe + blank-error fix ([`2026-07-15-mesh-create-vs-update-remote-probe.md`](2026-07-15-mesh-create-vs-update-remote-probe.md))

**✅ SHIPPED 2026-07-15** (same-day pull-forward — it blocked the D3 live checks). Landed the "already has a mesh" → one-shot retry-as-update fallback in `deployMeshComponent`, the blank-error fix (`formatAdobeCliError` trims the leading-arrow newline), and the review's inverse-gap find (`edsResetMeshHelper` sources `existingMeshId` from remote truth). Residual noted in the item: `createHandler`'s duplicate create pipeline + drifting signature detector (architecture-duplication candidate).

#### Hybrid storefront — Tier 2 (B2B+B2C in one site) ([`hybrid-storefront-model/`](../plans/hybrid-storefront-model/overview.md) — still in `.rptc/plans/`)

One CitiSignal storefront serves both B2C individuals and B2B company accounts by customer type at login, on the `boilerplate-b2b-template` base with branding as an overlay (no fork). **Functionally complete** on `develop` — hybrid merge (`b9c31575`), B2B-readiness detection (`24656460`, `c3cd0bbd`), account-chrome overlay, config-flag injection (ADR-009, `bd90c96d`). **⛔ Gated on live login-UX verification**: confirm an individual customer sees no B2B nav rows, a company user does, and B2C is not regressed. The one plan dir that legitimately stays active. Step checks in [`step-02.md`](../plans/hybrid-storefront-model/step-02.md).

### B. Sequencing / blocked

#### Prereqs architecture reframe — two-tier (Path A) ([`2026-06-11-prereqs-architecture-reframe.md`](2026-06-11-prereqs-architecture-reframe.md))

Reframe `prerequisites.json` from "project prerequisites" to two tiers (extension-wide vs. feature-specific), build a non-dismissable first-run welcome panel, repoint the wizard step at project-specific work only, share one install runner. **Research complete + 16 decisions locked; ready for `/rptc:plan`** — no plan dir or code yet. (The original `.116` target slipped; we're on `.121`.) Unblocks the Claude CLI detection plan below.

#### Engine-aware AI launch + detect + opt-in install ([`claude-cli-detection-and-install/`](claude-cli-detection-and-install/overview.md))

**⚠️ Blocked on the prereqs reframe above.** Engine-aware structure (engine registry keyed by `demoBuilder.ai.engine`, `openInClaude.ts` → `openInAi.ts`), lazy install-gate notification, opt-in Homebrew install. Confirmed not started (no `demoBuilder.ai.engine` / `openInAi.ts` in code). Becomes a thin "fill in engine-specific bits" plan once the reframe lands.

#### Adobe org-context — residual workstreams ([`2026-06-15-adobe-org-context-self-heal-consolidation.md`](2026-06-15-adobe-org-context-self-heal-consolidation.md))

Core self-heal **shipped** (see Recently shipped). Residual scope from the original consolidation, **verify against current code before picking up**: (B) concurrency safety — re-pin under an exclusive lock spanning select→command and/or per-project `aio` config isolation; (C) human org-picker (real `get-organizations`/`select-org`) + typed non-retryable `ORG_MISMATCH` for agents + AGENTS.md/skills guidance. Was the FIX-FIRST gate for the App-Builder-deployable + workspace work; the gate is cleared now that the self-heal landed.

### D. Deferred by design (gated on an external condition)

#### Retire `legacyLookupKey` infrastructure — DA/repo unification cleanup ([`2026-06-08-rename-existing-da-content-to-repo-name.md`](2026-06-08-rename-existing-da-content-to-repo-name.md))

Phase 1 (matching names + auto-migration on reset) shipped (`23efd831`, `b2169699`). This entry is now the cleanup batch: retire `SiteRegistrationParams.legacyLookupKey`, the `cleanUpLegacyRegistration` branch, the 4th arg to `buildSiteConfigParams`, the `daLiveSite` manifest field. **Verified these symbols still exist.** Single-day deletion. Pick up only after telemetry confirms no `storefrontNameMigration` activations for 30+ days.

#### Rebuild BuildRight on the thin-layer model ([`2026-06-10-buildright-eds-disposition.md`](2026-06-10-buildright-eds-disposition.md))

Disposition decided 2026-06-10: **complete rebuild** — express BuildRight as a Demo Builder package on canonical (branded block library + brand CSS + DA content) using the ADR-006 mechanisms. ADR-006 has now shipped, so this is unblocked; the old `buildright-eds` repo archives when the rebuild ships. BuildRight is currently `hidden: true` in the picker.

#### PDP empty-data redirect to native /404 ([`2026-06-09-pdp-graceful-empty-state.md`](2026-06-09-pdp-graceful-empty-state.md))

When an SC deletes a SKU, the cached PDP serves the template and the drop-in gets no data. Honest UX = redirect to the storefront's native `/404`. **Investigate first**: does `@dropins/storefront-pdp` expose an empty-state callback before building a DOM-polling wrapper. Ships as a Demo Builder code patch (ADR-006). Phase 0 investigation 15–30 min.

#### App Builder component — edit-mode rehydration + ReviewStep visibility ([`2026-06-21-appbuilder-component-first-class-persistence.md`](2026-06-21-appbuilder-component-first-class-persistence.md))

Rewritten 2026-07-09: two of the three original claims were already resolved on `develop` (`buildProjectConfig` serialization EXISTS; custom-URL provisioning EXISTS via creation Phase 3b + the rebuilt `CustomIntegrationRow`; `showCustomDoor` is obsolete). Remaining: edit-mode rehydration (nothing persists the selections to rehydrate FROM), the live ReviewStep bug (reads always-empty `components.appBuilder`, so hand-picked integrations are invisible on Review), and the coupled **D3 dual-flow removal**.

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

#### DX follow-through — verification pipeline + guidance freshness ([`2026-07-03-dx-verification-pipeline.md`](2026-07-03-dx-verification-pipeline.md))

Deferred items from the 2026-07-03 DX audit (`../research/dx-audit/research.md`): secret-file PreToolUse guard, evidence capture in the `gate` skill + fresh-context `/code-review` habit, periodic re-verification of the `<!-- Last verified -->` markers now stamped on every CLAUDE.md, and removal of the unused webpack devDependencies.

#### Structural baseline ([`2026-05-21-structural-baseline.md`](2026-05-21-structural-baseline.md))

Numbers-first measurement pass to map the codebase's actual size, complexity, and coupling after ~1 year of AI-assisted development. **Run after Cycle D ships.** Produces a report that informs subsequent trim cycles.

#### Legacy / soft-deprecation cleanup ([`2026-05-21-legacy-soft-deprecation.md`](2026-05-21-legacy-soft-deprecation.md))

~30 inventoried items across `src/` — `@deprecated` JSDoc, "kept for backward compatibility" variants, deprecated API aliases. **3 zero-caller deletions are ready any time** for a small trim task. Downstream of the structural baseline (which will likely re-rank these). Full plan in batches L1–L5.

#### Oversized test-file splits — non-AI areas ([`2026-05-27-oversized-test-file-splits.md`](2026-05-27-oversized-test-file-splits.md))

⚠️ **Mostly resolved** — `blockCollectionHelpers.test.ts` and the priority files were split (`35418a26`, `4fd26bf7`). Re-audit current `max-lines` warnings before treating this as active; keep only if any of the original 7 files still exceed 500 lines.
### App Builder attach feature (supersedes 1b) ([`2026-06-15-integration-service-cleanup-and-discovery-token.md`](2026-06-15-integration-service-cleanup-and-discovery-token.md))

Effort 1 (remove dormant `integration-service` + the `appBuilderApps` mechanism) **shipped** on `develop`. **Active seed:** a feature to add 1+ App Builder apps to a demo project (**Model A** — user-supplied git repos deployed via `aio app deploy` into the demo's existing workspace; the Mesh lifecycle, multiplied). Supersedes the old Effort 1b cleanup (repurpose the `appBuilder` selection plumbing, don't delete). **Effort 2 (discovery least-privilege token): DECLINED 2026-06-15** — no attacker exposure it would close; the residual is at-rest plaintext a token shares and doesn't fix; not worth the per-demo setup friction. (If at-rest ever matters, the cheap fix is VS Code Secret Storage, not a token.)

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

### Reset consent only when there is something to lose (`2026-07-29`)

[`2026-07-29-reset-consent-only-when-there-is-something-to-lose.md`](2026-07-29-reset-consent-only-when-there-is-something-to-lose.md)
— New repos already pin + patch unconditionally (ADR-006 Step 4b, both branches). Only
the **existing-repo** path gates on the `resetToTemplate` checkbox, so an empty or
non-storefront repo left unticked proceeds with no template, no LKG pin, and no
canonical patches, then reports `Complete`. Replace one default-off checkbox with three
states: auto-setup when empty, **refuse** when populated-but-not-a-storefront (the
larger half — the repo that prompted this had 53 blocks and no `scripts/scripts.js`),
prompt only when the user has something to lose. Pairs with the selection-time App
check in `.rptc/research/github-app-installation-visibility/`.

### PDP routing silently broken three ways — patches never fetched, smart-404 SHA race (`2026-07-29`)

Two independent defects found in a live Extension Host run 2026-07-29, **both present in
`v1.0.0-beta.121` verbatim** and neither a hotfix regression. (1)
[`2026-07-29-code-patches-not-rehydrated-in-edit-mode.md`](2026-07-29-code-patches-not-rehydrated-in-edit-mode.md)
— `edsConfig.codePatches`/`codePatchSource` are produced only by `WelcomeStep`, so every
edit-mode republish trips a **silent** early return at `storefrontSetupPhase1.ts:115` and
the ADR-007 SKU-encoding patches never apply. (2)
[`2026-07-29-pdp404-stale-sha-conflict.md`](2026-07-29-pdp404-stale-sha-conflict.md) —
Inspector Tagging writes `scripts/delayed.js` via the Git Tree API, PDP404 then reads it via
the Contents API and commits with a stale SHA, skipping the smart-404 install. Together with
the Configuration Service 403 (the only one that surfaces a message), a storefront can finish
with no PDP support by any mechanism and still report `Complete`.

### PDP empty-data redirect to native /404 ([`2026-06-09-pdp-graceful-empty-state.md`](2026-06-09-pdp-graceful-empty-state.md))

Deferred during BYOM PDP routing Phase 1. When an SC deletes a SKU, the cached PDP URL still serves the template and the drop-in queries Commerce, gets nothing back. **Originally framed as "custom Product not available message"; reframed same day** — the honest UX for a deleted SKU is the storefront's native `/404`: same chrome, same status semantics, browser URL bar updates to reflect reality. Detect empty Commerce data → `window.location.replace('/404')`. Cleanup tooling (Refresh PDPs action, action-side telemetry) was rejected as overkill; redirect handles the visible UX without that infrastructure. **Investigate first**: check if `@dropins/storefront-pdp` exposes an empty-state callback; building a DOM-polling wrapper without checking is the wrong order. Phase 0 investigation 15–30 min, implementation 0–2 h depending on what we find. Lives as a Demo Builder code patch (per ADR-006, 2026-06-10 — the thin-layer evaluation retired the forks, so storefront-side behavior changes ship via the code-patches layer).

### Pre-existing SOP-scan findings — code-pattern cleanup pass ([`2026-06-10-sop-pre-existing-patterns.md`](2026-06-10-sop-pre-existing-patterns.md))

Inventory of ~20 pre-existing code-pattern violations surfaced by an SOP scan run between Step 5a and the patches-repo workstream on the ADR-006 thin-layer initiative. The one ADR-006-related finding (`templateUpdateChecker` nesting from Step 3) was fixed inline in `9b78c9dc`; this entry collects everything else so it doesn't get lost. Four small batches, ~2 hours total: S1 `helixService.ts` (deep chains + `Object.keys` patterns in `parseBulkJobResponse`), S2 `executor.ts` + `featurePackInstaller.ts` (componentInstances `Object.keys || {}` duplicates), S3 nested ternaries in `GitHubServiceCard.tsx` + `DaLiveServiceCard.tsx` (identical 4-level shape, parallel extraction), S4 long validation chains + one magic timeout. Behavior-preserving; pick up any time the codebase wants a refresh pass. NOT in scope: `daLiveContentOperations` god-file decomposition and `executeEdsPipeline` complexity 27 (both belong to the structural baseline cycle).

### DaLivePermissions log message chops the owner name ([`2026-06-10-dalive-permission-log-typo.md`](2026-06-10-dalive-permission-log-typo.md))

Surfaced by the ADR-006 Step 5b smoke test. The `[DaLiveConfig] Granting access to <user> for <owner>/<repo>` info line drops the first character of the owner — printed `ukla/citisignal-b2b` instead of `skukla/citisignal-b2b`. Cosmetic only; the actual permission grant works (subsequent log lines correctly use `skukla`), so the bug is a string-slice in the log path, not in the API call. Single-file, single-line fix; ~5 minutes including a one-line test assertion. Pick up any time.

### Harden `updateSiteConfig` — sheet-preservation + 401 guards ([`2026-06-11-updatesiteconfig-weak-guards.md`](2026-06-11-updatesiteconfig-weak-guards.md))

Surfaced by the security-agent during verification of the AEM Assets site-scope fix (.116 — `applySiteConfig`/`writeMergedDataConfig`). `DaLiveContentOperations.updateSiteConfig` writes the block-library `library` sheet to the **same** per-site config URL (`/config/{org}/{site}`) that the new `applySiteConfig` writes to, but with weaker safety: it silently "starts fresh" on ANY GET failure (catch-all), has no 401 write-access ownership probe, and hardcodes `:names: ['data','library']` — so a transient GET error or an existing `permissions` sheet can lead to writing a config that **drops site-level permissions**. The hardened `writeMergedDataConfig` was built to prevent exactly this. Fix: refactor `updateSiteConfig` to reuse the same discipline (ideally delegate to a generalized `writeMergedDataConfig` that merges a named sheet) + regression tests for GET-failure, 401-no-access, and permissions preservation. Pre-existing; behavior-preserving on the happy path.

### Sanitize MCP stderr tail in AI-verification log ([`2026-06-11-sanitize-mcp-stderr-in-verify-log.md`](2026-06-11-sanitize-mcp-stderr-in-verify-log.md))

Hardening note from the security-agent (conf 45, below threshold) during the .116 observability pass. `handleVerifyAiSetup` logs each MCP server's captured stderr tail (`entry.error`) via `warn`, which bypasses `sanitizeErrorForLogging`. Safe for the extension-generated `.claude/mcp.json` (generated servers carry no secret env; SDK allowlist excludes host secrets), but a footgun if a user hand-adds a credential-bearing third-party MCP server that echoes its env on crash. Fix: wrap the tail in `sanitizeErrorForLogging()` (or route the body through `debugLogger.trace`), keeping the socket-path/connect-error diagnostic intact. Low priority — no active leak.

### Engine-aware AI launch + detect + opt-in install ([`claude-cli-detection-and-install/`](claude-cli-detection-and-install/overview.md))

**⚠️ Blocked on [`2026-06-11-prereqs-architecture-reframe.md`](2026-06-11-prereqs-architecture-reframe.md).** The plan as drafted puts the Claude install surface on the per-project `AiCapabilitiesModal`, which doesn't reach an AI-first user before they have a project. A follow-on conversation identified the real issue: nearly every "project prerequisite" today is actually extension-wide, and there's no global surface for tools at that scope. Owner decided to do Path A (reframe the prereq architecture) rather than ship Claude through a parallel global surface. Once the reframe lands, Claude becomes the first Tier-2 (feature-specific) item to slot into the new model.

Field issue origin: Leah had Claude Desktop but not the Claude Code CLI; clicked "Open in Claude Code" and got `command not found` in a terminal with no extension-side signal. The "AI Ready" badge was green throughout because it only inspects project files and the in-extension MCP server, not the CLI binary on PATH. Scope expanded mid-design (owner confirmed) to **engine-aware** structure for future Codex support: an engine registry keyed by `demoBuilder.ai.engine`, parameterized launch/install/detect paths, `openInClaude.ts` → `openInAi.ts` rename, modal copy interpolated from the configured engine's display name. Plan locks in (a) single conditional second action button on `AiCapabilitiesModal` matching the existing single-action vocabulary, (b) lazy-gate notification in `openInAi.ts` mirroring the AEM Code Sync install prompt, (c) opt-in Homebrew install delegating to the existing prereq install runner (visual experience matches fnm/Node installs). Codex value stays absent from the enum until separate convention-layer plan picks up `.claude/` dir conventions + session-store probing + skill discovery format; convention coupling map captured in the plan's "Scope boundary" section so the follow-up is well-scoped. ~150-200 lines + 9 test deltas. Picks up after the prereq reframe ships.

### Prereqs architecture reframe — two-tier (Path A) ([`2026-06-11-prereqs-architecture-reframe.md`](2026-06-11-prereqs-architecture-reframe.md))

Audit of `prerequisites.json` shows the "project prerequisites" framing is wrong — nearly every entry (Homebrew, fnm, Git, Node, aio-cli) is actually extension-wide in scope; the "project" frame is a UX shortcut driven by the wizard being the first encounter point. The Claude detection plan exposed the gap: there's no global surface for extension-wide tools, so anything that needs to be discoverable before a user has a project (the soup-to-nuts AI-first promise) doesn't have a home. **Owner-confirmed direction: Path A** — reframe to two tiers, build a non-dismissable first-run welcome panel, repoint the wizard step at project-specific work only, share one install runner across surfaces. **Research complete + 16 decisions locked** through a design-discussion thread (welcome panel non-dismissable, single `prerequisites.json` with `scope` discriminator, `componentRequirements` repurposed as Tier-2 feature→tool map, no sidebar indicator, no uninstall surface, AI engine selection via radio at welcome time + `demoBuilder.ai.engine` setting, no auto-uninstall on engine switch, schema rewrite as Plan Step 1, Claude plan sequenced after this reframe). Three plan-cycle research items remain (`perNodeVersion` runner path, wizard step auto-advance, activation-interrupt precedent). Ready for `/rptc:plan` in a fresh session. Estimated `.116` target. The Claude detection backlog plan ([`claude-cli-detection-and-install/`](claude-cli-detection-and-install/overview.md)) consumes this reframe's primitives and becomes a thin "fill in engine-specific bits" plan once this lands.

### Sync Storefront — auto-resolve managed-file conflicts ([`2026-06-11-sync-storefront-auto-resolve-managed-conflicts.md`](2026-06-11-sync-storefront-auto-resolve-managed-conflicts.md))

Follow-up to the shipped Sync Storefront conflict-visibility fix (Layer 1 makes a rebase conflict appear in Source Control via `git.openRepository`; Layer 2's pre-sync `git pull --ff-only` makes conflicts rare). For the non-technical "just want it to work" user: when ALL conflicting files are Demo-Builder-managed (`config.json`, `fstab.yaml`, etc.) — where the remote copy is authoritative and the user never hand-edits — auto-resolve by taking the remote side, stage, `rebase --continue`, no prompt. Only surface the manual merge editor when the user's own **content** genuinely conflicts (the one case a human must judge). Explicitly NOT a generic "fix any conflict" button (unsafe). **Highest-risk line: rebase inverts ours/theirs** — taking the remote authoritative copy mid-rebase is `git checkout --ours`, not `--theirs`; prove with a test + real F5 repro. Safe default for unknown-class files = treat as content → manual. Rare edge; pick up only if real users hit content conflicts.

### B2B feature pack — dropins never reach the browser — ✅ RESOLVED 2026-06-12 ([`../complete/2026-06-12-b2b-feature-pack-dropin-delivery.md`](../complete/2026-06-12-b2b-feature-pack-dropin-delivery.md))

Shipped via the **opposite** design — the additive overlay was retired. A spike proved `@dropins/*` ship as one coordinated release set sharing internal chunks, so overlaying b2b dropins onto a non-b2b base blank-pages. Instead: added a `citisignal-b2b` package that brands the coherent `boilerplate-b2b-template` base (commit `134e0003`, validated live) and removed the feature-pack mechanism entirely (commit `49b3d6d1`). Doc moved to `.rptc/complete/`.

### Logs toggle → sidebar utility — ✅ SHIPPED 2026-06-12 ([`2026-06-12-logs-toggle-to-sidebar.md`](2026-06-12-logs-toggle-to-sidebar.md))

Implemented this cycle (`feat(sidebar): move the Logs toggle into the sidebar UtilityBar`). Design doc retained for reference. Consolidated the "Logs" affordance from three button locations into a single Logs utility in the sidebar UtilityBar (4th icon), keeping the `toggleLogsPanel()` toggle behavior and removing the dashboard + wizard footer buttons and the dead `viewDebugLogs` handler.


### Console teardown pre-empts one delete blocker of three ([`2026-08-04-console-delete-blockers-not-preempted.md`](2026-08-04-console-delete-blockers-not-preempted.md))

From the 2026-08-04 App Builder deletion/management audit. `consoleProjectTeardown.ts` clears event registrations and providers before deleting a Console project, specifically so the delete never fails with a 409 that doesn't name its cause. Adobe documents three blocking conditions; teardown handles one. The other two — an App Builder app submitted for approval (Pending/Published), and a workspace whose Runtime namespace exposes a shared package — fail identically and silently. Fix is an extension of the existing pre-flight gate, naming the blocker and (for the published case) the revoke-then-delete remedy. Low likelihood for demo projects as we build them (headless catalog apps, never submitted; private per-integration OpenWhisk packages), so this is robustness rather than a live bug. The doc also records the audit's durable findings — `aio app undeploy` unpublishes by default and has no per-action granularity, `removeAppComponent` is already correct, project deletion cleans up the Runtime namespace and CDN assets automatically, and 2021–2022 threads claiming Runtime projects can't be deleted are stale.

### Face buttons vs the kebab — decide it once, for every tile ([`2026-08-04-card-face-buttons-vs-kebab.md`](2026-08-04-card-face-buttons-vs-kebab.md))

Research item, then one cross-tile change. Raised by "why does a mesh get a Redeploy button — it should use the same kebab behavior"; two attempts to answer it on the mesh alone produced a mesh-only exception, which is the signal the question is about the shared verb vocabulary. Today the face carries Deploy/Update/Retry and the kebab carries Redeploy only on a healthy card, so in every state where something is wrong the same operation appears on the face under a different name. The asymmetry any decision must handle: integrations have four labels over TWO real calls (retry and redeploy differ), while every mesh verb resolves to one `onDeployMesh()`. Three options weighed, none chosen. Owner's position is that face buttons are abandoned — if so it applies to all tiles at once.

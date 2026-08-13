# Backlog — Future Work

Plans for features, fixes, and improvements that aren't active yet. Each file is a self-contained plan with the context, scope, and kickoff prompt needed to pick the work up later — possibly months later, possibly by a different agent.

This directory is the **single source of truth** for "what's next." If it belongs here it should not also live in TODO files, the CHANGELOG, or scattered code comments.

## Conventions

- **Shape**: a single file `<topic-slug>.md` for an idea, OR a directory `<topic-slug>/` for an already-structured RPTC plan that's paused (overview + step files).
- **Filename**: `<topic-slug>` or `YYYY-MM-DD-<topic>` — date prefix when the deferral date matters (e.g., the item was scoped during an audit and you want the snapshot date visible).
- **Required sections** (for single-file entries): Provenance · Goal/Scope · Execution plan · Constraints · Kickoff prompt.
- **Before filing, grep `.rptc/plans/` as well as this directory.** An active plan for
  the same work is the more likely home, and a backlog duplicate splits the record. On
  2026-08-07 an item was filed here for work `.rptc/complete/integrations-destination-control/`
  had covered since 2026-08-03, including the very question the session was answering.
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

> **Index last reconciled: 2026-08-13.** Every link resolved mechanically: 62 links, 0 dead,
> 0 unreferenced items. The checker was proved by injecting a link known to be broken and
> confirming it was caught, so "0 dead" is a result rather than a silent pass.
>
> **Same pass audited `.rptc/plans/`, which held 11 directories while the handoff said nothing
> was active.** Five had SHIPPED and were never archived — `integrations-surface` (whose own
> header still read "no code written yet" two weeks after the screen shipped),
> `integrations-grid`, `integrations-destination-control`, `storefront-delivery-probe` and
> `pdp-prerender-validation` (open-looking until you read its handoff). Five were paused or
> gated and moved here. `data-installer` is the only genuinely active plan. Every verdict came
> from an artifact in `src/` or a commit, because several status lines were stale.
>
> An earlier "32 entries vs 34 files" discrepancy was a MEASUREMENT error, not a gap: some
> entries link two files and plan directories count differently. Nothing was missing. Recorded
> because a wrong count in a reconcile note sends the next person hunting for nothing.
>
> **Section C is absent on purpose.** It was "Ready to pick up", emptied when
> `mcp-affordance-coverage` shipped, and was removed rather than left hollow. Letters are not
> renumbered so older references keep resolving.
>
> Descriptions still drift between audits — when in doubt, trust the code and `git log`.

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

Also resolved since last index (now archived to `../complete/`): **oversized test-file splits** (0 `max-lines` warnings — the rule skips blanks/comments, and the worst file counts 481 of 500), **regenerate-AI-files progress** (shipped as `aiRegenProgress` in `useDashboardStatus.ts`; the old note pointed at a `creationProgress` symbol in `features/ai/handlers/`, a path that has since moved to `features/dashboard/handlers/`), **logs-toggle → sidebar**, and **B2B feature-pack dropin delivery**. The **DaLive permission-log "typo"** was a false positive — deleted outright rather than archived, since there was never anything to do.

⚠️ **`jest worker force-exit` was listed here as resolved and is NOT** — see §F. It reproduces on demand as of 2026-08-05.

---

## Active backlog

### A. In flight (active front)

#### App Builder app family — attach a deployable app to a demo ([`2026-06-17-appbuilder-app-deploy-spine.md`](2026-06-17-appbuilder-app-deploy-spine.md))

Add a custom Adobe App Builder app to a demo project as a first-class, deployable component — the App Builder analog of the component-first direction. **Decided model** (from [`../research/app-builder-app-structure/research.md`](../research/app-builder-app-structure/research.md)): one workspace per demo = the API Mesh (separate artifact) + **one** custom app, with multiple integration domains as **packages inside that one app** — so the singleton `meshState` shape fits and no keyed app array is needed. **Build principle:** reuse existing primitives (org targeting, command plumbing, clone/install, the block-library additive pattern), share the mesh deploy scaffold where duplication is real, and hold off on a generalized deployable framework until a 3rd deployable type appears (Rule of Three). Effort 1 (remove the dormant `integration-service` + `appBuilderApps` mechanism) shipped earlier (`c98e5125`); Effort 2 (discovery least-privilege token) **DECLINED 2026-06-15** (no attacker exposure it closes; VS Code Secret Storage is the cheap fix if at-rest plaintext ever matters).

**Shipped (archived 2026-08-13 reconcile; moved to `complete/` in `fe38d1c4`):** [`appbuilder-shell-app`](../complete/appbuilder-shell-app/overview.md) — the "first app": blank-shell catalog entry (`skukla/app-builder-shell`), Developer Agent tooling un-gated to all App Builder-adjacent projects, runtime API access for AI (`list_console_apis`/`add_console_apis` + persisted `additionalConsoleApis`), AI guidance. Steps 1–3 + guidance shipped 2026-07-09; live Firefly walkthrough pending.

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

#### Hybrid storefront — Tier 2 (B2B+B2C in one site) ([`hybrid-storefront-model/`](../backlog/hybrid-storefront-model/overview.md) — still in `.rptc/plans/`)

One CitiSignal storefront serves both B2C individuals and B2B company accounts by customer type at login, on the `boilerplate-b2b-template` base with branding as an overlay (no fork). **Functionally complete** on `develop` — hybrid merge (`b9c31575`), B2B-readiness detection (`24656460`, `c3cd0bbd`), account-chrome overlay, config-flag injection (ADR-009, `bd90c96d`). **⛔ Gated on live login-UX verification**: confirm an individual customer sees no B2B nav rows, a company user does, and B2C is not regressed. The one plan dir that legitimately stays active. Step checks in [`step-02.md`](../backlog/hybrid-storefront-model/step-02.md).

### B. Sequencing / blocked

#### Prereqs architecture reframe — two-tier (Path A) ([`2026-06-11-prereqs-architecture-reframe.md`](2026-06-11-prereqs-architecture-reframe.md))

Reframe `prerequisites.json` from "project prerequisites" to two tiers (extension-wide vs. feature-specific), build a non-dismissable first-run welcome panel, repoint the wizard step at project-specific work only, share one install runner. **Research complete + 16 decisions locked; ready for `/rptc:plan`** — no plan dir or code yet. (The original `.116` target slipped; we're on `.121`.) Unblocks the Claude CLI detection plan below.

#### Engine-aware AI launch + detect + opt-in install ([`claude-cli-detection-and-install/`](claude-cli-detection-and-install/overview.md))

**⚠️ Blocked on the prereqs reframe above.** Engine-aware structure (engine registry keyed by `demoBuilder.ai.engine`, `openInClaude.ts` → `openInAi.ts`), lazy install-gate notification, opt-in Homebrew install. **Partially started** — `demoBuilder.ai.engine` DOES exist (`package.json:345`, documented at `src/commands/CLAUDE.md:204`); the earlier "not started" note was wrong on that half. Still absent: the `openInClaude.ts` → `openInAi.ts` rename and the engine registry. Becomes a thin "fill in engine-specific bits" plan once the reframe lands.

#### Adobe org-context — residual workstreams ([`2026-06-15-adobe-org-context-self-heal-consolidation.md`](../complete/2026-06-15-adobe-org-context-self-heal-consolidation.md))

Core self-heal **shipped** (see Recently shipped). Residual scope from the original consolidation, **verify against current code before picking up**: (B) concurrency safety — re-pin under an exclusive lock spanning select→command and/or per-project `aio` config isolation; (C) human org-picker (real `get-organizations`/`select-org`) + typed non-retryable `ORG_MISMATCH` for agents + AGENTS.md/skills guidance. Was the FIX-FIRST gate for the App-Builder-deployable + workspace work; the gate is cleared now that the self-heal landed.

#### Generated diagnosis skill — teach agents how to LOOK ([`2026-08-11-generated-diagnosis-skill.md`](2026-08-11-generated-diagnosis-skill.md))

Of the 13 generated skills, **zero** cover diagnosis — every one is a do-this-task skill (verified 2026-08-11: `grep -rli "troubleshoot\|diagnos\|debug"` over `templates/skills/` returns 0 files). So a tool like `get_store_structure` has no home: an agent finds it by tool search, but nothing says to check store scope *when PDPs come back empty* — the failure that cost an afternoon in the PDP handoff §3. Scope is one symptom → check routing table (shaped like `sync-changes.md`), covering the eight read tools plus the Diagnostics command and Debug Logs channel; the file carries the inventory. **Not blocked — ready to execute.** Listed here only because it needs an `AI_CONTEXT_VERSION` bump, which re-prompts every existing project to regenerate; worth batching with another bundle change rather than shipping alone.

#### Audit: project-level facts stored per-component ([`2026-08-11-project-level-facts-stored-per-component.md`](2026-08-11-project-level-facts-stored-per-component.md))

`componentConfigs` is keyed by who CONSUMES a value, not by what the value IS, so one fact is stored once per declaring component. Measured 2026-08-11: **17 of 25** declared env vars have more than one owner; 6 are the Commerce scope keys (single-sourced 2026-08-11), leaving **11**. The drift mechanism is NOT a second writer — there is none; it is that Configure's fan-out targets come from `selectedComponents`, so a component holding a copy but missing from the selection lists never gets updated (the same gap `reconcileComponentSelections` exists for). That is **key-agnostic**, so all 11 are exposed. Two candidate fixes: widen the fan-out target set (one change, every key) or single-source per key (what scope got). **Do the fan-out audit first** — it may make most of the per-key work unnecessary. **Not blocked.**

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

#### Jest worker force-exit ([`2026-06-09-jest-worker-force-exit.md`](2026-06-09-jest-worker-force-exit.md))

⚠️ **Was listed as resolved; it is not.** "A worker process has failed to exit gracefully" returned
when `maxWorkers` went 25% → 75% (`3c17791e`, 2026-08-05). Now reproducible on demand — **0/3 runs at
25%, 3/3 at 75%** — which is a far better starting point than the original filing had. The item's
hypothesised cause is **stale**: the `useMeshDeployment.ts:211` 180s timer it named no longer exists,
and no un-`unref`'d long timer remains in `src`. Higher concurrency did not create a leak, it changed
suite-to-worker packing and exposed one. Tests pass and CI is green, so the cost is only the noise
floor — which is precisely what this item exists to protect.

#### Full-suite timeout flake ([`2026-08-13-jest-full-suite-timeout-flake.md`](2026-08-13-jest-full-suite-timeout-flake.md))

**Same suspect as the item above, harder consequence — pair them.** A full run fails **~3 suites,
a different set each time**, on **timeouts rather than assertions**; every affected suite passes in
isolation. Two consecutive runs on 2026-08-13 failed disjoint sets. The sharpest evidence is a
wall-clock assertion that measured **12,793 ms against a 2,000 ms bound** — nothing behavioural
changed, the process was starved. Where force-exit costs only a noise floor, this costs the gate:
**every "full suite green" in this repo is one sample of a noisy process.** Start from that item's
`0/3 at 25%, 3/3 at 75%` measurement rather than re-deriving it; step 1 here is a 10× baseline,
because a flake "fixed" by one green run is a flake you stopped looking at.

### G. Live defects (filed 2026-07-29, verbatim in `v1.0.0-beta.121`)

#### Make third-party AI tooling visible, optional, and coherently gated ([`2026-08-13-third-party-tooling-visible-and-optional.md`](2026-08-13-third-party-tooling-visible-and-optional.md))

Filed 2026-08-13. Most of this already works — packages install automatically into the
isolated `.demo-builder-mcp/`, `.mcp.json` is written for the user, install failure is
surfaced, a package that goes missing is caught by `detectMcpDrift` and healed, a broken
server shows in the AI Capabilities modal, and `scrape-reference-site` tells the agent how to
recover. Three gaps remain. **(1) The biggest download is invisible:** `@playwright/mcp` is
only the server; Playwright fetches a ~150 MB Chromium on first USE, and nothing in `src/`
knows that binary exists — on a restricted network it fails at an agent mid-scrape, as an
error the extension never sees. **(2) Progress is a label, not progress** — one opaque step
claiming "up to a minute" it cannot know. **(3) There is no opt-out, and the blocker is not
the toggle:** `ai-defaults.json` declares packages, `DEMO_BUILDER_ALWAYS_ON_SKILLS` declares
skills, and **nothing connects them** — the skill→tool dependency exists only as prose inside
skill bodies, so "which skills are disabled if I opt out?" has no machine-readable answer.
Nor is it all-or-nothing: of the six EDS scraping skills only three drive Playwright, the
other three work on already-scraped material. **The state to avoid is a skill that tells an
agent to use a tool that is not installed** — worse than no skill, because the agent tries,
fails and improvises. Step 1 is declaring the dependency. Do the composition axis of
[`2026-08-13-tier-the-ai-bundle-refresh.md`](2026-08-13-tier-the-ai-bundle-refresh.md) first;
this shares its gate. Not blocked.

#### Watch both AI-bundle staleness axes, then refresh proportionately ([`2026-08-13-tier-the-ai-bundle-refresh.md`](2026-08-13-tier-the-ai-bundle-refresh.md))

Filed 2026-08-13 out of the `global-mcp-version-pin` work, then **widened by research that
reversed half of it**. The first framing was "the prompt fires too often": "Regenerate AI
files" is three jobs behind one button — rewrite config paths (instant, offline), rewrite
skills + AGENTS.md (fast, offline), install MCP tool packages (slow, networked, can fail) —
and it asks permission for the third every time, because `AI_CONTEXT_VERSION` is one integer
and the check cannot tell which changed. `.127` and `.128` each re-prompted every project for
a small change. **But it also UNDER-fires, which is worse.** Which packages a project needs
is a function of its COMPONENTS (`projectNeedsAppBuilderTooling`), and the freshness check
never looks at them — so `addAppBuilderComponent` on a live project leaves it qualifying for
`@adobe-commerce/commerce-extensibility-tools` and the seven `appbuilder-*` skills while
receiving neither, silently. Storefront setup has the same shape. The upgrade flow is mostly
innocent: of six update kinds only `performAdobeMcpUpdates` regenerates, and the others do
not change component membership — **the gap is in ADD, not UPDATE.** Supporting finding: the
extension already regenerates silently on that update path, so "regeneration needs consent"
is already false here; two routes just disagree. **Settle first:** the prompt is currently
the only thing protecting a hand-edited `AGENTS.md`. **And the plan makes more things
silent, so it carries a logging section:** today the freshness check logs only on the
stale branch, so "checked and fine" and "never ran" are the same silence — the
`|| echo "none"` ambiguity in another costume, and the reason the under-firing case is
invisible. **Step 0 is reproducing the silent case.** Not blocked.

#### AI surface coverage — tools and skills vs features ([`ai-surface-coverage/`](ai-surface-coverage/))

Paused 2026-08-13 with the research done and seven steps written; deferred so a live defect
could go first. Measured: **58 tools, 14 skills, 67 handlers** across five feature maps, 26
exposed by descriptor rows. The apparent gap is mostly not one — reading the 41 handlers
without a row splits them into UI navigation, fire-and-forget dispatchers, and capability
already reachable through one of the 32 tools registered outside the descriptor tables. That
turned up a disqualifier `mcp-tool-authoring` does not state: a handler can be perfectly
headless and still unexposable because its return carries the DISPATCH rather than the
OUTCOME (`handleSyncStorefront` is two lines that run a command and return success), so
exposing it hands an agent a tool that cannot fail. Real gaps are on the guidance side —
authentication has 8 tools and no skill, mesh has 3 and none dedicated, prerequisites has no
surface at all. Step 01 is mechanical and the worklist of all 41 is written; backing research
is `.rptc/research/ai-surface-coverage/research.md`. **Not blocked.**

#### `export_project_settings` ignores `includeSecrets` ([`2026-08-11-export-settings-ignores-include-secrets.md`](2026-08-11-export-settings-ignores-include-secrets.md))

Filed 2026-08-11, found in passing during Data Installer credential research. `includeSecrets: false`
writes secrets to the file **and** returns `includesSecrets: false` — not a missing filter but an
affirmative false claim, and the MCP tool's description explicitly promises "pass `includeSecrets:false`
for a secret-free copy" (`actionDescriptors.ts:126-130`). Whole chain traced: the flag threads correctly
through four hops and is then consumed only to stamp a label, while
`settingsSerializer.ts:156` emits `componentConfigs` unconditionally. Exposes
`ADOBE_COMMERCE_ADMIN_PASSWORD`; SecretStorage-backed secrets are unaffected. Existing tests pin the
flag's value, not any stripping. Two entry points also disagree on the default (`false` at
`settingsSerializer.ts:203`, `true` at `settingsTransferService.ts:305`). **Public repo → `high`.**

#### Reset consent only when there is something to lose ([`2026-07-29-reset-consent-only-when-there-is-something-to-lose.md`](2026-07-29-reset-consent-only-when-there-is-something-to-lose.md))

**In progress** — classifier landed on `develop`; UI wiring remains. New repos already pin + patch
unconditionally (ADR-006 Step 4b). Only the **existing-repo** path gates on the `resetToTemplate`
checkbox, so an empty or non-storefront repo left unticked proceeds with no template, no LKG pin and
no canonical patches, then reports `Complete`. Replaces one default-off checkbox with three states:
auto-setup when empty, **refuse** when populated-but-not-a-storefront (the repo that prompted this had
53 blocks and no `scripts/scripts.js`), prompt only when there is something to lose.

#### PDP routing silently broken two ways ([`2026-07-29-code-patches-not-rehydrated-in-edit-mode.md`](2026-07-29-code-patches-not-rehydrated-in-edit-mode.md) · [`2026-07-29-pdp404-stale-sha-conflict.md`](2026-07-29-pdp404-stale-sha-conflict.md))

Both found in a live Extension Host run, both present in `v1.0.0-beta.121`, neither a hotfix
regression. (1) `edsConfig.codePatches`/`codePatchSource` are produced only by `WelcomeStep`, so every
edit-mode republish trips a **silent** early return at `storefrontSetupPhase1.ts:115` and the ADR-007
SKU-encoding patches never apply. (2) Inspector Tagging writes `scripts/delayed.js` via the Git Tree
API; PDP404 then reads it via the Contents API and commits with a stale SHA, skipping the smart-404
install. Together with the Configuration Service 403 (the only one that surfaces a message), a
storefront can finish with no PDP support by any mechanism and still report `Complete`.

#### App Builder attach — Model A seed ([`2026-06-15-integration-service-cleanup-and-discovery-token.md`](2026-06-15-integration-service-cleanup-and-discovery-token.md))

Effort 1 (remove the dormant `integration-service` + `appBuilderApps` mechanism) **shipped** on
`develop`. **Active seed:** add 1+ App Builder apps to a demo project (**Model A** — user-supplied git
repos deployed via `aio app deploy` into the demo's existing workspace; the Mesh lifecycle,
multiplied). Supersedes the old Effort 1b cleanup. **Effort 2 (discovery least-privilege token):
DECLINED 2026-06-15** — closes no attacker exposure; VS Code Secret Storage is the cheap fix if
at-rest plaintext ever matters.

---

## Recently shipped — 2026-08

Pointers only; `../complete/` holds each writeup and git history holds the implementation.

- **Mesh deployment state: one fact, five readers, two writers** ([`../complete/2026-08-04-mesh-deployment-state-one-accessor.md`](../complete/2026-08-04-mesh-deployment-state-one-accessor.md))
- **One status vocabulary, three tables** ([`../complete/2026-08-04-two-status-vocabularies-one-grid.md`](../complete/2026-08-04-two-status-vocabularies-one-grid.md))
- **Storefront staleness misses the two PaaS endpoints** ([`../complete/2026-08-04-storefront-staleness-misses-paas-endpoints.md`](../complete/2026-08-04-storefront-staleness-misses-paas-endpoints.md))
- **Cosmetic Adobe reads should be non-interactive** ([`../complete/2026-08-04-cosmetic-adobe-reads-should-not-prompt.md`](../complete/2026-08-04-cosmetic-adobe-reads-should-not-prompt.md))
- **Face buttons vs the kebab** ([`../complete/2026-08-04-card-face-buttons-vs-kebab.md`](../complete/2026-08-04-card-face-buttons-vs-kebab.md))
- **The add path bypasses the "one deploy-record writer"** ([`../complete/2026-08-04-two-deploy-record-writers.md`](../complete/2026-08-04-two-deploy-record-writers.md))
- **Console teardown pre-empts one delete blocker of three** — closed as robustness, not a live bug ([`../complete/2026-08-04-console-delete-blockers-not-preempted.md`](../complete/2026-08-04-console-delete-blockers-not-preempted.md))
- **A second, dead, unwrapped mesh-creation implementation** ([`../complete/2026-08-04-dead-second-mesh-create-implementation.md`](../complete/2026-08-04-dead-second-mesh-create-implementation.md))
- **Eleven superseded message handlers, still registered** ([`../complete/2026-08-05-eleven-superseded-message-handlers.md`](../complete/2026-08-05-eleven-superseded-message-handlers.md))
- **MCP socket resolution: existence is no longer evidence of liveness** — filed and shipped 2026-08-10 alongside the socket-TOCTOU fix that created the condition; `resolveProxyTarget` now probes liveness first and falls back to existence only once some window is confirmed live ([`../complete/2026-08-10-mcp-socket-existence-is-not-liveness.md`](../complete/2026-08-10-mcp-socket-existence-is-not-liveness.md))

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

### Compositional Adobe demo builder (north star) ([`compositional-demo-builder.md`](compositional-demo-builder.md))

The umbrella direction: evolve the extension from **prebuilt commerce packages** to a **compositional Adobe demo builder** — the SC composes a demo from an **owning system** (what a creation wizard provisions) **+ connected systems they add** (App Builder instances like API Mesh / the Commerce Prerenderer, AEP, other backends), over the existing `componentSelections.{integrations[],appBuilder[]}` slots (additive, not a framework rebuild). Several features ladder into it — the synced storefront (first instance), an **App Builder add-flow** (next), a content-SC wizard. This is the north-star/umbrella; the features below are the scoped work. Guardrails: neutral spine + YAGNI on the general composer (no plugin framework ahead of its second real user).

### Commerce-connect: two-SC synced storefront demos ([`commerce-connect-aem-sc/`](commerce-connect-aem-sc/overview.md))

**The first feature under the [compositional demo builder](compositional-demo-builder.md) direction.** Let two solutions consultants — a **Commerce SC** and a **Content SC** — each demo their own use case on one opportunity from **two identical-looking, fully-transacting storefronts**, despite working in **separate Adobe accounts**. **Locked target (2026-06-04):** both SCs use the extension; a **neutral code upstream** (a commerce boilerplate that supports **AEM Sites authoring** — `aem-boilerplate-xcom`) is **forked by each SC into their own org** and kept in sync, so the two sites share look/design/commerce; **each authors their own content** (the **Content SC in their own AEM Sites** — the non-negotiable point); both transact against the **Commerce SC's backend**. Governed by Adobe EDS's **canonical-site rule** (one repo = one org's site; one content source per site), which is *why* it's two forks, not one shared site — the Content SC's AEM org-binding forces the split, and we accept it. **The spine and the gating unknown are the same: AEM Sites as a content source** (the extension is DA.live-only today — verify live first). Reuses the sync engine, the commerce dropins, Connect-Commerce. Start the [`overview.md`](commerce-connect-aem-sc/overview.md) → the architecture + decision trail in [storefront-topology](commerce-connect-aem-sc/storefront-topology.md) → the [roadmap](commerce-connect-aem-sc/roadmap.md). Older docs in the folder carry superseded framing — see the overview's table. Architecture seam: [ADR-003](../../docs/architecture/adr/003-multisite-architecture-seam.md).

### AI Ready: surface skills drift as amber ([`2026-06-01-ai-ready-skills-drift.md`](2026-06-01-ai-ready-skills-drift.md))

Skills are scaffolded into `.claude/skills/` at project creation; new skill templates shipped by the extension never reach existing projects until "Regenerate AI Files" is invoked manually. Users have no signal of the drift until an agent fails to load an expected skill mid-task. Goal: detect missing (and optionally outdated) skill files in the verify path, surface as a new yellow "Skills outdated" branch on the AI Ready badge with the drift list rendered in `AiCapabilitiesModal`. Single-day work — detector in `skillsWriter.ts`, one branch in `useDashboardStatus.ts` `aiReady` memo, list-rendering in the modal. First slice: missing files only; hash-based content drift deferred.

### Retire `legacyLookupKey` infrastructure — DA/repo unification cleanup ([`2026-06-08-rename-existing-da-content-to-repo-name.md`](2026-06-08-rename-existing-da-content-to-repo-name.md))

The user-facing piece — wizard always producing matching names + auto-migration on reset for existing mismatched storefronts — shipped in commits `23efd831` and `b2169699` (2026-06-08). This entry is now scoped to the follow-up cleanup batch: retire `SiteRegistrationParams.legacyLookupKey`, the `cleanUpLegacyRegistration` branch in `ConfigurationService.updateSiteConfig`, the fourth argument to `buildSiteConfigParams`, and the `daLiveSite` field on `eds-storefront` manifest metadata. Single-day deletion-only commit. Pick up after telemetry confirms no `storefrontNameMigration` activations across the SC team for 30+ days (every active storefront has been reset on a post-migration build).

### Jest worker process force-exits during parallel test runs ([`2026-06-09-jest-worker-force-exit.md`](2026-06-09-jest-worker-force-exit.md))

Broad Jest sweeps emit "A worker process has failed to exit gracefully and has been force exited" after all tests pass. `--detectOpenHandles` reports zero open handles. Pre-existing — visible on multiple branches today including PR #44 merge verification, BYOM Phase 1 ship, and the auth-fix branch. Likely smoking gun: `setTimeout(..., 180_000)` in `useMeshDeployment.ts:211` that may not be cleared when its test unmounts. ~30 min to investigate, ~10 min to fix if confirmed. Medium priority — not blocking, but the noise floor obscures genuine new leakage from future work.

### Sync storefront templates with canonical Boilerplate Commerce upstream ([`2026-06-09-storefront-template-sync.md`](2026-06-09-storefront-template-sync.md))

Three storefront-template repos under our control have substantially drifted from Adobe's canonical `hlxsites/aem-boilerplate-commerce`: `citisignal-eds-boilerplate` 185 behind / 145 ahead, `demo-system-stores/accs-citisignal` 212 behind / 119 ahead, `buildright-eds` **1,541 behind / 589 ahead**. Drift surfaced during the My Account left-nav bug investigation (selector race fix shipped as `citisignal-eds-boilerplate#2`). Per-repo strategy varies: cherry-pick for the two citisignal repos, fresh-fork-and-reapply for buildright (1,541 commits is past the audit-feasibility threshold). Risks include downstream Demo Builder storefronts breaking on next reset, drop-in version coupling, and content/code coupling between the two citisignal repos. Detailed playbook + per-repo recommendations in the file.

### Evaluate dropping storefront forks in favor of thin-layer customization ([`2026-06-09-evaluate-thin-layer-storefront-model.md`](2026-06-09-evaluate-thin-layer-storefront-model.md))

**Gates the storefront-template-sync project above.** The sync inventory revealed three forks drifted by 185, 212, and 1,541 commits behind canonical. Before committing to syncing them, audit the customizations: what proportion are additive (new blocks, content, theme) vs. modifications to canonical code (the selector fix from `citisignal-eds-boilerplate#2` is a modification). If >85% additive, drop the forks and migrate customizations into Demo Builder configuration — Demo Builder points at canonical `hlxsites/aem-boilerplate-commerce` directly and applies customizations as a thin patching layer at create time (existing `contentPatches` + block library installation, plus potentially a new code-patches mechanism for the modification cases). Owner is interested in this approach; outcome determines whether the sync project happens or gets dropped entirely.

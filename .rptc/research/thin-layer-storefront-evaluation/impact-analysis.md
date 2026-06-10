# ADR-006 Impact Analysis — Update System & AI Tooling

**Date**: 2026-06-10
**Companion to**: `findings.md` (the fork audit) and ADR-006
**Question**: What in the extension's update functionality and AI tooling needs to change under ADR-006 (forks retired; canonical at LKG SHA + external patches)?

## TL;DR

- **Update system**: real work, but contained. Four touchpoints change (template-commit recording, template-update checking, template sync, reset helper); the fork-sync subsystem degrades gracefully to a no-op for CitiSignal without code changes; everything else (extension/component/addon updates) is untouched.
- **AI tooling**: effectively zero impact. All 9 MCP tools and all 12 shipped skills are fork-agnostic — they operate on the user's storefront repo and config, never on the template's identity. One stale doc note found (unrelated to ADR-006).
- **One naming trap resolved**: the `accs-citisignal` *DA.live content site* (`demo-system-stores/accs-citisignal` on content.da.live) is **not** the GitHub fork and **survives** ADR-006. Only the GitHub code repos retire. The shared name is a coincidence of provenance, not a dependency.
- **One open decision blocks config work**: where the 9 custom blocks live once the fork is archived (`block-libraries.json` currently sources them from the fork).

---

## Area 1: Update functionality

### 1.1 The "out of date forks" check — `forkSyncService.ts` (degrades gracefully, keep)

This is the subsystem the owner remembered. `checkUpdates.ts:checkForkSyncUpdates` (lines ~358–395) iterates all projects, takes each project's **template repo** (`getTemplateSource(project)` → e.g. `skukla/citisignal-eds-boilerplate`), and asks GitHub whether that repo is a fork that's behind its upstream parent. If so, the Updates QuickPick offers a one-click **merge-upstream** sync (`forkSyncService.ts:111`, GitHub `merge-upstream` API; executed via `updateExecutor.ts:performForkSyncUpdates`).

**Under ADR-006**: for CitiSignal the template becomes `hlxsites/aem-boilerplate-commerce`, which is not a GitHub fork → `checkForkStatus` returns `isFork: false` → no QuickPick item. **The subsystem no-ops for CitiSignal with zero code changes.** Keep it: it still serves other packages whose templates are forks (isle5, buildright) until their dispositions are decided. Retire it only when no package uses a forked template. Note: once the CitiSignal forks are archived on GitHub, merge-upstream against them would fail anyway (archived repos are read-only) — another reason the graceful no-op matters: nothing must be pointed at the forks when archiving happens.

Secondary call site: `updateApplyService.ts:341` runs the same fork check against block-library/addon **sources**. Today `demo-team-blocks` sources from the fork, so this check follows wherever the blocks move (see 1.6).

### 1.2 Template version recording at create time — `executor.ts` (must change)

`executor.ts:533` calls `fetchTemplateCommitSha()` (defined at `:594`), which fetches the **template repo's latest `main` commit** and stores it as `lastSyncedCommit` in the EDS component metadata.

**Under ADR-006**: the recorded SHA must be the **LKG canonical commit** read from the patches repo's `last-known-good` file — not whatever canonical `main` happens to be at create time. This is the anchor for everything in 1.3–1.5. Suggested metadata addition: record the patches-repo ref consumed alongside the SHA, for traceability.

### 1.3 Template update detection — `templateUpdateChecker.ts` (must change)

Compares the project's `lastSyncedCommit` against the template repo's latest `main` commit via `getLatestBranchCommit` (line 85) and reports `commitsBehind`.

**Under ADR-006**: "is there a template update?" becomes "**has the LKG pointer advanced past my `lastSyncedCommit`?**" — fetch the LKG SHA from the patches repo instead of canonical `main`. This is the better semantics anyway: it never offers an update to a canonical state our patches haven't been verified against. A storefront is "up to date" when it matches LKG, even if canonical `main` is ahead.

### 1.4 Template sync — `templateSyncService.ts` (deprecate merge, keep reset)

Offers two strategies: `merge` (clone user repo, add template as remote, `git merge`, preserve `fstab.yaml`/`config.json`) and `reset` (replace with template state), updating `lastSyncedCommit` after success.

**Under ADR-006**: the **merge strategy loses its meaning** for CitiSignal. Merging canonical into a storefront that contains applied patches + installed blocks produces conflicts with the thin layer itself; the layered model's only coherent update operation is *re-create the layers*: clone canonical at new LKG → apply patches → reinstall blocks → restore preserved files. That is exactly the existing **reset** flow. Recommendation: route template updates for thin-layer packages through reset, and keep merge only for packages still on forked templates (or deprecate it with them). This mirrors what ADR-006 already says: "reset becomes the delivery vehicle."

### 1.5 Reset flow — `edsResetRepoHelper.ts` / `edsResetService.ts` / `storefrontSetupPhase1.ts` (must change, mechanically small)

- `storefrontSetupPhase1.ts:136` creates the SC's repo via GitHub's generate-from-template API against `templateOwner/templateRepo`. Works unchanged against canonical (the API works on any repo); the generated repo is **not a fork** (no fork lineage), which is also what makes 1.1 no-op. Caveat to verify at implementation: generate-from-template produces a repo at template **HEAD** — pinning to the LKG SHA needs a follow-up reset/force-push step or a different clone strategy.
- `edsResetRepoHelper.ts:53` fetches placeholder files from the template's `aem.live` preview URL — points at canonical's preview after the config flip.
- The reset sequence gains one step: **apply code patches** (fetched from the patches repo) after reset-to-template, before block installation — the slot where v1's patch application lived and where the smart-404 vendoring already runs.
- `edsResetService.ts` orchestration is otherwise unchanged.

### 1.6 Config files (the actual fork pointers)

`demo-packages.json` — the CitiSignal package's two EDS storefronts both carry:

| Field | Today | Under ADR-006 |
|---|---|---|
| `source.url` / `templateOwner`+`templateRepo` | `skukla/citisignal-eds-boilerplate` | `hlxsites/aem-boilerplate-commerce` — **the `custom` package already uses exactly this shape**, so there's an in-config precedent to copy |
| `contentSource` | `org: demo-system-stores, site: accs-citisignal` | **Unchanged.** This is the DA.live content site, not the GitHub fork. Same name, different system; the audit found zero DA content in the git repos. |
| `contentPatchSource` | `skukla/eds-demo-content-patches` (path `citisignal`) | Unchanged; gains a sibling **code-patch source** + the LKG pointer location (new fields, implementation-defined) |

`block-libraries.json` — `demo-team-blocks` sources the 9 custom blocks from `skukla/citisignal-eds-boilerplate@main`, with `nativeForPackages: ["citisignal"]`.

**RESOLVED 2026-06-10 (owner decision, supersedes the options below)**: the blocks are the *demo team's*, shipped in their boilerplate at `demo-system-stores/accs-citisignal` — copying them anywhere recreates the sync smell. `demo-team-blocks.source` flips to the demo team's repo directly. This works with **zero installer changes**: block discovery is dynamic (scans the source's `blocks/`), and dedup-against-destination means only net-new blocks install — the demo team's modifications to canonical blocks can't bleed through. Consequence: `accs-citisignal` is *not* archived; it's demoted from "our template" to "block-source upstream" (ADR-006 amended). Migration prerequisite: PR our fork's two product-teaser fixes to the demo team's repo before flipping, or they're lost. Fallbacks if the demo team won't take a fix: carry it as a code patch (patches apply after block install, so they can target installed blocks), or — last resort — shadow the broken block via a higher-priority override library entry. *(Original options preserved for the record: (a) dedicated blocks repo; (b) blocks tree in patches repo; (c) interim archived-fork source. All rejected as copies.)*

`components.json` — `aiSkillBundle.path` already references `aem-boilerplate-commerce/skills` (canonical); content-source entries mirror demo-packages and follow the same "DA.live site stays" rule.

### 1.7 Untouched

`updateManager.ts` (extension updates via GitHub Releases), `extensionUpdater.ts`, `componentUpdater.ts` (component artifacts, snapshot/rollback), `addonUpdateChecker.ts`, `adobeMcpUpdateChecker.ts`, `storefrontStalenessDetector.ts` (env-var staleness → config.json republish; nothing to do with templates), `storefrontRepublishService.ts`. None compare anything against template repos.

---

## Area 2: AI tooling (MCP server, skills, context files)

### 2.1 MCP server — no changes

All 9 tools (`list_projects`, `get_project`, `get_component_config`, `update_project_config`, `sync_storefront`, `list_blocks`, `get_block_source`, `promote_block_to_library`, `remove_block_from_library`) operate on the **user's storefront repo and project config**, resolved from project metadata (`githubRepo` = the SC's created repo, never the template). Whether that repo was generated from a fork or from canonical is invisible to every tool. `sync_storefront` is plain `git add/commit/push` on the storefront; the block tools read/write the storefront's own `component-definition.json`. Verified: no fork names anywhere in `src/mcp-server.ts` or `src/features/ai/`.

One semantic note worth a line in the implementation plan, not a code change: agent edits pushed via `sync_storefront` live in the storefront repo and are **wiped by reset** — true today under the fork model, equally true under ADR-006. The persistence boundary (storefront repo = disposable; block library/patches repo = durable) doesn't move.

### 2.2 Skills — no changes

All 12 skills in `src/features/project-creation/templates/skills/` enumerated and scanned: `register-custom-block`, `remove-custom-block`, `sync-changes`, `add-component`, `create-eds-project`, `update-credentials`, `scrape-reference-site`, `connect-authenticated-site`, `commerce-block-mapper`, `demo-data-injector`, `header-nav-footer`, `refine-visual-match`. Zero references to the fork repos, template repos, or upstream syncing. They direct agents at MCP tools and the local storefront — all origin-agnostic. `create-eds-project` keeps working verbatim when the backend flips to canonical+patches.

### 2.3 Context file generation — one stale note (pre-existing, not ADR-006)

`aiContextWriter.ts` (generates `AGENTS.md`) is fork-agnostic — repo links and block-library lists flow from project metadata and config. One stale line found at `aiContextWriter.ts:309`: "Library promotion is a planned future Demo Builder feature" — written before `promote_block_to_library` shipped. Worth fixing, but it predates and is independent of ADR-006.

---

## What the implementation plan must account for (consolidated)

1. `executor.ts` — record LKG SHA (from patches repo) as `lastSyncedCommit` at create; consider recording the patches-repo ref too.
2. `templateUpdateChecker.ts` — compare against LKG pointer, not canonical `main`.
3. `templateSyncService.ts` — deprecate `merge` for thin-layer packages; updates go through reset.
4. `edsResetRepoHelper.ts` / pipeline — clone canonical at LKG SHA (verify generate-from-template pinning caveat); add patch-application step before block install; placeholder fetch follows config.
5. `demo-packages.json` — flip CitiSignal template fields to canonical (mirror the `custom` package); add code-patch + LKG source fields; **leave `contentSource` alone** (DA.live site, not the fork).
6. `block-libraries.json` — flip `demo-team-blocks.source` to `demo-system-stores/accs-citisignal` (the demo team's boilerplate; resolved decision, see 1.6). **Prerequisite: PR the fork's two product-teaser fixes to the demo team first.**
7. `forkSyncService` subsystem — no change now (no-ops for canonical templates); schedule retirement when the last forked-template package is gone.
8. AI tooling — nothing required; optionally fix the stale `aiContextWriter.ts:309` note while in the area.
9. Sequencing constraint: nothing may still point at `skukla/citisignal-eds-boilerplate` on the day it's archived — the block-source flip (item 6) and the teaser PRs must land first. (`accs-citisignal` is not archived; it stays live as the block-source upstream.)

## Sources

- `src/features/updates/`: `updateManager.ts`, `componentUpdater.ts`, `templateUpdateChecker.ts` (lines 5–110), `templateSyncService.ts` (strategies, lines 29–45), `forkSyncService.ts` (full read), `updateApplyService.ts:91,294,341`, `commands/checkUpdates.ts:358–395`, `commands/updateExecutor.ts:97`
- `src/features/project-creation/handlers/executor.ts:533,594`; `services/aiContextWriter.ts:153–380`; `services/mcpConfigWriter.ts`
- `src/features/eds/`: `services/edsResetRepoHelper.ts:38–243`, `edsResetService.ts`, `handlers/storefrontSetupPhase1.ts:105,136`, `services/edsPipeline.ts:49–50,318–360`
- Config: `demo-packages.json` (citisignal + custom package entries), `block-libraries.json` (demo-team-blocks), `components.json:54,240,245`
- AI: `src/mcp-server.ts`, `src/features/ai/server/inExtensionMcpServer.ts`, all 12 files in `src/features/project-creation/templates/skills/`
- Method: two parallel read-only exploration passes + direct verification of every load-bearing claim (file/line greps and config JSON parsing reproduced above in session)

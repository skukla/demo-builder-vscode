# Legacy / Soft-Deprecation Cleanup — Cycle Plan

## Provenance

This plan was produced during the post-Cycle-C audit (commit `5cfb4539` on `feature/ai-layer-cycle-c`, 2026-05-21). The audit inventoried every `@deprecated`, `legacy`, `backward compatibility`, and `Kept for compatibility` reference in `src/`. The findings were **deferred** from that audit because the scope spans many features outside the AI Layer Pivot. This document captures the deferred work so it survives until a future cycle picks it up.

## Standing rule

From `feedback_no_soft_deprecation.md` in user memory:

> "When something is obsolete, delete it outright; do not leave accepted-but-ignored schema or (Deprecated) stubs."

This cycle enforces that rule across the codebase by either (a) deleting the deprecated thing outright when nothing depends on it, or (b) migrating the live callers to the canonical API and then deleting.

## Scope — what counts as "legacy" for this cycle

**Category A — KEEP.** Legitimate uses outside the rule:
- Comments describing **external systems'** deprecated features (shell syntax, Helix's fstab data model, etc.)
- One-time **migration code** that reads BOTH old and new formats (not soft deprecation — it's an active migration path)
- **API flexibility** statements (accepts old + new value shapes — not a deprecation, just polymorphism)

**Category B — REMOVE.** Real soft deprecation in Demo Builder's own code:
- `@deprecated` JSDoc tags on shipping APIs
- Type fields / union variants marked "Kept for backward compatibility"
- Re-exports labeled "for backward compatibility"
- Runtime deprecation warnings
- Aliases that exist purely to avoid breaking callers

**Category C — historical mentions** of past architecture in comments. Low priority; clean opportunistically if a file is already being touched.

## Phase 1 — Re-discovery (handles drift since 2026-05-21)

Run these greps and compare against the snapshot below to detect what has been added/removed since the original audit:

```bash
grep -rn 'legacy\|backward.compat\|deprecat' src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

Re-classify each hit into A / B / C. Update the inventory below.

## Inventory snapshot (2026-05-21)

### Category A (KEEP — verified legitimate)

- `src/mcp-server.ts:150` — shell syntax security comment
- `src/features/eds/services/fstabGenerator.ts:14,26` — Helix data model
- `src/features/eds/services/helixService.ts:152-166` — one-time secret migration
- `src/core/state/stateManager.ts:94` — active old-format migration
- `src/core/logging/stepLogger.ts:67` — active wizard step id migration
- `src/types/typeGuards.ts:456,469` — active project shape fallback
- `src/core/commands/ResetAllCommand.ts:60` — active legacy data cleanup
- `src/core/ui/utils/spectrumTokens.ts:6,69,81` — API polymorphism
- `src/core/ui/components/layout/GridLayout.tsx:24` — same polymorphism

### Category B (REMOVE — real soft deprecation)

**Zero-caller items (delete outright, no migration needed):**

| Item | Location |
|---|---|
| `WizardStep 'adobe-org'` | `webview.ts:18` |
| `WizardStep 'data-source-config'` | `webview.ts:30` |
| `WizardStep 'connect-services'` | `webview.ts:31` |
| `ProgressUnifier.ts:671` `formatElapsedTime` back-compat re-export | tests only — verify tests use it, or migrate test then delete |

**Wizard step renames (small migration, 1–4 callers each):**

| Old | New | Callers |
|---|---|---|
| `'adobe-setup'` | `'adobe-auth'` / `'adobe-project'` / `'adobe-workspace'` | 4 |
| `'adobe-context'` | (canonical TBD per use site) | 1 |
| `'eds-github'` | `'eds-connect-services'` | 1 |
| `'eds-dalive'` | `'eds-connect-services'` | 2 |
| `'component-config'` | (canonical TBD) | 1 |
| `'commerce-config'` | (canonical TBD) | 1 |
| `'org-selection'` | (canonical TBD) | 1 |
| `'project-selection'` | (canonical TBD) | 1 |

**Data shape migrations (medium):**

| Item | Location | Callers |
|---|---|---|
| `WizardState.editMode` / `editProjectPath` / `editOriginalName` → `wizardMode` | `webview.ts:92-95` | 8 files |
| `RawComponentRegistry.components` field → v3.0 sections | `components.ts:177` | 4 files (`componentUpdater.ts`, `configure.ts`, `ComponentRegistryManager.ts`, `ProjectSetupContext.ts`) |
| `ComponentInstance.endpoint` → `meshState.endpoint` | `base.ts:113-115` | 2 files (`meshStatusHelpers.ts`, `dashboardStatusService.ts`) |
| `WizardState.existingRepoFullName` / `existingRepoVerified` → `selectedRepo` | `webview.ts:378,380` | TBD in Phase 1 |

**Deprecated APIs / aliases (caller counts TBD in Phase 1):**

- `HandlerRegistry` class-based pattern (`handlers.ts:223`)
- `ErrorDisplay` → `StatusDisplay variant='error'` (`ErrorDisplay.tsx`)
- `webviewHTMLBuilder.ts` (entire file deprecated)
- `getWebviewHTMLWithBundles.ts:83` deprecated alias
- `bundleUri.ts:42,53` deprecated aliases
- `debugLogger.ts:281` deprecated method
- `baseCommand.ts:227-231` deprecated `getCurrentProject` helper
- `baseWebviewCommand.ts:61` panel-management back-compat helpers
- `features/mesh/handlers/index.ts:10` individual handler re-exports
- `stalenessDetector.ts:75,101,164` back-compat exports + static method
- `features/eds/services/githubHelpers.ts:17` re-export
- `features/eds/services/edsResetService.ts:42` re-exports
- `features/project-creation/services/ProjectSetupContext.ts:80` componentInstances back-compat
- `BackwardCompatibleLogger` wrapper (`logger.ts:17,46`)
- `configGenerator.ts:63` `'paas' default for backward compatibility` (comment-only — reword to plain default)

### Category C (historical comments, low priority)

- `types/index.ts:104` — "Replaces legacy brands + templates architecture"
- `core/utils/index.ts:7` — "generateWebviewHTML has been deprecated and removed"

## Execution plan

### Batch L1 — Zero-caller deletions (no migration risk)

1. Remove the 3 unused WizardStep values from the type union
2. Verify `formatElapsedTime` back-compat re-export: if tests import via the back-compat path, update the test imports first, then remove
3. Tests + tsc pass → commit:
   ```
   refactor: delete zero-caller soft-deprecated APIs (L1)
   ```

### Batch L2 — WizardStep rename pass

1. For each step rename, find every caller via `search_for_pattern`
2. Replace caller usage with the canonical step ID
3. Delete the legacy variant from the `WizardStep` union in `webview.ts`
4. Update any switch/dispatch logic that branched on the old ID
5. Tests + tsc pass → commit per logical group:
   ```
   refactor(wizard): migrate adobe-* step IDs to canonical names (L2.1)
   refactor(wizard): migrate eds-* step IDs to canonical names (L2.2)
   refactor(wizard): drop misc legacy step IDs (L2.3)
   ```

### Batch L3 — Data shape migrations (one batch per shape)

- **L3.1** — `WizardState` edit mode → `wizardMode` migration
  - Find every reader/writer of `editMode` / `editProjectPath` / `editOriginalName`
  - Replace with `wizardMode` + a derived path/name where needed
  - Delete the 3 fields from `WizardState`
- **L3.2** — `RawComponentRegistry.components` → v3.0 sections
  - Audit the 4 caller files; determine if they read a real v2.0 `components.json` or just defensively handle the type
  - Migrate callers to the v3.0 section access pattern
  - Delete the field from `RawComponentRegistry`
- **L3.3** — `ComponentInstance.endpoint` → `meshState.endpoint`
  - Update `meshStatusHelpers` + `dashboardStatusService` callers
  - Delete the field from `ComponentInstance`
- **L3.4** — `existingRepoFullName` / `existingRepoVerified` → `selectedRepo`
  - Verify caller count; migrate or delete

### Batch L4 — Deprecated API deletions (one PR-sized chunk per API)

For each item in the "Deprecated APIs / aliases" list:

1. `find_referencing_symbols` to enumerate callers
2. If zero callers → delete outright
3. If callers exist → migrate callers, then delete
4. Commit per item:
   ```
   refactor: delete deprecated <thing>, migrate callers (L4.N)
   ```

### Batch L5 — Category C comments (opportunistic, can be batched at the end)

```
docs: trim historical-architecture mentions from src/ comments (L5)
```

## Constraints

1. **Re-verify caller counts before each batch.** The inventory above is a 2026-05-21 snapshot; counts may have drifted.
2. **One conceptual change per commit.** Don't bundle unrelated migrations.
3. **Never widen the scope to "while we're in here, also fix X".** Each batch is closed before the next begins.
4. **Tests must pass after every commit.** Type-check too.
5. **Never commit without asking.**
6. **Skip Category A items** — they look like deprecation but aren't.
7. **If a caller migration turns out to be larger than expected (>20 lines), STOP**, document it as an open question, and ask the user whether to scope-creep or skip.

## Branch

`feature/legacy-cleanup`, branched off whichever branch is current when this cycle begins (defer the merge target to commit time — Cycles D and E may have landed by then).

## Cycle 4 execution log (2026-05-31, branch `claude/soft-deprecation-cycle-4-54ZNO`, base `c0a43c2`)

Each item below is one commit, verified with `tsc --noEmit` (0 errors), `eslint`
on touched files (0 errors), and the affected jest suites.

**Done:**
- **L4a** — deleted `BaseCommand.getProjectDirectory` (`@deprecated`); inlined its
  sole caller `getTerminalCwd` to `(await this.stateManager.getCurrentProject())?.path`.
- **L4b** — deleted the `getWebviewHTMLWithBundles` alias in
  `core/utils/getWebviewHTMLWithBundles.ts`; barrel now re-exports canonical
  `getWebviewHTML`. (File NOT renamed — out of scope; the 5 command callers
  already import `getWebviewHTML` directly.)
- **L2.1** — dropped `WizardStep` `'adobe-setup'`, `'adobe-context'` (no
  WizardStep-typed callers).
- **L2.2** — dropped `WizardStep` `'eds-github'`, `'eds-dalive'`; removed the two
  dead `WizardContainer` switch branches + orphaned imports. NOTE: the step
  components `GitHubSetupStep`/`DaLiveSetupStep` are now orphaned (only their own
  tests reference them) — left for a future dead-code pass (not soft-deprecation
  symbols). The `'eds-github'`/`'eds-dalive'` STACK ids are a separate namespace,
  untouched.
- **L2.3** — dropped `WizardStep` `'org-selection'`, `'project-selection'`,
  `'component-config'`, `'commerce-config'`; removed dead `'component-config'`
  entry from the `useWizardEffects` self-managed-focus Set.
- **StepLogger canonicalization** (user-directed; the backlog's Category-A "active
  migration" classification of `stepLogger.ts` was WRONG — these were dead
  translations). Migrated 24 `logTemplate('adobe-setup', …)` call sites across the
  3 Adobe auth services to `'adobe-auth'`; removed the dead `adobe-setup` /
  `adobe-context` / `org-selection` / `project-selection` / `commerce-config` map
  entries and the dead `adobe-auth→adobe-setup` normalize branch in `getStepName`.
  Display name unchanged ("Adobe Setup"). Updated the affected test assertions.
- **L3.2** — dropped `RawComponentRegistry.components` (`@deprecated` v2.0 field).
  Shipped `components.json` is v3.0 (sectioned), so the only reader
  (`...(raw.components || {})` in `ComponentRegistryManager`) was a dead no-op.
- **Infra/quality (separate commits):** fixed a case-sensitive import in
  `tests/setup/node.ts` (`@/core/di/ServiceLocator`→`serviceLocator`) that broke
  ALL node tests on Linux/CI; fixed a pre-existing `import/order` warning in
  `WizardContainer.tsx`.

**Done (continuation pass — full cleanly-removable sweep):**
- **L1 stragglers** — dropped zero-caller `WizardStep` `'adobe-org'`,
  `'data-source-config'`, `'connect-services'` (the latter migrated 2 test
  fixtures' `currentStep` to canonical `'eds-connect-services'`).
- **resetViewModeOverride** (dashboardHandlers) — zero-caller `@deprecated` deleted.
- **componentHasEnvVars** (configureHelpers) — migrated sole caller to
  `hasComponentEnvVars`, deleted wrapper.
- **HandlerRegistryMap** (types/handlers) — no consumers (decl + 2 barrel
  re-exports only); removed all three.
- **DebugLogger.toggle()** — `@deprecated` one-liner, only a test asserted it
  existed; removed method + test.
- **createBundleUris / BundleUris** (bundleUri) — no src callers; deleted alias +
  type + barrel re-export, retargeted the test to canonical `getBundleUri`.
- **resetLogsViewState** (lifecycle) — no prod callers; deleted, removed 2 barrel
  re-exports + its unit tests, switched showLogs handler-test setup to
  `sessionUIState.reset()`.
- **ErrorDisplay** (core/ui) — no real renders (barrel + a JSDoc example only);
  deleted component + barrel exports + its test; updated the useAsyncData example.
- **webviewHTMLBuilder.ts** — empty exports-removed stub, zero importers; deleted
  the file + its deprecation-verification meta-test.
- **existingRepoVerified** (webview WizardState) — write-only, never read/
  serialized; removed field + 3 set sites. Kept `existingRepo` and reclassified
  it **Category A** (active migration fallback `selectedRepo || existingRepo` for
  pre-`selectedRepo` serialized projects — reworded the comment).
- **Test robustness:** `edsResetParams.test.ts` loads `extractResetParams` via
  `jest.isolateModules` so its `demo-packages.json` mock always applies regardless
  of worker file ordering (root-caused the original flaky "pre-existing" failure).

After this pass: full suite **8297 green**, `eslint` **0 errors** (only pre-existing
refactor-only warnings: max-lines/complexity/max-depth/1 non-null-assertion).

**Remaining — NOT clean soft-deprecation removals (need decisions / are Category A):**
- **L3.1 `editMode`/`editProjectPath`/`editOriginalName` → `wizardMode`** — an
  IN-PROGRESS migration, not a finished one: code reads BOTH
  (`wizardMode ? wizardMode !== 'create' : editMode`). `wizardMode` is an enum that
  can't hold the path/name DATA in `editProjectPath`/`editOriginalName`, so there's
  no defined home for them. Crosses the UI↔backend message boundary
  (`executor.ts`, `handlers.ts`, `createHandler.ts`) and drives the edit-project
  flow. Needs a data-model design decision — deferred.
- **mesh `stalenessDetector` / `meshVerifier` "backward-compatible function
  exports"** — 5 importers; removing means migrating callers to the class/DI form
  (lazy-default-logger → injected logger), a behavioral refactor, not a stub
  removal. Deferred.
- **`ComponentHandler`** (`componentHandler.ts`) — unused class but woven into
  `HandlerContext` typing (`testUtils` casts `{} as ComponentHandler`) with 3 stale
  `jest.mock`s; untangling touches the handler-context contract. Ambiguous (dead vs
  intended-API) — deferred.
- **Category A (KEEP, mislabeled "backward compatibility"):** the individual
  handler re-export barrels (mesh/prereq/projects-dashboard handlers `index.ts`)
  are an ACTIVE, `barrel-exports.test.ts`-tested API for the project-creation
  handler registry — not removable. `existingRepo` (above). typeGuards endpoint
  fallback, helixService one-time migration, prerequisitesCacheManager old-cache
  fallback (already Category A in the snapshot).
- **L5 Category-C comments** — trivial historical-architecture comment trims;
  not yet done.

**Stopped-and-asked / deferred (over the ~20-line / broad-data-shape threshold):**
- **L3.3 `ComponentInstance.endpoint` → `meshState.endpoint`** — backlog's "2
  files" snapshot is stale. Real blast radius: ~6 source readers
  (`meshStatusHelpers`, `dashboardStatusService`, `typeGuards`, `ConfigureScreen`,
  `useConfigureFields`, `executor`), a writer in `meshVerifier`, and 15+ test
  files asserting `componentInstances['commerce-mesh'].endpoint`. Also a genuine
  source-of-truth conflict: `base.ts` calls `meshState.endpoint` AUTHORITATIVE
  while `meshVerifier.ts:152` calls `meshComponent.endpoint` "the single source of
  truth". Needs an architectural decision + likely a data migration → its own
  session.
- **L4c `getAccessToken`** — ~29 source references / 48 files incl. tests. Per the
  task's own note, "likely its own session." Deferred.

**Pre-existing issues found on the branch baseline (NOT introduced this cycle;
confirmed identical at `c0a43c2`):**
- 15 failing tests in 3 suites: `projects-dashboard/handlers/dashboardHandlers`,
  `projects-dashboard/handlers/selectProject-navigation` (handler/test out of
  sync re: `demoBuilder.showProjectDashboard`), and `eds/services/edsResetParams`
  (cross-suite pollution — passes in isolation).
- 4 repo-wide eslint errors (`no-duplicate-imports` in `edsResetService`,
  `ProjectCard.tsx`, `ProjectRow.tsx`; unused `execFile` in `mcp-server.ts`) + 96
  pre-existing warnings (mostly `max-lines` in test files). The task's "expect
  0/0 + ~8421 green" assumed a clean baseline this branch did not have.

## Verification

After every batch:

```bash
npx tsc --noEmit
npx jest --no-coverage <touched test files>
```

After Batch L5 / final batch:

```bash
npx jest --no-coverage   # full suite — reserved for final wave
```

Manual end-to-end smoke after L3 (data shape migrations) and after L4 (deprecated API removals):

1. Create a fresh demo project end-to-end via the wizard
2. Open Configure → AI Setup tab; verify checks pass
3. Start/stop a demo; verify dashboard mesh status renders
4. Run a regenerate AI files action; verify it still works

## Open questions

1. Several items in Batch L4 have unknown caller counts. The first action of each L4 step is to gauge that count before deciding between "delete" and "migrate + delete".
2. The `configGenerator.ts:63` item is a comment-only fix that doesn't affect runtime — could fold into Batch L5 if preferred.
3. Some Category C "historical" comments might be useful context for future agents — decide per-comment whether to remove or keep.

## Kickoff prompt (paste into `/rptc:feat`)

```
/rptc:feat "Execute the legacy / soft-deprecation cleanup plan at
.rptc/backlog/2026-05-21-legacy-soft-deprecation.md. Re-run
Phase 1 (re-discovery) first to catch drift since the 2026-05-21
snapshot, then execute Batches L1 through L5 sequentially. Commit
per batch. Standing rule: no soft deprecation — delete outright or
migrate-then-delete."
```

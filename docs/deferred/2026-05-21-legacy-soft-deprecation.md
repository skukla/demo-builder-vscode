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
docs/research/2026-05-21-legacy-soft-deprecation-cleanup.md. Re-run
Phase 1 (re-discovery) first to catch drift since the 2026-05-21
snapshot, then execute Batches L1 through L5 sequentially. Commit
per batch. Standing rule: no soft deprecation — delete outright or
migrate-then-delete."
```

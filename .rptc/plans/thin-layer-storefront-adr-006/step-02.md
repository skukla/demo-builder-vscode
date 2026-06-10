# Step 02 — Reset/Create Pipeline Integration

**Repo:** `skukla/demo-builder-vscode`
**Depends on:** Step 1 (engine). **Blocks:** Step 5 (config flips), Step 9 (cutover).
**Status:** proposed (no code yet)

## Objective

Wire the code-patch engine into the create/reset pipeline so patches apply **after reset-to-template** and
**after block install**, letting one ledger target both canonical files and installed library blocks. Define
the create/reset behavior when patch application fails (precondition mismatch) or the patches repo is
unreachable.

## Why this slot

- After **reset-to-template**: the canonical files exist to patch (this is where v1's patch application and the
  smart-404 vendoring already run).
- After **block install** (`blockCollectionHelpers.installBlockCollections`, pipeline Step 2): installed library
  blocks exist to patch — this is precisely how the two product-teaser carries (Step 6/8) target demo-team
  blocks (ADR §"Two upstreams", item 1).

## Scope / files

- `src/features/eds/services/edsResetRepoHelper.ts` — add the code-patch application call in `resetRepoToTemplate`,
  in the same Git-Tree-commit neighborhood as the smart-404 vendoring (~`:259–267`). Patches against canonical
  files belong here (after the bulk reset, before/with the smart-404 step).
- `src/features/eds/services/edsPipeline.ts` — apply block-targeting patches **after** block install
  (`pipelineConfigureBlockLibrary`, ~`:476–478`). Thread `codePatches` + `codePatchSource` through the pipeline
  params alongside the existing `contentPatches` / `contentPatchSource`.
- `src/features/eds/services/edsResetService.ts` — pass the new params through `executeEdsReset` →
  `runContentPipeline` (mirrors how `contentPatches` already flows).
- `src/features/project-creation/handlers/executor.ts` — pass `codePatches`/`codePatchSource` from package config
  into the create path (mirror `contentPatches`).

## Approach (to detail in TDD after approval)

1. Thread `codePatches: string[]` + `codePatchSource: CodePatchSource` through create + reset params from package
   config (Step 5 supplies them).
2. Apply **canonical-file patches** in the reset/repo-tree phase; apply **block-targeting patches** after block
   install. (A single ledger; each patch's `target` determines which phase touches it — or split into two
   declared groups. Decide grouping in TDD; recommend deriving phase from `target` prefix, e.g. `blocks/…`.)
3. **Failure handling (Risk R3 — resolved by owner decision D1: proceed and warn):** on a non-matching
   precondition, do **not** silently continue and do **not** hard-block the demo — surface a **loud, persistent,
   actionable** notification and continue the create/reset. On patches-repo unreachable, reuse the content-patch
   timeout, warn, and proceed (LKG-unreachable falls back to canonical HEAD with a warning — see Step 4). Specify
   a per-patch `critical: true` flag (defaults off) that, when set, escalates that one patch to a hard abort —
   reserved for a future need, not used by the initial CitiSignal ledger.
   *(Smart-404 is unaffected: per D4 it stays bundled in the extension and off this network path, so PDP routing
   survives an `eds-demo-patches` outage.)*
4. Idempotency across reset: re-running reset re-applies cleanly (engine detects already-applied) so repeated
   resets are safe.

## Dependencies / ordering note

The pipeline already applies `contentPatches` during content copy (pipeline Step 1) — code patches are a
**separate** concern on repo files, not DA HTML. Keep them distinct; do not fold one into the other.

## Risks (this step)

- **R3** (patches repo load-bearing): failure mode resolved (D1 = proceed and warn, loud + persistent). Risk is
  now "a transient outage ships a cosmetically-degraded storefront" — accepted; smart-404/PDP routing is off this
  path (D4).
- **Phase routing:** mis-routing a block patch to the pre-install phase would fail its precondition (block not
  present yet). Tests must cover both phases explicitly.
- **Commit topology:** block install and smart-404 each create their own atomic commit; ensure code patches
  land in a coherent commit (with the reset tree, or as a dedicated follow-up commit) without clobbering the
  block-install commit.

## Test / verification

- Integration: patch a canonical file post-reset; patch an installed library block post-install; assert order.
- Failure: broken precondition → loud, persistent warning, create/reset still completes (D1); `critical:true`
  patch → hard abort; patches repo unreachable → warn + proceed (canonical-HEAD fallback).
- Idempotency: reset twice → stable result, no double application.

## Exit criteria

- A CitiSignal create/reset (in a test harness) clones template, installs blocks, applies a canonical-file patch
  and a block-targeting patch, and on a deliberately-broken precondition **warns loudly and still completes**
  (D1) — while a `critical:true` patch aborts. Failure mode implemented and tested.

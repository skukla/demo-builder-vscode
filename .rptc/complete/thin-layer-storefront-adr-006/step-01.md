# Step 01 — Code-Patch Engine v2 (generic, externalized)

**Repo:** `skukla/demo-builder-vscode`
**Depends on:** none. **Blocks:** Step 2 (pipeline integration), Step 4 (clone-at-LKG).
**Status:** proposed (no code yet)

## Objective

Introduce a generic **code-patch engine** that applies named patches to files in a cloned storefront repo at
create/reset time. The engine knows no canonical file by name — every coupling lives in externalized patch
definitions fetched from the patches repo. This **recovers and refactors** the v1 template-patch system (added
2026-01-20, removed 2026-02-01), externalizing the definitions (v1's one structural flaw was bundling payloads in
the extension).

> **Finding F1 (corrected):** the v1 source **is recoverable** — it was hidden only by a shallow clone. The full
> recovered system (file inventory, verified shapes, apply algorithm, wiring, sample payload, and the v1→v2 delta
> table) is captured in **[`v1-prior-art.md`](v1-prior-art.md)** in this plan folder — that document is Step 1's
> starting point. Seed v2 from the real v1 code (`git show 'f6a7d029^:…'`); the v1 test suite at
> `f6a7d029^:tests/features/eds/services/templatePatchRegistry.test.ts` seeds the RED phase. *(Re-cloning for TDD
> requires `git fetch --unshallow` first, or the v1 history won't be present.)*

## Design anchor (reuse, do not reinvent)

Two living mechanisms already encode 90% of this; the engine is their synthesis:

- **`contentPatchRegistry.ts`** — patch shape `{id, …, searchPattern, replacement}`, external fetch from
  `raw.githubusercontent.com/{owner}/{repo}/main/{path}/patches.json`, per-source Promise cache,
  `PREREQUISITE_CHECK` timeout, failed-promise eviction. **Reuse the fetch + cache verbatim** (extract a shared
  helper rather than copy).
- **`pdp404HandlerPublisher.ts`** — idempotency via "already applied" detection, runtime-value substitution,
  non-fatal-skip / explicit-result discipline. **Reuse the result-object discipline** so a non-matching
  precondition is a surfaced result, never a silent skip.

## Scope / files

- **New:** `src/features/eds/services/codePatchRegistry.ts` — the engine.
- **New type:** `src/types/demoPackages.ts` → `CodePatchSource = {owner, repo, path}` (sibling of
  `ContentPatchSource`).
- **Possibly extract:** a shared `externalPatchFetch` helper used by both `contentPatchRegistry` and
  `codePatchRegistry` (DRY — see Constraints).
- **Config:** `src/features/eds/config/code-patches.json` is **not** added (definitions are external, per ADR);
  no local fallback (D3: definitions live in `eds-demo-patches`). `CodePatchSource` defaults point at
  `owner: skukla, repo: eds-demo-patches`.

## Approach (to detail in TDD after approval)

1. Define the code-patch definition shape: `{id, target (repo-relative path), description, precondition
   (anchored search string), replacement, exit?}`. Same family as the content-patch shape; `target` replaces
   `pagePath`, operating on repo files instead of DA HTML.
2. `getCodePatches(source, logger)` — fetch external definitions (reuse content-patch fetch+cache).
3. `applyCodePatches(files, patchIds, source, logger)` — for each requested patch: read `target`, verify
   `precondition` matches, apply `replacement`, return a per-patch result `{patchId, target, applied, reason}`.
   **A non-matching precondition is an explicit `applied:false` failure result**, not a silent pass.
4. Idempotency: re-running detects an already-applied patch (replacement present, precondition absent) and
   reports it without double-applying — the same logic the gate uses for obsolete-patch detection (Step 7),
   kept consistent here.
5. Engine emits no canonical file names of its own; everything comes from the fetched definitions.

## Risks (this step)

- **R-shared-helper:** extracting the fetch helper touches `contentPatchRegistry`; keep behavior identical and
  covered by existing content-patch tests to avoid regressions.
- **Anchored-match ambiguity:** a too-loose precondition could match the wrong region. Mitigate with
  anchored/unique search strings and a test that a multi-occurrence precondition is rejected or applied
  deterministically (decide in TDD; recommend "must be unique or fail loudly").

## Test / verification

- Unit: precondition match / no-match / multiple-match; replacement correctness; idempotent re-apply;
  result-object shape on failure; external-fetch success / timeout / unreachable; cache sharing + eviction.
- 100% coverage target on this file (load-bearing).

## Exit criteria

- Engine applies a sample external patch to a fixture file, reports a clean result, and surfaces a loud failure
  on a deliberately-broken precondition. No canonical file names in the engine source. Content-patch tests still
  green after the shared-helper extraction.

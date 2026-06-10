# Step 03 — LKG Pointer: Record at Create + LKG-Aware Update Check

**Repo:** `skukla/demo-builder-vscode`
**Depends on:** none (parallel with Steps 1–2). **Blocks:** Step 4.
**Status:** proposed (no code yet)

## Objective

Make "what canonical commit did this storefront get?" mean **the LKG SHA read from the patches repo**, both when
recording it at create time and when checking for updates. Today both read canonical `main` directly; under
ADR-006 that would offer storefronts canonical states our patches have never been verified against.

## Scope / files

- `src/features/project-creation/handlers/executor.ts` — `fetchTemplateCommitSha()` (~`:594`, called from
  `populateEdsMetadata` ~`:533`): for thin-layer packages, read the LKG SHA from the patches repo's
  `last-known-good` file instead of the template repo's latest `main`. Store as `lastSyncedCommit`; **also record
  the patches-repo ref consumed** alongside it (impact-analysis 1.2) for traceability.
- `src/features/updates/services/templateUpdateChecker.ts` — `checkForUpdates()` (~`:85,106`): "is there an
  update?" becomes "**has the LKG pointer advanced past my `lastSyncedCommit`?**" Fetch the LKG SHA from the
  patches repo; compare against it, not canonical `main`. A storefront is up-to-date when it matches LKG even if
  canonical `main` is ahead.
- EDS component metadata shape (written in `executor.ts`, read in `updateTypes.getTemplateSource` /
  `templateUpdateChecker`): add the patches-repo ref field; keep `templateOwner`/`templateRepo`/`lastSyncedCommit`.

## Approach (to detail in TDD after approval)

1. A small `readLkgSha(codePatchSource)` helper: fetch `last-known-good` from the patches repo (reuse the
   content-patch fetch + cache; format per Q2 — recommend a one-line SHA file at repo root).
2. `fetchTemplateCommitSha`: branch on whether the package is thin-layer (has a `codePatchSource` / LKG source).
   Thin-layer → `readLkgSha`. Non-thin-layer (isle5/buildright, still forked) → unchanged behavior.
3. `templateUpdateChecker`: for thin-layer packages, compare `lastSyncedCommit` vs LKG SHA (equal ⇒ up to date;
   LKG ahead ⇒ update available). For forked packages, unchanged.
4. Keep `getTemplateSource()` working — it still reads `templateOwner`/`templateRepo` from metadata (now canonical
   for CitiSignal); no signature change needed.

## Risks (this step)

- **Mixed fleet:** both thin-layer (CitiSignal) and forked (isle5/buildright) packages coexist during migration.
  The branch must be driven by package config, not hardcoded, so each package gets the right semantics.
- **Q2 dependency:** the `last-known-good` file format/location must be fixed before this lands so Steps 3, 6, 7
  agree. Recommend resolving Q2 at approval.
- **Backward compat:** existing CitiSignal projects created pre-migration carry a fork SHA in `lastSyncedCommit`.
  Define behavior for them (recommend: treated as "needs reset to canonical@LKG"; covered in Step 9 migration).

## Test / verification

- Unit: thin-layer create records LKG SHA + patches-repo ref; forked create unchanged.
- Unit: up-to-date when `lastSyncedCommit == LKG`; update offered when LKG advanced; **no** update offered when
  canonical `main` is ahead of LKG.
- Unit: LKG fetch timeout / unreachable → defined behavior (no false "up to date").

## Exit criteria

- A thin-layer create records the LKG SHA (not canonical HEAD) and the patches-repo ref; the update checker
  reports against LKG. Forked-package paths are provably unchanged.

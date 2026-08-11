# Step 04 — Clone Canonical at LKG SHA + Sync-Strategy Redirect

**Repo:** `skukla/demo-builder-vscode`
**Depends on:** Step 3 (LKG read). **Blocks:** Step 5.
**Status:** proposed (no code yet)

## Objective

Make create and reset actually build the storefront at the **LKG SHA** (not template HEAD), and route thin-layer
template updates through **reset** instead of `merge` (merging canonical into a patched+block-installed storefront
produces conflicts with the thin layer itself).

## The HEAD caveat (Risk R2 — verify first)

`storefrontSetupPhase1.createFromTemplate()` (~`:135`) uses GitHub's generate-from-template API, which produces a
repo at the template's **HEAD**, not an arbitrary SHA. The reset path (`edsResetRepoHelper.resetRepoToTemplate`)
uses the **Git Tree API** against `main`. Neither pins to a historical SHA today. **The first task of this step is
to empirically confirm this caveat** (impact-analysis 1.5), then choose a pinning strategy.

## Scope / files

- `src/features/eds/handlers/storefrontSetupPhase1.ts` — pin the generated repo to LKG: after
  generate-from-template (HEAD), add a follow-up reset/force step to the LKG tree, **or** switch to a clone-at-SHA
  strategy. Reuse the existing Git-Tree reset machinery rather than inventing a new clone path.
- `src/features/eds/services/edsResetRepoHelper.ts` — `resetRepoToTemplate` reads the template tree at the **LKG
  SHA** instead of `main` HEAD (~`:242–244`); placeholder fetch (~`:53`) targets canonical's `aem.live` preview
  after the config flip.
- `src/features/updates/services/templateSyncService.ts` — deprecate `merge` for thin-layer packages; route their
  updates through `reset` (clone canonical@LKG → apply code patches (Step 2) → reinstall blocks → restore
  preserved `fstab.yaml`/`config.json`). Keep `merge` only for still-forked packages, or deprecate with them.
  Ensure `updateLastSyncedCommit` records the new LKG SHA post-reset.

## Approach (to detail in TDD after approval)

1. **Verify** generate-from-template pins to HEAD (small spike against a test repo); record the result in the step.
2. Implement pinning: simplest viable is generate-from-template (gets repo + history) → Git-Tree reset to the LKG
   tree (the reset code already does a tree reset; point it at the LKG SHA). Confirm the generated repo's HEAD ==
   LKG SHA in a test.
3. Reset flow: parametrize the template ref by LKG SHA throughout `resetRepoToTemplate`.
4. `templateSyncService`: gate strategy by package type — thin-layer ⇒ reset; forked ⇒ existing behavior. The
   reset already invokes block reinstall and (via Step 2) code-patch application.

## Risks (this step)

- **R2** (HEAD pinning): the whole LKG guarantee rests on this. Verify empirically; tests assert HEAD == LKG SHA.
- **Preserved files on reset:** `fstab.yaml` / `config.json` must survive the reset (existing `performReset`
  preserves them) — keep that guarantee with the LKG-pinned tree.
- **Placeholder source:** after the config flip, the `aem.live` preview URL resolves to canonical
  (`main--aem-boilerplate-commerce--hlxsites.aem.live`); verify placeholders exist there.

## Test / verification

- Spike result documented: does generate-from-template pin to HEAD? (expected: yes.)
- Integration: created repo HEAD == LKG SHA; reset rebuilds at LKG SHA; preserved files intact.
- Unit: thin-layer update uses reset; forked update uses prior strategy; `lastSyncedCommit` updated to LKG SHA.

## Exit criteria

- Create and reset both produce a storefront pinned to the LKG SHA, with preserved files intact, and thin-layer
  updates demonstrably route through reset (not merge).

# Step 02 — One writer (both surfaces agree)

**Purpose:** Close the state-coherence seam. The singular deploy paths
(`deployMeshHeadless`/`deployAppHeadless`) write `meshState`/`appState` + `*StatusSummary` and never
`setAppBuilderComponent`, while the keyed runner writes only `appBuilderComponents[id]`. Route the
singular paths through `setAppBuilderComponent` so the projects-dashboard card grid and the keyed
integrations list read the **same** source of truth; derive `meshStatusSummary`/`appStatusSummary`
from the keyed entry.

**Prerequisites:** Step 01 (keyed map must persist first).

**Reuse / surgical anchors (verified 2026-07-15):**
- `src/features/app-builder/services/deployAppHeadless.ts` — sets `appState`, then `saveProject` (module since DELETED, `9bb3b820`).
- `src/features/app-builder/services/deployMeshHeadless.ts` — mesh sibling (same pattern).
- `src/features/app-builder/services/appBuilderComponentRunner.ts:154-155` — `setAppBuilderComponent`
  then `saveProject` (the target write shape).
- `src/features/app-builder/services/appBuilderComponentState.ts` — `setAppBuilderComponent`,
  `getMeshAppBuilderComponent`, `getIntegrationAppBuilderComponents`, `getProvidedEnvVars`.
- `src/types/typeGuards.ts:528-533` — `getAppBuilderInstance` (singular reader; will be dropped in Step 05).

## Tests to write FIRST (RED)

- [ ] `deployAppHeadless` success writes `appBuilderComponents[id]` (not just `appState`).
- [ ] `deployMeshHeadless` success writes the keyed mesh entry.
- [ ] `meshStatusSummary`/`appStatusSummary` are **derived** from the keyed entry (a keyed deploy
      updates the summary the card grid reads).
- [ ] Cross-surface agreement: deploy via `deployAppHeadless` and read via `listAppBuilderComponents`
      → the entry is present with `status:'deployed'` + url.
- [ ] A mesh redeploy via the keyed runner refreshes `meshStatusSummary` (no stale read-through).

## Files to create / modify

- MODIFY `deployAppHeadless.ts` / `deployMeshHeadless.ts` — on success, `setAppBuilderComponent(project,
  id, state)` before `saveProject`; keep writing `appState`/`meshState` for now (Step 07 retires them).
- MODIFY the status-summary derivation so `*StatusSummary` comes from the keyed entry (single source).
- Tests alongside each service.

## RED → GREEN → REFACTOR

- RED: deploy-core tests assert keyed write + derived summary (currently absent).
- GREEN: add the keyed write + summary derivation.
- REFACTOR: extract a shared "persist deploy result to the keyed entry" helper (runner + headless both use it).

## Acceptance criteria

- A deploy via ANY path lands in `appBuilderComponents[id]`; the card grid and keyed list agree.
- Existing suite GREEN; no status regression on the mesh badge.

## Risks

- **Status regression:** the card grid currently gates on `meshStatusSummary`/`appStatusSummary`.
  Moving those to derive from the keyed entry must preserve the exact gating (tested).

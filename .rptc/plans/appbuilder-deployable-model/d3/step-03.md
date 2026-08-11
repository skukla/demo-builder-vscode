# Step 03 — One isolating deploy path (the structural guarantee)

**Purpose:** Ensure the *proper component structure* by construction. Each integration must deploy under
a distinct OpenWhisk package (`deriveOwPackage(id)` via `applyIsolatedPackages`) — that package is the
`aio app deploy` prune boundary in the shared workspace. Today only the **keyed runner** isolates; the
singular `deployAppHeadless` path (projects-dashboard + kebab) is **un-isolated** and can prune
siblings. Route every deploy through the isolating runner so no un-isolated path survives.

**Prerequisites:** Step 02.

**Reuse / surgical anchors (verified 2026-07-15):**
- `src/features/app-builder/services/appConfigPackages.ts:110-123` — `applyIsolatedPackages`
  (renames `app.config.yaml` runtime packages to a distinct name); `:98` `isStandaloneApp` (add-door gate).
- `src/features/app-builder/services/owPackageName.ts:57` — `deriveOwPackage(id)`.
- `src/features/app-builder/services/appBuilderComponentRunnerDeps.ts:88-90` — the deps wiring:
  `applyOwPackage` **then** `deployAppComponent` (the isolating path to mirror).
- `src/features/app-builder/services/appDeployment.ts:123` — `aio app deploy` (per component dir).
- `src/features/app-builder/services/deployAppHeadless.ts` — the un-isolated legacy path to fix.

## Tests to write FIRST (RED)

- [ ] **Structural invariant:** after adding N integrations, each is in its own `components/<id>/` and
      `applyIsolatedPackages` was called with a distinct `deriveOwPackage(id)` for each (no shared
      `application`/`dx-excshell-1`).
- [ ] `deployAppHeadless` (projects-dashboard path) applies isolation before `aio app deploy`
      (currently it does not).
- [ ] Remove one integration → its `aio app undeploy` runs against ONLY its own package (siblings
      untouched) — assert the undeploy command targets its `ow.package`.
- [ ] `isStandaloneApp` still gates the add door (extension-shaped repo rejected before deploy).

## Files to create / modify

- MODIFY `deployAppHeadless.ts` to delegate deploy through the isolating runner path (or call
  `applyIsolatedPackages(componentPath, deriveOwPackage(id))` immediately before `deployAppComponent`),
  so both surfaces share ONE isolating deploy.
- Tests: the structural-invariant test (new) + the isolation assertions.

## RED → GREEN → REFACTOR

- RED: the invariant test + the deployAppHeadless-isolation test fail.
- GREEN: consolidate on the isolating path.
- REFACTOR: a single `deployComponentIsolated(id, componentPath, kind)` used by runner + headless.

## Acceptance criteria

- Every deploy path isolates; the structural-invariant test passes.
- The `../overview.md` "Component structure" guarantee holds under test.

## Risks

- **Re-isolating an already-deployed legacy app** changes its package name → a subsequent deploy may
  prune the old package's entities / orphan them. **Live-workspace probe required** (ADR-011
  load-bearing assumption) before trusting this on existing deployed projects. Consider a one-time
  migration note for projects deployed via the old un-isolated path.

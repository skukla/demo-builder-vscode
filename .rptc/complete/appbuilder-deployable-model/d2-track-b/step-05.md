# Step 05 — Dashboard integrations list + live runner wiring (add/deploy/redeploy/remove)

**Purpose:** Add a SEPARATE integrations list to the dashboard (do NOT unify mesh into it — that's D3;
the mesh badge + `mesh-verify` on-open check stay UNTOUCHED). Each row reuses `AppBuilderCard`'s 4-state
machine (`not-deployed`/`deploying`/`deployed`/`error`) + message pattern + custom-URL door. The list
wires its actions to D1's `addDeployable`/`deployDeployable`/`removeDeployable` — THIS is where the full
`addDeployable` (clone+install+subscribe+deploy) finally goes live (distinct from Track A's bounded mesh
subscribe). Row status comes from persisted `project.deployables` + an on-demand per-row "verify" — NO
new on-open check (P1: no surprise side effects).

## Prerequisites

- Step 01 (`getSelectableDeployables` for the add-a-deployable picker).
- Step 04 (Configure collection — the add flow routes here when bucket 3 is non-empty).
- D1 engine: `deployableRunner.ts` (`addDeployable`/`deployDeployable`/`removeDeployable`),
  `deployableRunnerDeps.ts` (`buildDefaultRunnerDeps`/`RunnerDepsContext`),
  `deployableState.ts` (`listDeployables` for the rows), `apiSubscriberClientAdapter.ts`
  (`createApiSubscriberClient`) for `ctx.subscriberClient`.
- Reuse (do NOT fork): `AppBuilderCard.tsx` (4-state + URL input), its `openLiveSite` URL handling,
  `DeployAppCommand.ts` (the guard-order TEMPLATE: auth → org → permission → `withOrgContext`),
  `dashboardHandlers.ts` (`handleAddApp`/`handleDeployApp`/`handleRemoveApp` patterns + `buildAppDeps`),
  `StatusCard.action` (per-row CTA — PR #55), `getOrganizationsSdkOnly()` for any passive org read.

## Tests to write FIRST (RED)

**UI — `tests/unit/features/dashboard/ui/components/DeployableRow.test.tsx`** (@testing-library/react)

- [ ] Renders the 4 states from a `DeployableState`: not-deployed (Deploy CTA), deploying (spinner +
      message), deployed (status badge + deployedUrls quiet Links + Redeploy + Remove), error (message +
      Retry). (Mirror `AppBuilderCard`'s states — extract the shared presentational pieces.)
- [ ] Deployed row exposes a per-row "Verify" action via `StatusCard.action` that posts `verifyDeployable`
      with the row id (on-demand only).
- [ ] Remove posts `removeDeployable` with the row id (confirm dialog handled in Step 06).

**UI — `tests/unit/features/dashboard/ui/components/DeployablesList.test.tsx`**

- [ ] Renders one `DeployableRow` per `listDeployables(project)` entry of `kind:'integration'`
      (mesh is EXCLUDED — it keeps its own badge).
- [ ] An "Add a deployable" affordance opens the catalog picker (`getSelectableDeployables`) + custom-URL
      door (shared validator from Step 03); choosing one posts `addDeployable` with the catalog id (or a
      custom source).
- [ ] Empty integrations → an empty-state "Add a deployable" prompt (Edge).
- [ ] Stable empty arrays to hooks are module-level constants (infinite-re-render gotcha).

**Handler — `tests/unit/features/dashboard/handlers/deployableHandlers.test.ts`** (mock runner + SDK/CLI)

- [ ] `addDeployable` handler resolves the catalog entry, assembles `RunnerDepsContext` via
      `buildDefaultRunnerDeps` (componentManager, commandManager, logger, saveProject,
      getCachedOrganization, `subscriberClient` from the adapter, `catalog`, `secrets`), and calls D1's
      `addDeployable(project, entry, deps)`.
- [ ] The handler runs the guard order BEFORE deploying (mirror `DeployAppCommand`/`handleAddApp`): auth
      → org-mismatch → App Builder permission; a failing guard surfaces the message and does NOT call the
      runner.
- [ ] `deployDeployable`/`redeployDeployable` → D1 `deployDeployable(project, id, deps)`.
- [ ] `removeDeployable` → D1 `removeDeployable(project, id, deps)` (confirmation is UI-side, Step 06).
- [ ] `verifyDeployable` → an ON-DEMAND, non-interactive probe (cached/SDK-only read; NEVER an `aio`
      write/browser) that posts a typed status outcome; updates the row from `deployed`/`error`.
- [ ] Add-with-bucket-3 inputs: when the chosen deployable's `classifyEnvSchema` has `userText`/`userSecret`,
      the handler routes the user to Configure FIRST (does not silently deploy with missing inputs).
- [ ] Failure paths: runner returns `{success:false,error}` → handler posts an `error` row status with
      the message (no throw to the webview).

## Implementation (GREEN)

- Create `src/features/dashboard/ui/components/DeployableRow.tsx` — extract `AppBuilderCard`'s 4 state
  components into shared presentational pieces (NoState/DeployingState/DeployedState/ErrorState) that BOTH
  `AppBuilderCard` and `DeployableRow` use (Rule of Three: AppBuilderCard + DeployableRow = 2 in-plan
  uses → extract now). Row dispatches id-scoped messages.
- Create `src/features/dashboard/ui/components/DeployablesList.tsx` — maps `listDeployables` integrations
  to rows + the add-a-deployable picker (catalog from Step 01 + custom-URL door from Step 03's validator).
- Create `src/features/dashboard/handlers/deployableHandlers.ts` — `handleAddDeployable`,
  `handleDeployDeployable`/`handleRedeployDeployable`, `handleRemoveDeployable`, `handleVerifyDeployable`.
  Each assembles `RunnerDepsContext` (extend `buildAppDeps` → a `buildRunnerDepsContext(context)` that
  ALSO supplies `subscriberClient = createApiSubscriberClient(authService)`, `catalog =
  config.deployables`, `secrets = context.secrets`) and runs the `DeployAppCommand` guard order before
  the runner call. Register the new message ids in the handler map (`dashboardHandlers.ts:824-827` style).
- Render `<DeployablesList>` in `ProjectDashboardScreen.tsx` as a SEPARATE block beside the existing
  `<AppBuilderCard>` / mesh badge (gated by `hasAdobeContext`). Do NOT touch the mesh badge block
  (`:436-445`) or `ActionGrid` mesh wiring.
- Add row action handlers to `useDashboardActions.ts` (id-scoped `postMessage`s), following the existing
  handler style.

## Files

| File | Action |
|---|---|
| `src/features/dashboard/ui/components/DeployableRow.tsx` | create |
| `src/features/dashboard/ui/components/DeployablesList.tsx` | create |
| `src/features/dashboard/ui/components/AppBuilderCard.tsx` | modify (extract shared state pieces) |
| `src/features/dashboard/ui/ProjectDashboardScreen.tsx` | modify (render list; mesh untouched) |
| `src/features/dashboard/ui/hooks/useDashboardActions.ts` | modify (row actions) |
| `src/features/dashboard/handlers/deployableHandlers.ts` | create |
| `src/features/dashboard/handlers/dashboardHandlers.ts` | modify (register new message ids + extend buildAppDeps→buildRunnerDepsContext) |
| `tests/unit/.../DeployableRow.test.tsx` | create |
| `tests/unit/.../DeployablesList.test.tsx` | create |
| `tests/unit/.../deployableHandlers.test.ts` | create |

## Dependencies / ordering

- After Steps 01, 03 (validator), 04 (Configure routing). Step 06 (remove-confirm) layers on this.
- The runner deps factory + adapter already exist (Track A merged) — this step CONSUMES them; it does
  not rebuild them.

## Risks

- **Mesh badge / `mesh-verify` regression** (HIGH): the integrations list must NOT render the mesh, must
  NOT add an on-open check, must NOT touch `MESH_ENDPOINT`→storefront. Mitigation: `DeployablesList`
  filters to `kind:'integration'`; no new `CHECK_IDS` entry; the existing dashboard tests for the mesh
  badge must stay green (run them).
- **Guard-order divergence** (HIGH): the add/deploy handlers must reproduce `DeployAppCommand`'s
  auth→org→permission→`withOrgContext` order (the runner does `withOrgContext` internally for the deploy;
  the handler still owns auth/org/permission preflight). Mitigation: reuse the existing guard helpers
  (`ensureAdobeIOAuth`, `detectProjectOrgMismatch`, `testDeveloperPermissions`); a handler test asserts
  no runner call when a guard fails.
- **P1 surprise side effects** (HIGH): `verifyDeployable` must be on-demand + non-interactive
  (SDK-only/cached), never a deploy or `aio` write. Locked by the verify test.
- **`addDeployable` first-live-run fidelity** (MEDIUM): D1's full add (clone+install+subscribe+deploy)
  has never run live for a non-mesh integration. Mitigation: tests mock the runner; flag a manual live
  smoke-test of one real integration before merge (the D1 spike proved the mechanics; this is the first
  UI-driven invocation).
- **AppBuilderCard extraction breakage** (MEDIUM): extracting the state pieces must keep AppBuilderCard's
  existing tests green. Mitigation: extract verbatim; AppBuilderCard re-imports the pieces.

## Self-critique (KISS/YAGNI)

- Reuses the 4-state machine, the URL door, the guard order, the runner, the adapter, the catalog loader.
  New code is the row/list composition + a thin handler bundle. No mesh unification (D3), no on-open
  check (deferred — persisted state + on-demand verify is sufficient and P1-safe).
- The shared-state-pieces extraction is justified by 2 concrete in-plan consumers, not speculation.

## Acceptance criteria

- Integrations render as rows with the 4-state machine + add/deploy/redeploy/remove/verify wired to D1's
  runner via `buildDefaultRunnerDeps`; guard order mirrors `DeployAppCommand`; mesh badge + `mesh-verify`
  + `MESH_ENDPOINT` edge untouched; no new on-open check. Suite green (incl. existing mesh-badge tests).

# Unify API provisioning at rebuild + prefetch the org-API picker

> **Step 0 — RPTC re-initialization (ALWAYS FIRST on re-entry):** if context was cleared,
> re-invoke `/rptc:fix "Plan is approved, continue to implementation"`. Work happens in the
> worktree `…/demo-builder-vscode.worktrees/fix/unify-api-subscribe-at-rebuild` (branch
> `fix/unify-api-subscribe-at-rebuild`). Mirror this plan to
> `.rptc/plans/unify-api-subscribe-at-rebuild/overview.md` on implementation start.

## Context

Two frustrations with the Add-Integration API flow:

1. **"Mixing and matching."** API Mesh subscribes its APIs (baseline `AdobeIOManagementAPISDK` +
   `GraphQLServiceSDK`) **eagerly, in the modal, on Add** (`useIntegrationFlow.enableMeshApi` →
   `ensure-mesh-api-subscribed`), while catalog/custom integrations subscribe only at the rebuild.
   The mesh **rebuild subscribes the same APIs again** (executor Phase 3 → `meshSetupService` →
   `ensureMeshApiSubscribed`), so mesh pays for it twice and "Add mesh" blocks on the slowest
   in-modal call (multiple Adobe requests, 180s budget). Custom/blank rows even hold a ✓
   confirmation "for parity with mesh" without provisioning anything.

2. **"API loading takes forever."** Only the browsable picker (`ApiPickerStage`, used for
   custom-app Add / "Change APIs" / dashboard Manage APIs) fetches `getServicesForOrg` — the org's
   full ~90-row entitled catalog, cached only 5 min per session. First open pays full latency;
   edit mode adds an extra `getOrganizationsSdkOnly` call to resolve the org. (Mesh/catalog API
   stages already render instantly from static data — no fetch.)

**Goal (user-approved, #1 first):** every integration's APIs land at **one place — the rebuild**;
the modal never provisions. Then hide the picker's unavoidable Adobe latency behind a prefetch.

## Change 1 (priority) — the Add modal provisions nothing; APIs subscribe at rebuild

Make **finishFlow commit + close immediately for every kind** (mesh, catalog, custom, blank).
Provisioning happens only at the existing rebuild path, which already subscribes mesh + all
App Builder `requiredApis` (union reconcile). Net effect: "Add" is instant and identical across
kinds; the mesh card just shows "APIs in use" (already built).

- `ui/components/integration-flow/useIntegrationFlow.ts`:
  - Delete `enableMeshApi` + the `mesh-api-subscribe-progress` listener; delete state `enabling`,
    `enableDone`, `enableError`, `enableComplete`, `picksConfirmed`; drop the `EnsureResult` import
    if it becomes unused.
  - Simplify `finishFlow`: `api-edit` → `saveEditedPicks()` + `onClose()`; **all other kinds** →
    `commitSelection()` + `onClose()`. Remove the mesh enable branch and the custom/blank
    confirm-hold branch.
  - Remove the enable/confirm terms from `onContinue`/`canGoBack` gating and from the footer
    (`Enabling…`/`Done`/`Retry` → the plain add label); drop the removed fields from the hook's
    return object.
- `ui/components/integration-flow/AddIntegrationFlowModal.tsx`: mesh api-access →
  `<ApiAccessStage required={meshComponent?.requiredApis} alreadyEnabled={alreadyEnabled} />`
  (drop `enabling`/`enableDone`/`enableComplete`/`enablesOnAdd` + the `enableError` block —
  identical to the catalog branch). `ApiPickerStage` → drop the `confirmed` prop.
- `ui/components/integration-flow/stages/ApiAccessStage.tsx`: remove the enable props
  (`enabling`, `enableDone`, `enableComplete`, `enablesOnAdd`) and the ✓/progress rendering →
  purely informational (lists `required` + baseline by name, as it already does for catalog).
- `ui/components/integration-flow/stages/ApiPickerStage.tsx`: remove the `confirmed` gate prop.

**Keep** the `ensureMeshApiSubscribed` service and the `ensure-mesh-api-subscribed`
message/handler — the rebuild/deploy paths still use the service, and `useProjectCreationPhases`
keeps the message as its (tested) create-project contract. Not dead; out of scope.

## Change 2 — prefetch + warm the org-API catalog for the picker

- **Prefetch on flow open.** When `AddIntegrationFlowModal` opens and the user is signed in, fire a
  fire-and-forget `list-org-console-apis` request (componentIds `[]`) to warm the extension-side
  `servicesCache`. The picker's later fetch (`ApiPickerStage`) then hits the warm cache and renders
  fast. In edit mode this also absorbs the extra org-resolution call in the background instead of
  blocking the picker. Reuse the existing `webviewClient` and the `list-org-console-apis` handler —
  no new message type.
- **Longer cache.** Bump `CACHE_TTL.ORG_SERVICES` (`core/utils/timeoutConfig.ts`) from 5 min to
  30 min — the org catalog changes rarely, and sign-out / reload still clears the in-memory cache.
- Non-goal: persisting the catalog across extension reloads; streaming/non-blocking picker UI
  (prefetch makes the picker usually-warm without it).

## Reuse (don't re-derive)
- Rebuild subscription: `executor.ts` Phase 3 → `services/meshSetupService.ts` →
  `app-builder/services/ensureMeshApiSubscribed.ts`; App Builder union reconcile in
  `app-builder/services/apiSubscriber.ts`.
- `getServicesForOrg` session cache: `authentication/services/adobeEntityFetcher.ts:1115` +
  `CACHE_TTL.ORG_SERVICES`.
- `list-org-console-apis` handler: `project-creation/handlers/consoleApiHandlers.ts`.

## Test strategy (TDD, tests first)
- `useIntegrationFlow` tests: mesh/custom/blank Add now **commits + closes without** sending
  `ensure-mesh-api-subscribed`; no `enabling`/`Done`/`Retry` footer states. Update the existing
  mesh-enable walk assertions.
- `AddIntegrationFlowModal` tests + `IntegrationsStep.test.tsx` (the full mesh add walk that asserts
  `ensure-mesh-api-subscribed` + "Add API Access"/"Done"): assert mesh Add commits immediately and
  sends **no** subscribe message.
- `ApiAccessStage` / `ApiPickerStage` tests: drop the enable-UI / `confirmed` assertions.
- Prefetch: opening the modal while signed in fires one `list-org-console-apis` warm request; the
  picker still renders from the (now warm) catalog.

## Risks
- **Test churn** in the integration-flow modal suites (the mesh enable walk is well covered) — sync
  first, per TDD.
- A mesh **rebuild** subscribe failure now surfaces at rebuild instead of at Add. Acceptable and
  consistent — that is where every other integration's API failures already surface.
- Prefetch fires on every modal open (including mesh/catalog adds that won't use the picker) — one
  cheap, cached, fire-and-forget call; harmless.

## Verification (live, Extension Dev Host)
1. `npm run compile` (or `watch:all` from the worktree) → Cmd+R.
2. Add a **mesh** → "Add" is instant (no spinner / "Enabling…"), the card shows "APIs in use". No
   `ensure-mesh-api-subscribed` in the Debug Logs during Add. Finish the rebuild → mesh deploys and
   its APIs are subscribed (Developer Console shows them).
3. Add a **custom App Builder app** → the API picker is already populated (prefetched); pick an API
   → "Add" is instant. Finish rebuild → the picked API is subscribed.
4. **Change APIs** on a custom integration → the picker opens warm.
5. Jest: the updated suites pass; `tsc --noEmit` 0; eslint 0.

# PL-59 — integration operations show their progress in a modal

> **Phase 2** — the same approach across the whole extension, with a routing table
> saying which surface each operation reports to and why: `extension-wide.md`.

## Context

Adding, updating, redeploying or removing an integration takes minutes. Today the SC gets one
VS Code notification with one line of text, plus a one-line status on the tile. Today's Bodea
work showed the cost: 1–2 minute Adobe calls with nothing to read but a spinner. The owner
chose a **modal**, because it is the extension's accepted way to show an SC detail. The
Storefront setup step already has the right content (stage, current step, a fixed "how long
this usually takes" line) through `LoadingDisplay`. This plan reuses that inside the core
`Modal`.

**The tile keeps its live status.** It is still the only signal when an agent runs the
operation (no modal should pop for something the SC didn't click). It explains "Waiting to
update" on the second tile of a pair, and it holds the saved end state after the modal closes.
It is already built.

## Behaviour

- **Opens only for what the SC started on this screen.** A tile action (Redeploy, Update,
  Remove, Install into Commerce) or a finished Add opens the modal for that integration.
  Agent-started operations never open it.
- **The modal carries the tile's live status.** Its header uses the tile's own status line
  (the same `StatusDot` + label the card and flyout share), fed by the same
  `appBuilderComponentStatusUpdate` overrides (`useRowStatusOverrides`). So the real-time
  status is never out of sight while the modal covers the grid, and the tile underneath
  keeps updating as it does today.
- **While running:** `LoadingDisplay` with the stage ("Deploying the app"), the current step
  ("Running aio app deploy"), and a static expectation line ("Usually 1–3 minutes"). One
  button, **Run in background**, closes it. The work carries on and the tile shows its status.
  Clicking a tile whose operation is still running reopens the modal at the current stage.
- **Succeeds:** the modal closes itself. The tile shows the new status.
- **Fails:** the modal stays open with the plain reason (including the Adobe permission
  sentences just shipped) and three buttons: **Retry** (the same tile action again),
  **Open Debug Logs**, **Close**.
- **No VS Code notification for a modal-hosted operation.** The repo's standing rule is "no
  two surfaces narrate the same step". The agent path and card-less paths (the projects-list
  kebab redeploy) keep the notification exactly as today.

## Design

1. **Stage vocabulary, one place.** New vscode-free `src/core/utils/operationStages.ts`: each
   stage the runner reports gets `{ label, expectation }`. The runner's `onProgress` literals
   (`'Subscribing Adobe APIs…'`, `'Deploying custom integration...'`, `'Installing into
   Commerce…'`, `'Removing the app from Commerce…'`, …) are replaced by these constants, so a
   stage and its expectation can't drift apart. Expectations start from the step timings
   already written to Debug Logs by `timedSteps` (`progressRegister.ts`). A scan test fails
   when a runner `onProgress` call uses a literal instead of a stage.
2. **One typed push channel.** `componentOperationProgress` in `src/types/webviewPayloads.ts`:
   `{ id, stage, step?, expectation?, state: 'running' | 'succeeded' | 'failed', error? }`.
   Sent through the existing live-panel lookup in `showDashboard.ts`
   (`getLiveProjectPanel`, beside `sendAppBuilderComponentStatusUpdate`).
3. **The source is `withComponentProgress`** (`appBuilderComponentHandlers.ts`). All four
   operations and the App Management install already go through it. It gets
   `(stage, step)` instead of a single collapsed string. The handler currently flattens them
   with `report(subMessage || message)`; that flattening stays only for the notification path.
   A request flag `progress: 'modal'` from the webview selects the modal path: push progress
   and skip the notification. The latest payload per id is kept in memory, so a reopened
   modal (or a reloaded panel) asks for it with one new request, `getComponentOperationProgress`.
4. **Webview.** `useComponentOperationProgress(id)` subscribes to the channel.
   `ComponentOperationModal` is the core `Modal` plus `LoadingDisplay` plus the failure buttons.
   `IntegrationsGrid.tsx` opens it from its existing action dispatch map and adds
   `progress: 'modal'` to the request. Retry re-dispatches through the same map. The Add flow
   opens it for the new id once the add request is sent.

## Scope

- **In:** integrations surface: add, redeploy/update, remove, install into Commerce.
- **Out (PL-59 stays open for these):** mesh deploy (`deployMeshWithFeedback`), project
  creation/edit/reset, destination move, storefront content.
- The ERP branch's pair update (`integrationUpdateHandlers.ts`, only on
  `feature/erp-integration`) adopts it when develop is next merged there.
- **Branch:** `feature/operation-progress` off develop, in its own worktree.

## Critical files

- `src/features/dashboard/handlers/appBuilderComponentHandlers.ts` — `withComponentProgress`
  and its four callers, plus `appManagementInstallHandlers.ts`
- `src/core/vscode/progressRegister.ts` — `withProgressRegister` gains the modal path
- `src/features/app-builder/services/appBuilderComponentRunner.ts`, `appDeployment.ts` —
  stage constants
- `src/features/dashboard/commands/showDashboard.ts` — the push sender
- `src/types/webviewPayloads.ts`, `src/types/messages.ts` — channel types
- `src/features/dashboard/ui/components/integrations/IntegrationsGrid.tsx` and the new modal and
  hook; reuse `src/core/ui/components/ui/Modal.tsx` and
  `src/core/ui/components/feedback/LoadingDisplay.tsx`

## Surfaces

- **Bundles:** only the integrations surface renders `IntegrationsGrid`.
- **Agent surface:** unchanged, keeps its phase channel.
- **Docs:** the `progressRegister.ts` header rule gains the modal as a third register.

## Verification

- **Unit (TDD per slice):**
  - the stage table and the scan test;
  - `withComponentProgress` pushes running → succeeded/failed with the right payload and opens
    no notification on the modal path (argument assertions, per the mock rule);
  - the modal renders the stage, step and expectation, closes on success, and shows the reason
    plus Retry, Debug Logs and Close on failure;
  - Retry re-sends the same message;
  - "Run in background" leaves the tile status in place.
- **Fixtures** typed in `tests/helpers/webviewFixtures.ts`.
- **Visual baseline** (`webview-visual-baseline`) for the new modal's CSS, before push.
- **Gate:** `npm run gate`.
- **Live:** in the Extension Dev Host, the owner redeploys a harmless integration and watches
  the modal. I don't run cloud deploys myself.

## As built (2026-09-18) — where it differs from the design above

- **The stage table lives in `src/features/app-builder/services/operationStages.ts`**, not
  `src/core/utils/`. Only extension code reads it: the expectation line travels in the push
  payload, so no webview imports it.
- **The modal is hosted by `IntegrationsScreen`, not the grid.** The first Add happens on a
  screen with no grid (the empty state replaces it), so a grid-hosted modal never appeared.
  The grid still starts operations through the screen's `useComponentOperation` controls.
- **Every modal-hosted request is guaranteed an end** (`narrateOutcomeToModal`). A handler
  that refuses before `withComponentProgress` runs (unknown id, already added, not deployed)
  would otherwise have left the modal on "Starting…". The wrapper marks the run running first,
  which also replaces a previous run's failure, and sends the handler's own answer as the end
  when nothing else did. A thrown error ends it with a plain sentence; the detail goes to logs.
- **A new run never asks for held state; only a reopened modal does** (`run` + `resume` on the
  operation), so Retry cannot show the previous failure.
- **A refused guard shows only in the modal** — `guardOrBlock` skips its warning pop-up on the
  modal path.
- **Open Debug Logs** needed a new request, `openDebugLogs` (handler map 38 → 40 with
  `getComponentOperationProgress`).
- **The card/flyout status markup** became one component, `IntegrationStatusLabel`, when the
  modal became its third user (source duplication 54 → 53).

---
name: webview-command-handler
description: Add a webview message handler/command end-to-end (MessageType → handler → feature map → wizard composite → webview request), stand up a new webview surface, or REUSE a component from another feature/surface. Use when adding or wiring an extension↔webview message, a comm.on/dispatchHandler handler, when the UI receives a Promise/[object Object]/undefined instead of a response, or when a borrowed component misbehaves on its new surface — a request that never resolves, a blank panel, or rows rendering with no values.
---
# Add a Webview Message Handler End-to-End

## When NOT to use
- A palette/VS Code command with no webview messaging — follow "Adding New Commands" in `src/commands/CLAUDE.md` instead.
- Wizard step UI, area order, or lock/continue logic — use the `wizard-step-authoring` skill.
- Extension→webview pushes (`comm.sendMessage`) with no handler — this skill covers webview→extension request handling.

## Procedure
1. Read the reference pair first: `src/features/mesh/handlers/subscribeHandler.ts` (a real shaped handler) and `src/features/mesh/handlers/meshHandlers.ts` (its feature map).
2. Add the message type to the `MessageType` union in `src/types/messages.ts`. The union ends in `| string`, so omitting it compiles silently — add it anyway; it is the documented contract.
3. Create the handler in the owning feature's `handlers/` directory from the bundled [handler-template.ts](handler-template.ts). Keep the reference ordering: validate payload (`@/core/validation` — mandatory for any value that reaches an Adobe CLI command) → `ensureAuthenticated` pre-flight for Adobe operations → service call → shaped `{ success, error?, code? }` return. Return failures; never throw (`.rptc/sop/consistency-patterns.md` §2).
4. Register it in the feature handler map: the `defineHandlers({...})` object literal (from `@/types/handlers`), keyed by the message type — e.g. `meshHandlers.ts`.
5. If the wizard dispatches this message, ALSO register it in `src/features/project-creation/handlers/ProjectCreationHandlerRegistry.ts`. The wizard command (`createProject.ts`) auto-registers only the keys of that composite map via `getRegisteredTypes(projectCreationHandlers)` — a handler that exists only in the feature map is invisible to the wizard.
6. Webview side: call `webviewClient.request('<type>', payload)` (`src/core/ui/utils/WebviewClient.ts`) when you need the response; `postMessage` only for true fire-and-forget. Using `postMessage` then immediately reading state races the handler (`.rptc/sop/consistency-patterns.md` §1).
7. If the handler runs Adobe CLI commands: use `TIMEOUTS.*` from `@/core/utils/timeoutConfig` (never numeric literals), target the op per-invocation with `withOrgContext`, and in the catch block check `error.stdout` for success indicators before failing — Adobe CLI ops routinely succeed after the timeout fires (`src/commands/CLAUDE.md` "Timeout Handling").
8. Add a test mirroring the source path, e.g. `tests/features/mesh/handlers/subscribeHandler.test.ts` — assert the response SHAPE for success, validation failure, and service failure.

## Adding a whole new webview SURFACE (not just a handler)

Two traps that fail SILENTLY — nothing throws, nothing logs, the UI just never updates:

- **Static push senders address ONE panel id.** The senders in
  `showDashboard.ts` (`sendMeshStatusUpdate`, `sendAppBuilderComponentStatusUpdate`,
  `sendAppBuilderComponentsSnapshot`, …) look up `getActivePanel('demoBuilder.projectDashboard')`.
  Surfaces open by tab REPLACEMENT — the dashboard panel is disposed — so on a new
  project-scoped surface every push reaches nobody. Resolve whichever panel is live
  (`getLiveProjectPanel()`), preferring one so a push renders once. Symptom: the surface
  renders correct initial data and then never moves.
- **Reuse the existing handler map before writing handlers.** A surface that renders existing
  components usually needs ZERO NEW handlers — register the feature's map wholesale
  (`getRegisteredTypes` + `dispatchHandler`, per `showProjectsList.ts`). But "no new handlers"
  is not "no more registration": the map you register must cover every message the surface's
  components send, INCLUDING components borrowed from another feature — see below.

Precedents to copy rather than invent: `showProjectsList.ts` (command shape),
`src/features/dashboard/ui/aiSurface/index.tsx` (entry point), `WEBVIEW_ENTRIES` in
`esbuild.config.js` (bundle key), `commandManager.ts` `registerCommands()` (registration +
sibling-panel disposal).

## Reusing a component from ANOTHER surface

Rendering another feature's component (the integrations surface renders the WIZARD's
`AddIntegrationFlowModal` via `AddIntegrationFlowAdapter`) inherits its **whole dependency
graph**, and every layer of it fails silently. On 2026-07-31 the same reuse broke three times,
each fix exposing the next — check all four before wiring:

1. **Messages** — the component's requests are registered in ITS feature's map, not yours.
   `list-org-console-apis` lives in `ProjectCreationHandlerRegistry`; the integrations panel
   registers `dashboardHandlers`, so the API picker hung until timeout. An unregistered type
   is not an error, it is silence: the request never resolves.
   *Guarded:* `tests/features/dashboard/commands/showIntegrations-handlerCoverage.test.ts`
   scans the reused flow's source for every `webviewClient` request/postMessage literal and
   fails if the host panel doesn't register it. Copy that test for a new reuse.
2. **State the component's LOGIC reads** — supply what its gates actually test, not what looks
   sufficient. `isAdobeSignedIn` reads `adobeAuth` + `adobeOrg`; passing neither made the flow
   walk `dest-signin` → `AdobeAuthStep` → **blank webview**.
3. **State the component's VIEWS render** — a different set from (2). `deriveStageOrder` reads
   `adobeProject` as a mere boolean, but `DestinationSummary` renders `adobeProject.title`;
   passing `{ id }` alone gave two labelled rows with **no values**. Shaping state for the
   machine is not the same as shaping it for what the user sees.
4. **CSS** — its classes may live in a stylesheet only the ORIGINAL bundle imports. See
   `spectrum-webview-ui` → "A CSS class working in one webview proves nothing about another".

Rule of thumb: read the component's own source for `webviewClient.`, for the state fields its
gates read, and for the fields its JSX renders. Three different lists.

## Gotchas
- **The handler-map count test is PINNED.** `tests/features/dashboard/handlers/dashboardHandlersMap.test.ts`
  asserts an exact handler count with a comment deriving it. Adding a handler fails it by design —
  bump the number AND extend the derivation comment so the next reader can still reconstruct it.
- An unawaited/unreturned inner promise makes the UI receive a Promise object or `undefined`. `WebviewCommunicationManager` awaits the handler you register, but only what the handler *returns* travels back — always `return await service(...)` results, never fire-and-forget inside a request handler. (Root `CLAUDE.md` gotcha; `src/core/communication/webviewCommunicationManager.ts`.)
- The handshake protocol queues messages until both sides are ready — never assume immediate delivery, and never send from the webview before `ready` (`docs/systems/race-conditions.md`).
- Handler works from the dashboard but the wizard reports an unknown message → it's missing from `ProjectCreationHandlerRegistry.ts` (step 5).
- Unvalidated payload ids flowing into `aio` commands = command injection. Mirror `subscribeHandler.ts`'s `validateOrgId/validateProjectId/validateWorkspaceId` block verbatim.
- Throwing instead of returning `{ success: false, error }` breaks every caller that branches on `result.success` (`.rptc/sop/consistency-patterns.md` §2).

## Verify
Round-trip the message — do not stop at compilation:
1. From the webview (Extension Dev Host: `npm run watch:all`, then Cmd+R) trigger the UI action, or from the handler's test call it directly.
2. Confirm the resolved value has the expected shape: `success` is a boolean, `error`/`code` present on failure, `data` on success. A UI rendering `[object Promise]` or `undefined` is the missing-await/return failure mode.
3. Check the "Demo Builder: Debug Logs" output channel for the dispatch entry and any handler error — absence of a dispatch log for your type means registration (step 4/5) failed, even if nothing errored.

_If this skill was wrong or incomplete, fix it before closing the task._

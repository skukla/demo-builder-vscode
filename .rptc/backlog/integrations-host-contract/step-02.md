# Step 02 — BUG: 726 projects fetched, picker shows "No Projects Found"

## RESOLVED 2026-08-03 — it was none of the three candidates

The push arrived intact. It was the HOST's state store: `AddIntegrationFlowAdapter`
supplied a `state` memo with no cache keys and an `updateState` that kept
`selectedConsoleApis` and silently dropped everything else.

`useSelectionStep` is state-BACKED, not state-reading: it writes the fetched list into
`state[cacheKey]` and reads its `items` straight back out of it. So the picker fetched
726 projects, wrote them into a store that discarded them, and rendered the empty state
in the same instant. The wizard works because `IntegrationsStep` passes the wizard's real
`state`/`updateState`.

Fix: the adapter keeps EVERY write in a local `overrides` object layered over the
values derived from the live project. Also memoized the `Object.entries` derivation —
it produced a new array (and so a new `state` identity) every render, re-subscribing
the picker's message listener each time. The `updateState as never` cast is gone: the
callback now genuinely has the wizard's signature.

Destination writes are session-scoped — they steer the modal's own stages and context
line. PERSISTING a changed destination to the project is still
`integrations-destination-control/step-01`'s job.

Acceptance 3 (`panelHandlerContext.test.ts`): **no**. That guard reads extension-side
panel construction; this bug lived entirely in webview React state, where it cannot see.
The regression net is the adapter's own `state store — writes must round-trip` block.
`AddIntegrationFlowAdapter` is the only host in `src/` that fabricates a wizard state
(checked: it is the sole `state as never` site), so there is no second instance to guard.

The original investigation notes follow.

## Evidence (2026-08-03, after `0807d1c4`)

Extension log:

```
14:54:23.817 [info] Opening integrations surface
14:54:31.798 [info] [Adobe Setup] Loading available projects...
14:54:32.123 [info] [Adobe Setup] Loaded 726 projects
```

Modal at the same moment: **"No Projects Found — No projects found. Please create a
project in Adobe Console first."**

So this is NOT the org error any more (that was the missing `authManager`, fixed) and
NOT a fetch failure. The fetch SUCCEEDED with 726 results and the picker rendered its
empty state. The results are not reaching the UI.

## Where to look first

`handleGetProjects` returns a `DataResult`, but it ALSO pushes results to the webview:

```ts
await context.sendMessage('get-projects', stamped);   // projectHandlers.ts ~line 157
```

`AdobeProjectPicker` consumes the PUSH (`messageType: 'get-projects'` handed to
`useSelectionStep`, which listens for the message rather than awaiting a response).

Candidates, cheapest first:

1. **The push does not reach this panel.** `showIntegrations`'s context supplies
   `sendMessage: (type, data) => this.sendMessage(type, data)`. Confirm that resolves to
   a live panel and that the message actually leaves — log at the send site.
2. **Stamp/shape mismatch.** `stamped` carries org-context stamping; if `useSelectionStep`
   filters on a field the integrations path does not populate (an org id, a request id),
   the payload arrives and is discarded as stale. Compare against the wizard, where the
   same picker works.
3. **A double answer.** The panel now registers `get-projects` as a request handler, so
   the comm manager sends a `__response__` AND the handler pushes `get-projects`. Check
   the push is not being swallowed as an unexpected second reply, or the empty state set
   by whichever lands first.

## Verify

The wizard's picker is the control: the same component, same hook, same message. If it
works there and not here, diff the two paths rather than reading either alone.

## Do NOT

- Do not "fix" it by making the picker await the request response instead. That may work
  but changes a shared component for one host; understand why the push is lost first.

## Acceptance

1. The picker lists the projects the log says were fetched.
2. Whatever the cause, add a test that fails without the fix.
3. If it is a host-context difference, ask whether `panelHandlerContext.test.ts` should
   grow to cover it.

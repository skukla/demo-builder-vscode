# Integrations panel — make hosting the wizard flow an explicit contract

> ## ✅ SHIPPED — archived 2026-08-13
>
> **The hand-list is gone.** Fixed by **`0b9f0f6d`** ("fix(integrations): register the reused
> wizard flow's handler; stop reporting abandoned checks as failures"), building on
> `0d4a49b0`. Found still-open on 2026-08-13 during a validation pass — the index still
> claimed "19 references, verified 2026-08-13", which was a re-assertion of the item's own
> text rather than a re-measurement.
>
> `src/features/dashboard/commands/showIntegrations.ts` now enumerates both handler maps
> instead of naming their members:
>
> ```ts
> for (const messageType of getRegisteredTypes(addIntegrationFlowHandlers)) { … }
> for (const messageType of getRegisteredTypes(dashboardHandlers)) { … }
> ```
>
> Measured after the change: **0** hand-listed handler references in that file (183 lines
> total). The file's own comment now states the contract this plan was written to create —
> *"adding a message to the flow is one edit"* — and the drift mechanism is closed at the
> source: a handler added to the flow's map is registered by the host automatically, so the
> host can no longer fall behind the flow.
>
> Note the file also moved: `src/features/dashboard/commands/`, not `app-builder/commands/`.

## Context

The integrations surface renders the WIZARD's Add Integration flow
(`AddIntegrationFlowAdapter` → `AddIntegrationFlowModal`). That makes it a second HOST
for code it does not own — and every requirement of that code has so far been
discovered by breakage, four times on 2026-07-31:

| # | Missing | Presented as | Fixed in |
|---|---|---|---|
| 1 | `list-org-console-apis` handler | API picker spun forever | (earlier) |
| 2 | `get-projects` + 5 destination handlers | "takes forever / times out" | `47254ac9` |
| 3 | `authManager` in the handler context | "This organization is not available on your current Adobe account" | `0807d1c4` |
| 4 | 4 more undefined managers across 5 panels | latent | `db2a4506` |

Each presented as an EXTERNAL fault (slow Adobe, a timeout, a broken org) rather than
as our own wiring, because an unregistered message type fell through in silence.
`2cce8e79` removed the silence; this plan removes the guessing.

## The remaining structural problem

`showIntegrations.ts` now lists nine reused wizard handlers BY HAND. That list is a
copy of a contract the flow owns, so it drifts every time the flow grows — and the
guard tests catch the drift only after someone writes the failing code.

Nothing declares "hosting this flow requires X". The requirement lives in the flow's
import graph, discoverable only by a source-scanning test.

## Steps

- `step-01.md` — the flow exports its own handler map; hosts spread it
- `step-02.md` — BUG: 726 projects fetched, picker shows "No Projects Found"

## Related

- `tests/core/communication/webviewHandlerCoverage.test.ts` — the panel-wide guard
- `tests/features/dashboard/commands/panelHandlerContext.test.ts` — the context guard
- `.rptc/complete/integrations-destination-control/` — adds ANOTHER host requirement, so
  step-01 should land first

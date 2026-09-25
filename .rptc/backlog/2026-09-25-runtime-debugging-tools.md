---
id: AB-31
kind: feature
area: ai
needs: []
value: high
status: active
---

# Runtime debugging from the agent surface — the three gaps the ERP validation measured

Filed 2026-09-25 from the owner's question "have we created the correct tooling to properly
interact with Adobe I/O Runtime debugging?", answered against a full day of live debugging.

## What exists and what it did

`list_runtime_activations` (last 50 rows, optional action filter) and `read_runtime_activation`
(logs + result) — `runtimeActivationHandlers.ts`, `runtimeNamespace.ts`. Every defect fixed on
2026-09-25 was found through them: the 10 s client timeouts, the 400 on the confirm comment,
the write-back echo, Commerce 503s on reads, the product handler at its 60 s limit.

## The gaps, each measured

1. **Successful runs leave no record** unless the request carries `X-OW-EXTRA-LOGGING: on`
   (Adobe Runtime, "Logging and monitoring"). Commerce forwards headers registered on a
   webhook, so the two cart webhooks now carry it. I/O Events registrations carry no custom
   headers, so an event handler that succeeds while doing the wrong thing is invisible. Cost:
   the first cart-pricing miss (13:28) could not be explained for an hour.
2. **No tool invokes an action.** Seeing what `webhook/item-prices` did meant calling its URL
   by hand with the CLI's IMS token and a hand-built payload. Design: `invoke_runtime_action`
   — blocking, sends the extra-logging header, takes `componentId`, `action`, `payload`,
   confirm-gated (an action may write), answers the result and the recorded activation id so
   `read_runtime_activation` can follow. Same namespace targeting as the list.
3. **The list is short and noisy.** 50 rows is the CLI's ceiling; the two minute-timers
   (`erp-refresh-timer` → `erp/refresh-job`, `events-retry-timer` → `demo-erp/events-retry`)
   write four rows a minute, so 50 rows cover about twelve minutes. Design: `failedOnly`,
   `since` (ISO time, paging with `--skip`), and timer rows excluded unless `includeTimers`.
4. **To verify:** the recorded successful webhook run (`050064a3…`) answered its result and
   no log lines, though the action logs at info. Either none were written or
   `readRuntimeActivation` drops them for successful runs — one probe settles it.

Outside the tools, by Adobe's design: Commerce's webhook log and Events Status grid (Admin
only), the registration debug tracing (Console only). Those stay with the owner.

## Verification block

Each new tool or option: descriptor row, narration, alert copy where gated, count pins moved,
`docs/systems/mcp-tools.md` regenerated, and one live probe against Bodea's namespace that
shows the recorded run of an invoked action.

## Shipped so far

- 2026-09-25  feat(ai): invoke_runtime_action, a sharper activation list, compact and redacted Runtime reads (`38c9eedf3`)

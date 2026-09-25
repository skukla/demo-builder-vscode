---
id: AB-31
kind: feature
area: ai
needs: []
value: high
status: built
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
- 2026-09-25  docs(report): the Runtime debugging tools shipped and proven live; AB-31 built (`b415af03c`)
- 2026-09-25  fix(ai): read_runtime_activation takes an action's lines from activation logs (`45e815a43`)

## Built (2026-09-25, same day)

Shipped on `feature/erp-integration`, gated (scoped jest, both typecheckers, eslint, the SOP
suites), and proven live against Bodea's namespace through the running dev host:

- `invoke_runtime_action` — a web action (an Adobe-auth sequence) goes through its URL with the
  user's token and the extra-logging header, then its recorded run is read; anything else is a
  blocking CLI invoke. Live: `webhook/item-prices` answered its price update in 3 s with the
  recorded activation id; a direct invoke of the same action had died in its validator.
- `list_runtime_activations` — `skip`, `since`, `failedOnly`, timer firings hidden by default.
  Live: failures since 13:00 in one call (which is how the refresh job's 120 s deaths surfaced).
- `read_runtime_activation` — one `get` for the record plus `logs` for each action's lines,
  sequences followed into their components, lines compacted (84–165 tokens per read today).
- Every answer redacted: bearer tokens anywhere, secret-named fields at any depth, and never a
  component's result — the validator's result is the request itself, and it leaked into one
  probe answer before the redaction existed (the token was the CLI's console session, which
  expires on its own; `aio logout && aio login` retires it early).
- The gap-4 question is answered: `activation get` carries no log lines for an action on Adobe
  Runtime; `activation logs` does. Both measured on a successful and a failed run.
- Also in this slice, per the owner: the Commerce REST tools bound an unpaged search to 20 rows
  and say so, and steer agents to `fields=`.

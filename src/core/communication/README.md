# Webview communication

The message channel between the extension host and a webview panel. One manager per
panel, created by `BaseWebviewCommand`.

## The handshake, and why it is webview-initiated

```
extension creates the panel
    ↓
webview loads its bundle, sends __webview_ready__
    ↓
extension replies __handshake_complete__
    ↓
both sides flush what they queued
```

The extension does **not** speak first. It cannot: there is no event telling it the
webview's JavaScript has loaded (VS Code issue #125546), so a message sent on panel
creation is dropped silently. The webview announcing itself is the only reliable
signal.

Until the handshake completes, **messages are queued on both sides** rather than
sent. That is what makes it safe to post immediately after opening a panel.

## Timeouts are set by the BACKEND, per request type

`REQUEST_TIMEOUTS` maps a request type to its budget, and the frontend is told —
rather than each side guessing. There is one source of truth on purpose.

Two things that budget must account for, both learned from failures:

- **Budget the sum, not the fast path.** The Adobe data calls attempt the SDK
  (10s cap) and then fall back to the `aio` CLI. A slow endpoint spends the whole SDK
  budget *before* the fallback starts, so 30s timed out work that would have
  succeeded. These are set to 180s.
- **A dashboard twin needs the wizard's budget.** `listConsoleApis` hits the same
  `getServicesForOrg` call as `list-org-console-apis`. Without its own entry it
  inherited the frontend's 30s default, and a 35.2s catalog fetch reported
  "Request timeout" in the UI while the extension logged a successful 96-service
  result.

Adding a message that reaches Adobe means adding its timeout here. The symptom of
forgetting is a UI error over a backend success.

## Async handlers must be awaited

A handler that returns a promise and is not awaited sends the **promise** to the
webview, which renders as `[object Object]` or an empty field. This is the single
most common bug on this seam.

## Related

- [`webview-command-handler`](../../../.claude/skills/webview-command-handler/SKILL.md)
  — adding a message end-to-end
- [ADR-017](../../../docs/architecture/adr/017-webview-architecture.md) — the channel
  is a ratified singleton; `acquireVsCodeApi()` can only be called once per webview

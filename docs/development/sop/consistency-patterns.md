# Consistency patterns

Two seams where doing the same job two ways causes real bugs rather than untidiness.

> **Trimmed 2026-08-30.** This file used to carry 18 sections, several of which
> restated rules that ADRs now own — service layer, dependency injection, module
> boundaries, handler architecture. That is not harmless duplication: the module
> boundary section had drifted into recommending a feature facade `index.ts`, the
> exact pattern [ADR-022](../../architecture/adr/022-barrel-files.md) forbids, and it
> went on saying so because nothing read it. Those sections are gone; the rules live
> in [the handbook](../handbook.md) with their enforcers.

## 1. `request` when you need the answer, `postMessage` when you do not

| | |
|---|---|
| Caller waits for completion | `webviewClient.request()` |
| True fire-and-forget | `webviewClient.postMessage()` |

Using `postMessage` and then reading state races the handler:

```typescript
// ❌ races — the fetch runs while the command is still going
await webviewClient.postMessage('startDemo', { projectPath });
fetchProjects(true);

// ✅ the fetch sees the result
await webviewClient.request('startDemo', { projectPath });
fetchProjects(true);
```

The `await` on the first one is the trap: it looks like it waits, and it does not.
It resolves when the message is *posted*.

## 2. A handler returns its failure, it does not throw

```typescript
{ success: true, data: { ... } }   // succeeded, with a payload
{ success: true }                  // succeeded, nothing to return
{ success: false, error: '...' }   // failed, with something a human can read
```

Throwing breaks every caller that branches on `result.success` — they get a rejected
promise where they expected an object, and the UI shows nothing rather than the
error.

Cancellation is a **success** that carries a failure inside it:
`{ success: true, data: { success: false, error: 'cancelled' } }`. The handler ran
correctly; the user chose not to proceed. Reporting that as a failure produces an
error message for a deliberate action.

## Related

- [`webview-command-handler`](../../../.claude/skills/webview-command-handler/SKILL.md)
  — adding a message end-to-end, including these two rules
- [`@/core/communication`](../../../src/core/communication/README.md) — the handshake
  and per-request timeouts underneath

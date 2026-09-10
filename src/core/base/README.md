# Base command classes

Every VS Code command in this extension extends one of these. That is a rule, not a
convention of convenience — see
[the handbook](../../../docs/development/handbook.md).

| | Extend when |
|---|---|
| `BaseCommand` | the command does work and reports on it |
| `BaseWebviewCommand` | the command opens a panel |

## What extending buys you

`context`, `stateManager`, `logger` and a `DisposableStore`, already wired. Plus
`withProgress`, `showError`/`showWarning`/`showInfo`, and `showSuccessMessage`.

The point is the negative: a command that acquires its own context and disposal is
the implicit dependency this architecture removes everywhere else. It also leaks —
`dispose()` here empties the store for you, and a hand-rolled command reliably
forgets one listener.

Implement `execute()`. That is the only abstract member.

## Panels are singletons, and the manager is static

`WebviewPanelManager` holds `activePanels` and `activeCommunicationManagers` as
**static** maps keyed by webview id. One panel per id, process-wide. Opening a
webview that is already open focuses the existing panel rather than making a second.

Two consequences worth knowing before you touch it:

- **Disposal is routed through a callback**, not handled locally. `extension.ts`
  registers one so auto-reopen logic lives in a single place instead of in each
  command.
- **There is a transition lock.** Moving between webviews would otherwise let the
  auto-welcome screen fire in the gap after one panel closes and before the next
  opens. The lock holds that gap shut, with a timeout so a failed transition cannot
  wedge it permanently.

## Related

- [`@/core/communication`](../communication/README.md) — the message channel a
  `BaseWebviewCommand` sets up
- [`@/core/state`](../state/README.md) — the `stateManager` handed to every command

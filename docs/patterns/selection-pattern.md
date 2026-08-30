# Backend call on Continue

**A selection changes local state. Only Continue talks to the backend.**

Clicking a project, an org or a workspace updates the UI and nothing else. The
network call happens when the user commits to the choice.

## Why

The extension used to call the backend on every selection, and it produced four
problems at once: the UI waited before acknowledging a click, errors surfaced at
moments the user could not connect to an action, every screen tracked several
loading states, and browsing options was slow enough that people avoided exploring.

Deferring to Continue fixes all four with one rule. Selection is instant because it
is local. An error belongs to a deliberate action, so its message can say what
failed. And there is one loading state per screen instead of one per control.

## What this means when building a step

- A selection handler sets state. If it awaits anything, look again.
- Continue is the only control that can be slow, and it is the only one that needs a
  spinner and a disabled state.
- Validation that needs the backend belongs on Continue too — validating on selection
  reintroduces the same problem with a different name.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Use
`webviewClient.request()` when you need the answer — `postMessage` then reading state
races the handler, which is the specific bug this pattern otherwise invites.

## Related

- [consistency-patterns.md](../development/sop/consistency-patterns.md) — request vs postMessage
- [`src/core/communication/README.md`](../../src/core/communication/README.md) — the channel

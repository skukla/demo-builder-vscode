# State management

Five places state can live, and picking the wrong one is how state ends up in two.

| Scope | Where | Survives | Use for |
|---|---|---|---|
| **Project** | `.demo-builder.json` in the project dir | forever, and travels with the project | everything about a project — **the single source of truth** |
| **Global** | `context.globalState` | across VS Code sessions | recent projects, user preferences |
| **Transient** | a Memento, via `transientStateManager` | across sessions, but disposable | "don't show again" flags |
| **Session UI** | `sessionUIState` | until the window closes | panel open/closed, which tab is active |
| **Secrets** | VS Code `SecretStorage` | across sessions, encrypted | tokens and credentials — **never a file** |

## Choosing

Ask what should happen when the user copies the project folder to another machine.
Anything that must travel goes in the manifest. Anything that must not — a token, a
window layout — does not.

Ask what should happen when the extension is uninstalled. Global state survives that;
a project's manifest goes with the project. That asymmetry is why "recent projects"
is global and "which components are installed" is not.

## The rule underneath

**One value, one home.** Duplicated state fails silently: a write succeeds in one
place and fails in the other, and a read returns whichever the caller happened to
check. See [state-ownership.md](../architecture/state-ownership.md), written after the
mesh endpoint was stored twice and the two disagreed.

## Dependent state is cleared, not left

When a parent selection changes, clear everything derived from it. A workspace list
left over from a previous project is worse than an empty one — it looks like data.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Secrets live in VS Code
settings or `SecretStorage`, never in code or a tracked file — this repository is
public. `StateManager` is built once at the composition root.

## Related

- [`src/core/state/README.md`](../../src/core/state/README.md) — the manifest's shape,
  and the fixture traps in reading it

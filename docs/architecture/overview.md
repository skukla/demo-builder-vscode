# Architecture overview

**Start here.** Then read [the handbook](../development/handbook.md), which states
the rules this architecture is held to.

## What this is

A VS Code extension that builds Adobe Commerce demo projects — it creates the
backends, the storefronts and the integrations, then runs and maintains them.

## One repository, two programs

| | Runs in | Can reach |
|---|---|---|
| **Extension host** | Node | VS Code API, the file system, Adobe's APIs |
| **Webviews** | a browser page — eight separate React bundles | neither Node nor VS Code |

They communicate by passing messages, and nothing else. A service importing `vscode`
cannot run in a webview; a React component cannot read a file. **This is the first
thing to understand, because every other rule follows from it** — and the two halves
have separate architecture records, [ADR-015](adr/015-dependency-architecture.md) for
the host and [ADR-017](adr/017-webview-architecture.md) for the webviews.

## How the code is arranged

Grouped by what it does for the user, not by what kind of thing it is:

```
src/features/<name>/     one feature's whole vertical slice: services, handlers, ui
src/core/                shared infrastructure — logging, state, shell, communication
src/commands/            the entry points VS Code calls
```

A feature uses `core/`. A feature does not reach into another feature. Commands are
the exception — orchestrating is their job.

**Which kind of thing to write, and where it goes:**
[where-code-goes.md](where-code-goes.md).

## Much of the behaviour is data

Twelve schema-backed JSON registries describe what the extension supports —
components, stacks, demo packages, prerequisites, block libraries. Adding support for
something is usually a row, not a class. Each has a schema beside it, validated by
`tests/templates/config-contracts.test.ts`.

## Where to go next

| To understand | Read |
|---|---|
| the rules code is held to | [the handbook](../development/handbook.md) |
| every convention and what enforces it | [conventions.md](../development/conventions.md) |
| what a component is | [component-system.md](component-system.md) |
| where state lives | [state-ownership.md](state-ownership.md) |
| Adobe auth and org context | [adobe-setup.md](adobe-setup.md) |
| EDS storefronts | [eds-content-separation.md](eds-content-separation.md) |
| the agent surface | [../systems/mcp-server.md](../systems/mcp-server.md) |
| why a decision was made | [adr/README.md](adr/README.md) |

Each feature also has a README describing what only it can say —
[`src/features/mesh/README.md`](../../src/features/mesh/README.md) is the shape they
all follow.

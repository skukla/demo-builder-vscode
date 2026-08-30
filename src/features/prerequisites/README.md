# Prerequisites

Detects, installs and version-checks the tools a demo needs — Node, npm, fnm, the
Adobe CLI.

## Everything is driven by `config/prerequisites.json`

A prerequisite is a row: how to check it, how to install it, what version satisfies
it. Adding one is an edit to that file, not new code.

## Two things in that file are easy to miss

**`perNodeVersion`** — some tools are installed once *per Node major*, not once. The
Adobe CLI is: a project running Node 18 and Node 20 needs it twice, and "is it
installed?" has no single answer. Anything reading a prerequisite's status has to
know which Node version it is asking about.

**`plugins`** — a prerequisite can carry its own plugins, each with its own check and
install commands. `aio-cli` ships one, `api-mesh`, and that is the API Mesh CLI
plugin the whole mesh feature depends on. It declares no `requiredFor`, so it
installs against the first target version rather than being mapped to a component.

## Installing happens where the need appears

The graphical prerequisites step runs after Welcome and before Build Your Project —
which is *before* integrations are chosen, and the dashboard and MCP add-paths never
pass through it at all. So a choice-dependent need cannot be resolved there.

`@/core/shell`'s `ensureNodeVersion` is called at the add door instead: the one
chokepoint every path shares. If you are wondering why a check is not in the wizard
step, that is why.

## Caching

`PrerequisitesManager` is memoised — one instance, built by
`prerequisitesManagerInstance.ts` — because its CLI-result cache is the difference
between a sub-10ms hit and a 500–3000ms miss. A second instance would silently make
every check slow again.

## Related

- [prerequisites-system.md](../../../docs/systems/prerequisites-system.md) — the
  detection and installation model in full

## Conventions that bind this

The rules are in [the handbook](../../../docs/development/handbook.md). The manager is a session accessor: memoised, built once, and listed as a ruling in the `architecture-rules` ledger rather than as debt.

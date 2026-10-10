# Working directory and Node version

Two things a shell command needs that are easy to get wrong, and both fail in ways
that point somewhere else.

## Commands run from the component directory

A command executed from the wrong directory does not error usefully — it reads the
wrong `.env`, resolves the wrong `package.json`, and reports a problem with whatever
it found there.

`aio` in particular authenticates from the `.env` beside it. Running it one directory
up produces an authentication failure for a project that is correctly configured.

Pass the component path with the command. Do not `cd` and rely on it persisting;
`@/core/shell` runs commands through a queue, so "the current directory" is not a
stable thing to depend on between calls.

## One Node for everything Demo Builder ships (PR-1a)

Demo Builder states no Node version of its own. Each component declares the Node it
accepts in its own repo (`engines.node`); at a release cut `npm run node:resolve`
reads every one of those ranges and writes the lowest long-term Node they all accept
to `src/core/shell/config/node-version.generated.json`, and every reader asks
`demoBuilderNode()` (`src/core/shell/demoBuilderNode.ts`). Those Nodes live in Demo
Builder's own Node folder, `~/.demo-builder/node` (fnm's `FNM_DIR`, set on each child
process by the command runner), never in the SC's own fnm.

The one exception is a custom integration whose repo's range excludes Demo Builder's
Node: the add door reads its `package.json`, picks a Node by the same rule
(`src/core/shell/nodeRangeRule.ts`) and records it on the integration, and every
later install, deploy and teardown uses it. `useNodeVersion` on a command selects
which Node it runs on.

`perNodeVersion` on a prerequisite still means "installed per Node": the Adobe CLI
is installed under each Node that runs it, and "is it installed?" is asked of the file
beside that Node's own binary (`toolInstalledUnder`).

**Availability is resolved when the need appears**, not during the prerequisites
step — see [`src/core/shell/README.md`](../../src/core/shell/README.md), which
explains why the check lives at the add door.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Every value reaching a
shell command passes through `@/core/validation` first; a path is user input like any
other.

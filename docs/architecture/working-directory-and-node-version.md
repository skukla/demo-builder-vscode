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

## A project can need several Node majors at once

Components declare the Node version they need, and one project can contain
components needing different ones. `fnm` provides them side by side, and
`useNodeVersion` on a command selects which.

This is why `perNodeVersion` exists on prerequisites: for a tool installed per
version, "is it installed?" has no single answer, and anything asking has to say
which version it means.

**Availability is resolved when the need appears**, not during the prerequisites
step — see [`src/core/shell/README.md`](../../src/core/shell/README.md), which
explains why the check lives at the add door.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Every value reaching a
shell command passes through `@/core/validation` first; a path is user input like any
other.

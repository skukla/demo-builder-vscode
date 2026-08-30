# Lifecycle

Starting, stopping and restarting a running demo.

## Stopping is the hard half

Starting a demo is one command in a terminal. Stopping it reliably is not: the
process spawns children, and killing the parent leaves them holding the port. The
next start then fails with an address-in-use error that looks unrelated to the stop
that caused it.

So teardown goes through `@/core/shell`'s `processCleanup`, which kills the tree, and
`portChecker` confirms the port is actually free before reporting success.

## Restart is not stop-then-start

Configuration changes need the demo to pick up new values, and a naive restart races
its own teardown — the start begins while the old process still holds the port. The
restart path waits for the port to clear.

## Where it is triggered from

The dashboard Start/Stop tiles, `commands/configure.ts` after a configuration change,
and the extension's own shutdown. All three land on the same services; there is no
second stop path.

## Related

- [`@/core/shell`](../../core/shell/README.md) — process teardown and port checking
- [race-conditions.md](../../../docs/systems/race-conditions.md) — the patterns this
  feature is built out of

# Race conditions

Four races this extension hits repeatedly, and the mechanism that closes each. They
are collected here because each was found the hard way and the fix is not obvious
from the failure.

## 1. Talking to a webview before it can hear

A panel exists before its bundle loads, and a message sent in that window is dropped
with no error. Closed by the **handshake plus message queuing** in
`@/core/communication` — the webview announces itself, and both sides hold messages
until it has.

Full mechanism: [`src/core/communication/README.md`](../../src/core/communication/README.md).

## 2. Two commands mutating the same global

`aio` keeps its org / project / workspace selection in one process-global config, so
two concurrent commands corrupt each other rather than interleaving. Closed by the
**queue** in `@/core/shell`, with `resourceLocker` giving per-resource exclusion so
unrelated work still runs concurrently.

## 3. Reading state that a fire-and-forget message has not written yet

`await webviewClient.postMessage(...)` resolves when the message is *posted*, not
when it is handled — so the next line reads stale state. The `await` is what makes it
look safe.

Use `request()` when you need the answer. See
[consistency-patterns.md](../development/sop/consistency-patterns.md).

## 4. Restarting a demo into its own teardown

Stopping a demo kills a process tree, and the port is not free the moment the parent
dies. A restart that begins immediately fails with an address-in-use error that looks
unrelated to the stop that caused it. Closed by `portChecker` — the restart waits for
the port, it does not sleep and hope.

## The shape they share

Every one of these is **an operation that reports completion before it is complete**:
a panel that exists before it listens, a message posted before it is handled, a
process killed before its port is released.

When something intermittently fails right after something else succeeded, that is the
first thing to check.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Sleeps route through the
shared `sleep()` — a hand-rolled one cannot be faked, which is what makes a race test
slow and then flaky. Polling for a condition beats sleeping for a duration.

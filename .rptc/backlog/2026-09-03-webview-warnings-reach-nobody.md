---
id: PL-40
kind: fix
area: platform
needs: []
value: med
status: backlog
---

# The wizard's configuration warnings reach nobody

`buildProjectConfig` has two validation branches that warn when a project is
being built from an inconsistent wizard state:

| where | condition |
|---|---|
| `validateStackPackageConfig` | a stack is selected but no brand/package |
| `validateStackLookup` | the selected stack id resolves to nothing |

Both write a `console.warn` plus a `console.log` carrying the structured detail.
Found 2026-09-03 while finishing [[PL-15]], which removed two OTHER webview
console calls — these two were deliberately left, and looking at why turned up
something worse than noise.

## They cannot be read

A webview's `console.warn` goes to **webview devtools and nowhere else**. There
is no bridge: `src/core/communication/` contains no console capture or
forwarding (checked for `captureConsole`, `forwardConsole` and `console.warn` —
zero hits).

So an SC whose project is built from a broken wizard state gets **nothing** in
the "Demo Builder: Debug Logs" channel — the exact place
`.claude/skills/debug-log-triage/` says to look first. The warning exists, fires,
and is invisible to everyone who would act on it.

## Neither branch has ever been tested

| probe | test files |
|---|---|
| `validateStackPackageConfig` | 0 |
| `validateStackLookup` | 0 |
| `"Incomplete configuration"` | 0 |
| `"Configuration warning"` | 0 |
| **control:** `buildProjectConfig` | **4** |

The function around them is well covered. These two branches are not, which is
why they never fire in the suite — and why nobody has ever checked that the
warnings say the right thing, or that the conditions are even reachable.

## The channel already exists and has no senders

`webviewClient.log(level, message)` posts a `log` message.
`baseWebviewCommand.ts:331` listens for it. `handleLog` writes it to the real
logger, mapping `warn` to `context.logger.warn`.

**Zero call sites in the whole codebase.** A working receiver nobody sends to —
the mirror image of the dead-sender shape `dead-code-scan` hunts for, and
arguably worse, because the infrastructure looks finished.

## What makes this more than a tidy-up

1. **Are these conditions reachable?** If the wizard cannot produce a stack
   without a package, both branches are dead and should be deleted rather than
   rewired. Nobody knows, because nothing tests them.
2. **If they ARE reachable**, an SC is hitting a real misconfiguration today and
   the only trace is in devtools they will never open.

Answer 1 first. It decides whether this is a delete or a rewire.

## Why it was not fixed on the spot

`wizardHelpers` is a pure helper — wizard state in, config out, no client
dependency. Threading a transport into it is a design change, not a cleanup, and
doing it with zero tests on those branches means no safety net for a change to
production logging. That sequencing is the work: cover the branches, decide
reachable-or-dead, then rewire or delete.

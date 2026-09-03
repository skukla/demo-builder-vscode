---
id: PL-40
kind: question
area: platform
needs: []
value: med
status: open
---

# Can the wizard's configuration warnings even fire, and does anyone need them?

**This is a question, not a fix.** It closes when evidence answers it, not when
something ships — and the answer decides between two very different pieces of
work, so filing it as either one would presuppose the answer.

`buildProjectConfig` has two validation branches that warn when a project is
built from an inconsistent wizard state:

| where | condition |
|---|---|
| `validateStackPackageConfig` | a stack is selected but no brand/package |
| `validateStackLookup` | the selected stack id resolves to nothing |

Found 2026-09-03 while finishing [[PL-15]], which removed two OTHER webview
console calls. These two were deliberately left, and looking at why turned up
something worse than noise.

## The question, in order

**1. Are either of these conditions reachable?**

Nobody knows. Can the wizard produce a `selectedStack` with no
`selectedPackage`? Can a stack id survive into `buildProjectConfig` without
resolving? The state machine may make both impossible, in which case these are
dead branches wearing the clothes of a safety net.

Answer this from the wizard's own state transitions and `wizard-steps.json` —
not from the fact that the code exists. Existing code is not evidence that its
branch runs.

**2. If they are reachable, has anyone ever hit one?**

The warnings are invisible in the field (below), so absence of reports is not
evidence of absence. Session transcripts and any `.demo-builder.json` with a
`selectedStack` but no `selectedPackage` are better evidence.

**3. Only then: delete or rewire?**

- Unreachable → delete both branches. A chore.
- Reachable → route through the log channel so an SC can see them. A fix, and a
  change to production logging that wants the branches covered first.

## What is already established

**They cannot be read.** A webview's `console.warn` goes to webview devtools and
nowhere else. There is no bridge — `src/core/communication/` has no console
capture or forwarding (checked `captureConsole`, `forwardConsole`,
`console.warn`; zero hits). An SC gets **nothing** in the "Demo Builder: Debug
Logs" channel that `.claude/skills/debug-log-triage/` tells them to check first.

**Neither branch has ever been tested.**

| probe | test files |
|---|---|
| `validateStackPackageConfig` | 0 |
| `validateStackLookup` | 0 |
| `"Incomplete configuration"` | 0 |
| `"Configuration warning"` | 0 |
| **control:** `buildProjectConfig` | **4** |

The surrounding function is well covered; these two branches are not. That is
why they never fire in the suite, and it is also why question 1 has no answer
sitting anywhere.

**The channel exists with no senders.** `webviewClient.log(level, message)` posts
a `log` message; `baseWebviewCommand.ts:331` listens; `handleLog` writes it to
the real logger, mapping `warn` to `context.logger.warn`. **Zero call sites in
the codebase** — a finished receiver nobody sends to, which is the mirror of the
dead-sender shape `dead-code-scan` hunts for and arguably worse, because the
infrastructure looks complete.

## Why this was not simply fixed

`wizardHelpers` is a pure helper: wizard state in, config out, no client
dependency. Threading a transport into it is a design change, not a cleanup —
and doing that with zero tests on the branches means no safety net for a change
to production logging. If the answer to question 1 is "unreachable", all of that
work is wasted anyway.

## Done means

Questions 1 and 2 answered with evidence recorded here, and a one-line verdict:
delete, or rewire. Whichever it is becomes its own item.

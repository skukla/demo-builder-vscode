---
id: PL-59
kind: feature
area: platform
needs: []
value: high
status: active
---

# A long operation should say what it is doing, not just spin

Adding an integration runs for minutes — subscribe the Adobe APIs, fetch and install the
app, deploy it, and for a bound pair do all of that twice, then install into Commerce. The
SC sees one VS Code progress notification with one line of text. Owner, 2026-09-16: that
gives us "no ability to tell them anything useful about what's happening".

The same is true of the other long operations: project creation, project edit, reset, and
component updates.

## We have already solved this once

Storefront setup does not use a notification. It renders a phase, the current message, a
sub-message, and a STATIC expectation line per phase — "how long it usually takes, or what
it is waiting on", from the 2026-08-22 loading-message audit (`StorefrontSetupStep.tsx`,
`getHelperText`). Integrations got the thin version instead, and the two surfaces drifted.

The plumbing for the richer version already exists: the runner emits progress at every step
through `deps.onProgress`, and the storefront pipeline already pushes phase payloads to a
webview. What is missing is the presentation and the phase vocabulary.

## Open: the shape (the owner wants to discuss this)

Options, with what each costs:

1. **Blocking modal reusing the loading spinner.** What the owner first suggested. Right when
   the surface has nothing else to offer and the wait is short; wrong for a multi-minute
   deploy, because it traps the dashboard while the SC waits.
2. **The card expands into a progress view** (recommended by the assistant): phases,
   current step, expectation line, terminal state with actions. Non-blocking, matches
   storefront setup, and the card is already where the SC is looking.
3. **A dedicated progress panel or drawer** shared by every long operation. Most room, most
   work, and it moves attention away from the thing being changed.

Whatever is chosen has to answer:

- **Phases.** Adding the ERP pair is: subscribing APIs → fetching the ERP → deploying the
  ERP → fetching the integration → deploying it → installing into Commerce. Each needs a
  name an SC understands and an honest expectation.
- **Failure.** A terminal state that stays put, names the reason, and offers Debug Logs and
  Retry — not a notification that fades.
- **The agent path.** The same operation can start from an MCP tool with no webview open, so
  a notification (or the existing progress channel) has to remain the fallback.
- **Reopening.** Closing and reopening the panel mid-run must re-render the current phase.
  There is an in-flight registry for card labels already (`progressRegister.ts`).
- **One component.** Storefront setup, integrations and long project edits share it, or the
  drift that produced this item happens again.

## Where

`appBuilderComponentHandlers.ts` (the current `withProgress` for add/remove/redeploy),
`StorefrontSetupStep.tsx` (the pattern to reuse), `progressRegister.ts`, and the webview
surfaces that host the cards.

## Shipped so far

- 2026-09-16  docs(backlog): PL-59 — a long operation should say what it is doing (`66b95506c`)
- 2026-09-19  feat(integrations): an integration operation shows its progress in a modal (`5aaefb0b1`)
- 2026-09-19  Merge feature/operation-progress: an integration operation shows its progress in a modal (`9e6e14e97`)
- 2026-09-19  Merge develop into feature/erp-integration: the progress modal and Adobe project rename (`6ed8283e3`)

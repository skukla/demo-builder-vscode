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
- 2026-09-19  feat(integrations): the progress modal hands over to a notification and holds still (`7a91197b4`)
- 2026-09-19  Merge feature/operation-progress into feature/erp-integration: the reviewed progress modal, to try on Bodea (`d25c65724`)
- 2026-09-19  Merge feature/operation-progress into feature/erp-integration: notifications show the short stage name (`beac5c902`)
- 2026-09-19  test(integrations): assert the stage-length list is empty strictly (`2f3b46549`)
- 2026-09-19  fix(integrations): a background notification shows the short stage name (`a937022df`)
- 2026-09-19  feat(integrations): a pair's progress says which of the two it is on (`29e192e76`)
- 2026-09-19  docs(plan): PL-59 phase 2, one progress model for the whole extension (`b40596920`)
- 2026-09-19  docs(plan): record the owner's PL-59 decisions: start/stop are short, 10 seconds (`bb87529f3`)
- 2026-09-19  docs(plan): an agent's project delete is local only by design; the cloud question moves out (`090a7efd8`)
- 2026-09-19  feat(progress): one progress model any screen can use (PL-59 phase 2, slice 0) (`6a002b9cc`)
- 2026-09-19  Merge feature/operation-progress into feature/erp-integration: the shared progress model (`a2724c134`)
- 2026-09-19  feat(mesh): deploy the API Mesh into the progress modal (`7430ae428`)
- 2026-09-19  Merge feature/operation-progress: the mesh deploy on the progress modal (`9b5a0d304`)
- 2026-09-19  feat(progress): keep a long operation visibly moving (`35880ca7e`)
- 2026-09-19  perf(app-builder): stop paying a minute for a question Adobe won't answer (`072095629`)
- 2026-09-19  feat(progress): say it in the SC's words, everywhere they watch (`d8cc4b097`)
- 2026-09-19  feat(reset): a reset narrates into the progress modal (`3c9cd8399`)
- 2026-09-19  refactor(ui): put class names where the bundle scan can read them (`3cadd5c8a`)
- 2026-09-20  feat(dashboard): the storefront buttons narrate into the progress modal (`d15168675`)
- 2026-09-20  feat(destination): the move narrates, and says which integration it is on (`89f032ca9`)
- 2026-09-20  feat(progress): the modals that already show progress can be left running (`ad686cbba`)
- 2026-09-20  feat(ai): the agent paths that ran steps now say them (`f54a99fb5`)
- 2026-09-20  test(ai): the delete tool's phase test joins its own suite (`b534a4d5a`)
- 2026-09-20  feat(wizard): the creation screens read from the shared stage table (`592ae1902`)
- 2026-09-20  feat(commands): the palette's notifications follow the wording rules (`658ccc6e1`)
- 2026-09-20  feat(lifecycle): start, stop and restart leave the tile to say it (`ecaa415d1`)
- 2026-09-20  docs(plan): PL-59 phase 2 — all ten slices built (`fef31647a`)
- 2026-09-20  test(sop): pin which surface a long operation opens (`d003872af`)
- 2026-09-20  fix(ui): results are messages, and the private-browser wait is written once (`c0560c9d1`)
- 2026-09-20  feat(ui): a question the work is paused on is asked in the modal (`8d1e1a739`)
- 2026-09-20  feat(ui): the modal owns the form, not just the question (`4f5d37958`)
- 2026-09-20  feat(ui): a modal keeps the height of its tallest state (`f554726b1`)
- 2026-09-20  fix(dashboard): a status read asks nothing (`fb9506345`)

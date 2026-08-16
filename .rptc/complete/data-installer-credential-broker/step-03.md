# Step 03 — Reconcile the provisioning UI with the brokered path

**Repo:** this one. **Blocks release. Shares a seam with step 02** — same files,
same refusal envelope. Land it in the same branch.

## What changes without anyone editing the UI

Nothing in `ImportDatapackModal` or `importResult.ts` has to move for step 02 to
work, and that is worth stating plainly before touching either. The offer is
already gated correctly:

```
needsAccsCredentials = reason === 'needs-accs-credentials'
                       && canProvisionAccsCredentials(project.adobe)
```

(`importHandlers.ts:409-411`, `exportHandlers.ts:185-187`, over the shared
predicate at `accsProvisionEligibility.ts:43`.)

After step 02 a project with a reachable broker never reaches that refusal, so the
button stops appearing for exactly the population it could never help. The
remaining refusal means: **no declared pair, and the broker had nothing either.**

So this step is mostly verification with three small decisions.

## Decision 1 — the button stays, as the third rung

**Keep "Set up credentials automatically"** (`ImportDatapackModal.tsx:490`) and keep
its gate unchanged.

It is **not** a preference toggle, and describing it as one would be wrong: it never
appears when the broker succeeds. Resolution runs local pair → broker → refuse, and
the button lives on the refusal. So it is the retry rung — *the shared credential
did not come through; make your own in your workspace* — which is also why its
existing gate is already the right one. Console provisioning still needs a
workspace, and offering it without one would be the second-refusal bug
`accsProvisionEligibility.ts` was written to prevent.

Removing it would leave a broker-403 user with no path at all.

## Decision 2 — the refusal message must name both remedies

`CREDENTIAL_MESSAGES['needs-accs-credentials']` (`importHandlers.ts:58-59`) says
"Add them before importing." That was complete when the only source was the user.
It is now one of two, and the other one failing is the more likely cause on a
project that has no binding.

Reword both copies (import and export keep their own wording — see step 02's
closing note) so the message covers: the shared service did not supply one, and
either paste a pair or ask an administrator. Do not name the service, its URL, or
the org in user-facing text — this repo is public and the string ships in the VSIX.

**Add a message for step 02's new `no-credential-service` key** in both maps. This
one is the user's to fix and should say so: no credential service is configured, and
the setting to configure is `demoBuilder.accsDiscovery.services` — the setting NAME
is safe to print, its value is not.

## Decision 3 — the success message

`importResult.ts:98-104` says "The OAuth pair was created in this project's
workspace and saved to its configuration." That stays accurate: it is the response
to the *provisioning button*, which does exactly that. No change.

**Nothing in the UI should announce which credential authenticated.** A brokered
run and a locally-configured run look identical to the user, deliberately. The
distinction goes in Debug Logs, one line, no values.

## Verification — the interaction with `11dea998`

The two fixes that landed before this plan must still hold. Both are behaviour a
test can pin:

| From `11dea998` | What step 02 does to it | How to check |
|---|---|---|
| `confirmSampleDataRemoval` resolves credentials **before** prompting (`edsResetUI.ts:476`) | starts succeeding for projects that had nothing — the prompt now appears where it can be honoured | a reset on a no-binding ACCS project with a configured broker shows the prompt; with no broker configured it stays silent |
| the button is gated on a real workspace binding | unchanged | a no-binding project with a failing broker still gets a refusal with **no** button |

The second row is the one to actually assert. An offer whose only outcome is a
second refusal is what `accsProvisionEligibility.ts` was written to prevent, and
step 02 adds a new way to arrive at that refusal.

## Tests

Extend the existing suites rather than adding a surface:

- `tests/features/data-installer/handlers/importHandlers.test.ts` — refusal after a
  failed broker still carries `needsAccsCredentials: false` when there is no
  binding, and `true` when there is
- `tests/features/data-installer/handlers/exportHandlers.test.ts` — same pair of
  cases, since it duplicates the gate deliberately
- `tests/features/data-installer/ui/components/ImportDatapackModal.lifecycle.test.tsx`
  — already drives the offer through `data: { needsAccsCredentials: true }`
  (`:205`, `:336`, `:414`); no new case needed, but re-run it as the regression pin
- the reworded messages: assert the KEY resolves, never the sentence. Matching
  message strings is the brittle version and the handler comment at
  `importHandlers.ts:403-407` already says so.

## Do not

- Do not add a "using the shared credential" badge, banner or notice. It is
  information the user cannot act on.
- Do not widen `canProvisionAccsCredentials` to accommodate the broker. It answers
  "can Console provisioning run here?", which the broker does not change.
- Do not surface the broker's HTTP status in the modal. 403 to a user reads as a
  bug in the extension; Debug Logs is where it belongs.

---
id: AB-18
kind: fix
area: app-builder
parent: AB-9
needs: []
value: high
status: backlog
---

# A Commerce product profile the SC is not a developer on locks them out of their own project

Filed 2026-09-17, found by AB-17's cleanup. AB-17 (a workspace per integration) and
every teardown path wait on this, because a read-only project cannot lose a workspace, a
credential or anything else.

## What happened on Bodea

- Deleting a workspace in Bodea's Adobe project failed with `400 "Read-only project
  cannot be deleted"`. The same delete worked in that project on 2026-08-27.
- The Developer Console now says of the project: "This project is read only due to missing
  developer permissions", and lists 38 product profiles the owner is not a developer on,
  all `Default - <Commerce tenant id>`, including Bodea's own tenant.
- The owner's role in the org is Developer. Adobe's Console FAQ: a project is read-only
  for a user who lacks developer access to any product profile its credentials use.
- **It blocks the extension's own work, not just Console housekeeping.** Updating the ERP
  integration on Bodea failed on 2026-09-17 at the step that reads the workspace
  credential's secrets, before any deploy: `403 [CoreConsoleAPISDK:ERROR_GET_INTEGRATION_SECRETS]
  … "The user … doesn't have the matching licenses for this application"`. The update had
  already fast-forwarded the clone, nothing was deployed, and the card offers Update again —
  so it resumes once the access is granted. Deploy, redeploy, add and remove read the same
  credential, so they are blocked the same way; nothing in the extension says so in plain
  words yet (see "What the fix needs").

## Cause

**Not our subscription.** An earlier draft of this item guessed that `17759e61f`
(2026-09-16, the ERP integration's `ACCS-REST-API` subscription) attached the 38 profiles.
The owner confirmed it had nothing to do with it (2026-09-17). How the profiles came to be
on the project is not recorded here. The owner has since learned that Adobe is moving to a
product profile per Commerce instance (PL-61), and the org admin is looking into the
owner's permissions.

Whatever attached them, the effect on the extension is the same: a project whose
credentials use a profile the SC is not a developer on is read-only for that SC, and the
extension cannot tear it down.

## What the fix needs

1. A check for projects that are read-only: detect it (the Console's reason) and explain
   it, instead of letting teardown fail with "Read-only project cannot be deleted".
2. When the extension itself subscribes a credential to a service with profiles, subscribe
   only the project's own tenant profile (its id is in the backend's GraphQL URL), and
   first check the SC is a developer on it (PL-61 covers both subscribe paths).
3. Bodea: the org admin's review of the owner's permissions; then the two leftover
   workspaces `zzerpspike` and `ErpSpikeq3e9` can be deleted.

## Open

- The owner is not a developer even on their own tenant's profile, yet Bodea's Commerce
  accepts the credential. Whether an SC can normally be made a developer on their tenant
  profile, and by whom, decides whether the check in step 2 is a warning or a blocker.

## Shipped so far

- 2026-09-17  docs(backlog): AB-18 — the Commerce subscription can make an SC's project read-only (`2046ae5e6`)
- 2026-09-20  Owner, 2026-09-20: no longer a blocker — deleting a workspace works today. The CAUSE of the 2026-09-17 read-only failure is not recorded; the evidence in AB-17 is left as it stands so a later reader can tell 'fixed' from 'never explained'.
- 2026-09-20  Verified 2026-09-20, NOT just taken on word: a create+delete round trip in Bodea's CURRENT project returned HTTP 200 in 3s and removed the Runtime namespace too. But the read-only project from 2026-09-17 still holds both undeleted spike workspaces — the condition was moved away from, not shown fixed. Keep this item.

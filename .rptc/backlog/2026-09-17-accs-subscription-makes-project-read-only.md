---
id: AB-18
kind: fix
area: app-builder
parent: AB-9
needs: []
value: high
status: backlog
---

# The ERP integration's Commerce subscription can lock the SC out of their own project

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

## Likely cause (to confirm)

`17759e61f` (2026-09-16) subscribes the ERP integration's credential to `ACCS-REST-API`
with the single product entry the org catalog offers for it
(`toServiceSubscriptionInfo`, `{ op: 'add', id, productId }`). The Stage workspace was last
modified that day. If that entry stands for every tenant's default profile, the credential
gained all 38, and the project turned read-only for any SC who is not a developer on all
of them, which in a shared demo org is everyone who is not an admin.

**Confirm first:** an org admin opens the Stage OAuth credential's Adobe Commerce as a
Cloud Service API and reads which profiles it holds, or `getServicesForOrgV2` (with the
extension's client, not the CLI's, which answered 403) shows what that one product entry
is.

## What the fix needs

1. Subscribe only the profile of the project's own Commerce tenant (its id is in the
   backend's GraphQL URL), never a product-wide entry.
2. Before subscribing, check that the SC is a developer on that profile; if not, stop and
   say what to ask the org admin for, because subscribing would lock them out of the
   project.
3. A check for projects already affected: detect read-only (the Console's reason) and
   explain it, instead of letting teardown fail with "Read-only project cannot be deleted".
4. Bodea: an org admin removes the extra profiles from the Stage credential (and makes the
   owner a developer on `Default - UoGYsHrcxMyeoVd2zUktZi`), then the two leftover
   workspaces `zzerpspike` and `ErpSpikeq3e9` can be deleted.

## Open

- The owner is not a developer even on their own tenant's profile, yet Bodea's Commerce
  accepts the credential. Whether an SC can normally be made a developer on their tenant
  profile, and by whom, decides whether step 2 is a warning or a blocker.

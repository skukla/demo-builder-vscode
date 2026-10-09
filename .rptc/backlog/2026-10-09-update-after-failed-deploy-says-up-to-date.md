---
id: AB-71
kind: fix
area: app-builder
needs: []
value: med
status: backlog
---

# An update whose deploy failed then says "already up to date"

Filed 2026-10-09, measured live on the Justrite project.

## What happened

`update_integration` on the Justrite ERP (`demo-erp`) fast-forwarded the
component's clone from `2e50537` to `89a3ad0`, then ran `aio app deploy`, which
failed: Adobe's database status check answered 504, so the deploy tried to
provision a database that already exists and got 409 "Provision request already
submitted". A transient Adobe failure, and the deploy failed honestly.

The retry answered `{"detail":"The integration is already up to date."}` and
deployed nothing. The live ERP was still running the old code. Only
`redeploy_integration` put the new code live.

## Why

`integrationSourceUpdate.ts` decides "current" by comparing the clone's HEAD with
the branch (`from === to` after `fetchHeads`). The clone moved before the deploy
ran, so after a failed deploy the clone is current and the deployed app is not.
The question it answers is "is the folder current?", and the SC asked "is the
running app current?".

## What a fix looks like (recommendation)

Record the commit a deploy actually shipped on the component's record (for
example `deployedCommit`, written only when the deploy succeeds) and have update
compare the branch head against THAT, not against the clone's HEAD. A clone that is
current with an older `deployedCommit` then redeploys instead of answering "already
up to date". `check_integration_updates` and the card's update badge should read
the same field, so the badge stays on until the new code is live.

Check both surfaces: the card's Update button and the `update_integration` tool
dispatch into the same handler.

## Workaround until then

Run Redeploy (button or `redeploy_integration`) after an update whose deploy failed.

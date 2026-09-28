---
id: AB-16i
kind: fix
area: app-builder
parent: AB-16
needs: []
value: high
status: backlog
---

# Events from an added ERP never reach the integration

Filed 2026-09-28 from AB-16a's live proof on Bodea.

## What was measured

Contoso ERP (`demo-erp-2`, its own workspace) raised `contract.changed` when its price list was
activated; its outbox shows `delivered: false` with an error. The mock ERP sends events to
`EVENTS_WEBHOOK_URL`, else to the ingestion action in ITS OWN namespace
(demo-erp `lib/events.js` `webhookUrl`), where no integration listens. Northwind's events work
because it shares the integration's workspace. The hourly publish covered prices; nothing covers
Contoso's credit, block, stock, shipment and invoice events.

## Fix

When Demo Builder deploys an added ERP, give it `EVENTS_WEBHOOK_URL` = the integration's
ingestion web action URL (in the integration's workspace; the integration's `deployedUrls`), and
make sure that ingestion action accepts a call signed with the ADDED ERP's credential (it is
`require-adobe-auth` in the integration's workspace, so it may refuse a foreign technical
account: the same mismatch as AB-16a, the other way round). Either the ingestion accepts calls
from the ERP's credential, or the ERP signs its event posts with a credential the integration's
workspace accepts. Decide with a measurement, then redeploy Contoso and prove one event.

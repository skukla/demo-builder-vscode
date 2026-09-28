---
id: AB-16i
kind: fix
area: app-builder
parent: AB-16
needs: []
value: high
status: built
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

## Shipped so far

- 2026-09-28  Measured from code (2026-09-28): the integration's ingestion web action is require-adobe-auth: true in the integration's workspace (src/commerce-extensibility-1/actions/ingestion/actions.config.yaml), so a post signed with the added ERP's own credential would be refused as a technical account mismatch. Chosen shape (a real ERP posts to middleware with a credential the middleware issued): Demo Builder deploys an added ERP with EVENTS_WEBHOOK_URL = the integration's ingestion URL and a publishing credential from the integration's workspace (EVENTS_AUTH_* inputs); the ERP signs event posts with it when given, else with its own. The first ERP is unchanged.
- 2026-09-28  Built and live on Bodea (2026-09-28): demo-erp main 7671773 (6434366 signs event posts with a publishing credential; 7671773 keeps a list-valued event's shape), Demo Builder 2d829598a (an added ERP is deployed with EVENTS_WEBHOOK_URL = the integration's ingestion URL and EVENTS_AUTH_* from the integration's workspace credential, through the same deploy-env path as ERP_SCREEN_KEY; never in the manifest or logs), integration 38a418d (contract vendored). Contoso price list activated 14:00:51: event delivered 14:00:51, price 1500 in Kukla Studios' catalog by 14:01:03; deactivated 14:01:22: removed by 14:01:34. The hourly publish (:05) did not run in between.

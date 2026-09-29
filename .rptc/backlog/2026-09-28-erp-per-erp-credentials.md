---
id: AB-16a
kind: feature
area: app-builder
parent: AB-16
needs: []
value: high
status: built
---

# The integration signs in to each ERP with that ERP's own credential

Filed 2026-09-28. **Decided by the owner, 2026-09-28: "Do what is recommended."**

## Why

Each mock ERP lives in its own Adobe workspace (the owner's one-workspace-per-ERP choice). An
ERP's actions are `require-adobe-auth`, and Adobe's check accepts machine calls only from that
workspace's own technical account. The integration calls every ERP with its own workspace's
credential, so a second ERP refuses everything: measured on Bodea, Contoso ERP (`demo-erp-2`)
answered 401 "Technical account mismatch" to orders, cart prices and health checks.

## What to build

- When Demo Builder adds an ERP, it hands the integration that ERP workspace's
  server-to-server credential with the ERP's list entry (`PUT erp/erps`).
- The integration keeps it (App Builder State), never returns it (`GET erp/erps` redacts it),
  and the adapter signs each call to that ERP with it (`paramsForErp`). The first ERP keeps
  using the integration's own credential.
- Removing the ERP removes its entry and so its credential; deleting its workspace revokes it.
- A real client's integration holds one API credential per ERP the same way.

## Done when

Contoso on Bodea answers the integration: a mixed order sends Contoso its part, its health
reads reachable, and its cart price applies. The credential never appears in a response, a
log or the repository.

## Shipped so far

- 2026-09-28  Integration side built (feature/ab-16a-per-erp-credentials: e2465c9, 0ba4c23, 425da37, c32826a, b41c806; 712 tests). paramsForErp overrides AIO_COMMERCE_AUTH_IMS_CLIENT_ID/_CLIENT_SECRETS/_ORG_ID/_SCOPES (+ technical account when given) and gives each ERP its own token cache context. Found and fixed outside the item: three actions logged the integration's IMS secret at debug level. Follow-up filed: AB-16h (paths that still reach only the first ERP). Known, not ours: aio-lib-ims-oauth prints its config, secret included, when DEBUG is on.
- 2026-09-28  Live on Bodea (2026-09-28): integration main b41c806 deployed; Demo Builder 06556c6a8 re-sent the ERP list with Contoso's own credential (Add another ERP, same name). Contoso health: reachable, 200 (was 401 'Technical account mismatch'). Mixed order 3000000021: Northwind sales order 0000001011 (accesspoint only), Contoso sales order 0000001000 (proliantdl380 only). Contoso price list 4000000001 for Kukla Studios: publish wrote 1500 for proliantdl380 into Kukla Studios' shared catalog; deactivated and published again: removed, catalog as it was (Platinum Buyer's 10% discount untouched). Contoso's own price event was NOT delivered (filed AB-16i); the hourly publish covered it.
- 2026-09-28  docs(backlog): AB-16a proven live; AB-16i filed; AB-16d progress (`0c5bc7255`)

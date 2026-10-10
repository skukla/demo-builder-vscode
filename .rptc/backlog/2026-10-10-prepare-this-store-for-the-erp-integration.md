---
id: AB-77
kind: feature
area: app-builder
needs: []
value: high
status: built
---

# Prepare this store: the ERP setup steps the extension can apply, not only check

Filed 2026-10-10 after the owner pointed at Adobe's September 2026 System Configuration
REST API and a ten-minute live test on Justrite proved it.

## What is true now

The ERP integration's setup checklist has nine steps (`setupSteps` on the catalog entry,
checks in `setupChecks.ts` and `setupConfigChecks.ts`). The extension CHECKS all nine and
FIXES half of one (AB-74 adds `erp_owner` to attribute sets; the attribute itself is still
created by hand). Everything else is a guided Admin walk.

Adobe Commerce as a Cloud Service gained `GET` and `PUT /V1/system/config` on 2026-09-08
(developer.adobe.com/commerce/webapi/rest/saas-integrations/system-config). Measured live on
Justrite 2026-10-10:

- reads at website scope answer the same rows for `scope=website` and the older
  `scope=websites` spelling the checks use, so the checks are not misreading;
- `PUT` works: `sales/totals_sort/tax` 40 → 41, read back 41, restored to 40, read back 40;
- a rejected path comes back in the answer's `errors` list under HTTP 200, so every write
  must read that list;
- `POST /V1/order-statuses` answers 404: the two custom order statuses have no write route.

## What it would do

One confirmed action on the integration's card and in the setup guide, "Prepare this store",
plus an agent tool, that:

| Step | Today | After |
|---|---|---|
| Catalog price scope = Website | guided | written: `catalog/price/scope` = 1 at default |
| Payment on Account on | guided | written: `payment/companycredit/active` = 1 at the website |
| Returns on | guided | written: `sales/magento_rma/enabled` = 1 at the website |
| Card payments on-switch | guided | written: `payment/payment_services/active` = 1 at the website; the PayPal sandbox connection stays a guided step |
| `erp_owner` and `brand` attributes | half | created as Text Fields (`POST products/attributes`), then AB-74's set fix |
| A warehouse per ERP in the website's stock | guided | written through the inventory routes the check already reads (source, stock, link); stock moves need a decision, see below |
| A shared catalog per priced company | guided | written through the B2B routes the check already reads |
| "Confirmed in ERP" status | guided | stays guided: no write route |
| "Partially Held" status | guided | stays guided: no write route |

Rules: show what will change before writing; apply; report every rejected item by name;
record each setting's previous value so "Undo preparation" restores it. A Commerce source
can be disabled but never deleted, so the warehouse step's undo is "disabled", said plainly.
Moving product quantities to the new source is a per-product write and may belong in the
datapack rather than here; decide when building.

Also: the `price-scope-website` step text still says "No API sets this". Stale since
2026-09-08; replace when this lands.

## Why high

Every ERP demo needs these steps, whichever ownership mode it uses, and they are where the
SC's setup time goes. AB-74 and AB-75 only help the multi-ERP case.

## Shipped so far

- 2026-10-10  feat(app-builder): prepare this store applies the ERP setup steps, with undo (`fa832c75b`)

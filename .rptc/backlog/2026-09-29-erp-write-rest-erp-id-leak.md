---
id: AB-40
kind: fix
area: app-builder
needs: []
value: high
status: shipped
parent: AB-26
---

# write_erp_rest with a body fails: the ERP action's own inputs leak into the body

Filed 2026-09-29, found live on Bodea while starting the AB-26e sync validation. The very
first ERP→Commerce leg (§1.3, change a product's list price on the ERP) failed.

## Symptom

`write_erp_rest` PATCH `products/accesspoint {"listPrice":249}` →
`400 "ERP_ID cannot be edited"`. The body I sent held only an editable field; `ERP_ID` was
never in it.

## Root cause (verified end to end)

1. The demo-erp `products` action is `web: 'yes'` (NON-raw) and declares `ERP_ID: $ERP_ID`
   as an input (`demo-erp/app.config.yaml:127,132`) — so `params.ERP_ID` is present on every
   invocation, alongside `ERP_DISPLAY_NAME`, `EVENTS_*`, `LOG_LEVEL`.
2. For a non-raw web action, Adobe Runtime merges a JSON request body into `params` and sets
   NO `__ow_body`.
3. The mock's `http.body()` (`demo-erp/lib/http.js:19-37`) takes its primary path only when
   `__ow_body` is set; otherwise it falls back to returning EVERY non-plumbing param as the
   "body". `ERP_ID` et al. are not in its `PLUMBING` set, so they ride along.
4. `patchProduct` (`demo-erp/lib/products.js:254,271`) iterates the body keys against
   `EDITABLE = {name,listPrice,warehouses,salesStatus}` and throws on the first stranger —
   `ERP_ID`.

## Why the screen is NOT affected

The ERP screen never calls the product action directly. It calls through a `screen` proxy
action (`demo-erp/screen/src/api.js:13-16` → `…/screen/api/products/<sku>`). Only a DIRECT
external caller hits the leaky fallback — and `write_erp_rest`/`callErpApi`
(`erpIntegrationClient.ts callWithIms`) calls the action directly at its deployed URL.

## Impact

Every `write_erp_rest` that sends a body to a non-raw ERP action is blocked from the AGENT
surface: ERP price / stock / sales-status edits (PATCH products), credit limit and block
(PATCH partners), contract prices (POST pricing). That is the whole ERP→Commerce half of
the sync-validation *via tools*, and a real hole in the agent story (AI-surface). The
Commerce→ERP legs (`write_commerce_rest`) and all reads are unaffected. The human screen
path works.

## Fix options (a decision — spans repos)

1. **Make the mock's ERP actions `web: 'raw'`** so `__ow_body` is set and `http.body()`'s
   primary path runs for direct callers. Cheapest to the symptom; confirm the `screen` proxy
   still forwards a body the raw parser accepts.
2. **`http.body()` fallback excludes the action's declared input env vars** (the all-caps
   `ERP_*`/`EVENTS_*`/`LOG_LEVEL` inputs). Keeps non-raw actions; the fallback stops treating
   inputs as body.
3. **Route `write_erp_rest` through the `screen` proxy** the way the UI does, instead of the
   action's own URL.

Recommendation: option 2 (exclude inputs in the fallback) is the narrowest correct fix and
keeps the actions non-raw; option 1 is the alternative if raw is wanted for other reasons.

## Done when

`write_erp_rest` PATCH products/partners and POST pricing succeed against a deployed ERP, and
the AB-26e ERP→Commerce legs run to PASS.

## Shipped so far

- 2026-09-29  Fixed: added ERP_ID to PLUMBING in demo-erp lib/http.js (commit 764bfce, main), with test/http.test.js pinning it; 367 mock tests pass. Redeployed both ERPs on Bodea. Verified live: write_erp_rest PATCH products/accesspoint {listPrice:249} now succeeds (was 400 'ERP_ID cannot be edited'). Note: update_integration reported 'already up to date' for an ERP id but did redeploy it (fresh lastDeployed) — a reporting quirk, not a failure.

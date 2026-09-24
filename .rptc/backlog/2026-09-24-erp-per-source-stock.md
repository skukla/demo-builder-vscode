---
id: AB-26h
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b]
value: med
status: active
---

# Per-source stock changes reach the ERP, plus the small gaps (product delete, credit truth, currency)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

G2: a non-default source's quantity edited in Commerce reaches the ERP (an MSI source-item event if one exists on the target backend, else the minute refresh re-reads changed SKUs). G1: a product deleted in Commerce leaves the ERP. G3: the ERP's exposure is the demo's truth, stated on the customer card (owner's decision assumed as recommended; confirm). G5: an ERP currency, read from the mapped website's Store Information (with AB-26j) or a setting until then.

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness journeys for each gap; fixture-backed tests for the new reads; the customer card states the truth rule.

## Shipped so far
- 2026-09-24  G2 BUILT TO THE EDGE — demo-erp 88b6679 (stock-only import key, journaled per SKU, does not move lastImportAt) + integration 6488c0d (minute timer refreshes stock: snapshot in State, diff, send moved SKUs with full warehouse lists; ERP-written quantities noted so they are not echoed; worker renamed refresh-job; 321 tests). Live proof waits for a credential. G1 (product delete), G3 (truth note on the customer card) next; G5 (currency) waits for AB-26j
- 2026-09-24  G1 + G3 BUILT TO THE EDGE — demo-erp 52b1acd (DELETE products/:sku, a deleted parent's variants stay as products of their own, journaled; customer card states the exposure rule) + integration 0ccb226 (subscription to observer.catalog_product_delete_commit_after + handler; manifest regenerated; 323 tests). G2 shipped earlier today (88b6679 / 6488c0d). Remaining: G5 currency (waits for AB-26j); live proof of the two new subscriptions and the minute stock refresh (a credential). Owner to confirm G3: the ERP's exposure is the demo's truth

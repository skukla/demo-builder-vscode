---
id: AB-60
kind: question
area: app-builder
parent: AB-26
needs: []
value: med
status: open
---

# How fine-grained can events be, in each direction?

Owner, 2026-10-02: a product NAME change showed in the event journal as a price update, and
its payload carried several fields rather than just the name. "I'd love to understand the
level of payload granularity that we can employ natively."

## What is true today (read 2026-10-02)

- **ERP → Commerce.** The mock ERP raises ONE event kind for any product edit,
  `product.price` (`be-observer.catalog_product_update`), carrying sku, name and price
  (demo-erp `lib/products.js`, `if (productChanged) emit('product.price', …)`); the journal
  labels that kind "Price changed" (`lib/journal.js`). So a name change reads as a price change.
  Our choice, not a platform limit. Fixed under AB-26y step 6 (the ERP's own language): a
  "Product changed" event with the full record, and the journal naming the fields that changed
  (a real ERP keeps a field-level change log: SAP change documents; to verify when built).
- **Commerce → ERP.** The integration subscribes `observer.catalog_product_save_commit_after`
  with a fixed field list (id, sku, name, price, type_id, created_at, updated_at;
  commerce-erp-integration `app.commerce.config.ts`), so every save sends all of them.

## What Adobe Commerce eventing offers (developer.adobe.com/commerce/extensibility/events/conditional-events/, read 2026-10-02)

- `fields` chooses what the payload carries: a snapshot of those fields, not a diff.
- `rules` decide whether the event is sent: equal, lessThan, greaterThan, in, regex, and
  `onChange`, which sends only when a field differs from its previous value in `_origData`.
  "This rule is possible only for events that include original data `_origData` in the
  payload." A rule that evaluates false sends nothing.
- `_origData` can itself be a field, so a receiver can see the previous values.
- A conditional event is a named child of a parent event, so "product name changed" and
  "product price changed" can be two subscriptions.

## The three live checks (before building anything)

1. Does Commerce as a Cloud Service accept `rules` (and `onChange`) for an app's event
   subscriptions? The page is written for the platform generally.
2. Can the integration's app config (`app.commerce.config.ts`, aio-commerce-lib-app's event
   declarations) declare rules and a parent event, and does the generated manifest carry them?
3. Does `observer.catalog_product_save_commit_after` include `_origData` on Justrite? (The
   Admin's System > Events > Events List shows it, per the page.)

## Recommendation

Keep full-record events in both directions (the standard ERP shape) and add precision where
it is cheap: the ERP names what changed (AB-26y); Commerce sends `_origData` or uses
`onChange` child events only if checks 1–3 pass, and only for the fields a demo story needs.

## Shipped so far
- 2026-10-02  Checks 2026-10-02. (2) YES: aio-commerce-lib-app 2.0.0 config schema accepts per-event rules with operators regex, greaterThan, lessThan, equal, in, onChange; it has no parent field, so a rule filters the app subscription to a native event rather than defining a named child event. (1) Largely yes: GET eventing/getEventSubscriptions on Justrite shows each app subscription stored as a named child (commerce_erp_integration.observer.catalog_product_save_commit_after, parent observer.catalog_product_save_commit_after) with fields and an empty rules list. Not yet proved: that a rule filters live, and (3) whether the product save payload carries _origData; both need a test subscription deployed, so they belong to the build
- 2026-10-02  docs(backlog): AB-60 checks — app config accepts onChange rules; Justrite stores rules per subscription (`dc54f4a2a`)
- 2026-10-02  docs(backlog): AB-60 filed — event payload granularity, with three live checks; the ERP product event fix joins AB-26y (`5a3a77be9`)

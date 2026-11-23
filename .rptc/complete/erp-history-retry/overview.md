# The ERP integration's history and retry (AB-25 parts 2 and 4)

Built in `skukla/commerce-erp-integration`, branch `feature/sync-history` off `main`.
Research: `.rptc/research/erp-two-way-ux/research.md` — a per-record log with the reason and a
retry of one record is the common pattern; Adobe's own Data Feed Sync Status page (status,
error column, resync action) is the layout to echo.

## What the code already gives us

`src/lib/order-sync.js` `sendOrderToErp` answers every order event with an outcome and a plain
message: `sent` (with the ERP number), `skipped` (not new, already numbered, sending off),
`held` (the ERP could not take it; I/O Events delivers again at 1, 2, 4, 8 minutes, then every
15 for a day) or `dropped` (refused by the ERP, or not sent because holding is off). Nothing
keeps those outcomes: they go to the Runtime log only.

## Model — one record per ORDER, not per attempt

A held order is retried by I/O Events up to ~100 times in a day; a line per attempt would bury
the story. Each order gets one record, rewritten as it moves:

`{ kind: "order", direction: "to-erp", ref: <increment id>, outcome, message, erpNumber?,
attempts, firstAt, lastAt, retriedBy? }`

- Stored in App Builder State (`@adobe/aio-lib-state` 5, already a dependency), one KEY per
  record (`history.order.<increment id>`), so parallel orders never overwrite each other — the
  company ledger's one-key-array shape would. Listed with `state.list({ match: "history.*" })`.
- Kept 14 days (TTL). `skipped` is not recorded — it fires on every later save of an order.
- Recording never breaks a sync: a storage failure is logged and swallowed.

## Slices

1. **`src/lib/history.js`** — `recordOrderOutcome(order, result)` and `readHistory({ limit,
   failedOnly, ref })`, newest first. Test seam like `ledger.js`.
2. **Record from the order event** (`order-commerce/created`): every non-skipped outcome.
3. **`erp/history`** action (GET): the records, for the Admin page and Demo Builder.
4. **`erp/retry-order`** action (POST `{ incrementId }`): reads the order from Commerce, sends it
   through `sendOrderToErp` as new, records the outcome with `retriedBy: "admin"`. The website's
   settings still apply — a retry for a website with sending off says so.
5. **The Admin page's History section**: time, order, result, message; a Retry button on held and
   refused rows; a "failed only" filter.

Then: ERP → Commerce events (prices, stock, statuses, credit) into the same history, keyed by the
ERP event id; then "follow one order".

## Out of scope here

Price answers at cart time (AB-25 part 3): the price webhook has a one-second budget, and a
write per cart line belongs in its own design.

# Returns and credit memos: the build (order-to-return loop, 2026-10-02)

Implements `returns-design.md` r1 (approved 2026-09-28) to the point the owner's goal needs:
one Justrite order split across Justrite ERP and Accuform ERP, invoiced, shipped, credited and
returned, shown in every system. Live facts it rests on are in `returns-design.md` §6.1
(R-T1 the return save event exists; R-T3 one credit memo per ERP refunds to company credit).

## What is built, in order

| Slice | Repo | What | Done when |
|---|---|---|---|
| A | demo-erp | **Credit memo document.** `POST orders/:n/credit-memo` credits the order's invoice in full (AB-26r O5: full credit only); invoice status Credited; event `creditmemo.created` → `be-observer.sales_order_creditmemo_create` carrying the credited lines (Commerce item ids, qty) and the ERP's credit memo number | a unit test credits an invoiced order once, refuses a second, and journals the event |
| B | demo-erp | **Return order.** `POST returns` (from the integration: the ERP's sales order, Commerce return id, lines by Commerce item id, reason) → return order; `POST returns/:n/receive` (goods back; stock up; event `return.received`); `POST returns/:n/credit-memo` (credit the received lines; the same `creditmemo.created` event, naming the return). `GET returns`, `GET returns/:n` | unit tests for create (idempotent on Commerce return id + ERP), receive, credit, refusals |
| C | both | **Contract v13**: the routes and the two events, vendored into the integration | both repos' contract tests pass on v13 |
| D | integration | **ERP credit memo → Commerce credit memo.** New external event + handler: `POST order/{id}/refund` for only that ERP's lines (the part's `itemIds`), offline, shipping 0, stock untouched, keyed by the ERP's credit memo number (a redelivery credits nothing twice), under the order lock; a comment on the order (and on the return when one is named) | harness: two ERPs, one credits → one Commerce credit memo of its lines; redelivery makes none |
| E | integration | **Commerce return → each ERP.** Subscribe `observer.rma_save_commit_after`; on a new return, split its items by the order's parts record and send each ERP its piece (`POST returns`); record `order-returns-<id>`; unrouted lines recorded, never guessed | harness: a return over two ERPs' lines sends one piece to each, once |
| F | integration | **ERP return received → Commerce.** `be-observer.rma_status_update` handler: a return comment naming the ERP and its return number; the return's item statuses moved when R-T2 shows the API allows it | harness test; R-T2 answered live |
| G | demo-erp | **Screen.** Returns list + return document (Receive, Post credit memo); Credit memo on the invoice document (Post credit memo); the journal names both | headless screen check |
| H | both | Version bump, deploy to Justrite (owner-authorized 2026-10-02), the live journey, then `docs/walkthrough.md` steps for every system | the owner's flow runs live end to end |

## Decided unattended (each extends an established pattern; none changes the data model's meaning)

- One `creditmemo.created` event for both a return's credit and an invoice credit: the
  integration's job is the same (credit that ERP's lines in Commerce).
- A return is sent to the ERPs when Commerce saves it (Pending), per r1 step 2.
- Return pieces live in their own state record (`order-returns-<return id>`), per design §4.

## Not built in this run (filed, not forgotten)

- The ERP's own return policy authorizing or refusing lines (r1 step 3) — needs the "only
  standard ERP features" check on return windows first.
- Return labels (r1 step 4, R-T6), the shipping refund rule (r1 decision 2).
- Commerce-made credit memos reaching each ERP (design slice R5) and Repeat order (AB-26r).

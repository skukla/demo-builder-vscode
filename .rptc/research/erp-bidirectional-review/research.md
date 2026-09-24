# The two-way Commerce ↔ ERP integration, reviewed against its two principles

Date: 2026-09-24. Read: `commerce-erp-integration` at `0fcec33` (README, `src/lib/ledger.js`,
`detach.js`, `commerce-before.js`, `order-sync.js`, `reset`, the four order handlers,
`app.commerce.config.ts` subscriptions) and `demo-erp` at `1c00e32`. Plan record:
`.rptc/plans/erp-integration/overview.md` (decisions 3, 8, 11, 19–21, 25, 26).

## The two principles, and where they are written down

1. **Commerce is the system of record; the ERP is transient.** Owner, 2026-09-14 and
   2026-09-23. Written in the integration README ("Commerce is the permanent system; the ERP
   is transient") and in `lib/ledger.js`, `lib/detach.js`, `lib/commerce-before.js`.
2. **To the audience, the ERP looks like the system of record.** Decision 19: change a
   price/stock/credit limit in the ERP and watch Commerce follow; place an order and watch it
   arrive with an SAP number; move it through confirmed → shipped → invoiced and watch
   Commerce follow.

**The cleanup standard exists and is precise.** README, "Commerce is the permanent system":
*every ERP → Commerce write that Commerce CAN undo is read before the write
(`commerce-before.js`, `NOT_READ` when unknown), ledgered with its BEFORE value
(`ledger.js`, first-before wins), and put back by `detach` (reset and removal). What stays
is only what Commerce cannot delete: order notes, shipments, invoices, cancellations. Orders
are the stated exception — the ERP number is cleared from them. Any new ERP → Commerce write
has to answer: can Commerce undo it, and if so, where is it ledgered?* This is the test every
item below is held to.

## What flows today (verified in code)

| Direction | What | Reversible? |
|---|---|---|
| Commerce → ERP | order saved → ERP order, number written back as `ext_order_id` + note | ERP number cleared by detach; note stays (exception) |
| Commerce → ERP | product/stock events, company refresh every minute, mirror at install/reset | n/a — Commerce overwrites the ERP's copy, by design |
| Commerce ↔ ERP | cart pricing webhooks (contract price, discount ceiling), `required: false` | nothing written |
| ERP → Commerce | price, name → product; stock → source item | **ledgered** (before read, revert on detach) |
| ERP → Commerce | credit limit, block → company | **ledgered** |
| ERP → Commerce | confirm → comment (+ Processing if set); shipment → `order/{id}/ship` with items + `stockSourceCode`; invoice → `order/{id}/invoice` (capture, whole order) + comment; cancel → `orders/{id}/cancel` + comment with the ERP's reason (built today) | **documented exception** — Commerce cannot delete these |

**Verdict on the standard.** Everything this turn added on the ERP (shipments as documents,
partial shipment, close remaining, the invoice, the cancel reason) reaches Commerce through
the four order handlers, all of which are in the documented exception. Nothing new needs
ledgering. `stockSourceCode` makes Commerce deduct from a named source — that is Commerce's
own shipment behaviour, inside the exception, and the ERP does NOT deduct stock itself
(Commerce's stock event brings the new figure back), so no second write to unwind.

## Where principle 2 is thin — ranked

Ordered by how much the ERP would stop looking like the system of record if an audience
pressed on it.

### 1. A Commerce-side shipment or invoice leaves the ERP wrong (HIGH)

If an SC (or the merchant in the story) ships or invoices an order **in Commerce Admin**, the
ERP still says *confirmed*. Nothing subscribes to Commerce's shipment or invoice events. For
a system of record that is the one failure that cannot be explained away on stage.

**Fix.** Subscribe to `observer.sales_order_shipment_save_commit_after` and
`observer.sales_order_invoice_save_commit_after` (both exist in Commerce eventing; the kit's
`order-commerce/*` route is the shape), and tell the ERP: `POST orders/:n/shipments` (lines
from the Commerce shipment's items by `order_item_id` → the ERP's `commerceItemId`) then
`…/post`; `POST orders/:n/invoice`. **The loop has to be closed by design:** the ERP's post
raises `order.shipped`, which would create a SECOND Commerce shipment. Two honest ways:

- (a) the ERP takes an `origin: { event }` on these moves (the pattern `journalOrder` already
  uses for imports), journals the inbound entry, and **does not emit** the outbound event
  when an origin is present — "this came from Commerce, Commerce already has it";
- (b) the handler carries a marker Commerce ignores. There is none — Commerce has no
  idempotency key on shipments.

(a) is the one. It is an ERP change (`fulfilment.js`: skip `emit` when `origin` given; journal
via `receive`) plus a new pair of Commerce-event handlers in the integration, and a contract
addition (`origin` on the move requests). **Owner decision needed:** this makes Commerce
Admin a second place orders are fulfilled from, which the demo story (decision 19) does not
show — is it wanted, or is "fulfil only from the ERP" the rule and the gap acceptable?

### 2. Credit hold is the missing beat, and it is bidirectional (HIGH)

Plan §6.1 / slice 3: an over-limit or blocked customer's order is **created and held**;
Confirm and Create shipment refuse; Release / Reject clear it. Demo step 11 depends on it and
nothing else on the path is missing.

**The Commerce half.** Commerce has `POST orders/{id}/hold` and `POST orders/{id}/unhold`,
which put an order in status *On Hold* and back. A held ERP order → a held Commerce order
is the most convincing "the ERP decided" moment the integration can show, and it is
**reversible by construction** (unhold). Per the standard: can Commerce undo it? Yes. Where is
it ledgered? It need not be — detach should simply unhold every order the ERP holds
(read from the ERP's own order list, as it clears `ext_order_id`). Reject → the existing
cancel event with reason *Credit rejected*.

New event `be-observer.sales_order_hold` (value: the order payload + `held: true|false` +
`reason`), one handler, contract change. **Owner decision:** the hold-in-Commerce half —
show it, or keep the hold ERP-side only?

### 3. `stockSourceCode` shipped, but the ERP cannot name a warehouse (MEDIUM)

The shipment now carries the warehouse; Commerce's vocabulary (`default`, "Default Source")
is what the audience reads. The UI audit's Settings → Warehouses (ERP names for Commerce
source codes) closes it. ERP-only; no contract change.

### 4. Pricing source on the order line (MEDIUM)

The order document cannot say "Contract price CP01" per line because the ERP never learns
which condition the cart used. The quote it answered at cart time knew (`source`). Add
`source` to the order request lines (`erpOrderFrom` in `order-sync.js` would need the quote
result, which the cart webhook has and the order event does not — so either the ERP
re-derives at order creation against its own conditions, or the integration stores the last
quote per cart). Recommend the ERP re-derives at `createOrder` and stores `pricingSource` on
the line: it is the ERP's own pricing and it is "as priced when the order arrived". Contract:
`order.response` line gains a field. Small.

### 5. Confirm marks Processing only if a setting says so (LOW, already right)

`mark Processing on confirm` is a per-website setting. Fine; note it in the demo script.

### 6. What Commerce writes back that the ERP then re-imports (LOW, already right)

An ERP price edit → Commerce → product event → ERP import of the same value. Verified as
the intended loop (decision 3); the import overwrites with the identical number and the
journal shows both directions. No change.

## What was built this turn on this front

- `demo-erp 1c00e32` + `commerce-erp-integration 0fcec33`: the ERP's cancel event carries
  its reason; the integration writes *"Cancelled in the ERP (ERP sales order N): Duplicate
  order"* into the order history. Contract: `sales_order_cancel` gains `reason`. Inside the
  documented exception; nothing to ledger.
- `demo-erp ffc7be2` + `commerce-erp-integration 64a6844`: shipments and invoices as
  documents; the shipment event carries that shipment's items and `stockSourceCode`
  (the handler already read and defaulted it). Contract vendored.

## Recommended order

1. **Credit hold, ERP side** (slice 3's remainder) — needed for demo step 11, no cross-repo
   change, and it is where "the ERP looks like the system of record" is most visible.
2. **Hold → Commerce hold/unhold**, with detach unholding — after the owner's yes.
3. **Commerce-side shipment/invoice → ERP** with origin-suppressed events — after the
   owner's yes on whether Commerce Admin is a fulfilment surface in this demo.
4. Warehouse names; pricing source on lines.

Nothing here is unattended-safe to *deploy*: 2 and 3 are new Commerce writes and event
subscriptions, and changing a subscription after install needs an uninstall/install cycle
(README, "Changing a webhook or event after install"). Build and test locally; deploy on the
owner's word.

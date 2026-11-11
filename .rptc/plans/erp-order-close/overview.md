# Every Demo Order Ends Canceled or Closed, Closed in Commerce

Owner decisions, 2026-11-11 (datapack simplification, prototype J1-3b; `prototype-feedback.md`):

- Commerce is the source system, not the ERP. Clear closes every demo order in Commerce itself and
  stops handing orders to the ERP integration. The ERP is brought in line afterwards, as its own step.
- The one order rule changes in both copies (`wipeOrders.ts` here, `reset-rule.js` in
  `commerce-erp-integration`): cancel when nothing is invoiced or shipped; otherwise invoice what is
  not invoiced, then refund it all offline, so Commerce closes it. Experience League: Closed is "an
  order was assigned a credit memo and the customer has received a refund"; "you must generate an
  invoice before creating a credit memo"; "you can issue an offline refund … for any payment method".
- Payment review (PayPal fraud filter, PaaS only) stays open with a note; the run's result reports it
  with Open Commerce Admin (the Admin home: the Unified Shell has no deep links).
- The owner wants this done before J2 ("I want it out of the way").

The integration's side is written up in its `docs/order-close-ownership.md`
(`feature/one-reset-rule`, commit 08fbe66).

## Steps

| # | Step | Repo | Done when |
|---|---|---|---|
| 1 | The rule: invoice first, then refund in full; the reset note written before the first write; a rerun finishes what a stopped run left | here (`wipeOrders.ts`, `wipeOrderRun.ts`) | Tests prove each order state's outcome and the write order |
| 2 | The same rule | integration (`reset-rule.js`, `close-orders.js`) | Its tests prove the same table |
| 3 | One table of order states and expected results, read by both test suites | both | Changing one copy's rule fails the other's tests |
| 4 | The integration recognises a reset by the note in Commerce's history, not only its own mark | integration (`reset-closed.js` and the order event handlers) | An event for an order Clear closed sends nothing to an ERP |
| 5 | Clear stops handing orders to the integration; the ERP is brought in line afterwards | here (`wipeErp.ts`, the Clear run) | Clear closes ERP-served orders itself; a failed ERP step is reported as an ERP problem |
| 6 | Live test on the test store, **with the owner's go** | both | A shipped-not-invoiced and a partly invoiced order end Closed; nothing reaches an ERP; a second Clear changes nothing |

Steps 1 to 5 write nothing to a real store. Step 6 writes to the test store and waits for the owner.

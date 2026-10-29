---
id: AB-56
kind: fix
area: app-builder
parent: AB-26
needs: []
value: med
status: shipped
---

# A split order is sent to its ERPs again on later saves

Found 2026-10-02 reading the comments of order 5000000005 on Justrite (the order-to-return
loop's rehearsal; two ERPs). After both ERPs confirmed and Commerce invoiced the order, the
order gained, between 06:39:57 and 06:40:03Z, "Sent to Justrite ERP, waiting for
confirmation" + "Created in Justrite ERP as sales order 0000001003" once more, and the same
pair three more times for Accuform ERP. Each ERP answered with the number it already had (its
create is idempotent on the Commerce order id), so no ERP holds a duplicate order; the harm is
a Complete order whose history says "waiting for confirmation", and ERP calls that should not
happen.

## Cause (verified in code, then live)

Not the race the lead below guessed. `routeToSeveral` skipped a part only when its status was
in `FINAL_OUTCOMES` (sent, skipped, dropped), and every ERP message sets a part's status to
the message's outcome (confirmed, shipped, invoiced, held, cancelled; demo-erp adapter
`readOutcome`). So every later save of the order sent each part again, and set its status
back to sending then sent, losing invoiced. Fixed in commerce-erp-integration `83cb0a0`: a
part with the ERP's sales order number is never sent again. Also `ce2cde4`: the
confirmation comment names the ERP. Proved live on order 5000000007: every comment once,
each confirmation naming its ERP.

## Lead as filed (disproved)

The order's later saves (confirmation status, invoices) each raise
`observer.sales_order_save_commit_after`, and the router decides per part whether it was
sent. The integration agent of the same loop reported that the parts record
(`order-parts-<order>`) has writers that take no lock (`recordPartMessage`, `recordShipped`)
while the send writes under `lockOrder`; a lost update that drops a part's `sent` would make
the next save send it again. Falsify first: read the parts record of 5000000005 now (each part
should read sent/confirmed), and replay one save event against a parts record whose parts are
both sent (does the router skip?). Only then decide between locking every writer and a
compare-before-write.

## Shipped so far
- 2026-10-02  commerce-erp-integration 83cb0a0 (a part the ERP holds is never resent) + ce2cde4 (confirmation names the ERP); deployed; order 5000000007 history clean
- 2026-10-02  docs(backlog): AB-56 built — a split order is no longer re-sent on later saves; proved live (`9cb558198`)
- 2026-10-03  Shipped 2026-10-03 by the owner's finish line for work that lives only in the ERP and integration repositories: on their main branch and deployed (they carry no release tags). Any live proof this item still names is a check, not a reason to hold it open.

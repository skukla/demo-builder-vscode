---
id: AB-56
kind: fix
area: app-builder
parent: AB-26
needs: []
value: med
status: open
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

## Lead (not yet verified)

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

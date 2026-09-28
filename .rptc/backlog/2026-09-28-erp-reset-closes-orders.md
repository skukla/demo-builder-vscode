---
id: AB-16n
kind: feature
area: app-builder
needs: []
value: high
status: backlog
parent: AB-16
---

# A reset returns the whole ERP story to zero, orders included

Filed 2026-09-28. **Owner, 2026-09-28: "We need to solve this definitively for demo hygiene",
and agreed the rule below.** Replaces the one-ERP reset built earlier the same day (AB-16c),
which the owner had not asked for: resetting one ERP left split orders pointing at sales orders
that no longer existed (Bodea, orders 3000000021 and 3000000022 after Contoso's reset).

## The rule

1. **A reset always covers every ERP.** The one-ERP option is removed from the ERP card and from
   `reset_erp_records`. The integration keeps `erp/detach?erp=` for REMOVING one ERP from a
   project, a different act.
2. **Before the ERPs are wiped, every order they hold is closed off in Commerce:**
   - an order Commerce can still cancel (no invoice, no shipment) is cancelled, with a comment
     "Cancelled by the demo reset on <date>";
   - an order Commerce cannot cancel (invoiced, shipped, complete) stays as history, with a
     comment that its ERP documents were removed by the reset;
   - the integration forgets every order: its parts records, the ERP order numbers
     (`ext_order_id`, already), and holds (already released);
   - the cancellations are not sent to the ERPs (they are wiped next).
3. After a reset, no order in Admin looks open, and none points at ERP documents that no
   longer exist.

**What cannot be undone:** a cancelled order stays cancelled; Commerce cannot delete or reopen
an order. The reset's confirm dialog says so.

## Done when

On Bodea: a full reset cancels the open test orders, comments the rest, leaves no parts record,
and a fresh mixed order afterwards routes cleanly to both ERPs.

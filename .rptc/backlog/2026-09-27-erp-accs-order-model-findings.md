---
id: AB-37
kind: question
area: app-builder
parent: AB-26
needs: [AB-16]
value: high
status: open
---

# Four places the several-ERPs design and the ACCS docs disagree

Filed 2026-09-27 from a client tech case's vendor research ("one order the customer sees when
several ERPs own its lines"). The source research, with every citation, is kept outside this
public repo, in the tech case's own research on Commerce as a Cloud Service (§One order the
customer sees) and App Builder (§Merging several ERP status streams). The tech case now commits to **one Commerce order per checkout, each ERP's part
expressed as its own shipments and partial invoices on that order** — the demo should tell
the same story.

## The four findings

1. **ERP numbers in custom order attributes (plan `several-erps` B2, Q-num).** Experience
   League: "Custom order attributes can only be edited when the order is in `Pending` status"
   (Order workflow and processing). No API write after Pending is documented, and ERP numbers
   arrive after placement. Keep Q-num's live test as the gate; fallback is order comments plus
   the routing app's own store.
2. **Whole-order invoice with `capture: true` double-bills under several ERPs.** With two
   ERPs, the first to invoice bills the other ERP's lines. Each ERP needs a partial invoice
   (`items[]`) for its own lines — this is needed for B1 itself, not only for the frozen
   partial-invoice reconciliation item (AB-26v).
3. **"A panel" on the Commerce order page.** The Admin UI SDK documents order grid columns,
   order-view buttons and mass actions only. Use an order-view button that opens the routing
   app's page.
4. **One integration per ERP with no router (2026-09-26).** Fine for two ERPs. At 9+ ERPs one
   component must still know every part to set the combined order status.

## Also found (no disagreement, worth using)

- **Nominated source per line (ACCS release notes, July and September 2026):** "Each SKU in a
  cart resolves to a single nominated source", copied to the order line and shown in the Admin.
  If each ERP's warehouse is a source, the order line records its owning ERP natively. The
  plan's "nothing native records ownership at the order line" is no longer true on ACCS.
- **Open contradiction between two Adobe pages:** Invoices says a purchase-order payment is
  invoiced at checkout; Order workflow says offline methods (incl. purchase order) are not.
  Decides whether per-ERP invoices can exist in Commerce for PO-paid orders. Sandbox test.

## Done when

Each finding is answered in `.rptc/plans/several-erps/overview.md` (accepted and the plan
changed, or rejected with the reason), and the two live tests (attribute write after Pending;
PO invoicing at checkout) have results recorded.

## Shipped so far

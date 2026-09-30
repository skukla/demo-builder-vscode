---
id: AB-16q
kind: feature
area: app-builder
needs: []
value: high
status: built
parent: AB-16
---

# The ERP's maintenance mode: take an ERP down on purpose, and bring it back

Filed 2026-09-28. **Owner, 2026-09-28: "Yes" (add it back), filed under AB-16.**

## Why

- **Proofs:** the Partially Held and Re-send path (AB-16d) cannot be seen live, because the
  demo ERP never refuses an order and the integration's ERP list cannot be edited by any tool.
  An ERP in maintenance answers "unavailable", which the integration treats as down: the part
  waits, the order is Partially Held, Re-send sends it once the ERP is back.
- **Demos:** "the ERP went down; orders waited; then they caught up" answers a question
  prospects ask about any integration. Real ERPs have maintenance windows when their API
  answers unavailable, so this stays within what a real ERP does.
- The old "offline" switch was removed 2026-09-17 because nobody had asked to show it
  (demo-erp `lib/action.js`). The owner now has.

## What to build (recommended)

- **In the ERP:** one route to turn maintenance on and off, and a button on its admin screen.
  While on, the ERP's record routes answer 503 "in maintenance"; its screen still opens and
  shows that it is in maintenance, with the time it ends.
- **It ends by itself** after a set time (default 30 minutes), so a forgotten switch cannot
  break the next demo.
- **Agents:** Demo Builder's existing `write_erp_rest` reaches the route; no new Demo Builder
  tool. A tool server provided by the ERP itself was considered and not recommended now: it
  would duplicate Demo Builder's ERP tools and need its own sign-in.
- The integration's health read should show an ERP in maintenance as not reachable, saying why.

## Done when

On Bodea: Contoso put in maintenance, a mixed order placed (Northwind's part sent, the order
Partially Held naming Contoso), maintenance ended, Re-send pressed, Contoso's part sent once.
Order numbers recorded here and on AB-16d.

## Shipped so far

- 2026-09-28  2026-09-28 proven live on Bodea (integration d8d5aae, both ERPs fafaddb): Contoso put in maintenance (15:25 UTC, until 15:55) through write_erp_rest; get_erp_status: Contoso not reachable, 'Contoso ERP is in maintenance until 15:55 UTC.'. Guest order 3000000022 (accesspoint + proliantdl380): Northwind sales order 0000001012 at once; Contoso's part held, retried 4 times with the maintenance reason; Commerce status partially_held. Maintenance ended 15:30:57; Re-send (erp/resend-part) 15:31: Contoso sales order 0000001001; Commerce status back to pending; a second Re-send answered skipped; each ERP holds exactly one sales order for it.
- 2026-09-30  Renumbered AB-16j → AB-16q on 2026-09-30 while merging feature/erp-integration into the loop branch: both branches had allocated AB-16j (the loop to the ERP-settings agent tool, this branch to this item). Commit trailers on this branch's earlier commits still say AB-16j.

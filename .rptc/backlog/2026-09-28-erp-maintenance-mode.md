---
id: AB-16j
kind: feature
area: app-builder
needs: []
value: high
status: backlog
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

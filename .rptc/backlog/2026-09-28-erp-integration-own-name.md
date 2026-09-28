---
id: AB-16o
kind: feature
area: app-builder
needs: []
value: high
status: backlog
parent: AB-16
---

# The integration has a name of its own, and Commerce's labels are neutral

Filed 2026-09-28. **Owner, 2026-09-28: yes, and "I agree with the neutral labels".**

## The gap

The integration has no name of its own: Demo Builder's card and Commerce Admin's labels are
both built from the first ERP's name (`ERP_DISPLAY_NAME`; the card adds " Integration"). With
two ERPs on Bodea: the card reads "Northwind ERP Integration" and Contoso's card says it is
linked to it; Commerce Admin's menu and page read "Northwind ERP", the order grid column
"Northwind ERP order", the product action "Move stock between Northwind ERP warehouses", and
App Management's app name "Northwind ERP" (integration `app.commerce.config.ts`).

## The rule

- **The integration's own name**, set when it is added, default "ERP Integration"; the SC can
  change it. Used on Demo Builder's card and in Commerce Admin's menu, page title and app name.
- **ERPs keep their own names** on their own cards and wherever a value names an ERP (the
  grid cell, history rows, the trace, Overview, Lookup, Move stock's result).
- **Neutral labels where the thing is about every ERP:** the grid column "ERP order", the
  product action "Move stock between ERP warehouses".
- **Existing projects keep their current names** until the SC renames; nothing changes under
  anyone. A rename reaches Commerce on the integration's next update (labels are fixed at
  deploy), and the rename offers that update.

## Done when

On Bodea: the card and Commerce Admin carry the integration's own name, the column and action
read neutrally, both ERP cards say they are linked to that name, and one ERP looks right too.

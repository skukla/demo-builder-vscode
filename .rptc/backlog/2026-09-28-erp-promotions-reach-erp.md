---
id: AB-16l
kind: feature
area: app-builder
needs: []
value: med
status: built
parent: AB-16
---

# Commerce promotions reach the ERP's sales order

Filed 2026-09-28 (owner conversation on pricing layers).

## The split, recommended

The ERP owns list prices and customer prices; Commerce owns promotions (catalog price rules,
cart price rules). That is the usual B2B division: contract pricing in the ERP, campaigns in
the web store. The ERP takes the web order's prices as sold and does not reprice it.

## What happens today (read 2026-09-28)

- Commerce's final price is the LOWEST of product price, tier price (the ERP's customer price),
  special price and catalog price rule (Experience League, "Tier pricing"), so a catalog rule
  aimed at an ERP-priced company's group can undercut its ERP price or not apply at all.
- The order sent to the ERP (integration `src/lib/order-sync.js` `erpOrderFrom`) carries each
  line at `base_price` (after any catalog rule, before cart discounts) and the order's grand
  total. A cart price rule's discount therefore reaches the ERP only as a lower total: the
  ERP's lines do not show it and they no longer add up to the total.

## To build

- The order carries each line's cart discount (Commerce's `discount_amount`), and the ERP
  shows it on the sales order line, so the ERP's order matches what the buyer paid.
- Setup guide: a catalog price rule aimed at an ERP-priced company's customer group competes
  with the ERP's price (lowest wins); aim campaigns at groups the ERP does not price, unless
  that is the point of the demo.

## Shipped so far

- 2026-09-28  2026-09-28 correction (case agent, confirmed on Experience League 'Tier pricing'): 'lowest wins' is Commerce's DEFAULT. With 'Apply Catalog Price Rule on Grouped Price' on (SaaS only; Sales > Promotions), a catalog rule discounts the group's quantity-1 tier price instead (90 with 10% = 81). Recommended for the demo: on, with a quantity-1 line on every ERP price list line shown. The demo store's setting has not been read yet. Written into pricing-strategy.md.
- 2026-10-03  Built 2026-10-03 (overnight loop): each order line carries the web shop's discount; the ERP stores and shows it on orders, invoices and credit memos, returns take their share to the cent (demo-erp 4457097, contract v17; integration 030bc88 adds items[].base_discount_amount to the Order Saved subscription — a redeploy and reinstall are owed). Owner decisions listed in .rptc/handoff/2026-10-03-loop-report.md.
- 2026-10-03  2026-10-03 (staged): docs/systems/erp-integration.md now tells the SC that a catalog price rule reaches the ERP as a lower line price and a cart price rule as a line discount (needs integration 030bc88 redeployed), plus the lowest-wins / Apply Catalog Price Rule on Grouped Price note; no setup step changed.
- 2026-10-03  Reconciled 2026-10-03 (second pass): the 'uncommitted / staged' wording above is stale: the work is committed (6817f5486, f0b4705e3, b7bc129d2, 844afae69) and on feature/erp-integration.

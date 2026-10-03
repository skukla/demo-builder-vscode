---
id: AB-64
kind: feature
area: app-builder
needs: []
value: med
status: built
parent: AB-26
---

# An ERP can own the products sold on named websites

Owner, 2026-10-02: "How would an end user seed [a second ERP] with products from a specific
website in Commerce?" Today they cannot, short of tagging products.

## What is true today (read from the code, 2026-10-02)

- An ERP's ownership is one of three settings, per ERP, on the integration's Admin page
  (commerce-erp-integration `src/lib/structure.js` OWNS; `src/router/ownership.js`): all products;
  the products stocked in named inventory sources; the products whose attribute names it
  (default `erp_owner=<the ERP's id>` once there are several ERPs).
- The same setting drives both the fill (Demo Builder `erpFillRows.ts`) and the split of an
  order (the router asks which ERP owns each line). Neither reads a product's websites.
- A second ERP added with no products tagged for it arrives empty.

## Recommendation

A fourth option, "Products sold on these websites" (`structure_owns: websites`, with the website
codes), in three places that must agree:

1. the fill gives the ERP the products assigned to those websites;
2. the router sends each line of an order to the ERP that owns the WEBSITE THE ORDER WAS PLACED
   ON (so a product sold on two websites belonging to two ERPs goes to the right one per order;
   an order then never splits by this rule alone);
3. the cart checks ask the same ERP.

Open for the owner: confirm rule 2 (route by the order's website), and whether one ERP may mix
this with attribute ownership.

## Shipped so far

- 2026-10-03  feat(erp): "Add another ERP" asks which products it owns, with counts and a default (AB-64) (`5345df62f`)

---
id: AB-42
kind: question
area: app-builder
needs: []
value: high
status: superseded
parent: AB-26
superseded-by: AB-44
---

# Should the ERP be seeded with price groups / price lists from Commerce's shared catalogs at setup?

Raised by the owner 2026-09-29 while watching AB-26e on Bodea: the ERP shows `priceGroups: 0`,
`pricingConditions: 0`, `contracts: 0` after a fill, even though Bodea has custom shared
catalogs with prices.

## What is true today (verified live + in code, 2026-09-29)

- Bodea has three CUSTOM shared catalogs (GET /V1/sharedCatalog): ServerSavvy Solutions
  (customer_group_id 16), Platinum Buyer (17), Kukla Studios (19); type 0 = custom. Some carry
  custom tier prices (commerce-tier-prices.js cites ServerSavvy `accessmesh` fixed 49).
- The mock ERP HAS a full pricing model: `demo-erp/lib/price-groups.js`, `contracts.js` +
  `contract-prices.js` (customer price lists — customer's own, then its price group's),
  `conditions.js`; partners carry a `priceGroup`.
- The integration's price sync is ONE-WAY, ERP → Commerce (AB-26z): the ERP owns contract
  prices and publishes them as Commerce tier prices onto the customer group of each company's
  custom shared catalog (`src/lib/contract-prices.js`, `src/lib/commerce-tier-prices.js`),
  managing only rows it wrote (a ledger replace). NOTHING reads Commerce shared-catalog prices
  INTO the ERP.
- The fill seeds products, companies and credit — NOT price groups or price lists. And
  `src/lib/company-sync.js` does not set the partner's `priceGroup` at all.

## The consequence

The ERP — which the model treats as the pricing master — starts blind to the contract pricing
Commerce already has. Bodea's shared-catalog custom prices are invisible to the ERP and
unmanaged by it; a reset/fill strands them. A real ERP always has price lists/groups; this one
looks empty, and the two sides do not agree at setup.

## The question (owner owns this)

Should initial setup / fill seed each ERP with price groups and price lists derived from
Commerce's shared catalogs?

Recommendation (loop's): YES, as a ONE-TIME reverse seed at setup only —
1. map each custom shared catalog → an ERP price group, and set each company partner's
   `priceGroup` from its shared-catalog customer group (also fixes the missing partner
   `priceGroup`);
2. import each shared catalog's existing tier prices as the ERP's contract prices/price lists
   for that group.
The ERP stays master afterward (ERP → Commerce, unchanged). The design tension to decide: this
is a Commerce → ERP flow, which only makes sense as a setup seed, not ongoing.

Relates to the business-structure mapping (AB-26j: sales-org per website, ownership per pair)
and AB-16j (per-ERP settings) — price group per shared catalog is the same kind of structural
mapping. Independent of AB-40/AB-41 (those are event-plumbing fixes).

## Done when

The owner decides seed-or-not; if seed, an implementation item is opened with the mapping
(shared catalog → price group, tier prices → contract lines, company → price group).

## Shipped so far

- 2026-09-29  Owner decided 2026-09-29: YES, seed each ERP's price groups/price lists from Commerce's custom shared catalogs at setup (one-time reverse seed; ERP stays master afterward). Also set partner.priceGroup from the shared-catalog customer group. Implementation to follow as its own item.
- 2026-09-30  2026-09-29 Implementation opened as [[AB-44]] and started (reverse seed at fill time). Question resolved.

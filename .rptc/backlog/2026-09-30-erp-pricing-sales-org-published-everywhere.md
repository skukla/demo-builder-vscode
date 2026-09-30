---
id: AB-46
kind: fix
area: app-builder
parent: AB-26
needs: []
value: high
status: active
---

# A price condition scoped to one sales organization is published to every website

Filed 2026-09-30 from the review of the other agent's work (2026-09-28..30). The reviewer's
finding, verified against the code before the fix: demo-erp's prices-in-force publish
(`lib/net-prices.js`) never passes `salesOrg`, and `lib/pricing.js` treats a missing
`salesOrg` as "applies everywhere". A quote through sales org 1000 correctly excludes an
EU-only condition; the PUBLISHED prices in force — the ones that land in the company's
shared catalog — include it. No test covered it.

## Failure scenario

An SC adds "10% off for Acme, EU site only" in the ERP. The US storefront's shared catalog
for Acme gets 10% off too. The buyer sees a discount the ERP never granted for that site.

## Why it matters for the demo

The whole pricing rule ([[AB-26z]]) is "the price the buyer sees IS the ERP's price". A
published price the ERP would not honour on that site breaks the one promise the shared
catalogs make.

## The decision (owner) and the rule taken

A company has ONE shared catalog, not one per website, so a per-site price cannot be
published as such. Two ways out:

- **A — publish only the org-unrestricted conditions.** A condition scoped to a sales org
  is honoured where the ERP prices the order (the quote / order path already passes
  `salesOrg`), not in the catalog. The buyer on the EU site sees the base price in the cart
  and the ERP applies the EU discount on the order — a real ERP pattern (SAP: order
  pricing conditions). Safe: never a price the ERP would refuse.
- **B — publish per sales org.** Needs a shared catalog per company × website and a
  publish per site. Bigger; Commerce's shared-catalog model resists it.

**Taken: A**, as the safe default, on the owner's 2026-09-30 "address them immediately";
reversible. The Admin/screen wording for a scoped condition should say it prices the
order, not the catalog.

## Verification

A test in demo-erp: prices in force for a customer exclude a condition with a `salesOrg`;
a quote through that org still applies it. The 140-case cross-check still passes.

## Shipped so far

- 2026-09-30  2026-09-30 FIXED (demo-erp 88ef676, loop branch). Option A taken: a condition scoped to a sales organization stays out of the published prices in force (lib/net-prices.js) and prices the order through that organization, which the quote/order paths already pass. Test: the scoped discount is not published, the unscoped one is; the same condition still prices a quote through its org and not another. 392/392 then. Reversible if the owner prefers per-site catalogs (option B).

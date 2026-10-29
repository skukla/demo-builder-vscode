---
id: AB-16m
kind: question
area: app-builder
needs: []
value: med
status: shipped
parent: AB-16
---

# One shared catalog per priced company: does it scale to thousands?

Filed 2026-09-28 from the case agent's review of `.rptc/plans/several-erps/pricing-strategy.md`.

## The question

The strategy gives every company with its own prices a shared catalog (and so a customer group)
of its own. The JustRite client has about 3,000 customers ordering daily (intro call
2026-08-20), which could mean thousands of shared catalogs and customer groups. No Adobe
guidance on practical limits (ACCS), or on catalog-export time at that count, was found yet.

## Recommended

1. Look for Adobe's guidance first (Experience League on shared catalogs and customer groups;
   the Catalog Service export).
2. Design the alternative: a shared catalog per ERP PRICE GROUP, shared by its member
   companies, and a company-specific catalog only for a company with its own price list. That
   mirrors the ERP's own precedence. The integration today writes and removes each company's
   rows through that company's ledger; several companies sharing one catalog would need the
   rows owned by the price group, not the company, or one company's removal could take away a
   price the others still hold.

The demo stays on one catalog per priced company until this is answered.

## Shipped so far

- 2026-09-28  2026-09-28 the wrinkle (owner with the tech case): a shared catalog is one customer group carrying both visibility and price, so with one catalog per priced company each catalog's product list must follow that company's entitlements (from the CRM). The count of catalogs and the work to keep their product lists right grow together.
- 2026-10-03  Answered 2026-10-03 (.rptc/research/shared-catalog-scale/research.md): no, not to thousands — Adobe documents a 1,000 customer-group ceiling for Live Search, and every shared catalog is a customer group. Fine for demos; at scale, one catalog per ERP price group with company catalogs as exceptions. ACO price books do not apply to ACCS today.

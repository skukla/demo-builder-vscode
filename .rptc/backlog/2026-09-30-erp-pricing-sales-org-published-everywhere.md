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

**Taken first: A** (88ef676), as the safe default. **Then corrected by the owner the same
day: Commerce supports per-website pricing inside a shared catalog** — each tier price
carries a website (Adobe B2B, "Set shared catalog pricing and structure": "Set Website to
the website where the tier price applies"; requires Stores → Configuration → Catalog →
Price → Catalog Price Scope = Website). The premise of A ("one catalog, so a per-site price
cannot be published") was wrong. **B is built** on top of A:

- ERP (`lib/net-prices.js`, contract version 12): a customer with any organization-scoped
  condition is published as one WHOLE set per sales organization the store sells through
  (from the mirrored business structure), each line tagged `salesOrg`, and no untagged
  line — so Commerce never has an all-websites row beside a site row for the same product
  and quantity, whose precedence Adobe's docs do not state. A customer with none keeps one
  untagged set. With no sales organizations mirrored yet, A's behaviour holds (the scoped
  condition is left out).
- Integration (`lib/contract-prices.js`, `lib/contract-price-deps.js`): a tagged line
  becomes one tier-price row per website whose effective `structure_sales_org` (the ERP's
  default or its per-website value) is that organization, with that `website_id`, ledgered
  per website; an organization no website carries is left out and named (`unmapped`),
  never published everywhere.

## Prerequisites on Bodea (owner)

1. Catalog Price Scope = Website, or site rows are ignored and B degrades to A (safe).
   Not yet read from Bodea — the dev host was wedged at the time.
2. Each ERP's websites carry their sales organization in the ERP's per-website settings
   (the mapping the integration already keeps).

## Verification

A test in demo-erp: prices in force for a customer exclude a condition with a `salesOrg`;
a quote through that org still applies it. The 140-case cross-check still passes.

## Shipped so far

- 2026-09-30  2026-09-30 FIXED (demo-erp 88ef676, loop branch). Option A taken: a condition scoped to a sales organization stays out of the published prices in force (lib/net-prices.js) and prices the order through that organization, which the quote/order paths already pass. Test: the scoped discount is not published, the unscoped one is; the same condition still prices a quote through its org and not another. 392/392 then. Reversible if the owner prefers per-site catalogs (option B).
- 2026-09-30  2026-09-30 OWNER CORRECTION → B BUILT (integration ad4501a on feature/live-checks-at-checkout; demo-erp 76634e9 on the loop branch). Per-website pricing IS what Commerce shared catalogs offer (each tier price carries a website; Catalog Price Scope = Website), so the first fix's premise was wrong. ERP: a customer with any org-scoped condition gets one whole set per sales organization, every line tagged salesOrg (contract v12; null = every website), no untagged line beside a tagged one. Integration: a tagged line → one tier-price row per website whose effective structure_sales_org is that org, ledgered per website; an org no website carries is left out and named (unmapped), never published everywhere. Degrades to the first fix when no orgs are mirrored or price scope is Global. Integration 971/971, ERP 401/401. PREREQUISITES (owner): confirm Bodea's Catalog Price Scope = Website (Stores → Configuration → Catalog → Price) — not read, dev host wedged; deploy + live proof: an EU-only discount shows on the EU site's cart and not the US site's.

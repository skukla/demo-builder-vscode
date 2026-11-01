---
id: PL-87
kind: feature
area: platform
needs: []
value: med
status: backlog
parent: PL-60
---

# Each company sees its own catalog on ACCS + ACO: private views per shared catalog

Filed 2026-11-01. The owner: "a public view alone is not enough for a demo. Private views match up
with company based pricing, which has typically been demonstrated using shared catalogs."

What landed under PL-60 gives each company its own PRICES on a public view: Commerce already
answers each buyer's price book, measured for a company's buyer on ACCS. It does not give a company
its own PRODUCTS, and it protects nothing. Adobe's connector for that is PaaS only, so on ACCS we
would have to stand in for it. Reasoning and measurements:
`.rptc/research/aco-support/customer-pricing.md`.

## What it would take

1. **Products marked by shared catalog.** The ACO export adds an attribute listing the shared
   catalogs a product is in (`sharedCatalog/{id}/products` has the SKUs), so a policy can filter on
   it. Adobe's connector does the same with its own attribute.
2. **A private view per shared catalog and store view.** Policy, one price book (a private view
   takes exactly one) and a restricted access key. By hand in ACO Studio today. Decide whether the
   ACO admin API is usable first: it needs a product profile the org does not have.
3. **A resolver holding the private keys.** On ACCS, `commerceOptimizer` answers only `priceBookId`
   (read from its schema), so nothing returns a view or a token. An App Builder action takes the
   buyer's token, reads their group from Commerce, maps it to a view and signs an RS256 token.
   Keys stay in the action, never in `config.json`.
4. **A storefront code patch.** After sign-in, send `AC-View-ID`, `AC-Price-Book-ID` and
   `AC-Catalog-View-Access-Token` from the resolver's answer, and go back to the public view on
   sign-out. Goes through `eds-demo-patches`.
5. **Undo.** Every view, policy, key and action has a way back, or says plainly why not.

## Why it may age well

Adobe's public docs give the storefront the same three headers. When an ACCS connector arrives,
only what resolves the view should change. That is an expectation, not a promise from Adobe.

## Before starting

Licensing counts views times price books (100 by default), and catalog writes need ACO ingestion
enabled in the org, which it is not today. Without that nothing here can be proved live.

## Shipped so far

- 2026-11-01  docs(aco): what company pricing takes on ACCS + ACO, and what to offer now (`a3e585efb`)

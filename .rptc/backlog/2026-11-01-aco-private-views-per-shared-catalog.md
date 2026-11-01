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
3. **A resolver holding the private keys.** An App Builder action reads the buyer's company,
   maps it to a view and signs an RS256 token. Keys stay in the action, never in `config.json`.
4. **Answering the question the storefront already asks.** No storefront code is needed (corrected
   2026-11-01; this step used to be a patch). Adobe's B2B template at our verified commit asks
   Commerce `company { catalogViewContext { catalogViewId accessToken } }` for a signed-in buyer
   and sets `AC-View-Id` and `AC-Catalog-View-Access-Token` from the answer
   (`scripts/initializers/company-switcher.js`, on when `commerce-companies-enabled` is true, which
   CitiSignal sets). Our ACCS test store already declares that field and a public PaaS store
   without the B2B connector does not; what it answers for a buyer is not measured. The likely
   route is API Mesh answering that field from the action. Unproven: whether Mesh can override a
   field Commerce already declares.
5. **Undo.** Every view, policy, key and action has a way back, or says plainly why not.

## When Adobe's connector is on

Commerce answers the same field itself, so the Mesh piece and the action come off and the storefront
does not change. Keep the view lookup replaceable: a custom pricing service, if it is ever
demonstrated, would still need something to answer with a price book Commerce does not know.

## Before starting

Decide whether this is worth building at all: if ACCS + ACO arrives with shared catalogs, the window
for it may be weeks. Licensing counts views times price books (100 by default), and catalog writes need ACO ingestion
enabled in the org, which it is not today. Without that nothing here can be proved live.

## Shipped so far

- 2026-11-01  docs(aco): what company pricing takes on ACCS + ACO, and what to offer now (`a3e585efb`)

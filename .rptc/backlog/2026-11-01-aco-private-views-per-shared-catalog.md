---
id: PL-87
kind: feature
area: platform
needs: []
value: med
status: active
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
   takes exactly one) and a restricted access key, all through the ACO admin API, which the project's
   credential reaches (proved 2026-11-01).
3. **A resolver holding the private keys.** The mesh reads the buyer's company from Commerce, maps it to a view and
   signs an RS256 token, with the keys in its encrypted secrets (proved live 2026-11-01). Keys never reach
   `config.json` or the browser.
4. **Answering the question the storefront already asks.** No storefront code is needed (corrected
   2026-11-01; this step used to be a patch). Adobe's B2B template at our verified commit asks
   Commerce `company { catalogViewContext { catalogViewId accessToken } }` for a signed-in buyer
   and sets `AC-View-Id` and `AC-Catalog-View-Access-Token` from the answer
   (`scripts/initializers/company-switcher.js`, on when `commerce-companies-enabled` is true, which
   CitiSignal sets). On ACCS with the connector off it answers null. An API Mesh can answer it
   instead, proved live 2026-11-01, so that is the route. A project without a mesh needs one added.
5. **Undo.** Every view, policy, key and action has a way back, or says plainly why not.

Design, including the custom pricing service as one part of it: `.rptc/plans/aco-company-catalogs/overview.md`.

## When Adobe's connector is on

Commerce answers the same field itself, so the Mesh piece comes off and the storefront
does not change. Keep the view lookup replaceable: a custom pricing service, if it is ever
demonstrated, would still need something to answer with a price book Commerce does not know.

## Reopened (owner, 2026-11-01)

Closed earlier the same day because our code would be doing Commerce's job. Reopened by the owner: make it
available, build it to come off when the connector reaches ACCS, and follow Adobe's patterns as closely as possible.
It carries a stand-in label on screen. The closed decision's reasoning stands as the reason for the label.

## Shipped so far

- 2026-11-01  docs(aco): what company pricing takes on ACCS + ACO, and what to offer now (`a3e585efb`)
- 2026-11-01  docs(aco): private views need no storefront code, the template already asks (`255b15301`)
- 2026-11-01  docs(aco): what was proved live, the combined plan, and the PaaS checklist (`8cfddcccf`)
- 2026-11-01  Owner: whether November's ACCS release includes shared catalogs is unknown, so building this stays undecided. Mesh sign-in fix released on eds-accs-mesh (merged, stable moved); Console project Kukla ACO test kept for the browser test.
- 2026-11-01  docs(aco): a buyer's own price proved on a real page, with and without a mesh (`a61d3bf9b`)
- 2026-11-01  docs(updates): a moved tag reaches new projects, a release reaches existing ones (`11b4d24aa`)
- 2026-11-01  docs(aco): the open questions tested in a browser, and three findings filed (`35aa9c286`)
- 2026-11-02  Reopened by the owner: a labelled stand-in that comes off at GA. Live tests passed for the tag, mesh signing and shared catalog reads; a real order is approved for the build
- 2026-11-01  feat(mesh): a deploy sends the mesh's secrets file when it has one (`9deea68b4`)
- 2026-11-01  docs(aco): reopen private company catalogs as a stand-in that comes off (`d13dbeead`)
- 2026-11-02  docs(aco): private catalogs stay in step through events, with no manual step (`ebcf7c4b6`)
- 2026-11-02  docs(aco): private catalogs stay in step on the connector's one-minute schedule (`e621d3e71`)

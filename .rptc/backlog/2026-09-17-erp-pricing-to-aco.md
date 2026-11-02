---
id: AB-14
kind: question
area: app-builder
parent: AB-9
needs: [PL-87]
value: low
status: gated
---

# Where does an ERP price go when the project also has ACO?

Filed 2026-09-17 from the owner: pricing needs two paths, one to the Commerce backend and,
potentially, the same pricing to ACO, at least until Adobe joins the two. Explore this when
the extension gains ACO support (`PL-60`).

## What the ERP integration does today

Commerce is the only destination:

- A base price changed in the ERP arrives as an ERP product event and is saved to the
  Commerce product as a sparse save of name and price (the integration's
  `product/external/updated` action; its `transformer.js`).
- Contract prices are written to Commerce as tier prices for the customer group of each company's custom shared
  catalog (`src/lib/publish-prices.js`, `src/lib/commerce-tier-prices.js`). The two cart webhooks this item first
  described were taken off in 0.9.1.

A storefront backed by ACO reads its catalog, and so its prices, from ACO (price books
and catalog views; the multisite item notes ACO as a catalog layer over PaaS or ACCS).
So an ERP price change that reaches only Commerce may never show on an ACO storefront.

## What the extension already records about ACO (surveyed 2026-09-17)

There is no catalog-source setting: none of the extension's 23 settings, and no wizard
field, chooses between the Commerce backend and ACO. ACO is an optional add-on,
`adobe-commerce-aco` (`stacks.json` `addonDefinitions`; offered on `eds-paas` and
`eds-accs`), with four credentials (`ACO_API_URL`, `ACO_API_KEY`, `ACO_TENANT_ID`,
`ACO_ENVIRONMENT_ID`) in `components.json`. Today it is out of reach:

- No wizard control adds it; only a hidden, coming-soon package requires it, and the
  shipped packages exclude it.
- The storefront config's ACO headers (`AC-View-ID`, `AC-Price-Book-ID`, in
  `configGenerator.ts`) never apply: `mapBackendToEnvironmentType` is called with the
  backend id, which is never the add-on.
- The only ACO write path is the `commerce-demo-ingestion` tool's `import:aco` and
  `delete:aco`, with no live caller for the import.
- The mesh has no ACO source. App Builder code and the ERP catalog entry never read the
  add-on.

Earlier research and plans that bear on this:

- `.rptc/research/demo-template-architecture/research.md`: a PaaS / PaaS+ACO / ACCS model
  with catalog and pricing in ACO.
- `.rptc/research/data-installer/spike-01-live-api.md`: the data installer has an ACO
  datapack family, price books and prices included (`aco_price_books`, `aco_prices`),
  deferred in `.rptc/complete/data-installer-plan/overview.md`.
- `.rptc/research/project-builder-ux/research.md` and
  `.rptc/complete/project-builder-ux-rewrite/commerce-v6.md`: ACO belongs under
  Commerce → Catalog, gated by package.
- The multisite item and `docs/research/2026-05-19-multisite-multillocale-research.md`:
  catalog view ids per locale; catalog views have no provisioning API.
- `.rptc/research/multitenant-prerender-evaluation/research.md`: the live ACO storefront
  endpoint is ACO-native.

Nothing anywhere covers keeping Commerce and ACO prices in step, or sending ERP prices to
ACO.

## Questions to answer

1. **Does ACO pick up the Commerce price on its own?** When ACO is fed from the Commerce
   backend by a sync, a Commerce write may be enough and the second path is not needed.
   If ACO is fed independently, the integration must write to ACO too.
2. **Which ACO object holds the price:** a price book per customer group or company, a
   catalog view, or the product itself? Contract prices may map to a price book, which
   would change how the cart webhooks behave for ACO storefronts.
3. **Which API and credentials** the integration would use for ACO writes, and whether
   they fit the integration's existing App Builder project.
4. **Where the choice lives:** a setting in the integration's Commerce Admin page (AB-10),
   detected from the project's ACO addon at deploy, or both.
5. **What the cart does on an ACO storefront:** whether the Commerce cart webhooks still
   apply, or ACO pricing makes them redundant.
6. **Reversal:** the ERP reset undoes the Commerce writes it ledgered; ACO writes need the
   same treatment.

## Answers so far (2026-11-01, from the integration's code, Adobe's docs and live ACO tests)

No ERP change has been run on an ACO project yet; PL-87's proof list has that test.

1. **No, not without the connector.** With it, Commerce is the system of record and it copies prices to ACO. Without
   it nothing does: this tenant reads `acoEnabled: false`.
2. **A price book per website and customer group**, `<website>::<sha1(group id)>`. Each shared catalog's group
   already maps to one, and a private view takes exactly one.
3. **ACO's ingestion API**, on the ACO credential, added to the integration's workspace.
4. **Decide from the project:** it has ACO and the connector is off. No setting for the SC.
5. **The cart stays Commerce's.** It charges Commerce's price, so listings must match it (measured: 120 listed, 200
   in the cart). Placement and order events read Commerce, so they do not change.
6. **Ledger the ACO writes** with the others, so a reset undoes them.

Built under PL-87, step 5 of `.rptc/plans/aco-company-catalogs/overview.md`. Commerce stays the authority and PL-87's sync copies from it, so the integration should need no ACO code, and answers 3 and 6 move to that sync. Stock is still to measure.

## Done when

Each question has an answer with its source, and either a plan for the second path or a
recorded reason it is not needed.

## Shipped so far

- 2026-10-03  Reconciled 2026-10-03: the body's webhook/item-prices, webhook/discounts and pricing_contract_prices no longer exist on integration main; AB-26z moved contract prices into shared catalogs as tier prices. The question stands for ACO (PL-60).
- 2026-10-31  2026-10-31: BuildRight already solved a buyer's price book after sign-in: a mesh query backed by an App Builder action maps a customer (by group, or by Commerce customer attributes aco_catalog_view_id / aco_price_book_id) to a catalog view and price book, and the storefront re-sends AC-View-Id / AC-Price-Book-Id to every dropin on sign-in, sign-out and persona change (buildright-service actions/persona, buildright-eds scripts/initializers/auth.js). With Demo Builder's books the mapping is customer group to website:group. Details: .rptc/research/aco-support/audit-2026-10-31.md
- 2026-11-01  2026-11-01: Answered for the buyer's price book: Commerce names it, the storefront sends it, the export now matches. The ERP half is still open: a price changed in the ERP reaches Commerce, and only reaches ACO through a new export

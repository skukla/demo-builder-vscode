---
id: AB-14
kind: question
area: app-builder
parent: AB-9
needs: [PL-60]
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
- Contract prices are not stored in Commerce. The `webhook/item-prices` webhook applies
  them in the cart (setting `pricing_contract_prices`), and `webhook/discounts` caps
  discounts on top of them (setting `pricing_discount_ceiling`); both settings are AB-10's.

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

## Done when

Each question has an answer with its source, and either a plan for the second path or a
recorded reason it is not needed.

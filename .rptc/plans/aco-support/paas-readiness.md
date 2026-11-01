# ACO on a PaaS backend: what is known before there is one to test

Owner, 2026-11-01: an SC can choose their backend, so A, B and C should apply to PaaS as well.

## Tested without a backend

| | How |
|---|---|
| A PaaS project's `config.json` with ACO: catalog from ACO, carts on Commerce, the store sent to Commerce, none of PaaS's catalog headers sent to ACO | `acoStorefrontConfig.test.ts` |
| A PaaS project without ACO keeps its catalog headers | same |
| Connector state read from the schema | `acoTools.test.ts`, on the fields a public PaaS store answered |
| A public PaaS store with the connector answers `commerceOptimizer` with the same id format as ACCS | Live, 2026-11-01 |

## Known gaps

**Demo Builder's own Commerce client refuses PaaS** (`commerceRestClient.ts`, ACCS backends only). So on
PaaS none of these run:

- exporting a store to an ACO pack;
- Demo Builder's install engine and Clear demo data for Commerce;
- the agent's Commerce REST tools;
- reading customer groups, so a pack from elsewhere gets no shoppers' price books, and says so.

The Data Installer service still handles packs on PaaS. A PaaS client needs its sign-in decided first, and
that is best decided with a real backend.

## The day there is a backend

The backend needs Commerce 2.4.8+, B2B 1.5.3+ and `adobe-commerce/commerce-data-export-aco-adapter-b2b`,
with Live Search, Product Recommendations, Catalog Service and the Data Management Dashboard removed first,
then `aco:config:init` with credentials from a project enabled for ingestion.

Then, with a project pointed at it:

1. `get_aco_status` says the connector is on, and `declaresCatalogView` is true.
2. Loading an ACO pack and Clear demo data refuse.
3. A new project's storefront shows prices to a guest, using `run_aco_query` to compare.
4. Assign a company to a custom shared catalog. `run_aco_admin` lists its private view.
5. Sign in as that company's buyer. The storefront sends the view, price book and token, and shows only
   that catalog's products. Sign out and it goes back.
6. Without the B2B extension: steps 1 to 3 hold, with `declaresCatalogView` false.

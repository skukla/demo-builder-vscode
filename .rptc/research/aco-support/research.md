# PL-60: How an EDS storefront and the data side talk to Adobe Commerce Optimizer (ACO)

Read 2026-10-04. Read-only research. No cloud calls were made. No secrets copied: ids are
described by shape only. Labels: VERIFIED = I read it in the cited page or file today.
DOCUMENTED = a page states it, but I did not run it. UNVERIFIED = a lead, or a claim that
only a local doc makes.

Sources (all read 2026-10-04):
- S1 `https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/commerce-configuration/` (storefront config reference)
- S2 `https://experienceleague.adobe.com/en/docs/commerce/optimizer/storefront` (ACO storefront setup, updated 2026-09-11)
- S3 `https://experienceleague.adobe.com/en/docs/commerce/optimizer/use-case/admin-use-case` (updated 2026-10-01)
- S4 `https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api/` (Merchandising API)
- S5 `https://developer.adobe.com/commerce/services/optimizer/data-ingestion/` and `.../data-ingestion/using-the-api/` (Data Ingestion API)
- S6 `https://experienceleague.adobe.com/en/docs/commerce/optimizer/setup/catalog-view` (updated 2026-08-18)
- S7 `https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/b2b-shared-catalog-projection` (updated 2026-10-01)
- L1 `buildright-aco/node_modules/@adobe-commerce/aco-ts-sdk/dist/index.js` (Adobe's own SDK, v1.1.0, read as code)
- Repo root below = `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system`.

## 1. How an EDS storefront talks to ACO

**Endpoint.** The storefront reads one GraphQL endpoint, the Merchandising API:
`https://{region}[-sandbox].api.commerce.adobe.com/{tenantId}/graphql`. It goes in
`commerce-endpoint` (read-only catalog and search). Sandbox exists only in `na1`; the
`-sandbox` suffix is absent in production. DOCUMENTED (S4 "Base URL"; S5 "Base URL").
`commerce-core-endpoint` (cart, auth, writes) is still a separate Commerce core GraphQL URL;
S3 shows it pointing at a Commerce host, not ACO. DOCUMENTED (S1 Endpoints, S3 config.json).

**Headers, under the `cs` scope in config.json.** DOCUMENTED (S1 Headers, S2, S4):

| Header | Required? | Meaning |
|---|---|---|
| `AC-View-ID` | Required | Catalog view id (a UUID, shown by the info icon in the ACO UI) |
| `AC-Source-Locale` | Shown in every working example (S2, S3, citisignal config); S4 lists the locale as required in its curl placeholders table but not in its header table | Catalog source locale, e.g. `en-US` |
| `AC-Price-Book-ID` | Optional | Price book id. If omitted, a default price book `main` in USD is used (S4). S1: each catalog view has a default price book |
| `AC-Policy-<Name>` | Optional | Policy trigger value, e.g. `AC-Policy-Brand: Cruz` |
| `AC-Catalog-View-Access-Token` | Only if the view is private (Catalog Protection on) | Signed RS256 JWT |

- No `x-api-key` and no `Magento-Environment-Id` are needed for ACO. The ACO block in S1
  has none, and S4 says "Authentication is not required for the Merchandising API by
  default." DOCUMENTED.
- The S1 ACO header example contains only `cs` (no `all.Store`). S3 and S2 also show no
  `all` block. DOCUMENTED. The multisite research's "drop `all.Store`" fix agrees.
- Header names: docs write `AC-View-ID`; the working BuildRight storefront sends `AC-View-Id`
  and `AC-Price-Book-Id` (buildright-eds `scripts/initializers/index.js:210-213`). HTTP header
  names are case-insensitive, so both work. S3's sample config.json uses all-lowercase keys.
  I did not test it.
- `AC-Environment-Id` (the tenant id) is sent by BuildRight's storefront
  (`buildright-eds/scripts/initializers/index.js:191`, `pdp.js:51`). It is NOT in any Adobe
  page I read; S1/S4 do not list it. UNVERIFIED that it is needed; it is probably redundant
  because the tenant id is already in the URL path.

**Analytics block for ACO (different from PaaS).** DOCUMENTED (S1 Analytics): `environment-id`
= the ACO tenant id, `view-id` = catalog view id, plus `store-view-currency-code`,
`base-currency-code`, `store-url`, optional `storefront-template`, `aep-ims-org-id`,
`aep-datastream-id`. No store/website codes or ids.

**Propagation.** Config is cached up to 2 hours on the CDN (S1 "Configuration Caching"); S2
says changes "may take a few minutes". DOCUMENTED.

**Who builds it.** Adobe's own path: the DA.live Site Creator writes config.json with
placeholders, and you replace them by hand (S2). The "Config Generator tool" detects the
backend type (S1 note). DOCUMENTED.

## 2. The local ACO repos

**citisignal-aco** (a storefront; `config.json` at repo root)
- Shape: `public.default` with `commerce-core-endpoint` and `commerce-endpoint`, both the
  ACO-form URL `https://na1-sandbox.api.commerce.adobe.com/<22-char tenant id>/graphql`
  (`citisignal-aco/config.json:3-4`). Note the core endpoint also points at ACO here, so
  cart and auth do not work from this config alone. UNVERIFIED how CitiSignal handled that.
- `headers.all.Store: "default"` (`:6-8`) and `headers.cs` with `AC-View-ID`,
  `AC-Price-Book-ID`, `AC-Source-Locale` (`:9-13`). Values: a UUID, a price-book slug, a
  locale. `analytics` is the PaaS shape (store codes and ids, `:15-27`), not the ACO shape
  in S1. Adobe's current docs show a simpler ACO block.
- Per tenant: the tenant id in both URLs and in `analytics.environment-id`. Per catalog view:
  `AC-View-ID`. Per scenario: the price book id and locale.
- No ingestion scripts in this repo (`ls` shows storefront files only).

**buildright-aco** (data repo; its own `DEPRECATED-NOTICE.md` says it was superseded 2025-12-16
and its data moved to `buildright-data`)
- Config: `config/aco-config.json` holds `tenantId`, `region`, `environment`. OAuth client id
  and secret come from `.env` (`CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`, `REGION`,
  `ENVIRONMENT`) (`scripts/shared/aco-client.js:62-70`).
- Ingestion uses Adobe's TypeScript SDK `@adobe-commerce/aco-ts-sdk` (`package.json`).
  Scripts: `scripts/products/ingest-products.js:115` (`client.createProducts`),
  `scripts/prices/ingest-price-books.js:162` (`createPriceBooks`),
  `scripts/prices/ingest-prices.js:117` (`createPrices`), metadata via
  `createProductMetadata`. Workflows: `npm run import` -> `scripts/workflows/ingest-all.js`,
  `npm run delete` -> `reset-all.js`.
- Deletes: `scripts/shared/aco-delete.js` calls `deletePrices` (`:78`), `deletePriceBooks`
  (`:185`), `deleteProducts` (`:259`). Its header comment (`scripts/shared/browser-extract-skus.js:13`)
  says "The ACO Data Ingestion API is write-only with no GET/LIST operations", so cleanup
  needs a local state file or the original data. VERIFIED (local doc); I did not test it.
- Catalog views are manual: `docs/manual-setup/catalog-view-setup-guide.md:7` says views
  "CANNOT be created programmatically" and must be made in the ACO Admin UI. Each view is
  linked to one price book, and you copy its View ID by hand afterwards (`:146-154`).
  UNVERIFIED against Adobe (see section 3).
- `docs/api/ACO-ADMIN-API-CAPABILITIES.md` claims an Admin GraphQL endpoint
  (`/{tenantId}/admin/graphql`) with a working `catalogViews` read query, and that no
  `priceBooks` query exists. UNVERIFIED: I found no Adobe page for this.
- Reported in that repo only: policies and price books cannot be listed back; policies are
  made in the UI.

**buildright-eds** (storefront with a mesh): sends `AC-View-Id`, `AC-Price-Book-Id`,
`AC-Source-Locale`, `AC-Environment-Id` (`scripts/initializers/index.js:189-213`) and swaps
the view and price book per persona at runtime (`mesh-client.js:84-89`).
**buildright-service** (App Builder): maps `TENANT_ID` to `AC-Environment-Id` and
`ACO_PRICE_BOOK_ID` to `AC-Price-Book-Id` (`config/index.js:50-92`) and builds the
`/graphql` URL from tenant, region and environment (`:76-85`).

## 3. Creating catalog views and price books; deletion

| Thing | Programmatic? | Evidence |
|---|---|---|
| Products, product metadata, categories, prices, **price books** | Yes, Data Ingestion REST | S5 lists price books and prices in the API; L1 has `POST /v1/catalog/price-books` |
| Catalog **views** | UI only, as far as I can find | S6 describes only the UI steps (Store setup > Catalog views > Create). BuildRight says "CANNOT be created programmatically". UNVERIFIED that no API exists |
| Policies | UI only (S3 steps are UI) | DOCUMENTED |
| Catalog protection and access keys | UI (S4 "set up ... in Studio") | DOCUMENTED |
| Connector-synced views (B2B) | Created by the Adobe Commerce Optimizer Connector, not by hand | S7 says projected views, policies and keys are connector-managed |

Data Ingestion endpoints (from Adobe's SDK source, L1, VERIFIED as code; paths relative to
`https://{region}[-sandbox].api.commerce.adobe.com/{tenantId}`):

- `POST /v1/catalog/products` create, `PATCH` update, `POST /v1/catalog/products/delete`
- `POST|PATCH /v1/catalog/products/metadata`, `POST .../metadata/delete`
- `POST|PATCH /v1/catalog/products/prices`, `POST .../prices/delete`
- `POST|PATCH /v1/catalog/price-books`, `POST .../price-books/delete`
- `POST|PATCH /v1/catalog/categories`, `POST .../categories/delete`

Docs also name product layers (create/delete) (S5). Metadata must exist before products, for
`sku`, `name`, `description`, `shortDescription`, `price`, per locale (S5 DOCUMENTED).
Limit: 300 requests per minute, then 429 (S5). Payloads are arrays (BuildRight comment
`ingest-products.js:115`).

Reversibility: every ingested thing has a delete endpoint, so data can go back to zero.
The catch is there is no list call (BuildRight note above), so removal must be driven by what
the extension recorded at ingest time. Catalog views and policies made by hand need a manual
delete in the UI (S6 "Delete a catalog view"). A price book cannot be deleted cleanly while
prices reference it (BuildRight comment, `aco-delete.js:140`, says to delete prices first).

## 4. Auth: ingestion versus storefront

- **Storefront: none.** The Merchandising API needs no credential. Only a private catalog
  view needs a signed JWT (RS256, keys registered in Studio), and a JWT must be minted
  server-side, never in browser config. DOCUMENTED (S4).
- **Ingestion: an Adobe IMS bearer token**, from an Adobe Developer Console project. The
  header is `Authorization: Bearer <token>` (S5). The SDK gets it with an OAuth
  client-credentials call to `https://ims-na1.adobelogin.com/ims/token/v3` with scope
  `openid,AdobeID,commerce.aco.ingestion,email,profile` (L1, lines 27-46; VERIFIED as code).
  That means the credential is a **client id + client secret** (plus the tenant id), not a
  single "API key". Region `na1` is hard-coded in that SDK default.
- The Admin API claim in BuildRight's doc (Bearer + `x-api-key: {clientId}`) is UNVERIFIED.
- S5 does not state which Developer Console API to add, or the token validity period. I could
  not read the Adobe "Authentication" include. UNVERIFIED.

## 5. Where per-customer / contract prices live (AB-14)

- Prices are separate from SKUs: many price books per SKU, each with a currency, with regular
  and discounted prices (S5 "Price books and prices"). Adobe says scale is 30k+ price books
  (S3). DOCUMENTED.
- A catalog view can allow all price books, a chosen list, or a single one (S6). A private
  view can reference only one price book (S6, S7).
- The storefront picks the price book **per request** with `AC-Price-Book-ID`. A price book
  id "controls which pricing is requested. It does not restrict access" (S6 note).
- S1 says: if a customer has an assigned price book and it falls within the view's allowed
  price books, it is used; otherwise the view's default. It does not say where a customer is
  assigned a price book in ACO. UNVERIFIED mechanism.
- The Commerce connector maps customer groups and websites to price books (S7). DOCUMENTED.
- So for AB-14: a contract price is a price entry in a price book. A per-customer price needs
  one price book per customer (or per contract tier) loaded via `POST .../products/prices`,
  that book allowed on the catalog view, and the storefront sending that customer's book id.
  The storefront must therefore change `AC-Price-Book-ID` after sign-in (BuildRight does this
  per persona at runtime, `buildright-eds/scripts/services/mesh-client.js:84-89`). Static
  config.json cannot do it.

## Implications for PL-60

**The four env vars.** Today they are `ACO_API_URL`, `ACO_API_KEY`, `ACO_TENANT_ID`,
`ACO_ENVIRONMENT_ID` (`src/features/components/config/components.json:579-610`). Against the
sources above:

| Var | Verdict |
|---|---|
| `ACO_TENANT_ID` | Needed. Builds every URL and goes in `analytics.environment-id` |
| `ACO_API_URL` | Not needed as an input. It derives from tenant, region and sandbox flag. The placeholder `https://commerce-optimizer.adobe.io` does not match the documented host `*.api.commerce.adobe.com` (S4, S5). Ask for region + sandbox/production instead, or compute it |
| `ACO_API_KEY` | Wrong shape. Ingestion needs an IMS client id and client secret (L1), not one key. The storefront needs nothing. Replace with `ACO_CLIENT_ID` and a secret `ACO_CLIENT_SECRET`, needed only for ingestion |
| `ACO_ENVIRONMENT_ID` | No documented use in the Merchandising or Ingestion API. The docs call the tenant id the "environment-id" in analytics (S1), so this looks like a duplicate of the tenant id. UNVERIFIED; drop unless something proves otherwise |

Also note `toolManager.ts:192-197` writes `DATA_REPO_PATH: '../vertical-data-citisignal'` and
the four vars for a legacy ingestion tool; its env names will change with the above.

**What the `'aco'` case in `configGenerator.ts:161-169` should emit** (instead of
`{{AC_VIEW_ID}}` / `{{AC_PRICE_BOOK_ID}}` placeholders):
- `commerce-endpoint` = the real ACO `/graphql` URL built from tenant id, region, environment.
  Keep `commerce-core-endpoint` as the Commerce core URL (or leave it unset if the project has
  no cart; unverified what the boilerplate does without it).
- `headers.cs`: `AC-View-ID` (real id), `AC-Source-Locale` (real locale, e.g. `en-US`), and
  `AC-Price-Book-ID` only when set. Docs say to remove the header if no book is assigned (S2).
  Add `AC-Catalog-View-Access-Token` only for a private view, and it cannot be a static value.
- No `all.Store` block (S1 shows none for ACO); no `x-api-key`; no `Magento-*` headers.
- `analytics`: the ACO shape (S1): `environment-id` (tenant), `view-id`, currency codes.
- Add the missing glue the backlog already names: `mapBackendToEnvironmentType` receives the
  backend id, never the add-on, so the case never runs (backlog PL-60 "Storefront config").
- Update `tests/features/eds/services/configGenerator.test.ts:113-114,205-206`, which pin the
  placeholders.

**Minimal SC inputs.**
1. Tenant id (22-char id, from the ACO instance page or the Studio URL) and region.
2. Sandbox or production.
3. Catalog view id (UUID). SC creates the view by hand in ACO, since no API was found.
4. Source locale (default `en-US`).
5. Price book id, optional, once ERP prices matter (AB-14).
6. Only if the extension loads data: IMS client id and client secret (secret in SecretStorage).

**Open questions the sources do not settle (need a live check, owner approval first):**
- Is there any REST/GraphQL way to create a catalog view? A call to the (UNVERIFIED) Admin
  GraphQL endpoint with a real token would settle it.
- Which Developer Console API a project needs to get the `commerce.aco.ingestion` scope.
- Does the boilerplate need `AC-Environment-Id`? (BuildRight sends it; Adobe docs do not.)
- Where a customer is "assigned" a price book (S1 sentence).

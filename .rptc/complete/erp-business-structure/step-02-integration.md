# Step 02 — The integration carries the structure

## Settings (per website, on the Admin screen)

1. RED (`test/lib/settings.test.js` or the settings-view test): `settingSections` places
   `structure_sales_org` and `structure_sales_org_name` under a "Structure" section;
   `saveProblem` refuses a sales org that is not `^[A-Z0-9]{4}$` and accepts `2000`.
2. `app.commerce.config.ts` `businessConfig.schema`: the two fields (type `text`, defaults
   `1000` / `""`). **Verify at build** that the library renders `text`; if only the types the
   researched page lists exist, use the one that holds a string and record it in the plan.
3. `settings-view.js`: `SECTIONS` gains `{ prefix: "structure", title: "Structure" }`.
   `SETTING_DEFAULTS` follows from the schema; `settingsFor` needs no change — website
   values already reach a store view through the tree.

## The pair's own settings: prefix and ownership (rules M3, M4)

3a. RED: `saveProblem` refuses a prefix outside `^[A-Z0-9]{1,6}$`; `ownershipFilter(settings)`
    answers a predicate over a mirrored product: `all` → true; `sources` → any of the
    product's source codes is in the list; `attribute` → `customAttributes[code] === value`.
3b. `order-sync.js`: the number written to `ext_order_id` is `${prefix}-${number}`; the note
    says "Created in Acme ERP as sales order 0000001042". `detach` clears the field as
    before (it reads Commerce order ids from the ERP, not the prefix). Any read that
    compares `ext_order_id` to an ERP number strips the prefix first — grep every
    `ext_order_id` / `extOrderId` use and pin each with a test.
3c. `mirror-run.js`, `product-commerce/*`, `stock-commerce/updated`: apply the predicate;
    a filtered-out product is skipped with a debug line, never sent. Under `sources` /
    `attribute`, an order with no owned line is skipped with a journal entry
    ("no line of order 000000307 belongs to this ERP").

## Orders carry the sales organisation

4. RED (`test/lib/order-sync.test.js`): `erpOrderFrom(order, entityId, settings)` puts
   `salesOrg: settings.structure_sales_org` and `salesOrgName` on the request; a missing
   setting sends `1000`.
5. `order-sync.js`: pass the settings already read for `orders_send` into `erpOrderFrom`.

## Partners carry legal fields, the admin's website, and sales organisations

6. RED (`test/lib/mirror.test.js`): `partnersFrom(companies, websites, salesOrgByWebsite)`
   emits `legalName`, `vatTaxId`, `resellerId`, `legalAddress`, `website: {id, code}`,
   `salesOrgs: [salesOrgByWebsite.get(websiteId) ?? '1000']`; a company with no admin
   website emits `website: null, salesOrgs: []`.
7. `commerce.js` `listCompanies`: read `legal_name`, `vat_tax_id`, `reseller_id`, `street`,
   `city`, `region`, `postcode`, `country_id`, `telephone`, `super_user_id` (all documented
   on the company object, read 2026-09-24); then `GET customers/{super_user_id}` for
   `website_id` (documented on the customer object). One extra read per company; a demo
   has a handful.
8. New `commerce.js` readers: `listWebsites()` (`GET store/websites`) and `storeInfo()`
   (`GET store/storeConfigs` for currency; Store Information address + VAT via the
   `storeConfigs`/config read the live instance actually answers — **capture the live
   response as a fixture in `test/fixtures/` and pin the field names**; this is the one place
   the field names were not read from a doc).
9. `mirror-run.js`: the full mirror reads websites + per-website `structure_sales_org` (via
   `getConfiguration(byWebsiteId(id))`) and sends the `structure` block with the products
   import; `mirrorPartners` (the minute refresh) sends the widened partner rows.

## Done when

`npx vitest run` and `npx biome check src test` green; a mirror against the in-memory
readers sends every new key; the vendored contract already says version 2 (step 01).

<!-- Read off the Data Installer service's customer and B2B processors (dsc-data-installer-api,
branch feature/DEMOSYS-1698-add-validator, head 3da7602) on 2026-10-29, to specify Demo Builder's
own engine for these kinds (datapack-engine step 08). A specification of THEIR behaviour, not ours:
where we deliberately differ, the step 08 plan says so. Companion to catalog-spec.md (its §0
cross-cutting rules apply here too). Line citations are to that branch. -->

# Spec: Data Installer customer and B2B install and remove (ACCS)

Source: `dsc-data-installer-api`, branch `origin/feature/DEMOSYS-1698-add-validator`. `L` means line
number. **INFERRED** marks anything not read directly in the code, mostly Adobe Commerce behaviour.
Endpoint paths are from `config/endpoints/base.json`; the ACCS overlay is empty.

## 0. Shared mechanics

- One natural-key lookup per row, uncached (`actions/utils/lookups.js` L78-145, L255-291), one `eq`
  filter each (`buildLookupQuery` L23-68): `customer_groups_search` on `customer_group_code`,
  `shared_catalogs_search` on `name`, `companies_search` on `company_name`, `categories_search` on
  `url_key`. The FIRST item is used.
- Aliases, customer groups only: `Default (General)` ↔ `General`, `NOT LOGGED IN` ↔ `Guest`
  (`config/lookup_aliases.json` L2-7; `lookups.js` L157-170).
- `replaceWithLookup` replaces only strings; a failed lookup leaves the string in the body
  (`lookups.js` L262-271).
- **"Already exists" is decided by matching Commerce's English error text after a POST**, never by a
  search first. Nothing existing is updated.
- Removal finds each target by its natural key in the same pack; install-time ids are never kept.
- Delete "not found" (404/410, or 400 "no such entity" / "does not exist") counts as skipped
  (`actions/utils/commerceRestDeleteOutcome.js` L36-89).

## 1. customer_groups

- Row `{customer_group: {code, tax_class_id}}`, `code` required (`config/schemas/customer_groups.json`).
- Install: `POST /V1/customerGroups` `{"group": <row.customer_group>}` (`CustomerGroupImportProcessor.js`
  L82-108). Duplicate = "customer group already exists" → skipped (L8-31, L126-139).
- Remove: protected `General`, `NOT LOGGED IN`, `Wholesale`, `Retailer` (not `Default (General)`)
  (`CustomerGroupDeleteProcessor.js` L19, L73-84). A row `id` is deleted directly without a search
  (L55-57, L86-93); else search by code, `DELETE /V1/customerGroups/{id}` (L206-295).
- Export: code + tax class, excluding Commerce's own groups (`dataTransformer.js` L78-97;
  `config/export_exclusions.json` L14-24).
- **INFERRED:** deleting a group moves its customers to the default group.

## 2. customers

- Row `{customer: {...}, password?, redirectUrl?}`, `customer.email` required
  (`config/schemas/customers.json` L8-55); no `password_hash`/`rp_token` anywhere in the code.
- Install: substitution `group_id: replaceWithLookup(customer_groups_search)` (import config
  L322-324), applied to every nested `group_id`. **The whole processed row is the body** of
  `POST /V1/customers` (`CustomerImportProcessor.js` L84-111). **`password` is sent if and only if
  the row carries it**; the service's own tests use one (`tests/.../CustomerImportProcessor.test.js`
  L68, L87, L113). No `website_id`/`store_id` substitution.
- Duplicate = "customer with the same email address already exists in an associated website" →
  skipped (L8-32, L128-141). No update.
- Remove: search by email, first item, **no website filter**, then `DELETE /V1/customers/{id}`
  (`CustomersDeleteProcessor.js` L185-272): deletes whoever has that email.
- Export: `{customer: <item>}`, never a password (`dataTransformer.js` L395-412). Removed: `id,
  website_id, store_id, created_at, updated_at, created_in, extension_attributes, addresses.id,
  addresses.customer_id, addresses.region_id, addresses.region.region_id`
  (`data_processors_export.json` L102-116). `group_id` id → code (L117-119). Company admins are
  exported as ordinary customers.

## 3. customers_export (bulk)

One `POST /V1/import/json` with `{source: {entity: "customer_composite", behavior, items: [...]}}`;
`_store`/`_website` ← session codes, `behavior` ← `import` or `delete` (`JsonImportProcessor.js`
L22-130; import config L298-303; delete L31-36). The schema allows only `add_update`. Not produced by
any export. **INFERRED:** whether Commerce accepts `behavior: "import"` is untested.

## 4. b2b_shared_catalogs

- Row `{sharedCatalog: {name, customer_group_id, type, store_id: 0, tax_class_id}}`.
- Install: `customer_group_id` code → id (import config L447-449); `POST /V1/sharedCatalog`
  (`SharedCatalogImportProcessor.js` L203-225). Duplicate = "a catalog already exists with customer
  group" → skipped (L9-32, L238-252); no check by name.
- Remove: protected `Default Catalog` (L20, L74-85); search by name, exact else first; `DELETE
  /V1/sharedCatalog/{id}` (L242-357). The three assignment kinds are no-ops on delete ("Deleted when
  shared catalogs are deleted", delete config L178-198).
- Export excludes type 1 named `Default (General)` (`export_exclusions.json` L70-82).

## 5. b2b_companies

- Row `{query, variables: {input: {company_name, company_email, legal_name, legal_address {street[],
  city, country_id, postcode, telephone, region{region|region_code|region_id}}, company_admin {email,
  firstname, lastname}}}, extension_attributes?}` (`config/schemas/b2b_companies.json` L5-67).
- Install: GraphQL `POST {base}/graphql` with the row's own query (`B2BCompanyImportProcessor.js`
  L142-152), the IMS client-credentials bearer (`httpClient.js` L299-301). The admin is passed in
  the input; the service neither looks up nor makes a customer. The address validator exists but is
  never called (L335-404). With `extension_attributes`, a follow-up `POST /V1/company` `{company:
  {id, extension_attributes}}` (L186-197, L295-319); its failure is only a warning.
- Duplicate = "company with this email address already exists in the system" → skipped (L11-70,
  L154-176).
- Remove: search by `company_name`, exact else first, `DELETE /V1/company/{id}` (`B2BCompanyDeleteProcessor.js`
  L183-280). The admin customer is untouched unless also a `customers` row.
- Export: admin from `GET /V1/customers/{super_user_id}`; `region` as `{region_id}`; everything else
  on the REST company but the address, names and extension attributes dropped
  (`B2BCompanyExportProcessor.js` L24-176; `dataTransformer.js` L139-184).

## 6-8. Assignments

| Kind | Row | Install | Remove |
|---|---|---|---|
| `b2b_shared_catalog_company_assignments` | `{assignment: {shared_catalog_name, companies: [{company_name}]}}` | catalog by name, each company by name (missing → skipped with a warning), `POST /V1/sharedCatalog/{id}/assignCompanies` `{companies: [{id}]}` (`SharedCatalogCompanyAssignmentProcessor.js` L216-256) | none |
| `b2b_shared_catalog_categories` | `{catalogs: [{name, categories: [{id: <url_key>}]}]}` | each url key via `categories/list`, `POST …/assignCategories` `{categories: [{id}]}` (`SharedCatalogCategoriesProcessor.js` L193-244) | none |
| `b2b_shared_catalog_products` | `{catalogs: [{name, products: [{sku}]}]}` | one `POST …/assignProducts` `{products: [{sku}]}`, no SKU check (`SharedCatalogProductsProcessor.js` L190-238) | none |

Export reads `GET /V1/sharedCatalog/{id}/companies`, `/categories`, `/products` and names them;
product SKUs are lowercased (`make_sku_eds_compatible`, export config L469).

## 9. Order

Import (`config/data_processors_import.json`): attribute_sets, product_attributes,
attribute_assign_to_set, categories, **customer_groups**, stocks, sources, stock_source_links,
products, product_export, giftcards, source_items, **customers_export**, **customers**, cart_rules,
coupons, **b2b_shared_catalogs**, **b2b_companies**, **company assignments**, **catalog categories**,
**catalog products**.

Delete (`config/data_processors_delete.json`): **b2b_shared_catalogs**, cart_rules,
**customers_export**, **customer_groups**, product_export, products, stocks, sources, categories,
product_attributes, attribute_sets, **b2b_companies**, **customers**; the assignment kinds are no-ops.

## 10. Bodea's real rows (read 2026-10-29, `save_datapack_zip` from the Data Installer, read-only)

Bodea `main` holds exactly these seven kinds beside its catalog (14 in all; no `customers_export`).

- `customer_groups`: 2, `{customer_group: {code, tax_class_id}}`.
- `customers`: 6, fields `group_id` (a code, `Default (General)` or a pack group), `email`,
  `firstname`, `lastname`, `gender` (some), `addresses: []`, `disable_auto_group_change`, and
  **a top-level `password` on every row**, the same weak value on all six.
- `b2b_companies`: 3, the GraphQL form above; `street` an array; `region` `{region_id}` only; each
  admin's email is one of the six customers'.
- `b2b_shared_catalogs`: 2, each named for, and linked to, a pack group.
- Assignments: companies to `Default (General)` (the public catalog) and to a pack catalog;
  categories and products to the public catalog and both pack catalogs (one url key listed twice).
- Products' tier prices name the two pack groups and `32000` (all groups).

## 11. Open

1. Does ACCS accept `POST /V1/company` with `super_user_id` and the address block (Demo Builder's
   route), and what does it answer? (Adobe's B2B REST reference makes companies this way.)
2. What does Commerce do with a company's members when the company is deleted, and with a shared
   catalog's group when the catalog is deleted?
3. Is group 1's code `General` or `Default (General)` on ACCS?

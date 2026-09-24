# Composite entities: what each business concept is made of, record by record

Written 2026-09-24 for backlog item AB-26a (slice CE of `.rptc/plans/erp-programme/overview.md`).
The plan's §5a names nine business concepts that exist in neither system as one record. This
document writes each one out on three sides: the Adobe Commerce records, the SAP S/4HANA
records the mock ERP imitates, and what the mock ERP (`demo-erp`) plus the integration
(`commerce-erp-integration`) actually hold today. Every field names its **owner**, the system
whose value wins when the two disagree.

**How to read the labels.** *read* means the field or path was quoted from an opened API
definition or documentation page. *snippet* means it came from a JSON example, prose table or
search excerpt without opening the full definition. *inferred* means the path was seen in a
listing but its body was not opened, or the fact is general product knowledge not verified this
session. Owner column: **C** = Commerce decides, **E** = the ERP decides, **C→E** = Commerce
decides and the ERP mirrors it, **E→C** = the ERP decides and writes it to Commerce, **join** =
the key that ties the two composites together.

**Sources.** Commerce: the Admin and Customer REST OpenAPI specs for 2.4.9
(`AdobeDocs/commerce-webapi`, `src/openapi/`), the B2B and inventory REST narrative pages, and
the Commerce eventing reference (`AdobeDocs/commerce-extensibility`,
`src/pages/events/events-reference.md`, which is scoped to Commerce as a Cloud Service). Four
parallel readers converged on the same facts. SAP: help.sap.com S/4HANA Cloud API guides
(Business Partner A2X, APIs for Sales, Product Master A2X, Credit Management, Delivery and
Transportation); each entity below carries its page URL. api.sap.com never rendered (a
client-side application), so every SAP claim comes from help.sap.com, which carries the same
field lists. Codebase: the files named inline, read in this session.

**Two corrections to earlier drafts of the plan**, both from the SAP reader: the pricing
*scales* entity is `A_SlsPrcgCndnRecordScale` (the entity the plan had called scales,
`A_SlsPrcgCndnRecdSuplmnt`, is condition *supplements*); and there is no `API_CREDITMGMT_*`
service; the credit master-data API is `API_CRDTMBUSINESSPARTNER_0001`. The plan's §5a table
does not name either entity, so nothing there is wrong, but any later text should use these
names.

**A note on method.** The SAP reader reported that it drove a real Chrome browser to read
help.sap.com because the fetch server was down. The unattended loop's rails forbid opening
browser tabs; this is recorded in the loop report as a rail breach by a subagent. The evidence
it produced is still a direct read of the pages' own property tables and is used here as such.

---

## 1. Buying organization

The concept the owner named first: a customer company that buys on account, with people who
may order for it, a catalog and prices it is allowed to see, a credit line, and a legal
identity. Join: **Commerce company id** ↔ ERP business partner `commerceCompanyId` (the ERP's
partner id is `C<companyId>`, `commerce-erp-integration/src/lib/mirror.js` `partnersFrom`).

### Commerce side

| Record | Field | Type | Owner | Mirrored today | Label |
|---|---|---|---|---|---|
| `company` (`company-data-company-interface`) | `id` | int | C, join | yes (`commerceCompanyId`) | read |
| | `company_name` | string | C→E | yes (`name`) | read |
| | `status` | int (0 pending, 1 approved, 2 rejected, 3 blocked) | **both**: C→E on import, E→C when the ERP blocks (`be-observer.company_status_update`) | yes (`blocking`: 3 → `all`) | read (codes: snippet) |
| | `company_email` | string | C→E | yes, as `emailDomain` (the part after `@`) | read |
| | `legal_name`, `vat_tax_id`, `reseller_id`, `comment` | string | C | **no** | read |
| | `street[]`, `city`, `region`, `region_id`, `postcode`, `country_id`, `telephone` | string | C | **no** | read |
| | `customer_group_id` | int | C→E | yes (`customerGroupId`, used by the price webhook) | read |
| | `sales_representative_id` | int (admin user) | C | no | read |
| | `super_user_id` | int (company admin's customer id) | C | no | read |
| | `extension_attributes.quote_config.is_quote_enabled`, `is_purchase_order_enabled`, `applicable_payment_method`, `available_payment_methods`, `applicable_shipping_method`, `available_shipping_methods` | mixed | C | no | read |
| `company/{parentId}/relations` (`company-relation-data-relation-interface`) | `company_id`, `parent_id` | int | C | no | read |
| `customers` → `extension_attributes.company_attributes` (`company-data-company-customer-interface`) | `customer_id`, `company_id`, `job_title`, `telephone`, `status` (0/1), `is_default` | mixed | C | no | read |
| `customers` | `website_id` | int | C | no (needed by slice 9 to place the buyer under a selling organization) | read |
| `company/role` (`company-data-role-interface`) | `id`, `role_name`, `company_id`, `permissions[]{resource_id, permission}` | mixed | C | no | read |
| `hierarchy/{id}` (`company-data-hierarchy-interface`) + `team` | `structure_id`, `entity_id`, `entity_type` (team/customer), `structure_parent_id`; team `id`, `name`, `description` | mixed | C | no | read |
| company address book (`company/{id}/address`, `company-address/{id}`) | `company_address_id`, `type` (1 billing, 2 shipping), `nickname`, name parts, `street[]`, `city`, `country_id`, `region`, `postcode`, `telephone`, `vat_id` | mixed | C | no | **snippet only**: absent from the 2.4.9 OpenAPI spec, documented as Cloud-Service-only, gated on `is_company_address_book_enabled` |
| `customerGroups` (`customer-data-group-interface`) | `id`, `code`, `tax_class_id`, `tax_class_name`, `extension_attributes.exclude_website_ids[]` | mixed | C | no (only the id is carried) | read |
| `sharedCatalog` (`shared-catalog-data-shared-catalog-interface`) | `id`, `name`, `description`, `customer_group_id` (system-set, immutable), `type` (0 custom, 1 public), `store_id`, `tax_class_id` | mixed | C | no | read |
| `sharedCatalog/{id}/products` | array of `{sku}` (no named interface) | | C | no | read |
| `sharedCatalog/{id}/companies`, `assignCompanies`, `unassignCompanies` | company ids | | C | no | read |
| `companyCredits/company/{companyId}` | see §6 Credit | | | yes | read |
| negotiable quote (`extension_attributes.negotiable_quote` on the cart) | `quote_id`, `status`, `negotiated_price_type`, `negotiated_price_value`, `quote_name`, `expiration_period`, `creator_id`, `creator_type`, totals | mixed | C | no | read; **no GET on `negotiableQuote/{id}`, it is PUT-only** |
| purchase orders | **no REST entity**: only the checkout leg (`carts/mine/po-payment-information`, `purchase-order-carts/{cartId}/*`); list/approve/reject is GraphQL-only | | C | no | read (absence confirmed by grep of both specs) |
| requisition lists (`requisition-list-data-requisition-list-interface`) | `id`, `customer_id`, `name`, `items[]{sku, qty, store_id}` | mixed | C | no | read; **only `POST /V1/requisition_lists` exists**, read/list are GraphQL-only |

Write paths that matter to the integration: `PUT /V1/company/{id}` (status, the block),
`PUT /V1/companyCredits/{id}` (limit), `POST /V1/company/{id}` for creation (the demo's setup,
not the integration). Events: `observer.company_save_commit_after` exists (Admin, REST, GraphQL,
Storefront) and its payload carries `legal_name`, `vat_tax_id`, `reseller_id`,
`customer_group_id`, `sales_representative_id`, `super_user_id`, `status`, `reject_reason`
(read). The integration does not subscribe to it today; the minute refresh
(`mirrorPartners`) covers company edits by polling.

### SAP side (what the mock ERP imitates)

SAP keeps the customer in three layers, and the layering is the point of the concept: the same
company is one general record, one record per company code it does business with, and one
record per sales area it may order through.

| Entity | Classic table | Key fields | Label |
|---|---|---|---|
| `A_BusinessPartner` (`API_BUSINESS_PARTNER`) | BUT000 | `BusinessPartner`, `BusinessPartnerCategory` (1 person, 2 organization, 3 group), `BusinessPartnerName`, `BusinessPartnerFullName`, `BusinessPartnerGrouping`, `BusinessPartnerIsBlocked`, `Customer` | read, [page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/617d3658e4870846e10000000a441470.html) |
| `A_Customer` | KNA1 | `Customer`, `CustomerName`, `CustomerAccountGroup`, `CustomerClassification`, `CustomerCorporateGroup`, `OrderIsBlockedForCustomer`, `DeliveryIsBlocked`, `BillingIsBlockedForCustomer`, `DeletionIndicator`, `Industry` | read, [page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/dd5f045826552246e10000000a441470.html) |
| `A_CustomerCompany` (per company code) | KNB1 | `Customer` + `CompanyCode` (key), `ReconciliationAccount`, `PaymentTerms`, `PaymentMethodsList`, `PaymentBlockingReason`, `HouseBank`, `CustomerHeadOffice`, `AlternativePayerAccount` | read, [page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/3d60045826552246e10000000a441470.html) |
| `A_CustomerSalesArea` (per sales area) | KNVV | `Customer` + `SalesOrganization` + `DistributionChannel` + `Division` (key), `CustomerGroup`, `CustomerABCClassification`, `DeliveryPriority`, `IncotermsClassification`, `CustomerAccountAssignmentGroup` | read (key fields), [page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/9d60045826552246e10000000a441470.html) |
| `A_CustSalesPartnerFunc` | KNVP | the sales-area key + `PartnerFunction` (AG sold-to, WE ship-to, RE bill-to, RG payer), `BPCustomerNumber`, `DefaultPartner` | read (fields); the four function codes are inferred |
| `A_BusinessPartnerAddress` | ADRC | `AddressID`, `StreetName`, `HouseNumber`, `PostalCode`, `CityName`, `Region`, `Country`, `TaxJurisdiction` | read |
| `A_BusinessPartnerTaxNumber` | | `BPTaxType`, `BPTaxNumber`, `BPTaxLongNumber` | read |

The three SAP block flags on `A_Customer` (order, delivery, billing) are what the mock ERP's
`blocking` levels (`open`, `shipping`, `invoicing`, `all`) stand in for; Business Central's
graduated Blocked field is the other model (`demo-erp/lib/credit.js`, header comment).

### What the mock ERP holds today

`demo-erp/lib/partners.js` `importPartners` writes one business partner per Commerce company:

| ERP field | Source | Owner |
|---|---|---|
| `id` = `C<companyId>` | integration `partnersFrom` | join |
| `name` | `company_name` | C→E |
| `commerceCompanyId` | `company.id` | join |
| `customerGroupId` | `company.customer_group_id` | C→E (the price webhook keys on it) |
| `emailDomain` | `company_email` after `@` | C→E; used by `findPartner` to resolve a guest order to a partner |
| `creditLimit` | `companyCredits.credit_limit`; default 50000 when Commerce has none | C→E on import, E→C when edited on the ERP screen (`be-observer.company_credit_update`) |
| `blocking` | `company.status === 3` → `all`, else `open`; a level set on the ERP survives only until Commerce next says otherwise | both (see §6) |
| `paymentTerms` | ERP only, default `NET30` | E (never leaves the ERP) |
| `salesOrg` | ERP only, default `'1000'` | E (the business-structure plan makes it per-website) |

Resolution order for an incoming order (`findPartner`): explicit `partnerId`, then
`commerceCompanyId`, then the buyer's email domain, then the walk-in default partner.

**Not represented on either mirrored side today**: the company's legal identity (`legal_name`,
`vat_tax_id`, address), its people (company users, roles, teams), its catalog (shared
catalog), quotes, purchase orders, requisition lists. Slice 9 (entity map) shows the legal
identity and the people counts from Commerce reads; nothing about them needs to be mirrored
into the ERP for the demo story, because the ERP's sold-to layer is exactly one record per
company and the integration keys on the company id.

---

## 2. Selling organization

The seller's side of the sale: which legal entity sells, through which channel, in which
currency. Join: **the per-website setting** (`businessConfig` scope, see below).

### Commerce side

| Record | Field | Type | Owner | Label |
|---|---|---|---|---|
| `store/websites` (`store-data-website-interface`) | `id`, `code`, `name`, `default_group_id` | mixed | C | read |
| `store/storeGroups` (`store-data-group-interface`) | `id`, `website_id`, `root_category_id`, `default_store_id`, `name`, `code` | mixed | C | read |
| `store/storeViews` (`store-data-store-interface`) | `id`, `code`, `name`, `website_id`, `store_group_id`, `is_active` | mixed | C | read |
| `store/storeConfigs` (`store-data-store-config-interface`) | `id`, `code`, `website_id`, `locale`, `base_currency_code`, `default_display_currency_code`, `timezone`, `weight_unit`, `base_url`, `secure_base_url` and the media/static/link URL variants | mixed | C | read |
| Store Information (`general/store_information/*`: name, phone, address, VAT) and shipping origin (`shipping/origin/*`) | | C | **not exposed over REST** (grep of the full spec for `store_information`, `shipping/origin`, `StoreInformation`: zero; no generic `/V1/config` path). Admin System Configuration or `bin/magento config:set` only. | read (absence) |
| `inventory/stocks` `extension_attributes.sales_channels[]{type:"website", code}` | the website's stock | C | read (see §5) |

All four `/V1/store/*` paths are GET-only; nothing writes them over REST (read). The
integration reads websites today only through `@adobe/aio-commerce-lib-config`'s
`syncCommerceScopes` to build its settings scope tree
(`commerce-erp-integration/src/lib/settings.js`, `getScopeTree`).

**Consequence for slice 9.** The Organization card cannot read the seller's legal address or
VAT number from the API. Two options, both to be decided in AB-26j: keep those values as
integration settings typed once per website (App Management form), or read them from the
storefront's own configuration. The plan already leans on the setting; this research confirms
there is no third way.

### SAP side

| Entity | Classic table | Key fields | Label |
|---|---|---|---|
| `A_SalesOrganization` (APIs for Sales) | TVKO | `SalesOrganization`, `SalesOrganizationCurrency`, **`CompanyCode`** (the sales organization's owning company code; exactly one), `IntercompanyBillingCustomer` | read, [page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/151ed4ecd25e4d4e9decb6997c8d4924.html) |
| `A_DistributionChannel` | TVTW | `DistributionChannel` (text in a sibling entity) | read |
| Division | TSPA | `Division` | inferred (listed, not opened) |
| Sales area | TVTA | `SalesOrganization` + `DistributionChannel` + `Division` | inferred (the combination); components read |
| Sales office / sales group | TVKBZ / TVKGR | listed as replicate entities; technical names not resolved | inferred |
| Company code master (name, address, currency) | T001 | **no standalone public OData entity found**; appears only as a foreign key on dependent objects | read (absence) |

So SAP, like Commerce, does not hand the seller's legal identity to an API reader as one
record. Mapping: Commerce **website** ↔ SAP **sales organization** (one currency, one owning
company code); Commerce **store view** ↔ SAP **distribution channel** is the nearest
analogue but the business-structure research (`.rptc/research/erp-business-structure/`) argues
the channel is better fixed per integration ("10 = online"), and this document does not reopen
that.

### What the mock ERP holds today

`salesOrg` on the partner (default `'1000'`), nothing on the order header, no company code, no
currency per organization (`currency` on the order is whatever the integration sent, default
`USD`). The business-structure plan (`.rptc/plans/erp-business-structure/`) adds the sales
organization and order-number prefix per website; this document's contribution is the field
inventory it should carry: `salesOrg`, `companyCode`, `currency`, `prefix`, plus the display
fields (`legalName`, `vatId`, address) that the API cannot supply and the setting must.

---

## 3. Sellable item

Join: **SKU**. This is the most complete mirror today.

### Commerce side

| Record | Field | Type | Owner | Mirrored | Label |
|---|---|---|---|---|---|
| `products` (`catalog-data-product-interface`) | `sku` (the only required field) | string | C, join | yes | read |
| | `id`, `name`, `type_id`, `status`, `visibility`, `attribute_set_id` | mixed | C→E (`name`, `type_id` → `type`) | `name`, `type` | read |
| | `price` | number | **E→C** (ERP list price wins; `setProductPrice`) | yes (`listPrice`) | read |
| | `weight`, `created_at`, `updated_at`, `options[]`, `product_links[]`, `tier_prices[]`, `custom_attributes[]{attribute_code, value}` | mixed | C | no (variant attribute values are read through `custom_attributes`) | read |
| | `extension_attributes.website_ids[]` | int[] | C | **no** (slice 9 needs it: which selling organization offers the item) | read |
| | `extension_attributes.category_links[]{position, category_id}` | | C | no | read |
| | `extension_attributes.stock_item` (legacy single-stock: `qty`, `is_in_stock`, `manage_stock`, `backorders`, `min_sale_qty`, `max_sale_qty`) | | see §5 | via the stock event | read |
| | `extension_attributes.configurable_product_links[]` | int[] (child ids) | C→E (`parentSku`) | yes | read |
| | `extension_attributes.configurable_product_options[]` (`configurable-product-data-option-interface`: `attribute_id`, `label`, `values[].value_index`) | | C→E (`variantAttributes` labels and values) | yes | read |
| `products/attributes` | `attribute_id`, `attribute_code`, `default_frontend_label`, `options[]{value, label}` | | C→E | yes (`listVariantAttributes`) | read |
| `products/{sku}/links` (`catalog-data-product-link-interface`) | `link_type` (related/upsell/crosssell/associated), `linked_product_sku`, `position` | | C | no | read |
| `inventory/source-items` | see §5 | | | yes (`warehouses`) | read |

Write paths used: `PUT /V1/products/{sku}` with `product.name` and `product.price`
(`commerce-erp-integration/src/lib/commerce.js` `setProductName`, `setProductPrice`). Events:
`observer.catalog_product_save_commit_after` (subscribed; "recommended for external
integrations", read) and `observer.catalog_product_delete_commit_after` (exists, not
subscribed; slice AB-26h's G1 gap).

### SAP side

| Entity | Classic table | Key fields | Label |
|---|---|---|---|
| `A_Product` (`API_PRODUCT_SRV`; SAP recommends its v3 successor) | MARA | `Product`, `ProductType`, `BaseUnit`, `ProductGroup`, `Division`, `ProductHierarchy`, `CrossPlantStatus`, `GrossWeight`/`NetWeight`/`WeightUnit`, `Brand`, `ProductStandardID` (GTIN) | read, [page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/2c973258fb9d2060e10000000a44147b.html) |
| `A_ProductDescription` | MAKT | per-language text | inferred (listed) |
| `A_ProductSalesDelivery` (per sales org + channel) | MVKE | `Product` + `ProductSalesOrg` + `ProductDistributionChnl` (key), `ProductSalesStatus`, `ProductSalesStatusValidityDate`, `MinimumOrderQuantity`, `DeliveryQuantity`, `PricingReferenceProduct`, `ItemCategoryGroup` | read, [page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/d4982c0609e2407ca548092eecbbc2ec.html) |
| `A_ProductPlant` (per plant) | MARC | `Product` + `Plant`, `MRPType`, `ProfitCenter`, `AvailabilityCheckType`, `ProcurementType`, `IsNegativeStockAllowed` | read |
| `A_ProductStorageLocation` | MARD | `Product`, `Plant`, `StorageLocation`, `WarehouseStorageBin` (flags only; quantities are in the stock API) | read |
| Units of measure | MARM | the reader's extraction hit the wrong page; **not established** | |
| Delivering plant | | likely on `A_ProductPlantSales` / `A_ProductSales`; not opened | inferred |

The SAP shape says two things the mock ERP does not yet: an item's **sales status is per sales
organization** (MVKE), and an item is **extended to plants** (MARC) rather than owning a flat
warehouse list. The mock ERP's `warehouses[]` on the product (`demo-erp/lib/products.js`) is
the MARC + stock view flattened, which is the right amount of realism for a demo.

### What the mock ERP holds today

`importProducts` (`demo-erp/lib/products.js`): `sku`, `name`, `type` (simple/configurable),
`parentSku`, `variantAttributes[]{label, value}`, `unit` (default `EA`, never sent by Commerce),
`listPrice`, `warehouses[]{code, name, quantity}`. Owner: Commerce for identity, type and
variants; the ERP for `listPrice` and stock once imported (both are written back). `unit`
has no Commerce counterpart and stays in the ERP.

---

## 4. Price

Join: **SKU + company (customer group) + sales organization**; the sales-organization leg is
not built yet.

### Commerce side

| Record | Fields | Owner | Mirrored | Label |
|---|---|---|---|---|
| product `price` | number on the product | **E→C** | yes | read |
| `products/base-prices` (`catalog-data-base-price-interface`) | `price`, `store_id`, `sku` (website-scoped price) | C, unused | no | read |
| `products/tier-prices` (`catalog-data-tier-price-interface`) | `price`, `price_type`, `website_id`, `sku`, `customer_group` (name), `quantity` | C, unused | no | read |
| `products/special-price` (`catalog-data-special-price-interface`) | `price`, `store_id`, `sku`, `price_from`, `price_to` (`Y-m-d H:i:s`) | C, unused | no | read |
| `sharedCatalog/{id}/assignTierPrices` (same tier-price interface) | shared-catalog custom prices | C, unused | no | read |
| Cart-time price: webhook `plugin.magento.out_of_process_totals_collector.api.get_total_modifications.item_prices` (`erp_contract_price`) and `.execute` (`erp_discount_ceiling`) | JSON Patch on quote items and totals | **E** (the ERP quotes; Commerce applies) | live | read ([totals collector use cases](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/totals-collector-use-cases/)) |

Three stored price surfaces exist in Commerce for the same concept (product-embedded
`tier_prices`, standalone `products/tier-prices`, legacy `group-prices`), confirmed as three
real surfaces and not reconciled further (read). The integration uses none; contract prices
never persist in Commerce, they are quoted at cart time. That is the design the bidirectional
review kept (the ERP is the apparent system of record for agreed prices).

### SAP side

`API_SLSPRICINGCONDITIONRECORD_SRV` (communication scenario SAP_COM_0294, snippet) with six
entities, read from the [condition record page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/7916962329ee49b293156fffddfb7dd8.html):
`A_SlsPrcgConditionRecord` (records), `A_SlsPrcgCndnRecdValidity` (validity),
`A_SlsPrcgCndnRecordScale` (**scales**), `A_SlsPrcgCndnRecdSuplmnt` (supplements), and the
two text entities. Expected fields (snippet level): `ConditionType`,
`ConditionValidityStartDate`/`EndDate`, `ConditionRateValue`, `ConditionCurrency`,
`ConditionQuantity`, `ConditionQuantityUnit`; on validity `SalesOrganization`,
`DistributionChannel`, `Customer`, `Material`, `ConditionReleaseStatus`. Classic table mapping
(KONP / A-tables versus the S/4HANA CNDRC set): inferred.

### What the mock ERP holds today

`demo-erp/lib/conditions.js`: `kind` ∈ `contractPrice` (partner + SKU + `price`),
`contractDiscount` (partner, optional SKU, `percent`), `maxDiscount` (optional partner and SKU,
`percent`), plus since this loop `validFrom`, `validTo` (YYYY-MM-DD) and `minQty`.
`lib/pricing.js` derives `conditionStatus` (active / scheduled / expired), rules a record out
by date or quantity (`ruledOut`) and reports the reason on the quote line (`notApplied[]`).
The SAP field each stands for: `ConditionType` ↔ `kind` (PR00 list price, a customer price
type ↔ `contractPrice`, a discount type ↔ `contractDiscount`; `maxDiscount` has no SAP
condition type, it stands in for a pricing-procedure limit), `ConditionValidityStartDate`/
`EndDate` ↔ `validFrom`/`validTo`, `A_SlsPrcgCndnRecordScale` ↔ `minQty` (one scale step),
`SalesOrganization` on the validity ↔ **missing** (the business-structure plan adds it).

---

## 5. Inventory position

Join: **SKU + source code** (Commerce inventory source ↔ ERP warehouse code).

### Commerce side

| Record | Fields | Owner | Mirrored | Label |
|---|---|---|---|---|
| `inventory/source-items` (`inventory-api-data-source-item-interface`) | `sku` + `source_code` (compound key), `quantity`, `status` (0 out, 1 in) | **both**: C→E on import, E→C when the ERP edits a warehouse (`setStock`) | yes | read |
| `inventory/stocks` (`inventory-api-data-stock-interface`) | `stock_id` (1 = default, undeletable), `name`, `extension_attributes.sales_channels[]{type:"website", code}` | C | no | read |
| `inventory/stock-resolver/{type}/{code}` | sales channel → stock | C | no | read |
| `inventory/get-product-salable-quantity/{sku}/{stockId}` | bare number | C (derived) | no | read |
| `inventory/is-product-salable-for-requested-qty/{sku}/{stockId}/{qty}` | `{salable, errors[]}` | C (derived) | no; AB-19's availability webhook is the ERP-side answer | read |
| low-quantity notification (`source-item-configuration-interface`: `source_code`, `sku`, `notify_stock_qty`) | thresholds only; **no "currently low" report endpoint** | C | no | read |
| legacy `extension_attributes.stock_item` | `qty`, `is_in_stock`, `manage_stock`, `backorders`, `min_qty`, `min_sale_qty`, `max_sale_qty` | C | via `observer.cataloginventory_stock_item_save_commit_after`, **default source only** | read |

Events: the legacy stock-item event is the **only** inventory event in the reference; **no MSI
source-item event exists** (read, absence). That is the finding AB-26h (per-source stock) is
built on: per-source changes made in Commerce reach the ERP only by re-reading source items.

### SAP side

`API_MATERIAL_STOCK_SRV` (snippet only; the page could not be opened): root `MaterialStock`
(`MATERIAL`, `MATERIAL_BASE_UNIT`) → `A_MatlStkInAcctMod` (`Material`, `Plant`,
`StorageLocation`, `Batch`, `InventoryStockType`, `MatlWrhsStkQtyInMatlBaseUnit`); read-only
service. Available-to-promise was not researched; the mock ERP's `available` = on hand minus
committed is the demo's stand-in for an ATP check. Classic tables MARD / MCHB: inferred.

### What the mock ERP holds today

`warehouses[]{code, name, quantity}` on the product; `committed` to open orders and
`available` are derived on read (`demo-erp/lib/products.js`, `describeProduct`). A shipment
names its `warehouse` and the event to Commerce carries it as `stockSourceCode`
(`lib/fulfilment.js`). The default warehouse code is `default`, matching Commerce's default
source, and a bare Commerce stock number lands only there (`withDefaultStock`).

---

## 6. Credit

Join: **company id** (the ERP partner's `commerceCompanyId`).

### Commerce side

| Record | Field | Type | Owner | Mirrored | Label |
|---|---|---|---|---|---|
| `companyCredits` (`company-credit-data-credit-limit-interface`) | `id`, `company_id` | int | C | `creditId` kept by the integration for writes | read |
| | `credit_limit` | number | **both**: C→E on import, E→C on ERP edit (`PUT /V1/companyCredits/{id}`) | yes | read |
| | `balance` | number (amount owed; negative = owed) | C | **no** | read |
| | `available_limit` | number (computed `credit_limit − balance`, not settable) | C | no | read |
| | `currency_code`, `exceed_limit` (bool), `credit_comment` | mixed | C | no | read |
| `companyCredits/{id}/increaseBalance`, `decreaseBalance` | body `value`, `currency`, `operationType`, `comment`, `options{purchase_order, order_increment, custom_reference_number}` | | slice AB-26s (payment leg) writes these | not yet | read |
| `operationType` codes | 1 Allocated, 2 Updated, 3 Purchased, 4 Reimbursed, 5 Refunded, 6 Reverted; increase accepts 1,2,4,5,6; decrease accepts 2,3,4. **"Reimburse" is `operationType=4`, not an endpoint** | | | | read (four readers agree) |
| `companyCredits/history` (`company-credit-data-history-data-interface`) | `id`, `company_credit_id`, `user_type`, `amount`, `balance`, `credit_limit`, `available_limit`, `type`, `datetime`, `purchase_order`, `custom_reference_number`, `comment` | | C | no (slice 9 can list it) | read |
| `company.status` = 3 Blocked | | E→C when the ERP blocks (`be-observer.company_status_update`) | yes | read |

### SAP side

The credit API is **`API_CRDTMBUSINESSPARTNER_0001`** (OData; the earlier draft's
`API_CREDITMGMT_*` does not exist), from the [Credit Management API index](https://help.sap.com/docs/SAP_S4HANA_CLOUD/ce8c2b9687e94c2eb70ab34e92e6fba5/b48e74e0dd3f474ba241199c62abff02.html)
(read). Its account node carries `BusinessPartner`, `CreditSegment`, `CreditLimitAmount`, a
special-attention flag and a block reason (snippet); exposure and utilisation field names
were **not verified**. The **credit-blocked sales document** view (read, 26 fields,
[page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/28bbd3a0e57a4b549b144c9c8e8c0213.html)):
`SalesDocument`, `SoldToParty`, `CentralCreditCheckStatus`, `TotalCreditCheckStatus`,
`CreditBlockReleaseDate`, `CustomerCreditAccount`, `NextCreditCheckDate`,
`ReleasedCreditAmount`, `TotalNetAmount`, sales-area fields. This is the SAP shape behind the
mock ERP's create-and-hold: the order exists, carries a credit status, and a person releases it.

### What the mock ERP holds today

`creditLimit` and `blocking` on the partner; `creditStatus` (approved / held / released /
null), `creditReason`, `creditDecidedAt` on the order (`demo-erp/lib/orders.js`,
`lib/credit.js`); exposure derived from open orders excluding held ones, `available` = limit
minus exposure, `held` count (`describePartner`). **Not held**: a balance. Commerce's
`balance` is the receivable side of the concept and belongs to §8; the ERP's exposure is
open orders, which is a different number. Slice 9's Credit card must show both and say which
is which.

---

## 7. Order (order to cash)

Join: **`ext_order_id` on the Commerce order = the ERP order number, with the per-ERP prefix**
(rule M1 in the bidirectional review; the prefix is not built yet).

### Commerce side

| Record | Fields that matter here | Owner | Mirrored | Label |
|---|---|---|---|---|
| `orders` (`sales-data-order-interface`) | `entity_id`, `increment_id`, **`ext_order_id`**, `store_id`, `state`, `status`, `hold_before_state`, `customer_id`, `customer_email`, `customer_group_id`, `customer_is_guest`, `grand_total`, `base_grand_total`, `subtotal`, `total_paid`, `total_due`, `total_invoiced`, `total_refunded`, `order_currency_code`, `items[]{item_id, sku, qty_ordered, qty_shipped, qty_invoiced, qty_refunded, qty_canceled, price, base_price, parent_item_id}`, `payment{method, po_number, amount_paid, last_trans_id}`, `extension_attributes.company_order_attributes{company_id, company_name}`, `shipping_assignments[]` | C creates; E→C for `ext_order_id`, status comments, cancel, ship, invoice | `commerceOrderId`, `commerceIncrementId`, lines (`sku`, `qty_ordered`, `base_price`, `item_id`), `store_id` (for settings), currency, total | read |
| `orders/{id}/comments` (`sales-data-order-status-history-interface`) | `comment`, `status`, `is_customer_notified`, `is_visible_on_front` | E→C | yes (notes; Processing on confirm) | read |
| `orders/{id}/hold`, `unhold`, `cancel` | id only, return boolean | E→C (cancel today; hold in AB-26f) | cancel yes | read |
| `order/{id}/ship` | `items[]{order_item_id, qty}`, `notify`, `appendComment`, `comment`, `tracks[]{track_number, title, carrier_code}`, **`arguments.extension_attributes.source_code`** | E→C | yes | read |
| `order/{id}/invoice` | `capture`, `items[]`, `notify`, `comment`; `arguments.extension_attributes` is **empty** (no source on an invoice) | E→C | yes (whole order, `capture: true`) | read |
| `shipments` / `shipment/{id}` (`sales-data-shipment-interface`) | `order_id`, `increment_id`, `total_qty`, `items[]{order_item_id, qty, sku}`, `tracks[]`, `extension_attributes.source_code` | C→E in AB-26g (a Commerce-side shipment) | not yet | read |
| `invoices/{id}` (`sales-data-invoice-interface`) | `order_id`, `increment_id`, `state`, `grand_total`, `transaction_id`, `items[]`, `can_void_flag`, `is_used_for_refund` | C→E in AB-26g | not yet | read |
| credit memo (`sales-data-creditmemo-interface`) | `order_id`, `invoice_id`, `increment_id`, `state`, `grand_total`, `adjustment_positive/negative`, `items[]` | slice AB-26r, both directions | not yet | read |
| `order/{id}/refund` (offline, from item deltas, `arguments.extension_attributes.return_to_stock_items[]`), `creditmemo/refund` (full entity, `offlineRequested`), `invoice/{id}/refund` (`isOnline`) | the three creation paths | E→C in AB-26r | not yet | read |
| `PUT /V1/creditmemo/{id}` | **cancels** the credit memo, per its own description; not an update | | | read |
| `transactions` (`sales-data-transaction-interface`) | `txn_id`, `parent_txn_id`, `txn_type`, `is_closed`, `order_id`, `payment_id`; **no write path** (created only by payment operations) | C | slice AB-26s reads | not yet | read |

Events (read): `observer.sales_order_save_commit_after` (subscribed, new orders only);
`observer.sales_order_shipment_save_after` exists, **`_commit_after` does not**;
`observer.sales_order_invoice_save_after` exists, its own text says it is "not a reliable
event for external integrations", and no commit-safe alternative is named;
`observer.sales_order_creditmemo_save_after` exists and recommends a `_commit_after` that has
**no entry of its own**; `observer.sales_order_shipment_track_save_after`,
`observer.sales_order_invoice_pay`, `observer.checkout_submit_all_after` also exist. AB-26g
(Commerce-side shipment and invoice → ERP) therefore has to prove its events live in the
scratch workspace before choosing them; the pre-commit `_save_after` events may deliver a
record that is not yet readable.

### SAP side

| Document | Entity | Classic table | Key fields | Label |
|---|---|---|---|---|
| Sales order | `A_SalesOrder` + `A_SalesOrderItem` + `A_SalesOrderScheduleLine` + partners, pricing elements, texts, process flow (22 entities listed, [page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/00d244581efca007e10000000a441470.html)) | VBAK / VBAP / VBEP | header fields (`SalesOrderType`, `SoldToParty`, `TotalNetAmount`, `OverallDeliveryStatus`) **not opened this session**: inferred; item (read, 93 fields): `Material`, `ProductionPlant`, `PricingDate`, `RequestedQuantity`, `DeliveryPriority`, `CustomerPaymentTerms`, `ItemBillingBlockReason`, `PurchaseOrderByCustomer` | mixed |
| Outbound delivery | `A_OutbDeliveryHeader` (name inferred) + `A_OutbDeliveryItem` (name read) | LIKP / LIPS | header (read, 108 fields): `DeliveryDocument`, `DeliveryDate`, `ActualGoodsMovementDate`, `GoodsIssueTime`, `TotalCreditCheckStatus`, `OverallDelivReltdBillgStatus`, `WarehouseGate`; item (read, 132 fields): `ActualDeliveryQuantity`, `GoodsMovementType`, `GoodsMovementStatus`, `Batch`; `ShippingPoint` not seen in the truncated slice: inferred | [header](https://help.sap.com/docs/SAP_S4HANA_CLOUD/588780cab2774a7ab9fffca3a7f919fe/a4e35aa266bb4b11a7d7962979a46dce.html), [item](https://help.sap.com/docs/SAP_S4HANA_CLOUD/588780cab2774a7ab9fffca3a7f919fe/3719380e965045c1a7ec98002a33ae83.html) |
| Billing document | Billing Document Header (read, 97 fields) + Item (listed) | VBRK / VBRP | `BillingDocument`, `BillingDocumentType`, `BillingDocumentDate`, `BillingDocumentIsCancelled`, `CancelledBillingDocument`, `AccountingDocument`, `CompanyCode`, `CreditControlArea`, `CustomerPaymentTerms` | [page](https://help.sap.com/docs/SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/cb3caf09bd6749c59f0765981032b74e.html) |
| Credit memo | a billing document type (cancellation or credit memo request) | VBRK | `BillingDocumentIsCancelled`, `CancelledBillingDocument` (read) | |

The SAP document chain is order → delivery → goods issue → billing document → accounting
document; the mock ERP's chain is order → shipment (`stockSourceCode`) → invoice, with the
accounting document folded into the invoice (`demo-erp/lib/fulfilment.js`). AB-26r adds the
credit memo; AB-26s adds the accounting leg (§8).

### What the mock ERP holds today

`demo-erp/lib/orders.js` `createOrder`: `number` (`SO-…`, no prefix yet), `commerceOrderId`,
`commerceIncrementId`, `partnerId`, `lines[]{item, sku, qty, price, commerceItemId,
shippedQty, closedQty}`, `currency`, `total`, `header` (created / confirmed / cancelled),
`shipments[]`, `invoice`, `creditStatus`, `creditReason`, `creditDecidedAt`, `history[]`; the
five contract status words, `shippingStatus`, `billingStatus` and `overall` are derived on
read. Owner: Commerce for the order's existence, lines and buyer; the ERP for every
document it becomes; both for cancellation (Commerce cancel today reaches the ERP through
the order save event only if it is new, which it is not, so a Commerce-side cancel does not
reach the ERP; recorded as a gap for AB-26g).

---

## 8. Payment / receivable

Join: **Commerce invoice ↔ ERP invoice number** for the document; **company id** for the
balance. Nothing here is built; this section is the inventory AB-26s starts from.

### Commerce side

| Record | Fields | Owner | Label |
|---|---|---|---|
| invoice `state`, `transaction_id`; `POST /V1/invoices/{id}/capture`, `void` | payment captured on the invoice | C (payment gateway) | read |
| `transactions` | `txn_type`, `is_closed`, `txn_id`, `parent_txn_id`; read-only | C | read |
| `payment` on the order | `method`, `po_number`, `amount_paid`, `amount_authorized`, `last_trans_id` | C | read |
| `companyCredits.balance` and the balance operations (§6) | for orders paid on account: `decreaseBalance` with `operationType=3` (Purchased) at order, `increaseBalance` with `4` (Reimbursed) when the buyer pays | **E→C** in AB-26s: the ERP's incoming payment becomes a reimbursement | read |
| `companyCredits/history` | the ledger of those operations, `purchase_order`, `custom_reference_number` (where the ERP payment or invoice number can travel) | C, written by the operations | read |
| `PUT /V1/companyCredits/history/{id}` | body `purchaseOrder`, `comment`; valid only for a Reimburse row | | read |

### SAP side

This was the weakest link in the research. No clean public open-item read API was found:
`API_JOURNALENTRYITEMBASIC_SRV` (read) is restricted by its own page to SAP Analytics Cloud
integration; the SDK entity `OperationalAcctgDocItemCube` (snippet) carries `ClearingDate`,
`ClearingAccountingDocument`, `IsCleared`, `NetDueDate`, which is the right shape. Classic
tables BSID (open) / BSAD (cleared): inferred. The concept in SAP terms: the billing document
posts an **accounting document** with a customer **open item**; an **incoming payment**
clears it (`ClearingDate`); **overdue** is `NetDueDate` (payment terms from `A_CustomerCompany`)
against today.

### What the mock ERP should hold (AB-26s)

On the invoice: `openItem{amount, dueDate (invoice date + payment terms), cleared: bool,
clearedAt, paymentNumber}`; a `payments` collection: `number`, `partnerId`, `amount`,
`receivedAt`, `appliedTo[]` invoice numbers. Owner: the ERP for the open item and the payment;
Commerce's `balance` follows via the reimbursement operation. Reversal: `operationType=6`
(Reverted) exists for the undo; whether it reverses a specific row or only the balance is
**not established** and must be proven live.

---

## 9. Fulfilment source

Join: **`source_code`** (Commerce inventory source) = ERP warehouse `code`.

### Commerce side

| Record | Field | Type | Owner | Mirrored | Label |
|---|---|---|---|---|---|
| `inventory/sources` (`inventory-api-data-source-interface`) | `source_code` (immutable identity) | string | C, join | yes (warehouse `code`) | read |
| | `name` | string | C→E | yes (warehouse `name`) | read |
| | `enabled` (default source cannot be disabled), `description` | | C | no | read |
| | `country_id`, `region`, `region_id`, `city`, `street` (**a single string**, unlike company addresses), `postcode` | | C | no | read |
| | `contact_name`, `email`, `phone` (**not `telephone`**), `fax` | | C | no | read |
| | `latitude`, `longitude` | number | C | no | read |
| | `use_default_carrier_config`, `carrier_links[]{carrier_code, position}` | | C ("reserved for future use") | no | read |
| | `extension_attributes.is_pickup_location_active`, `frontend_name`, `frontend_description` | | C | no | read |
| `inventory/stock-source-links` (`inventory-api-data-stock-source-link-interface`) | `stock_id`, `source_code`, `priority` | | C | no (slice 9 shows which website a source serves) | read |
| `inventory/get-sources-assigned-to-stock-ordered-by-priority/{stockId}` | | C | no | read |

**No DELETE on a source** (read): sources are disabled, never deleted or renamed. A demo reset
that "removes" a per-ERP source can only disable it; the demo-setup guide must say so.

### SAP side

Plant (T001W) and storage location (T001L) as organizational master data; the product's plant
and storage-location views are `A_ProductPlant` and `A_ProductStorageLocation` (§3). Shipping
point (TVST) is inferred, not read. The mock ERP's warehouse is SAP's plant (a shipping
point per plant is one more level than the demo needs).

### What the mock ERP holds today

`warehouses[]{code, name, quantity}` per product, derived from Commerce source items and source
names (`mirror.js` `warehousesFor`, `commerce.js` `listSources`); a shipment's `warehouse`
becomes `stockSourceCode` on the event. Which ERP owns a source (the two-pair case) is an
integration setting, not an ERP field (business-structure plan, ownership modes).

---

## Cross-cutting findings

1. **The seller's legal identity is not readable over REST in either system.** Commerce's Store
   Information and SAP's company code master both appear only as configuration or foreign keys.
   Slice AB-26j must type those values into the per-website settings; there is no API to read
   them from (both read as absences).
2. **Four Commerce events the plan assumed do not exist by the assumed names**: the shipment
   and invoice `_commit_after` events, the credit-memo `_commit_after` entry, and any MSI
   source-item event. AB-26g and AB-26h are corrected to "prove the event live before
   subscribing"; the fallback for stock is the minute re-read.
3. **Purchase orders and requisition lists are GraphQL-only** for reads. If slice 9's Buying
   organization card is to show them, it needs a GraphQL read, not REST. Recommendation: leave
   them off the card in the first cut and record the gap on AB-26j.
4. **Credit in Commerce is two numbers, in the ERP one.** Commerce keeps a `balance` (what is
   owed) beside the limit; the ERP keeps exposure (open orders). They are different concepts and
   slice 9 must label them as such rather than compare them.
5. **The mock ERP mirrors the buying organization thinly**, and that is right: SAP's own sold-to
   layer is one record per customer per sales area. The people, roles and catalog of a company
   stay in Commerce and are shown, not mirrored.
6. **Two SAP API names were wrong in earlier notes** (scales entity, credit API); corrected
   above.

## Field ownership summary (the rule slice 9 renders)

| Concept | Commerce owns | ERP owns | Both, with the rule |
|---|---|---|---|
| Buying organization | identity, people, catalog, group, legal fields | payment terms, sales-org membership | block: Commerce's boolean is the master on import; the ERP's level writes back as the boolean |
| Selling organization | websites, stores, views, currency | sales organization, company code, prefix | the per-website setting is the join and is typed once |
| Sellable item | SKU, name, type, variants, website assignment | unit, list price after import | stock (see Inventory) |
| Price | none persisted; cart-time application | every condition | the quote is the ERP's; Commerce applies it |
| Inventory position | sources, stocks, salable quantity | committed, available | source-item quantity: last writer wins in either direction, ledgered for reversal |
| Credit | balance, history | exposure, held orders, decisions | limit: import from Commerce, write back from the ERP |
| Order | the order, its lines, the buyer | every document after the order, the credit decision | cancellation (Commerce-side cancel does not reach the ERP today) |
| Payment / receivable | capture, transactions, company balance | open item, incoming payment, clearing | the balance follows the ERP's payment through a reimbursement |
| Fulfilment source | the source record | the warehouse's ERP name and owning ERP | a shipment names one source; Commerce records it |

## What could not be established

From the Commerce side: purchase-order and requisition-list GraphQL coverage end to end;
company address book on PaaS; whether `observer.sales_order_creditmemo_save_commit_after` is
subscribable; PaaS eventing coverage (the reference is scoped to Cloud Service); enum values for
negotiable-quote `status`, tier-price `price_type`; `companyCredits/history/{id}` GET or
DELETE; the ACCS-specific schema (`accs-schema.yaml`) was not read.

From the SAP side: a standalone company-code master entity; sales office and sales group
technical names; the units-of-measure field list; exposure and utilisation field names on the
credit API; `ShippingPoint` on the delivery header; a non-restricted open-item API with
`NetDueDate` and `ClearingDate`; classic table names for pricing conditions and the credit
segment; the sales-order header field table (only the entity list and the item were opened).

From the codebase: nothing; the files are the source. What the pair does not do yet is listed
per concept above and is already a slice each (AB-26f hold, AB-26g Commerce-side documents,
AB-26h per-source stock, AB-26j organization, AB-26r credit memo, AB-26s payment).

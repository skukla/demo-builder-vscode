# One shared catalog per priced company: does it scale to thousands? (AB-16m)

Researched 2026-10-03. Sources: Adobe Experience League only (cited per claim). No Commerce
instance was called.

## Short answer

Not to thousands. Adobe documents a hard ceiling of **1,000 customer groups** for Live Search
(the boundaries page that covers Live Search and Catalog Service). Every shared catalog creates its
own customer group, so one catalog per priced company caps out at 1,000 priced companies.
JustRite's ~3,000 accounts are about three times that. Adobe also says customer groups and shared
catalogs act as multipliers on "effective SKUs", and advises cutting them; it gives no other number.
Commerce itself puts no documented limit on how many shared catalogs you can create. The scalable
answer Adobe documents is ACO price books assigned per customer, but on ACCS without ACO, pricing is
by customer group and shared catalog. So for ACCS the answer is fewer catalogs: one per ERP price
group, plus exceptions.

## Current design (code)

- `o2r/commerce-erp-integration/src/lib/commerce-tier-prices.js` (`sharedCatalogGroupOf`): a company
  gets ERP prices only if it sits in a custom shared catalog's customer group. Prices are written as
  tier prices (`POST V1/products/tier-prices`) for that group on website 0. A company in General (the
  public catalog's group) gets none.
- So the number of customer groups = 1 (General) + not-logged-in + the number of priced companies.

## 1. Documented limits: shared catalogs, customer groups, tier-price rows

| Claim | Source |
|---|---|
| "You can create as many custom shared catalogs as you need." Only one public shared catalog at a time. | https://experienceleague.adobe.com/en/docs/commerce-admin/b2b/shared-catalogs/catalog-shared |
| When shared catalogs are enabled, they fully control category permissions; existing group permissions are ignored. | same |
| "Both customer groups and shared catalog function as multipliers for the number of effective SKUs in a store." Advice: "Use alternative product features for custom pricing to replace shared catalog and customer groups multipliers" and reduce "the number of websites, customer groups, shared catalogs". Labelled for Commerce on cloud infrastructure (PaaS) and on-premises, all versions. No numbers. | https://experienceleague.adobe.com/en/docs/commerce-operations/implementation-playbook/best-practices/planning/catalog-management |
| Same page: too many attributes or options "can block bulk actions ... assigning custom prices to multiple products in a shared catalog". | same |
| **"Live Search can support up to 1,000 customer groups."** (Page "Boundaries and limits" for Live Search and Catalog Service; last update 2026-09-02.) | https://experienceleague.adobe.com/en/docs/commerce/live-search/boundaries-limits |

No Adobe source found gives a limit on tier-price rows (per product, per group, or total), or a
separate ACCS figure for shared catalogs or customer groups. Non-Adobe figures seen and not used:
"keep shared catalogs under 50", "a few hundred catalogs" (partner/blog material).

## 2. How Catalog Service / Live Search index per-group prices and permissions

| Claim | Source |
|---|---|
| Catalog Service has supported "Customer group prices and price ranges" since September 2022; shoppers with no group get a fallback default price. | https://experienceleague.adobe.com/en/docs/commerce/catalog-service/release-notes |
| Tier pricing support added 2025-09-08; it returns "only tiers whose discounted price is lower than the product's minimum final price." | same |
| The storefront picks the group's prices with the `Magento-Customer-Group` request header. | https://developer.adobe.com/commerce/webapi/includes/graphql/catalog-service/headers |
| SaaS Data Export ships product prices, category permissions and product permissions as feeds; a "Scopes" feed carries customer groups. | https://experienceleague.adobe.com/en/docs/commerce/saas-data-export/overview |
| Live Search: "Tier Pricing is not supported in the Live Search field and Product Listing Page Widget"; category facets may show categories a group cannot see; products not in a shared catalog are not displayed. | https://experienceleague.adobe.com/en/docs/commerce/live-search/boundaries-limits |
| SaaS price indexing moves price calculation to Adobe's cloud, aimed at merchants "with multiple websites or customer groups". No numbers. | https://experienceleague.adobe.com/en/docs/commerce/price-indexer/price-indexing |

Inference (not stated by Adobe): prices and permissions are exported per customer group, so the index
grows with the group count. The 1,000-group ceiling is the only documented bound.

## 3. What Adobe offers for customer-specific pricing at scale

| Claim | Source |
|---|---|
| ACO price books "let you define product prices for a catalog source across different customer tiers and markets"; up to 3 levels; currency set on the fallback only. | https://experienceleague.adobe.com/en/docs/commerce/optimizer/setup/pricebooks |
| "Customers can have their own assigned Price Books, which are used if they fall within the allowed Price Books for the catalog view." The storefront sends `AC-Price-Book-ID`. | https://experienceleague.adobe.com/en/tools/commerce-storefront/setup/configuration/price-book-setup/ |
| Same page: "If you are using Adobe Commerce as a Cloud Service or Adobe Commerce PaaS without Optimizer, this feature does not apply ... Adobe Commerce as a Cloud Service uses customer groups and shared catalogs for pricing instead of Price Book IDs." | same |
| ACO limits: 250K SKUs per catalog source, 50 catalog sources, 10 policies per catalog view, 10 discounts per price record, 1K updates/min and 100K/day ingestion; no limit listed on the number of price books. | https://experienceleague.adobe.com/en/docs/commerce/optimizer/boundaries-limits |
| The ACO Connector (Commerce to ACO) is PaaS-only; it makes "one base price book and one child price book for each customer group" per website, and "does not sync B2B shared catalog or company-assignment configuration". | https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/overview ; https://experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/reference/field-mapping |

ACCS today has no documented price-book path; even the connector maps groups one-to-one into price
books, so it does not remove the group count.

## 4. What a merchant with thousands of B2B accounts does

Adobe's only written guidance is the playbook line: replace shared-catalog and customer-group
multipliers with "alternative product features for custom pricing", and cut the number of groups and
catalogs. No specific feature is named. Adobe's B2B marketing page sells "customer-specific price books
and catalogs" (https://business.adobe.com/products/commerce/b2b-commerce-optimization.html), which
points at ACO. No Adobe-cited partner pattern was found.

## Could not establish

- Any Adobe limit on tier-price rows.
- Whether the 1,000-group ceiling also binds Catalog Service price lookups, or only Live Search.
- Whether ACCS has its own published guardrails on shared catalogs or customer groups.
- Sync or export time at hundreds or thousands of groups.
- Whether an ACCS backend can be combined with ACO price books today.
- How many of a real client's companies have their own price list rather than belonging to an ERP
  price group — this decides whether the price-group design stays under 1,000.

## Recommendation

- **Demo: fine as is.** A few companies, far below 1,000 groups.
- **To a customer asking about scale:** one shared catalog is one customer group; Adobe documents up to
  1,000 customer groups for its search layer and advises keeping groups and catalogs down. At thousands
  of accounts: one catalog per ERP price group, and company-specific catalogs only for companies with
  their own price list — which mirrors the ERP's own precedence. Do not promise one catalog per account
  at thousands.
- **PL-60 / ACO** does not change the ACCS design: per-customer price books are an ACO feature, and ACCS
  without ACO uses groups and shared catalogs. It belongs to AB-14 (ERP prices on an ACO storefront).
- **Next:** design the price-group alternative before a real customer at this size. The price-group
  catalog's rows must be owned by the price group, not by each company's ledger of what it wrote.

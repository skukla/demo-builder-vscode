# How products reach the storefront on ACCS, and where to look when they do not

Written 2026-10-01 at the owner's request ("read the docs to try to figure out how to
research the propagation of products. After the backend indexes, products should show"),
while 96 AccuformNMC products created over REST sat invisible to the Justrite storefront
two hours after their stock rows landed. Facts are tagged by source; measurements are
from the shared ACCS sandbox (tenant `UoGYsHrcxMyeoVd2zUktZi`, website `justrite`).

## The pipeline (per Adobe's docs)

1. **Commerce indexers build the feeds.** The SaaS Data Export extension keeps a feed
   table per entity (`cde_products_feed`, `cde_product_attributes_feed`, prices, variants,
   scopes…). Their indexers must run in *Update by Schedule*; cron then submits changed
   feed items to the Commerce Services endpoint. ("Data sync is not running on schedule",
   SaaS Data Export troubleshooting scenarios.)
2. **Catalog Service receives the feed** and answers `products(skus:)` from it. A
   configurable's effective status and stock come from its children: "at least one
   product variant must be enabled … assigned to the correct website and store view", else
   the parent is treated as disabled in the services. (Same page, "Configurable or bundle
   product missing".)
3. **Live Search streams from Catalog Service.** After the initial index (up to 60 min),
   "new products added to the catalog" and attribute changes are incremental: "up to 15
   minutes for a product update to become available in Live Search". Live Search does not
   index products set to *Not Visible Individually*, and `in_stock` is an indexed field
   per store view. (Live Search > Indexing.)
4. **The storefront's listing and search run on Live Search** (`productSearch`); product
   pages and the catalog pre-warm resolve SKUs through Catalog Service and the search.

Timing claims, per the docs: incremental product updates reach Live Search within ~15 min;
after a forced resync "it can take up to an hour"; the catalog sync runs hourly on the
Catalog Sync dashboard's model.

## Where to look (Admin, Commerce as a Cloud Service)

- **System > Data Transfer > Data Feed Sync Status.** Per feed: source records, sent,
  failed, and the indexer's health (Ready / Reindex required / Processing; changelog
  backlog; mode — *Update on Save* is flagged as wrong). Per item: SKU + store view,
  export status (Submitted / Failed-retry / Failed-attention / Awaiting submission), Last
  Sync Date, the error, and a **Request ID** for Support. Mass action: **Schedule
  Resync**. The page states export only: "A success status … does not confirm that data
  is available in connected services."
- **Data Management Dashboard** (System > Data Transfer; the renamed Catalog Sync
  dashboard). Confirms downstream availability, lists synced products, and shows each
  product's **synced JSON** — the one place to read what Catalog Service actually holds
  for a SKU (its `in_stock`, visibility, website scope) without a database.
- **The discrepancy recipe** (troubleshooting scenarios): if the JSON does not match the
  catalog, "make a minor edit to the product … to force the change to be detected", then
  wait for or trigger a resync. On PaaS the CLI is `bin/magento saas:resync --feed
  products`; on ACCS the Admin page is the only lever.

## What was measured here (2026-10-01, 00:30–02:45Z)

| Check | Result |
|---|---|
| `products(skus:["ACC-MDAN","51BSCB"])` with the Justrite headers | both returned; the Accuform sign with its three formats |
| `products(skus:["ACC-MDAN"]) { inStock }` | **false**, two hours after stock rows; Justrite's `51BSCB`, `NFPA_PRINTED_1200`: true |
| `productSearch(phrase:"")` on `justrite_us` | **0** (bodea_us 30, citisignal_us 39, base: "No index was found") |
| REST `inventory/get-product-salable-quantity/ACC-MDAN-AL/3` (Justrite Stock) | 100 |
| REST `inventory/export-stock-salable-qty/website/justrite` | all 72 Accuform variants qty 100; the 24 configurables 0 (expected for a parent) |
| REST `stockStatuses/ACC-MDAN-AL` (legacy, Default Stock) | qty 100, status 1 |
| REST `stockStatuses/ACC-MDAN` (the configurable) | qty 0, **status 0**; Justrite's `NFPA_PRINTED_1200`: status 1 |
| Bodea control `stockStatuses/accesspoint` | status 0 while Catalog Service says in stock → Catalog Service does NOT read the legacy status |

So Commerce's own inventory views all say the Accuform variants are salable on the Justrite
website, and Catalog Service still holds the configurables as out of stock. The one thing
that changed for these products after creation is stock (rows added afterwards, a zero
Default Source row deleted, then a bulk re-save of all 96). Everything points at the FEED
not having re-exported the products since: either the changelog has not been processed
(indexer/cron — "Awaiting submission"), or the parents' rows were not marked changed by
the children's stock change.

## The next three checks, in order

1. **Data Feed Sync Status → Products feed → Details**, filter SKU `ACC-MDAN` and one
   variant: what is the Export Status and the Last Sync Date? Anything after 01:50Z (the
   bulk re-save) means the export ran and the stale `in_stock` is downstream; anything
   earlier means the export has not picked them up. Note the Request ID either way.
2. **Data Management Dashboard → ACC-MDAN → synced JSON**: read `in_stock` and the
   children's. That is Catalog Service's truth and settles whether the gap is before or
   after the service.
3. **Schedule Resync** on the 96 items (or "make a minor edit"), then re-run the two
   GraphQL reads here after 15–60 minutes.

If (1) shows the items submitted with fresh timestamps and (2) still reads `in_stock:
false`, the index is the problem and the KB's last step applies: a Support request to
reindex Live Search, quoting the Data Space ID (System > Services > Commerce Services
Connector). The republish code already names that case.

## What this means for the extension

- **The pre-warm and the listing pages depend on Live Search, not on Catalog Service.**
  A fresh catalog is invisible to both until the feed and the index catch up, however
  correct Commerce is. The pre-warm's "Catalog returned 0 SKUs" should say that, and name
  the Admin page, rather than reading as "nothing to do".
- **A datapack/bulk load must end with the feed, not with the REST writes** (AI-10): load,
  then verify `productSearch` returns the count on the target store view, and tell the
  SC where to look when it does not.
- The ERP-warehouse model (a stock per website, products moved off the Default Source)
  is what the checklist asks every SC to do; whether Catalog Service follows that stock
  promptly is exactly what this case will tell us. Resolution to be logged on AB-53.

Sources: Live Search > Indexing; Live Search catalog not synchronized (KB); Data Feed Sync
Status monitoring; Catalog Sync / Data Management Dashboard; Troubleshooting scenarios for
SaaS Data Export — all Experience League, read 2026-10-01.

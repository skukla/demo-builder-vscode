---
name: author-commerce-data
description: Builds a demo's catalog data in the project's Commerce store from a brief or a spreadsheet — attributes, categories, products, variants, stock, prices, B2B shared catalogs — and checks the shopper can see it. Use when the user asks to create, load, add or fix products, categories or catalog data for a demo, or when products exist but a storefront or a buyer cannot see them. Read it before the first write: Commerce drops several mistakes silently.
---

# Author Commerce demo data

Two jobs look alike and are kept apart:

- **Sharing finished data** with other SCs is a datapack. Use `import-datapack` (import, reset,
  export). A datapack is versioned and removable; prefer it whenever one fits the brief.
- **This skill** is building or fixing data in THIS project's store, from a brief ("three brands,
  about forty products, contract prices for two companies") or from a spreadsheet a colleague sent.

Every write goes through `write_commerce_rest` (confirm:true, the user sees a dialog), every read
through `run_commerce_rest` and `run_commerce_query`. They reach Commerce as a Cloud Service
(ACCS) backends only; on a PaaS backend they refuse, and so does this skill.

## Step 0 — show the plan before writing anything

Before the first write, tell the user what you will create, as counts and names: attributes and
their options, the attribute set, the category tree, products per category, variants, stock
sources, price rows, shared catalogs and which companies they serve. Writes change a live store
that people demo from. A plan the user has read costs a minute; a wrong catalog costs an evening
of deletes.

Read what exists first (`run_commerce_rest` with `fields=` to keep answers small): the attribute
sets, the category tree, the websites and store views, the sources and stocks. Reuse what is
there; create only what is missing.

## The order of operations

Each step depends on the one before it. Out of order, Commerce mostly answers 200 and keeps less
than you sent.

1. **Attributes** and their options.
2. **Add each attribute to the attribute set** the products use
   (`POST products/attribute-sets/attributes` with the set, a group id, the attribute code and a
   sort order). Skip this and a select attribute's value is dropped on save with no error — and a
   configurable child then fails to attach because its variation value never saved.
3. **Categories**, parents before children.
4. **Sources and stocks** if the brief has more than one warehouse or website (a source per
   warehouse; a stock per website).
5. **Products**, simple ones first. Load many in ONE call: `write_commerce_rest` with `bulk:true`
   and an ARRAY body (e.g. `PUT products/bySku`, one request body per product). It answers a
   `bulk_uuid`; poll `run_commerce_rest "bulk/<uuid>/status"` until every operation is complete.
   One product per call takes 13–25 seconds each on ACCS — a forty-product catalog is half an
   hour that way, and seconds in bulk.
6. **Variants**: configurable parents, their options, then link children.
7. **Stock** per source (`inventory/source-items`, an array in one call).
8. **Prices**: tier and customer-group prices take an array in one call
   (`products/tier-prices`).
9. **B2B**: shared catalogs, their products and their categories, and the companies they serve.

## Rules Commerce will not tell you about

- **`category_links` need a `position`.** `{"category_id":"12"}` fails the whole product with a
  bare "The product was unable to be saved."; `{"category_id":"12","position":0}` saves.
- **There is no PATCH.** Update with PUT. For a B2B company, PUT needs the FULL record (group,
  sales rep, super user and the whole address) — read it, change one field, send it all back.
- **A product created over REST gets a Default Source row** (quantity 0). On a website served by a
  different stock that row can make the storefront report the product out of stock. Send no
  `stock_item` on create and set stock per source, or delete the zero rows afterwards.
- **Some reads lag the index.** `categories/{id}/products` and
  `configurable-products/{sku}/children` can read 0 right after a write that landed. Check the
  product's own `category_links`, or re-send the child link: "The product is already attached."
  is proof it is there.
- **Product images may be refused.** A store with the AEM Assets integration answers 403 to
  `products/{sku}/media` and drops gallery entries on create. Images then belong in AEM Assets,
  not in the product — say so to the user rather than retrying.
- **Writes can be slow.** A single product or company PUT can take minutes on ACCS. A timeout is
  not proof it failed: read the record back before writing it again.

## B2B: a category nobody was granted is invisible

With B2B on, a category is visible to a customer group only when a shared catalog serving that
group grants it. A new category, or a moved one, is denied by default — products in it still read
fine by SKU and are missing from every search and listing.

Whenever you create or move categories: assign them to every shared catalog that should see them
(the public one for guests, and each company's own), then verify per group (next section).

## Check that the shopper can see it

Writes succeeding is not the goal; the storefront showing the data is. After each phase:

- **Read back by SKU** (`run_commerce_rest "products/<sku>"`) and count per website.
- **Ask the storefront's own catalog** with `run_commerce_query` — once as a guest, and once per
  customer group that matters (`customerGroupId`, e.g. a company's shared-catalog group). Search
  for the product AND look it up by SKU.

Reading the two answers together names the cause in one step:

| By SKU | In search | Most likely |
|---|---|---|
| found | found | done |
| found | missing for one group | that group's shared catalog does not grant the category |
| found | missing for everyone | category or visibility; then the catalog feed |
| missing | missing | not synced to the storefront catalog yet — wait, then check the product's websites |

Filters in `run_commerce_query` take option LABELS (`"Catalog, Search"`), not the numbers stored
in Commerce (`4`). A numeric filter returns nothing, with no error.

## When an answer starts "Error:"

The tools mark it as an error. A refusal (no confirm, no sign-in, a PaaS backend) wrote NOTHING —
never count it as done, and never retry a write you have not read back. An expired Adobe sign-in
is a refusal: ask the user to sign in, then continue from the last step you verified.

## Undoing it

Everything this skill creates can be deleted with `write_commerce_rest` DELETE, one record at a
time (`products/<sku>`, `categories/<id>`, …), children before parents. Keep the list of what you
created as you go and offer it to the user at the end — it is the undo list. A datapack, by
contrast, is removed in one call (`reset_datapack`); that is the reason to prefer one when it fits.

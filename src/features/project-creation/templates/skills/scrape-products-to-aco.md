---
name: scrape-products-to-aco
description: Reads the products on a public website's listing page with the Playwright browser and saves them as an Adobe Commerce Optimizer (ACO) datapack in the user's datapack library, for review before loading. Use when the user wants an ACO catalog, ACO datapack or sample products "from a website", "from this URL" or "like this shop". Never invents silently — every value the page did not state is marked as proposed.
---

# Scrape a website's products into an ACO datapack

The user names a page that lists products (a category or collection page). You read the
product cards with the Playwright browser, then save them with one Demo Builder tool,
`make_aco_pack_from_products`, which makes the ACO pack rows and puts the pack in the
user's **datapack library**. Nothing reaches ACO or Commerce here; the user reviews the
pack in the library first, and loads it later.

## Scope and permission

Read only public pages the user can use for a demo: their own site, a customer's site they
are demoing to, or a public shop page. Never sign in, never get past a paywall or a bot
check. If the page needs a sign-in or blocks the browser, stop and say so.

Ask how many products they want if they did not say: **10 by default, 100 at most.**

## No browser tool in this chat?

The `browser_*` tools come from the Playwright MCP server, which a project's own folder
carries. A chat opened somewhere else may not have it. Then fetch the listing page's HTML
with your web-fetch tool (or `curl -sL '<url>'`) and read its JSON-LD (step 2) from the
`<script type="application/ld+json">` blocks. Tell the user you read the page without a
browser: a shop that draws its cards with JavaScript and publishes no JSON-LD cannot be
read this way, so say that rather than guess at products.

## 1. Open the listing and let it load everything

1. `browser_navigate` to the URL.
2. Scroll until the page stops growing, **at most 12 times**:
   - `browser_evaluate` with
     `() => { window.scrollTo(0, document.body.scrollHeight); return document.body.scrollHeight; }`
   - `browser_wait_for` with `time: 0.5`
   - stop when the height it returns is the same as the last one.

   Do not follow "next page" links: one listing page is the unit. Say so if the page has more.

## 2. Prefer what the page itself states

**First, read schema.org JSON-LD.** Many shops publish their products as structured data,
and it is the page stating its own values. `browser_evaluate` with:

```js
() => [...document.querySelectorAll('script[type="application/ld+json"]')]
  .map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
  .filter(Boolean)
```

Look for `@type: "Product"` objects: at the top level, inside an `ItemList`'s
`itemListElement` (each `item`), or inside `@graph`. Take `name`, `image` (a string, the
first of an array, or an `ImageObject`'s `url`), `description`, `sku`, `url`, `category`,
and from `offers` (an object or the first of an array) `price` and `priceCurrency`
(an `AggregateOffer` has `lowPrice` instead). Products read this way are `readFrom: "json-ld"`.

**Otherwise, read the visible cards.** `browser_snapshot`, then find the repeated product
cards in it. For each card take the name and its image; also its price, its link, and any
badge or text that states a SKU. The snapshot names elements, not image addresses, so read
the image and link URLs with `browser_evaluate`, made absolute:
`new URL(img.currentSrc || img.src, location.href).href`. These are `readFrom: "page"`.

A card with **no name or no http(s) image is left out.** ACO fetches each image from its
URL, so an inline SVG or a `data:` image cannot be used. Say how many you left out and why.
A product with no link of its own keeps the listing URL as its `url`.

## 3. Options, only if asked

If the user wants sizes or colours, open each product's `url` and read the option
dimensions the page offers: `attributes: [{ name: "Size", values: ["S", "M", "L"] }]`.
These are options, not variants: never make up variant SKUs.

## 4. Never invent silently

Every value the page did not state goes in that product's `proposed` list.

| Field | When the page does not state it |
|---|---|
| `price` | Propose a reasonable price for that kind of product, and add `"price"` to `proposed`. Never leave a proposed price unmarked |
| `currency` | Use the pack's currency (ask, or USD), and add `"currency"` to `proposed` |
| `sku` | Leave it out: the tool makes one from the name (8 characters) and marks it proposed itself. If you make one up, add `"sku"` |
| `description` | Leave it out. Do not write one |
| `categories` | Take them from breadcrumbs or the listing's own heading. If you inferred them from anything else, add `"categories"` |

Prices are numbers with no currency sign (`129.5`, not `"$129.50"`). One pack has one
currency: if the page shows several, ask which one.

## 5. Show the user, then save

Before saving, show a short table: name, price, SKU, and which values were proposed. Ask
whether to go ahead. Then call `make_aco_pack_from_products` with `confirm: true`:

| Argument | Value |
|---|---|
| `datapackName` | `aco_` plus the site in lower case, e.g. `aco_acme_shop` |
| `version` | `v1`, or the next free one if the library already has it |
| `displayName` | what the user will recognise, e.g. `Acme shop (website)` |
| `locale` | the page's language, from `<html lang>`, e.g. `en-US` |
| `currency` | the pack's one currency, e.g. `USD` |
| `products` | each `{ origin, data: { name, image, … }, proposed, readFrom }` |

Leave `priceBookId` out unless the user names one (prices then go in the `main` book).

## 6. Report

Pass on the tool's `note`, then list what the answer names: the products with proposed
values (`proposed`) and those with no price (`unpriced`). Tell the user the pack is in
their datapack library to review, and that **`delete_library_datapack`** (with the same
`datapackName` and `version`) removes it again.

If the tool refuses, its error names the products and the reason (two products stating
one SKU, a price in another currency, an image that is not a URL). Fix those and call it
again; do not drop products silently to make it pass.

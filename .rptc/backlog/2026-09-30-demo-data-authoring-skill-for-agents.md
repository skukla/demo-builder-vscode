---
id: AI-10
kind: feature
area: ai
needs: []
value: high
status: active
---

# A demo-data authoring skill: an SC's agent builds and loads the demo data from a brief

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-09-30. Owner: "I wonder if we can add skills to the demo builder MCP for creating and
importing demo data as we are having to do. My thought is that we could somehow come up with a
prompt that an SC can use to get to the result that they would need using an agent."

## What this session did by hand, and would be the skill

Loading Khalil's Justrite spreadsheet (43 products, 15 categories, a variant attribute, images by
asset URL) and making the AccuformNMC catalog (24 signs × 3 formats, drawn images) took three
Python scripts against `write_commerce_rest`, and cost three silent Commerce quirks before the
first product landed (`reference_commerce_product_create_gotchas`): `category_links` need a
`position`; a select attribute silently drops values unless it is in the product's attribute set;
there is no PATCH; `/children` and `categories/N/products` reads lag the index. None of that
belongs in an SC's head. It belongs in a skill the generated AI bundle ships, so the SC's agent
(Claude Code, Cursor, Codex — the bundle already targets all three) can do it from a brief.

## Shape (to design, not decided)

- **Input:** a brief — the brand(s), the categories, roughly how many products, the price band,
  which website, which ERP owns what (the `brand` / `erp_owner` model, AB-52) — or a
  spreadsheet/CSV a colleague supplied.
- **The skill** (in `skillsWriter.ts`'s always-on set, gated like the others by what the project
  builds): the order of operations (attributes → attribute set → categories → sources/stocks →
  products → variants → images → prices → companies/catalogs), the gotchas above as rules, the
  MSI model (a source per ERP, a stock per website), and the checks after each phase (read back
  by SKU; count per website; the index lag).
- **Tools it needs that do not exist yet:** an image upload (`products/{sku}/media` with a local
  file or a generated sign), a bulk-safe product write (the 300 s ACCS PUT latency is real), and a
  dry-run/plan step so the SC sees the shape before anything is written. Everything else is
  `run_commerce_rest` / `write_commerce_rest` already.
- **A worked example** the skill cites: the Justrite + AccuformNMC load (AB-52), scripts kept in
  the repo as the fixture, not in a scratchpad.
- **The prompt** the owner wants: one sentence an SC pastes — "Build the demo data for
  <brand brief> on the <website> site; the <ERP> owns <lines>" — and the skill carries the rest.

Related: `ai-context-authoring` (four gate seams, AI_CONTEXT_VERSION bump); the data-installer
service owns DATAPACKS (published sample data); this is the authoring side that produces one.

## Shipped so far
- 2026-09-30  2026-09-30, from loading the AccuformNMC catalog by hand: write_commerce_rest takes one product per call and ACCS saves a product in 13–23 s, so 96 creates + 43 tags ran ~35 min. Commerce's async bulk API (POST /async/bulk/V1/products, PUT /async/bulk/V1/products/bySku) is not reachable through the tool (it prefixes /V1) and is unverified on ACCS. First task for the demo-data skill: give the tool (or a sibling) the bulk prefix, prove it on the sandbox, and use it for product loads. Source items, stock links and shared catalogs already go in one call each.
- 2026-09-30  Owner 2026-09-30: product-by-product loading 'doesn't bode well for a quick action for an end user'. The SC-shaped path is a DATAPACK through the Data Installer (bulk, versioned, removable with the existing tool); the bulk REST endpoint is the fallback for ad-hoc loads. Also learned: this ACCS instance refuses POST products/{sku}/media ('disabled by AEM Assets Integration') — product images go through the bound AEM Assets author, so a datapack for it must carry assets for AEM, not gallery entries.
- 2026-10-01  2026-09-30 PROVEN on the ACCS sandbox: write_commerce_rest bulk:true PUT products/bySku with 43 request bodies — one 23 s call, bulk_uuid answered, all 43 operations status 1 (complete) within 15 s ('Service execution success ProductRepositoryInterface::save'). The ACCS route is V1/async/bulk/<path> (the PaaS order async/bulk/V1 404s empty at the gateway). So a 96-product load is one call plus a status poll, not 35 minutes. The datapack route remains the SC-shaped packaging; the bulk route is what it (or any ad-hoc load) should call.
- 2026-10-01  Loader rule learned 2026-10-01: a REST product create leaves a Default Source row (qty 0, status 0) on every product; on a website served by another stock that row makes Catalog Service report the product out of stock (hypothesis under test on AB-53). A bulk load must either send no stock_item or delete the zero rows afterwards with one inventory/source-items-delete call.
- 2026-10-01  2026-10-01, owner: two purposes, kept apart — SHARING finished work is the datapack (DI-1/DI-3); THIS item is an agent working Commerce data without hitting walls. Learned from the Justrite tree restructure, for this item: (1) a read-only visibility check — productSearch once per customer group beside a Catalog Service lookup by SKU — names permissions vs stock vs feed in one call; the 'stuck index' was B2B category permissions for most of a day; (2) a new category is invisible on a B2B website until a shared catalog grants it — the skill must grant and verify per group (EDS-24 has the measurements); (3) write_commerce_rest's 'requires confirm' refusal and an expired Adobe session both answer as plain text, so a script read both as success — tool answers that refuse must be marked errors; (4) category product links went one call each (25 calls, ~15 min) — prove the bulk route for categories/{id}/products.

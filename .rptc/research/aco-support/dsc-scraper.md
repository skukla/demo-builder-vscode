# DSC 3.0's product scraper, and what Demo Builder rebuilds of it

2026-10-31, for PL-60 slice A ("From a website", `.rptc/plans/aco-support/overview.md`).

## Provenance — read this first

**Everything in "What it is" and "How it works" below is reported by FluffyJaws, from its read of
the source of `Adobe-CoreTech/livedemos-scraper`. None of it is verified by us.** That repository
is behind Adobe's VPN / IP allow list and could not be opened from here. What it cites is the
repository, the service host, the MCP tool name and the Playwright call; no file paths inside the
repository reached us. Treat each claim as a lead to check when the repo is reachable, not as a
fact.

The one thing we did observe ourselves is the 401s in "Why we rebuild instead of calling it".

## What it is (FluffyJaws reports)

- A separate service, "LiveDemos Scraper", at `livedemos-scraper.adobe.io`, IMS-authenticated.
- Exposed to DSC's agent as the MCP tool `SalesVelocityCT_Products_Scraper`.
  - Input: `url`; `maxProducts` (1–100, default 10); `scrapeAttributes`; `locale`; `region`.
  - Output: `{ products: ScrapedProduct[] }`.
- `ScrapedProduct` = `{ origin, data: { name, description, price, currency, categories, sku,
  image, url, attributes[], downloadUrl? } }`.

## How it works (FluffyJaws reports)

1. Playwright Chromium, with a stealth plugin, opens ONE listing URL.
2. It scrolls up to 12 times, waiting 500 ms each time, until the page stops growing.
3. It takes a Playwright ARIA snapshot (`ariaSnapshot({ mode: 'ai' })`) of `main`, else
   `[role=main]`, else `body`, plus the page title, URL and meta description.
4. It asks an LLM (Adobe LLM Gateway, model from config) to extract the visible product cards,
   against a Zod schema:
   - required: `name` and an image reference;
   - optional: description, a numeric price, currency, categories, sku, a link reference.
5. The prompt tells the model to **propose a reasonable price when none is visible**, to **use
   USD when no currency is given**, and to **generate a unique SKU of at most 8 characters** from
   the name or a visible id.
6. References are resolved against the live DOM: an image's `currentSrc`/`src`, made absolute;
   data URIs; an inline SVG serialised. **A product with no image is dropped. A product with no
   link gets the listing URL.**
7. No pagination, and no JSON-LD or OpenGraph parsing.
8. With `scrapeAttributes`, it opens each product's URL and asks the LLM for option dimensions
   (size, colour): attributes, not concrete variant SKUs.
9. Images: the original URL is kept, and a copy is re-hosted for 24 hours as `downloadUrl`.

## What DSC does with the result (FluffyJaws reports)

DSC maps the scraped fields into an ACO pack (categories, a price book, products, prices) and
imports it through the Data Installer's `process-aco-datapack`. The SC types nothing: DSC
forwards the user's IMS token, and the target is chosen as `commerce_instance`.

## Why we rebuild instead of calling it (observed by us, 2026-10-31)

Tried read-only with our own Adobe sign-in (the aio CLI token):

- the scraper answered **HTTP 401 "Invalid access token"**;
- ACO's admin GraphQL answered **401** too.

So Demo Builder cannot call the scraper on the SC's behalf, and rebuilds the same job from parts
every project already has.

## What Demo Builder builds (slice A)

| DSC step | Demo Builder |
|---|---|
| Playwright + stealth, one listing URL | The project's own agent with `@playwright/mcp` (already in every project's bundle). No stealth plugin |
| Scroll until the page stops growing (12 × 500 ms) | The skill tells the agent the same loop, capped at 12 scrolls |
| ARIA snapshot + LLM extraction | The agent's own `browser_snapshot` and its own reading of it |
| LLM proposes price / USD / SKU silently | **Different on purpose.** The agent marks every value it proposed (`proposed: ['price', …]`), and the tool proposes the SKU itself when none was read and says so. The answer, and the pack's description in the library, name what was proposed |
| No JSON-LD | **An improvement:** the skill reads schema.org `Product` JSON-LD first when the page carries it, because that is what the page itself states (name, price, currency, SKU, image) |
| No image → dropped | Same; the agent also keeps only `http(s)` image URLs, since ACO fetches the image itself (no 24-hour re-host here) |
| No link → listing URL | Same (`origin`) |
| `scrapeAttributes` | Optional in the skill: open product pages for option dimensions; they become ACO attributes and `aco_metadata` rows, never invented variant SKUs |
| Mapped into an ACO pack and imported at once | Mapped by `make_aco_pack_from_products` into the existing ACO row types and saved into the SC's **library** first, for review. Loading into ACO is slice B |

The typed form of a product is `ScrapedProduct` in `src/types/scrapedProduct.ts`, modelled on
DSC's, with the per-field `proposed` marker added.

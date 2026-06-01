---
name: demo-data-injector
description: Replaces scraped real customer data (product names, SKUs, prices, distributor lists, testimonials) with demo-appropriate mock data while preserving the visual layout. Use after a reference site is scraped and before showing the demo to a customer who shouldn't see the original site's data.
---

# Inject demo data into scraped layouts

Use this skill after `scrape-reference-site` or `commerce-block-mapper` produces working blocks that visually match a reference, but still contain the reference site's real product names, SKUs, prices, distributors, customer testimonials, or other real-world data that shouldn't appear in the demo.

The goal: keep the layout, swap the data.

## When to use

- A scrape captured real product data and we're presenting the demo to a different customer.
- The reference's brand-specific copy (testimonials, customer logos, support contacts) needs to be neutralized.
- The demo's catalog backend differs from the reference's (different product mix, pricing model, regions).
- The demo represents the prospect's industry but should use the prospect's brand identity, not the reference's.

## What to replace

Walk through the scraped content and identify each "live data" category:

| Category | Examples | Replacement source |
|---|---|---|
| Product names | "ANT-LTE-CER-T", "MULTI-BAND SMT ANTENNA" | Demo catalog (via `get_component_config`) |
| SKUs | Real part numbers from the reference | Mock SKUs from demo catalog |
| Prices | Real list prices, tier pricing | Mock prices (use round numbers for clean demo display) |
| Stock indicators | Real inventory counts | Mock indicators ("In Stock", "Limited", "Backorder") |
| Distributor / region data | Specific distributor names + inventory | Generic placeholders ("Distributor A", "Distributor B") |
| Customer testimonials | Real customer quotes + logos | Generic placeholder testimonials or omit |
| Customer logos / case study tiles | Real logos | Generic placeholders or omit |
| Support contact info | Real phone numbers, email addresses | Generic ("Contact your account team") |
| Personalization slots | "Welcome back, Jane" | Generic welcome message OR demo-user placeholder |

## What to KEEP from the scrape

- Layout structure (block boundaries, grid columns, spacing)
- Design tokens (colors, fonts, spacing scale, border radius)
- Block types (which drop-in or custom block each section uses)
- Interaction patterns (tab navigation, accordion behavior, hover states)
- Image dimensions and aspect ratios (use placeholder images at the same dimensions)

## Process

1. **Get the demo catalog config.** Use `get_component_config` to read the demo's Commerce instance. Note the available product mix, the catalog endpoint, and any sample SKUs the demo backend ships with.

2. **For commerce sections**: don't substitute data into the drop-in markup. The drop-in fetches live from Catalog Service. Instead:
   - Make sure the demo's Commerce instance has the right products loaded.
   - If product data is missing or unsuitable, use `update_project_config` to point at a different Commerce demo backend that has appropriate sample data.
   - Document in the demo notes which products to feature in the live demo.

3. **For static content sections** (testimonials, customer logos, support widgets): replace inline.
   - Open the block .js / .css produced by earlier skills.
   - Identify the hard-coded constants (`TIERS`, `DISTRIBUTORS`, `TESTIMONIALS`).
   - Replace with generic demo-appropriate values.
   - Re-test the local dev render.

4. **For brand-specific imagery**: replace image URLs.
   - Default to neutral placeholder images at the same dimensions.
   - If the demo represents a specific industry (e.g., apparel, electronics, B2B parts), pull industry-appropriate stock images from a free source the user trusts.

5. **For personalization slots**: replace with demo-friendly defaults.
   - "Welcome back, Jane" → "Welcome to <BrandName>" or a generic non-personalized state.
   - Live recommendations → either a fixed product list OR leave the drop-in to fetch live (the demo backend's recommendations engine handles it).

6. **Final pass: scan for stray real-world data.** Look for:
   - Real domains in `href` attributes (mailto:, tel:, links to the original site)
   - Comments in the block code mentioning the original brand
   - Image alt text with the original product names

## What NOT to do

- **Don't substitute data inside the drop-in's API responses.** The drop-in fetches live; intercepting that breaks the demo's "real commerce" story. Change the catalog instead.
- **Don't fabricate trademarked brand names** ("Apple", "Nike") for demo placeholder content. Use generic neutral names or the demo prospect's brand.
- **Don't keep personal identifying information from the reference scrape.** Customer reviews with names, individual support agent names, anything PII — replace or remove.
- **Don't break the visual rhythm.** If the reference shows 12 testimonials in a 3×4 grid, keep the count; if you must, add generic placeholders to fill.

## Verification

After data injection, render the demo locally and spot-check:

- No mention of the reference brand in visible copy.
- No real-world SKUs / part numbers in displayed product lists.
- All images load (no broken references to the original site's CDN).
- Drop-in commerce sections still fetch correctly from the demo backend.
- Personalization renders as the demo's default state, not the reference's logged-in state.

## Handoff

Report in plain language, **summarized by category** — don't enumerate every replaced string:

- **What you swapped** (e.g. "product names, SKUs, and testimonials → demo placeholders").
- **What you intentionally left live** (the drop-in's catalog fetch) and why.
- **The one risk to confirm** (e.g. a section still pulling the demo backend's catalog the user should check), plus a short spot-check list.

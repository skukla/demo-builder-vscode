---
name: commerce-block-mapper
description: Maps scraped PDP/PLP markup to Adobe Commerce drop-in components for an EDS demo, honestly modeling what's customizable (slots, theming, content) versus what's immutable (React component internals). Use after a reference site is scraped and you need to wire the commerce sections to the storefront drop-ins.
---

# Map a scraped commerce site to Adobe Commerce drop-ins

Use this skill after `scrape-reference-site` produces a captured bundle, when the reference includes commerce pages (PDP, PLP, cart, checkout) that need to be wired through Adobe's drop-in components rather than rebuilt from scratch.

This is the **specialization layer** the AEM Modernization Agent explicitly leaves to manual work. Adobe owns the drop-in React components; we theme and arrange them, but we don't replace their internals.

## When to use

- A scrape included a PDP, PLP, cart, or checkout page.
- The Demo Builder project includes the EDS Storefront component (drop-ins available).
- The user wants the demo to actually transact (not just visually mimic the layout).

## The honest fidelity ceiling

Tell the user this up front:

> "PDP/PLP first-pass typically lands at 60-75% visual match against the reference. The reason is that Adobe Commerce drop-ins are React components Adobe owns and ships. We can theme them (colors, fonts, spacing), arrange them in EDS blocks, and provide custom slot content. We can't restructure the drop-in's internal DOM or replace its event handling. After 2-3 iterations of theme tuning and slot customization, expect 85-90% — the last 10-15% gap is the drop-in's fixed structure."

Don't paper over this. End users seeing a demo trust it more if it says "this section uses Adobe's product detail drop-in, themed to match" than if the demo silently degrades.

## What's customizable

For each drop-in, these levers exist:

| Lever | What you can do | What you can't |
|---|---|---|
| **Theming** (CSS custom properties) | Map scraped tokens to drop-in CSS variables: primary/secondary colors, fonts, spacing scale, border radius. | Restructure the drop-in's internal layout. |
| **Slots** | Pass custom React/HTML content to named slots (e.g., a custom call-to-action under the product gallery). | Override slots the drop-in doesn't expose. |
| **Container blocks** | Wrap drop-ins in EDS blocks that handle the surrounding layout, copy, and CTAs. | Replace the drop-in itself with custom block code. |
| **Events** | Subscribe to drop-in events (add-to-cart, variant-changed) to drive surrounding behavior. | Modify the drop-in's internal event flow. |
| **Configuration** | Drop-in config (display options, feature flags) via `.demo-builder.json` and component `.env`. | Bypass config to enable removed features. |

## Process

1. **Identify which scraped sections are commerce.** From the scraped accessibility tree or screenshot, mark:
   - Product detail layout → maps to `product-details` drop-in
   - Product listing layout → maps to `product-list-page` drop-in
   - Cart / mini-cart → maps to `commerce-cart` drop-in
   - Checkout → maps to `commerce-checkout` drop-in
   - Search → maps to `commerce-search` drop-in (where available)

2. **For each commerce section, extract the design tokens from the scrape**:
   - Brand primary / secondary colors
   - Type scale (headings, body, button text)
   - Spacing scale
   - Border radius style (square vs rounded)
   - Button style (filled, outlined, ghost)
   - Card / surface treatment

3. **Map tokens to drop-in CSS custom properties.** Each drop-in publishes a CSS variable surface. Update the project's storefront CSS to set these variables to the scraped values. Reuse the existing `aem-block-developer` skill for the actual CSS writing.

4. **Wrap with EDS container blocks for context.** If the reference shows surrounding content (related products, brand messaging, trust badges, distributor tables, sample-request CTAs), those go in EDS blocks AROUND the drop-in, not inside it. Use existing block patterns: `te-distributor`, `te-samples`, `te-stock-cart` from the TE project are good references for commerce-adjacent custom blocks. After you finish writing the block source files, call the `register-custom-block` skill (or directly invoke `promote_block_to_library`) so the block appears in DA.live's authoring picker.

5. **Use slots for inline custom content.** If the reference includes content that visually lives inside the drop-in's footprint (e.g., a custom "save for later" affordance under the price), check whether the drop-in exposes a slot for it. If yes, pass the custom content via the slot API. If no, place it in a wrapping block instead.

6. **Honestly document the gap.** In the project README or a `commerce-mapping.md` doc, note which sections use which drop-ins and what visual differences remain vs the reference. This sets the demo audience's expectations correctly.

## Common pitfalls

- **Over-customizing the drop-in's DOM.** Tempting, but Adobe drop-in updates will break your patches. Stay within the supported lever surface.
- **Rebuilding the drop-in as a custom block.** Doesn't transact, doesn't get drop-in updates, doesn't match Adobe's accessibility / i18n / a11y work. Always reach for the drop-in first.
- **Ignoring the variant / SKU model.** Reference sites often show variant selectors (size, color, configuration). The drop-in handles this; don't mock it with static markup.
- **Hardcoding product data.** The drop-in fetches catalog data live via Catalog Service. Don't substitute static product data in the drop-in — use `demo-data-injector` to control which products surface from the catalog instead.

## What this skill won't do

- Won't generate brand-new commerce React components — Adobe owns those.
- Won't bypass Adobe Commerce auth or backend services — connection still goes through the configured Commerce instance.
- Won't fix demos against the wrong commerce backend (PaaS vs SaaS vs ACCS) — confirm the project's stack first via `get_project`.

## Handoff

When the mapping is done, report in plain language:

- **Status:** which sections are now wired to which drop-ins.
- **The fidelity gap, stated once:** the honest first-pass / after-iteration percentages and that the remaining gap is the drop-in's fixed structure — don't bury it, and don't repeat it three times.
- **What to verify / next step:** the 2-3 things the user should eyeball, not a full QA matrix.

Lead with what's working. Keep CSS-variable names and drop-in internals out of the user message unless they ask.

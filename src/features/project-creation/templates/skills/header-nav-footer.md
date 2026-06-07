---
name: header-nav-footer
description: Maps scraped site chrome (header, navigation, footer, breadcrumbs, mini-cart icon) to EDS blocks. Use after a reference site is scraped — the Mod Agent explicitly excludes header/nav/footer from its scope, so Demo Builder owns this mapping.
---

# Map scraped site chrome to EDS blocks

Use this skill after `scrape-reference-site` produces a captured bundle. The Mod Agent explicitly excludes site chrome (header, navigation, footer) from its scope, so this is Demo Builder's territory.

## What "site chrome" covers

| Element | Typical content |
|---|---|
| **Header** | Logo, primary navigation, search input, account/cart icons, locale switcher, support contact |
| **Primary navigation** | Top-level menu items, mega-menu panels, mobile hamburger menu |
| **Breadcrumbs** | Current location path (Home > Category > Subcategory > Product) |
| **Mini-cart** | Cart icon + count + dropdown preview |
| **Footer** | Company info, link columns, legal text, social icons, newsletter signup |
| **Promo bar** | Top-of-page announcement strip (free shipping, current sale) |

## Why the Mod Agent excludes these

Site chrome appears on every page. The Mod Agent processes pages individually, so it would generate the chrome N times for N pages — duplicate work and inconsistent output. EDS handles site chrome differently: each block lives in the project's global blocks set and renders on every page that includes it.

## Process

1. **Extract the chrome sections from the scrape.** From the scraped accessibility tree, identify:
   - `<header>` and its contents
   - `<nav role="navigation">` (primary nav)
   - Breadcrumb component (often `<nav aria-label="Breadcrumb">`)
   - Cart icon and any dropdown
   - `<footer>` and its contents
   - Any promo bar above the header

2. **Use existing EDS chrome blocks as starting points.** The EDS Storefront boilerplate ships these block types:
   - `header` — global header block
   - `nav` — primary navigation
   - `breadcrumb` — breadcrumb component
   - `footer` — global footer block
   - `commerce-mini-cart` — drop-in cart icon

   Don't recreate them from scratch. Extend their CSS and markup to match the scraped reference. If the reference forces you to introduce a brand-new chrome block (rare — most cases extend existing ones), call the `register-custom-block` skill (or directly invoke `promote_block_to_library`) after writing the source files so the block appears in DA.live's authoring picker.

3. **Map scraped design tokens to the chrome blocks.**
   - Header background, height, sticky behavior
   - Logo dimensions and positioning
   - Nav link typography (font, weight, size, spacing)
   - Hover and active states
   - Footer column structure, link styles, social icon set
   - Promo bar color, height, dismissibility

4. **Handle responsive behavior.** Most reference sites have a mobile menu pattern (hamburger, slide-out, off-canvas). Use the scraped mobile screenshot at 375px to confirm the pattern. Don't invent — use what the reference uses.

5. **Wire commerce affordances into chrome.**
   - Mini-cart icon → wires to the `commerce-cart` drop-in for count + dropdown
   - Search input → wires to `commerce-search` drop-in if present
   - Account icon → wires to the auth drop-in
   - Locale switcher → wires to the project's locale config

6. **For nav structure**: read the reference's nav from the scrape and replicate the hierarchy in the project's `nav.docx` (Document Authoring) or `nav.md` (markdown). EDS pulls nav content from the document, not from hardcoded markup.

## What NOT to do

- **Don't hardcode brand-specific menu items in nav block code.** Put them in the nav document. EDS authoring expects nav content to be editable by content authors, not developers.
- **Don't duplicate the chrome per page.** Site chrome is global; it lives once and renders everywhere.
- **Don't ship the reference's mega-menu structure verbatim** if it includes real product categories. Replace with demo-appropriate categories from the demo's catalog.
- **Don't omit a11y attributes.** Headers, nav, and footer need proper ARIA landmarks (`<header>`, `<nav role="navigation">`, `<footer>`, skip-to-content link). Adobe's existing chrome blocks ship these — don't strip them.

## Verification

After mapping the chrome:

- Open the demo at 1440px and 375px viewports. Compare against the reference screenshots from `.scraped/<domain>/`.
- Check that the chrome renders on every demo page (not just the home page).
- Confirm responsive behavior: mobile menu opens/closes, sticky header behaves correctly on scroll.
- Verify commerce affordances (mini-cart count updates, search input works, locale switcher routes correctly).
- Run a screen-reader pass at a high level: skip-to-content link works, nav landmarks announce correctly.

## When this skill gets handed back to `refine-visual-match`

After the chrome is in place, `refine-visual-match` will compare rendered output against the reference and surface remaining deltas. Common chrome-specific issues that loop back here:

- Logo size or positioning off by a few pixels
- Nav link spacing slightly tight or loose
- Footer column alignment doesn't match
- Promo bar height or color slightly off
- Mobile menu animation doesn't match

Each of these is a small CSS adjustment in the chrome blocks. Keep iterations focused — don't restructure the chrome on every iteration; just tune.

## Handoff

Report in plain language: which chrome blocks you mapped or extended, that they render on **every** page (not just home), and the handful of things to check (desktop + mobile menu, mini-cart count, nav hierarchy). If you're handing visual deltas to `refine-visual-match`, say so in one line rather than listing pixel diffs.

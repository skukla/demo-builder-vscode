---
id: EDS-52
kind: fix
area: eds
needs: []
value: med
status: built
---

# The new-category offer reads the SAVED store, before it is published

Filed 2026-10-17, found walking release row 3.10.

## What happened

The agent switched `my-commerce-demo` (a CitiSignal storefront) to the Main Website
store with `configure_project`, and the republish it asked for was declined, so the live
site still served CitiSignal. After a window reload the new-category watch (EDS-27,
`newCategoryPagesWatch.ts`) looked at the open project and offered:

> 11 new categories on "My Commerce Demo" have no page yet (Products, Software,
> Maintenance Services, Critical Power, Cooling, Servers and Racks, ...). Add their pages?

Those are the Main Website store's categories. "Add pages" would have written and
published them on the live CitiSignal site.

## Why

The watch reads the store from the project's saved settings
(`componentConfigs`), not from what the storefront last published
(`edsStorefrontState.envVars`). Between a store change and its republish, the two
differ, and the republish already replaces the product and category pages for the new
store (EDS-44, `catalogPagesPending`). So the offer is at best redundant there and at
worst publishes the wrong store's pages.

## Likely fix

Do not offer (or auto-add) while the storefront is out of date on the store scope:
skip when `edsStorefrontState.catalogPagesPending` is set, or read the published store
codes instead of the saved ones. Check against the auto-add path too
(`demoBuilder.categoryPages.autoAdd`), which would publish without asking.

## Shipped so far

- 2026-10-19  fix(eds): the new-category check waits while a store change awaits its republish (`8ab77044c`)

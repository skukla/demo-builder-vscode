---
id: EDS-70
kind: fix
area: eds
needs: []
value: high
status: backlog
---

# The Catalog Service has lost Justrite's categories

Found 2026-11-01. For the Justrite store view the Catalog Service answers one category, "Default Category",
for every customer group, and an empty list when asked for Justrite's own ids. Commerce holds the five
top-level categories under the store's root, all active and in the menu. Products are fine: 49 come back.

The same answer reaches the live Justrite storefront, read from its own published config. On 2026-10-22 the
same store view answered 15 categories (`categoryReader.ts`).

So a republish on that store publishes no category pages, and says the categories are not marked "Include in
Menu", which here is not the reason. A new category on the test website did appear within minutes.

Not known: when this started, and why. The Justrite Test store's root was moved on 2026-10-30, which is a lead
and nothing more. The message should also stop claiming a cause it has not checked.

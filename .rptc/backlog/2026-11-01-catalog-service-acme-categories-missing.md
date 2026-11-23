---
id: EDS-77
kind: fix
area: eds
needs: []
value: high
status: backlog
---

# The Catalog Service has lost Acme's categories

Found 2026-11-01. For the Acme store view the Catalog Service answers one category, "Default Category",
for every customer group, and an empty list when asked for Acme's own ids. Commerce holds the five
top-level categories under the store's root, all active and in the menu. Products are fine: 49 come back.

The same answer reaches the live Acme storefront, read from its own published config. On 2026-10-22 the
same store view answered 15 categories (`categoryReader.ts`).

So a republish on that store publishes no category pages, and says the categories are not marked "Include in
Menu", which here is not the reason. A new category on the test website did appear within minutes.

Ruled out, 2026-11-01:

- **Shared catalog grants:** each catalog grants the whole Acme tree, so missing grants are not the cause.
- **The customer group:** guest, General and two company groups, by their real header, all answer the same.
- **The query:** `categoryTree` answers nothing either.
- **Acme alone:** CitiSignal and Bodea answer no categories at all, so the root move on the Acme Test store
  is a weak lead.

An empty `categories` on a product is normal on ACCS, so it is no evidence here.

Tried: re-saving one category with no change (Floor Marking), Adobe's guidance for forcing a resync. It had not come
back after a while, and the guidance allows up to an hour. If it stays gone, the next step is an Adobe support request
for a backend resync, which the owner has to raise. The message should also stop claiming a cause it has not checked.

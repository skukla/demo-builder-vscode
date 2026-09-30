# Loop report — 2026-09-30 (ERP programme continuation)

## Summary

Loaded a colleague's real Justrite product catalog into the live Bodea Commerce
instance — 43 products, zero failures — after finding and fixing three silent
Commerce quirks that had made the first attempt fail. One 2-minute Admin step is
left for you (point the Justrite store at the new catalog). The remaining ERP
backlog items all need a cloud deploy to finish, which the overnight loop does not
do, so they are handed off rather than built.

## Shipped

**Justrite catalog loaded live on Bodea.** A colleague (Khalil) supplied a 43-row
product spreadsheet for the Justrite brand. All of it is now in Commerce:

- 37 simple products + 6 configurable products, on the Justrite website, zero failures.
- 15 categories (already created earlier) — every product assigned to its category path.
- All 6 configurables have their 3 size/format variants attached and linked.
- The "Format" variant attribute is set on all 29 variant products.

Three Commerce behaviours caused the first attempt to fail silently; all three are
now fixed and written to memory so they don't cost time again:

1. A product's category assignment (`category_link`) needs a `position` number, or
   the whole product save fails with a generic error that never mentions the category.
2. A dropdown attribute silently discards its value unless the attribute has first
   been added to the product's attribute set. This is why every configurable was
   childless — the size value never saved, so the variants couldn't link.
3. The write path takes PUT, not PATCH.

Two Commerce read endpoints (a category's product list, a configurable's child list)
lag behind the write on this instance and can show empty right after a successful
write — verified the data another way (the product's own record, and Commerce
rejecting a duplicate link) rather than trusting the lagging reads.

## Handed off (need a cloud deploy — not doable overnight)

- **AB-26g — the "hold" leg.** Ship, invoice and cancel already flow from Commerce
  Admin back to the ERP and are proven live. Hold is not built, and it is blocked by
  a platform limitation: the Commerce REST "hold order" action is a no-op on this
  ACCS instance — it returns success but the order stays unheld. See "Your decisions".
- **AB-20 — live credit check at order placement.** A full feature (ask the ERP, at
  checkout, whether the account has the credit) that needs the order-placement flow
  wired and a deploy to prove. The credit logic already exists in the ERP; this is
  the wiring and the deliberate "what happens when the ERP is unavailable" decision.

## Filed (finding, needs your call)

- **G4 hold-leg direction.** Under the SAP-central model you locked, credit and holds
  are ERP-mastered. A Commerce-Admin hold flowing *to* the ERP is a channel-side
  operational action (an SC holds an order for their own reason and the ERP should
  know), which is defensible — but it can't be demonstrated through REST because the
  ACCS hold action is inert. Worth deciding before building it.

## Your decisions

1. **Justrite store root category (2 min, Admin).** Change "Justrite Store" root
   category from *Default Category* to *Justrite Catalog*. You set it to Default
   earlier only so you could create the store; the catalog (id 119) now exists. This
   is a store edit, not a category add, so it won't hit the dev-mode block you saw.
   Without it, the products are loaded but won't appear in the storefront's category
   navigation.
2. **G4 hold leg** — build it via the Admin UI hold action (different backend path,
   may fire the order-save event the integration already listens for), or drop the
   hold demonstration. Needs a scratch deploy to test either way.

## Environment facts

- The Commerce Admin category *add* (root or sub) is blocked by a PHP deprecation
  surfaced as a hard error in the sandbox's developer mode. REST bypasses it — that
  is how the Justrite Catalog and its 15 categories were created. Store *edits* are a
  different code path and work in Admin.

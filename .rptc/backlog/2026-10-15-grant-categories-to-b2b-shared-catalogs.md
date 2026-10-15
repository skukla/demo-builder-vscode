---
id: EDS-47
kind: feature
area: eds
needs: []
value: med
status: backlog
---

# Grant a B2B website's categories to its shared catalogs

Filed 2026-10-15 by the owner, from the release walk ("I want the new item").

## Why

On a B2B website every category is hidden from a customer group unless a shared catalog grants
it. Guests and General use the public shared catalog; each company's buyers use their company's.
A website full of products can therefore show nothing to guests: measured on Justrite on
2026-10-01, `productSearch` found 0 for guests and 49 for the two company groups (EDS-24's
table). SCs fix this by hand in Commerce Admin today.

Demo Builder does half of the B2B setup: **Prepare this store** gives each company with its own
prices its own shared catalog (`setupChecks.ts`, the company-catalogs step). Nothing grants
categories to any catalog. EDS-24 describes the missing half in full (its section "A category is
invisible until a shared catalog grants it") and it was never built.

## What done looks like

A **Prepare this store** step, "Make the catalog's categories visible", with the same shape as
the other steps (preview, apply, undo, a check that reads Done when nothing is missing):

1. Find the shared catalogs that apply to the website: the public one and each company's, with
   the groups each serves.
2. Preview which categories each catalog lacks, in words: "Guests can't see Safety Cabinets,
   Signs (12 more)". Leaving a category out for a group is a decision the SC can make, not an
   accident.
3. Apply with `POST sharedCatalog/{id}/assignCategories`; record what was granted.
4. Check by searching as each group (`productSearch` per `Magento-Customer-Group`), not by reading
   the grants back.
5. Undo takes back exactly the grants it made.

The agent gets it through `prepare_commerce_store` like the other steps. Once it exists, EDS-46's
"Guests won't see any products in this store view" notice can point to it on a B2B website.

## Open questions

- Grant every category to every catalog by default, or only the public one plus each company's
  own subtree? Ask the owner with a recommendation once the preview shows a real website.
- Prepare this store lives on the ERP integration's card today. A storefront without the ERP
  integration also needs this, so it may belong somewhere every B2B project reaches (Configure,
  or a storefront action). Decide before building.

Related: EDS-24 (category pages; documents the rule), EDS-46 (the warning), AB-77 (Prepare this
store).

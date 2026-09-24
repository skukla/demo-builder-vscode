---
id: AB-26u
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26e, AB-26m, AB-26l]
value: high
status: built
---

# The walk-through — what to look at in the ERP, what to look at in Commerce, and how each relates

Owner, 2026-09-24: "once all of this is built, I'm going to need a walk-through of what I
should look at in the ERP system, how it relates, and then what to look at in the commerce
system and how it relates." This is that deliverable, filed so it is not forgotten.

Slice of [[AB-26]]. **Lane: 1** — a document plus a preview recording, nothing live.

## What

`commerce-erp-integration/docs/walkthrough.md`, SC-facing, public, in two halves and one
map:

1. **The ERP, screen by screen** in the order the twenty-minute demo path walks them
   (`.rptc/plans/erp-screen-realism/overview.md` §7): Home → a product → a customer → pricing
   conditions → a sales order → its shipments → its invoice → a held order → the event
   journal → Settings' Organisation card. For each screen: what is on it, which numbers are
   the ERP's own and which are mirrored from Commerce, and what to click.
2. **Commerce, screen by screen**, the same story from the other side: the product and its
   sources, the company and its credit, the order with its ERP number, the shipment and
   invoice the ERP created, the comments the ERP wrote, the hold, the integration's Admin
   page with the entity map and the sync history. For each: which ERP action put it there.
3. **How each relates** — one table per composite entity (plan §5a): this ERP screen ↔ this
   Commerce screen, joined by this key, this side owns this field. The entity map (AB-26m)
   is the live version of the same table; the walk-through is the printable one.

Plus the two-pair walk-through (`multi-erp-order-routing` §10's nine moments) as a second
section once AB-26t exists, and a link from the ERP card's flyout in Demo Builder.

Written from the preview's stand-in records so every screenshot is reproducible, and
re-checked against a deployed pair on the owner's word.

## Verification block

Every screen named exists in the preview (headless check T-2 lists them); every "how it
relates" row names a real join field from the composite-entity research (AB-26a); the
demo path can be walked from the document alone by someone who has not seen the build.

## Shipped so far
- 2026-09-24  Picked up (lane 1: a document written from the preview; the live re-check is the owner's). Staleness check: every screen it names exists in the preview and has a headless check (T-2: home, orders, shipments, invoices, products, partners, pricing, events, settings, plus the documents); the entity map (AB-26m) and the composite-entity research (AB-26a) exist to draw the relation tables from. Dependencies AB-26e (built to its supervised edge), AB-26m and AB-26l (built) are on the same branch (loop report decision 7). Written as commerce-erp-integration/docs/walkthrough.md, with each screen named by its preview address so every look is reproducible without committing images
- 2026-09-24  BUILT — commerce-erp-integration 91fb8ce (docs/walkthrough.md: part 1 the ERP screen by screen along the twenty-minute path with mirrored vs the ERP's own on each; part 2 Commerce from the other side naming the ERP action behind each thing; part 3 one relation table per composite entity, the printable twin of the Mapping tab; two-pair note; what a first live showing must confirm), linked from the README and the setup guide; demo-erp 806b196 (README pointer). Two claims checked against the code before publishing: any blocking level other than open writes back as blocked (isBlocked), and the cancel handler writes the ERP's reason into the comments. Every ERP screen named by its preview address. NOT done: the live re-check against a deployed pair (the owner's); the two-pair nine moments wait for the routing integration
- 2026-09-24  docs(rptc): walk-through built; the ERP programme report closed with its walkthrough queue (`3ff4f92a7`)

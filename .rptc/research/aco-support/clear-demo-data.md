# ACO "Clear demo data": what it can and cannot do

Research, 2026-10-31, unattended (PL-60, "still open" point 1 of the loader branch's step 02).
No live calls were made; everything below is read from code, and the claims that need a live
run are marked.

## The question

Commerce has "Clear demo data": the SC picks the demo's stores and Demo Builder removes what
they hold that it did not install. ACO has no equivalent. Removing a pack Demo Builder
installed already works (deletes by the keys its install record lists), so the gap is data
that came into ACO some other way: an older script, a colleague, a half-finished run.

ACO's ingestion API can delete by key but **cannot list** what it holds (research.md, and the
loader branch's step 02). So clearing needs another way to find the keys.

## What the existing script does

`skukla/commerce-demo-ingestion`, `aco/delete-everything.js` (our repo; read 2026-10-31):

- **Products**: pages through the STOREFRONT GraphQL `productSearch` (phrase empty, 200 a page)
  for every SKU, then deletes them through ingestion (`deleteProductsBySKUs`).
- **Categories**: asks `categorySearch`, and treats it as possibly unavailable ("will be
  handled during re-ingest").
- **Prices**: no list; it deletes the prices of the products it found, per known price book.
- **Metadata** (attribute definitions): read from known codes, not listed.
- It sends `AC-Environment-Id` on the storefront call. Its comment says
  `AC-Price-Book-Id` is "Required for productSearch". Both are the script's claims, not
  verified here; the first is also one of the live check's open questions
  (`.rptc/plans/aco-support/live-check.md`, step 4).

## What that means for a Demo Builder version

Possible, with one limit that must be said to the SC: **it can only clear what the project's
catalog view shows.** `productSearch` answers through a view and a price book, so a product in
another view, or with no price in that book, is invisible to it and stays.

A shape that fits the house:

1. **Read**: page `productSearch` through the project's view (the ACO settings PL-60 already
   stores: tenant, region, environment, view, locale, price book) for every SKU; ask
   `categorySearch` for categories where it answers.
2. **Subtract**: every key an installed ACO pack's record lists (they are Demo Builder's, and
   removing the pack is their undo).
3. **Show and confirm**: the counts, in Clear demo data's own dialog as an ACO part ("Removes
   the 412 products this catalog view shows that Demo Builder didn't install."), with the limit
   said once.
4. **Delete** by key through the ingestion client PL-60 built (`acoClient.ts`), prices with
   their products; leave attribute definitions, which other data may share.

The agent surface is the existing `check_demo_data` / `clear_demo_data` pair with an ACO scope,
not new tools.

## Reversibility

Like Commerce's clear, it cannot be undone, and says so in its confirm sentence. It never
touches what an installed pack holds.

## Recommendation, and the decision it needs

Build it **after the live check proves step 1 works** (that `productSearch` lists through the
project's view with the headers Demo Builder sends), as one more slice of PL-60. Whether it is
needed before 1.0 is yours: without it, an SC whose ACO instance already holds stray data can
remove Demo Builder's own packs but not the rest.

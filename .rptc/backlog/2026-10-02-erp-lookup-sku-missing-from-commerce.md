---
id: AB-54
kind: fix
area: app-builder
parent: AB-26
needs: []
value: low
status: built
---

# The ERP lookup fails on a SKU Commerce does not have

Found 2026-10-02 while cleaning up after a bundle test on Justrite. Three test products
were deleted from Commerce, and `get_erp_record` was used to check whether the ERP had kept
copies. Every call failed with "ERP lookup answered 500 … 404 Not Found: GET …/V1/products/
TEST-TXT-REQ", while the same call on a real product answered normally. The tool says it
answers "whether a … product exists in Commerce at all", and the integration's lookup says
"a side that does not have it answers with empty cells; that is the answer, not an error".
Neither was true for a SKU Commerce lacks. (`run_erp_rest products/<sku>` answered the
question instead: the ERP held none of the three.)

## Cause (read in commerce-erp-integration, `ad4501a`)

The lookup action (`src/commerce-extensibility-1/actions/erp/lookup/index.js`) has two SKU
paths. With one ERP it reads the product through `getProduct`, which answers null on a 404.
With several ERPs (Justrite has two: its own and Accuform) it first decides which ERP owns
the SKU, and that reads the product's attributes through `productAttributes`, which has no
404 handling. A SKU Commerce lacks therefore threw before anything else was asked. The
per-ERP test mocks `productAttributes` to always answer, so the case was never run.

## Fix

When Commerce does not have the SKU there are no attributes to route by, so every ERP is
asked; each one that holds it is an owner, and a single owner's record fills the ERP side.
That answers the question the lookup was being used for: did an ERP keep a product Commerce
no longer has.

## Shipped so far
- 2026-10-02  fix(lookup): a SKU Commerce lacks no longer fails the lookup with several ERPs, commerce-erp-integration main 3b13fe2; not yet deployed to Justrite
- 2026-10-02  deployed to Justrite with f63574a (2026-10-02 05:13Z)
- 2026-10-02  docs(backlog): file AB-54, the ERP lookup failing on a SKU Commerce lacks (`e9d9b4a9e`)

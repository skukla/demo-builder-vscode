# Step 01 — Pin the record shapes, bump the contract

**Why first.** The owner's question (2026-09-24) was whether the data model was understood
and could not drift. Today the contract test pins EVENT payload keys and ROUTES; nothing
pins the STORED record shapes. Every later step adds fields, so the guard goes in before
the first field moves, and each step then updates the fixture in the same commit as the
field.

## demo-erp

1. RED: `test/records-shape.test.js`. Using `memoryCollections()`, create one of each record
   through the real modules (`importPartners`, `ensureDefaultPartner`, `createOrder` →
   `confirmOrder` → `createShipment` → `postShipment` → `createInvoice`, `upsertCondition`,
   `getSettings`, `updateSettings`), read the RAW stored document from the collection, and
   `assert.deepEqual(Object.keys(doc).sort(), fixture.<record>)` against
   `test/fixtures/record-shapes.json`. One assertion per record: partner, walk-in partner,
   order (with `shipments[0]` and `invoice` keys pinned too), pricing condition (each of the
   three kinds), settings. The fixture is the checked-in truth; a key that appears or
   vanishes fails here first.
2. GREEN: write the fixture from today's shapes (read them; do not type them from memory).
3. `contract/erp-contract.json`: `contractVersion: 2`; `import.partners` gains `salesOrgs`,
   `legalName`, `vatTaxId`, `resellerId`, `legalAddress`, `website`; `import` gains
   `structure` with its keys; `order.request` gains `salesOrg`, `salesOrgName`;
   `order.response` gains `salesOrg`, `salesOrgName`. `test/contract.test.js` gains a test
   that `contractVersion` is 2 and that the import/order key lists are exactly what the
   handlers accept (a positive control: remove one from the JSON, watch it fail).
4. README: the contract paragraph names version 2.

## commerce-erp-integration

5. Copy the contract; `npx vitest run test/contract` green; `npm run contract:check` clean.

## Done when

`node --test test/` green with the new suite; both contract copies identical at version 2;
one commit per repo, plain `git commit`, no trailers.

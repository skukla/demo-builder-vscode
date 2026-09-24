---
id: AB-26c
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b]
value: high
status: built
---

# Pair-in-a-box: the ERP in-process behind the integration, a fake Commerce in front (T-1)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

In the integration repo: the ERP's actions run in-process against `test/helpers/memory-db.js`; the integration's handlers call them directly instead of over HTTP; a fake Commerce records every write and answers from AB-26b's fixtures. Every two-way journey becomes a test that runs in seconds. `demo-erp` is a dev dependency by path.

## Verification block (checked by the loop's done gate — §6a of the plan)

The harness runs the eight-entity journey list (AB-26e) end to end; a failed journey names the entity and the direction; the ledger's revert is asserted after every reset.

## Shipped so far
- 2026-09-24  BUILT (first cut) — commerce-erp-integration test/box/: the ERP in-process by path (erp-in-process.js), a fake Commerce recording every write (fake-commerce.js), State as a map; journeys.test.js walks eleven journeys across the entity matrix both ways (order, confirm, shipment both ways incl. the echo match, invoice both ways, credit hold/release/reject, Commerce-side hold and cancel, prices+stock ledgered and reverted on reset, minute stock refresh without echo, product delete, company block+credit). Fixtures are typed from the 2.4.9 REST read, NOT live captures — AB-26b replaces them. Runs in npm test (343 tests)
- 2026-09-24  docs(backlog): the pair in a box built (AB-26c), sync validation unit half (AB-26e); loop report updated (`96a5ce139`)

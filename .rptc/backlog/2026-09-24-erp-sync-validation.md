---
id: AB-26e
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26c]
value: high
status: active
---

# Sync validation — every entity, both directions, proved (V)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1 for the harness journeys; the live baseline is authorised (owner, 2026-09-24) and runs on the demo instance.**

## What

For each row of the entity coverage matrix (`.rptc/research/erp-bidirectional-review/`): a harness journey (change in Commerce → see in ERP; change in ERP → see in Commerce; reset → undone) and the same journey written as a live script (`docs/sync-validation.md`) with the expected result beside each step. Runs first as a baseline against today's code, again after AB-26f–h and AB-26j, and before every release. Products first.

## Verification block (checked by the loop's done gate — §6a of the plan)

Every matrix row has a journey; the baseline's failures match the matrix's gaps (G1–G5) and nothing else; the live run's results are recorded per row with the date.

## Shipped so far
- 2026-09-24  Unit half BUILT as the box journeys (AB-26c): every entity-matrix row has a journey in both directions with reset asserted where a write is ledgered. Live half (docs/sync-validation.md script + baseline run on the demo instance) waits for a credential

## The end-to-end matrix, live status (2026-09-25 — owner: "our goal is a complete end to end test of all data flows")

Run through the Demo Builder agent tools against the demo instance (Bodea) and the deployed pair.
✓ proven live with the date; ✗ failed and fixed (see the ledger `commerce-erp-integration/docs/live-validation-learnings.md`); ○ not yet run live.

| Flow | Direction | Live status |
|---|---|---|
| Product save (name, price) → ERP product | Commerce → ERP | ✓ 2026-09-25 03:xx UTC, after the priority-subscription fix |
| Product delete → ERP | Commerce → ERP | ○ |
| Stock item save → ERP warehouse | Commerce → ERP | ✓ 2026-09-25 14:01 (source item accesspoint@default 61 in Commerce, ERP warehouse 61 within 90 s) |
| Companies, credit, status (minute refresh) → ERP partners | Commerce → ERP | ✓ 2026-09-24 |
| Order placed → ERP sales order, number written back | Commerce → ERP | ✓ 2026-09-25 12:24 (orders 3000000007, 3000000008), after three fixes (✗ `_isNew`, ✗ company, ✗ timeout) |
| Cart pricing webhooks (contract price, discount ceiling) | Commerce → ERP → cart | ✓ 2026-09-25 13:52: with the company in its own customer group and an ERP contract price of 40, the cart priced at 40 (item-prices ran in 2.6–2.8 s, recorded). The 13:28 miss was most likely Commerce's old 5 s limit on a cold start (no run recorded then); registrations now wait 10 s and record every run. Discount ceiling: fires (recorded), not yet exercised with a discount |
| Cancel / hold made in Commerce Admin → ERP | Commerce → ERP | ✓ 2026-09-25 14:05 (cancel of 3000000008 → ERP 0000001002 cancelled "Cancelled in Commerce"); ✓ 14:07–14:09 (hold and unhold of 3000000009 → ERP 0000001003 held "Put on hold in Commerce", then released) |
| Shipment made in Commerce Admin → ERP | Commerce → ERP | ✓ 2026-09-25 14:12 (order/9/ship from the default source → ERP order shipped, shipment recorded with the Commerce shipment id) |
| Invoice made in Commerce Admin → ERP | Commerce → ERP | ✓ 2026-09-25 14:17 (order/9/invoice → ERP order invoiced, on I/O Events' first retry after one failed run) |
| Price / name change → Commerce product | ERP → Commerce | ✓ 2026-09-25 13:56 (list price 55 in the ERP, Commerce product price 55 within 65 s; name not exercised) |
| Stock change → Commerce source item | ERP → Commerce | ✓ 2026-09-25 13:59 (warehouse default 77 in the ERP, Commerce source item 77 within 75 s) |
| Credit limit → company credit | ERP → Commerce | ✓ 2026-09-24; ✓ again 2026-09-25 13:05 and 13:17 (the restore landed on I/O Events' redelivery after two 30 s Commerce timeouts, which proves the retry path) |
| Block / unblock → company status | ERP → Commerce | ✓ 2026-09-24 |
| Confirmation → note (+ optional custom status) | ERP → Commerce | ✓ 2026-09-25 12:50, after ✗ (Processing is not a status a comment can set) |
| Credit hold → order On Hold; release → unhold | ERP → Commerce | ✓ 2026-09-25 13:10 (limit 50, order 114 held in the ERP and On Hold in Commerce in 30 s; released and unheld in 18 s, with both notes) |
| Credit reject → order cancelled | ERP → Commerce | ✓ 2026-09-25 12:21 |
| Shipment → Commerce shipment (source) | ERP → Commerce | ✓ 2026-09-25 12:31 |
| Invoice → Commerce invoice (capture) | ERP → Commerce | ✓ 2026-09-25 12:36 (order complete) |
| Reset → ledgered writes undone, ERP re-mirrored | both | ○ with real ledger entries |
| Remove integration → Commerce clean (credit, status, ext_order_id, holds) | both | ○ |
| Fresh add → install-time first sync | install | ○ |
| Agent tools read both sides and the crossing | agent surface | ✓ 2026-09-25 (`get_erp_order_trace`, `run_commerce_rest`, `run_erp_rest`, activations) |

Next runs, in order: credit-hold round trip (lower the demo company's limit in the ERP, order, hold, release, restore), cart pricing via a REST cart with a contract price, ERP price/stock → Commerce, Commerce Admin cancel/hold/ship/invoice → ERP, product delete, then reset and remove with the ledger populated, then a fresh add.

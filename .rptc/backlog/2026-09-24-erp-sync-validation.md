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
| Stock item save → ERP warehouse | Commerce → ERP | ○ |
| Companies, credit, status (minute refresh) → ERP partners | Commerce → ERP | ✓ 2026-09-24 |
| Order placed → ERP sales order, number written back | Commerce → ERP | ✓ 2026-09-25 12:24 (orders 3000000007, 3000000008), after three fixes (✗ `_isNew`, ✗ company, ✗ timeout) |
| Cart pricing webhooks (contract price, discount ceiling) | Commerce → ERP → cart | ✗ in progress 2026-09-25 13:28: group 18 + contract price 40 set up, cart still priced 53; ERP and action proven right in isolation; registrations now record every run to see Commerce's payload |
| Cancel / hold made in Commerce Admin → ERP | Commerce → ERP | ○ |
| Shipment made in Commerce Admin → ERP | Commerce → ERP | ○ (the echo of an ERP-made shipment was matched, not doubled: ✓ 12:31) |
| Invoice made in Commerce Admin → ERP | Commerce → ERP | ○ (the echo of an ERP-made invoice did not carry the Commerce invoice id back; nothing doubled) |
| Price / name change → Commerce product | ERP → Commerce | ○ |
| Stock change → Commerce source item | ERP → Commerce | ○ |
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

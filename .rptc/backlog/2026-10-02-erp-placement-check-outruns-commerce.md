---
id: AB-55
kind: fix
area: app-builder
parent: AB-26
needs: []
value: high
status: built
---

# Every order on Justrite is refused: the placement check outruns Commerce

Found 2026-10-02 05:03Z placing the order-to-return loop's baseline order (Dana Whitfield,
Northgate; one Justrite shadow board and two Accuform signs, on account). Commerce answered
400 "The ERP could not confirm this order right now. Please try again in a moment." — the
placement webhook's `fallback_error_message`, shown only when the hook itself is aborted.

## What happened (read live)

`list_runtime_activations` for the integration's workspace: `webhook/placement` (a sequence)
ran 16.9 s and `webhook/__secured_placement` 16.2 s, status 1; `read_runtime_activation`
answered "The action exceeded its time limits of 15000 milliseconds", no log lines. Commerce's
hard timeout for the hook is 10 s (`app.commerce.config.ts`), and Commerce as a Cloud Service
runs every hook as required, so an aborted check stops the order.

## Cause (read in commerce-erp-integration, 3b13fe2)

The check promises "a slow or down ERP never stops an order": each ERP call has a 4 s limit.
But the Commerce reads BEFORE the ERP calls have none: the buyer's company
(`customers/{id}`), then each line's owner through `splitLines`, which reads
`products/{sku}` once per line per ERP (`productAttributes`) and, with several ERPs, each
configurable's variants (`variantsOf`). On this sandbox a single REST read can take seconds,
so two lines and two ERPs ran past both limits. The same per-SKU reads made the price publish
outrun Runtime's 60 s on 2026-10-01; an unmerged commit on `fix/batched-ownership-reads`
(cb712fe) had fixed that for the publish only, and was recorded nowhere in the backlog.

## Fix (loop branch `loop/2026-10-02-order-to-return` in commerce-erp-integration)

1. A deadline for the whole check, 8 s, inside Commerce's 10 s: past it the order goes
   through and the log says so, the same fail-open rule as a slow ERP.
2. Ownership from one Commerce search for the order's SKUs, reusing cb712fe's batched
   readers (brought onto the branch as e6e6372); the placement split no longer reads
   variants (the router's variant check still runs when the order is sent).

## Shipped so far
- 2026-10-02  commerce-erp-integration main f63574a: 8 s deadline + one batched owner search (placement 16 s -> 3.5 s); deployed to Justrite, order 5000000002 placed
- 2026-10-02  commerce-erp-integration main cd4629c: unsaved lines (no item_id) split by their own owner; deployed; order 2 placement log asks Justrite ERP (274.86) and Accuform ERP (42.42)
- 2026-10-02  docs(backlog): AB-55 — every Justrite order was refused by a placement check that outran Commerce; fixed and deployed (`9ea8559f5`)

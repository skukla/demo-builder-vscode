---
id: AB-26f
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b]
value: high
status: active
---

# The credit hold reaches Commerce (hold / unhold), undone on reset

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2 — code and tests complete; the live proof uses the scratch-workspace deploy (authorised).**

## What

A held ERP order puts the Commerce order On Hold; release takes it off; reject cancels as today. New ERP event `be-observer.sales_order_hold`, one handler, contract in both repos; detach unholds every order the ERP holds (read from the ERP's own list). Multi-ERP rule M2: the handler first asks its own ERP whether it holds the order.

## Verification block (checked by the loop's done gate — §6a of the plan)

Unit tests assert the hold/unhold calls and their arguments; harness journey: hold → Commerce On Hold → release → back; reset → unheld; fixture-backed handler tests; the deploy to the scratch workspace proves it live and is torn down.

## Shipped so far
- 2026-09-24  BUILT TO THE EDGE — demo-erp 4b5d634 (one event be-observer.sales_order_hold, held true on creation-and-hold with the reason, false on release; contract, journal sentence, tests) + integration 4703b60 (handler order-backoffice/hold with the M2 own-ERP check, idempotent on redelivery, comments; cancel unholds first; detach/reset take every ERP-held order off hold; manifest regenerated; README; 310 tests). NOT done: the live proof (scratch deploy) — no credential for the pair on this machine; also to prove live: that POST orders/{id}/hold answers for an order in state new/processing on the target backend, and that Commerce cannot cancel a holded order (the reason for unhold-first)
- 2026-09-24  docs(backlog): AB-26f credit hold built to its supervised edge (live proof waits for a credential) (`472b52670`)

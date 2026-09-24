---
id: AB-26f
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b]
value: high
status: backlog
---

# The credit hold reaches Commerce (hold / unhold), undone on reset

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2 — code and tests complete; the live proof uses the scratch-workspace deploy (authorised).**

## What

A held ERP order puts the Commerce order On Hold; release takes it off; reject cancels as today. New ERP event `be-observer.sales_order_hold`, one handler, contract in both repos; detach unholds every order the ERP holds (read from the ERP's own list). Multi-ERP rule M2: the handler first asks its own ERP whether it holds the order.

## Verification block (checked by the loop's done gate — §6a of the plan)

Unit tests assert the hold/unhold calls and their arguments; harness journey: hold → Commerce On Hold → release → back; reset → unheld; fixture-backed handler tests; the deploy to the scratch workspace proves it live and is torn down.

## Shipped so far

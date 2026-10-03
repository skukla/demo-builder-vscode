---
id: AB-47
kind: fix
area: app-builder
parent: AB-26
needs: []
value: med
status: built
---

# An ERP reset wipes the ERPs even when Commerce failed to close an order

Filed 2026-09-30 from the review of the other agent's work. The reviewer's finding: the
reset (AB-16n: close every order the ERPs hold, THEN wipe) stops only when the integration
answers with no `closed` block at all (`erpIntegrationHandlers.ts` around 223-227). When
Commerce's cancel fails for one order — the 10 s client timeout is enough — that order
lands in `closed.failed` and the reset wipes the ERPs anyway. The failed count reaches an
agent in `report.undone.closed.failed`; nothing in the webview reads it.

## Failure scenario

Reset with two open orders; Commerce times out cancelling one. The ERPs are wiped; that
one Commerce order still points at a sales order that no longer exists — exactly the
half-an-order state AB-16n set out to remove — and the SC sees a green "reset" toast.

## Fix

Refuse the wipe when `closed.failed` is non-empty, with the failures in the answer
(which orders, why), so the SC re-runs after fixing or cancelling by hand. Nothing is
wiped on a refusal, so the reset stays re-runnable to zero (the idempotency rule).
Also the toast (`useComponentOperation.ts` ~121) still says "Resetting {one ERP}
records" while the reset covers every ERP — say the integration's ERPs.

## Verification

Handler test: a report with `closed.failed` non-empty → no wipe call, the answer names
the failed orders; one with `closed.failed` empty → wipe proceeds as before.

## Shipped so far

- 2026-09-30  2026-09-30 GUARD FIXED (demo-builder-vscode 5fb90b464 on feature/erp-integration — where the reset code lives; the worktree's commit hook took Backlog: AB-16n, this item's parent). closeOffAndDetach now refuses the wipe when closed.failed is non-empty and names each order and reason; nothing is touched, so the reset is re-run once they are dealt with. Test added (28/28); tsc src+tests and eslint clean. REMAINING (low): the webview toast still says 'Resetting <one ERP> records' — the name comes from the card model's system action (IntegrationsGrid.tsx handleSystemAction → confirmReset → pendingReset.erpName); the handler side already says '<integration>'s ERPs'.
- 2026-10-03  Reconciled 2026-10-03: the 'toast names one ERP' leftover looks fixed — IntegrationsGrid.tsx holds pendingReset.erpNames[]. Verify on the next reset before closing.

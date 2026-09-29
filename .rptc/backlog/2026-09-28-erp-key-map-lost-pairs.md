---
id: AB-16g
kind: fix
area: app-builder
parent: AB-16
needs: []
value: high
status: active
---

# Northwind's key map lost its company pairs

Filed 2026-09-28 (loop, while proving AB-26z live on Bodea).

## What was measured

- `get_erp_record` for company 21 (Kukla Studios): found in Commerce, not in the ERP, although
  Northwind holds customer `C21` Kukla Studios.
- Replaying Northwind's price event for C21 into `company-backoffice/contract-updated` answered
  "skipped: partner C21 is paired with no Commerce company".
- Load demo data for Northwind (12:5x UTC) answered `paired: 4` and the prices then published,
  so the pairs were absent before it and present after.

## Ruled out

- The merge: `mergeKeyMap` (src/features/app-builder/services/erpList.ts) keeps every other
  ERP's rows and replaces only the filled ERP's.
- The read and write shapes: Demo Builder reads `{ entries }` and the integration's
  `erp/keymap` answers `{ entries }`.
- Expiry: the integration stores the key map for 365 days (`src/lib/key-map.js`).

## Candidates, in order

1. Something wrote the map with only another ERP's rows: Contoso's first fill (add ERP retry,
   ~09:05 UTC) against integration `d6ef93c`, or a PUT from a code path that does not merge.
   Check every `replaceKeyMap` caller in Demo Builder and every writer in the integration.
2. A deploy or install step that clears State.

## Why it matters

Without the pairs, a company's contract prices and its orders' customer are not found: prices
are skipped and orders go to the walk-in customer, silently. Load demo data restores them.

## Shipped so far

- 2026-09-28  2026-09-28 one path found and closed, cause still unproven: a fill for an added ERP whose catalog entry could not be read fell back to the first ERP's list id, so its pairs replaced the first ERP's (mergeKeyMap drops the named ERP's rows). It now stops with the reason. Contoso's record carries its catalogId today, so whether this happened on 2026-09-28 cannot be read back; the integration's key map keeps no history. Still to check: the integration's pairCustomer read-modify-write racing Demo Builder's PUT during a fill.
- 2026-09-29  2026-09-28 (loop) ROOT CAUSE PROVEN in code (the 'still to check' race): the integration's key map is a single State document (key 'erp-key-map', src/lib/key-map.js) written by TWO unguarded read-modify-write PUTs with no compare-and-swap or lock — pairCustomer (readKeyMap -> filter -> writeKeyMap, lines 136-144) and replaceKeyMap (Demo Builder's fill, line 120). state().put is last-writer-wins (writeKeyMap line 64-66). So a fill's replaceKeyMap (T1) landing between a concurrent event-driven pairCustomer's read (T0) and write (T2) is clobbered by a stale map -> lost company pairs, exactly the measured symptom; two concurrent pairCustomer calls race the same way. Reachable whenever a fill overlaps a company event or two company events overlap (candidate: the ~09:05 add-ERP fill overlapping settling events). RECOMMENDED FIX (AB-16g's remaining work, extends an established pattern): serialize ALL key-map writes under a State lock mirroring lockOrder (src/lib/order-parts.js, used by src/router/part-fulfilment.js 'one at a time, under the order's lock'). No data-model or UX change; pure correctness. Implement RED-first: a test that interleaves replaceKeyMap and pairCustomer and asserts no pair is lost, then the lock makes it green.

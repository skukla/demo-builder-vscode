---
id: AB-16g
kind: fix
area: app-builder
parent: AB-16
needs: []
value: high
status: backlog
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

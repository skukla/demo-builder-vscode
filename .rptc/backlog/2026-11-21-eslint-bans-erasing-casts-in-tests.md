---
id: PL-112
kind: chore
area: platform
parent: PL-32
needs: []
value: low
status: built
---

# Tests ban `as any` and `as never` through eslint, and the zero-count ceiling test is deleted

Filed 2026-11-21 from the backlog reconciliation (PL-32 named it as left; PL-34 called it "polish,
for whoever picks it up").

PL-32 took the type-erasing casts in tests to zero. What it said comes next is not done:
`tests/sop/type-erasing-casts.test.ts` and its ledger still exist (ledger at 0/0), and
`eslint.config.mjs` (line 231) still turns `@typescript-eslint/no-explicit-any` off for tests, with no
`no-restricted-syntax` rule for `as any` or `as never`.

Done when eslint fails a new `as any` or `as never` in tests, and the ceiling test and its ledger are
deleted in the same change.

## Shipped so far

- 2026-11-23  Loop 2026-11-23: built (bf99e972e, on loop/2026-11-23-backlog). no-restricted-syntax fails as any / as never and their arrays in tests/ (0 hits across tests/ today); ceiling suite and ledger deleted; enforcer counts 74 to 73; convention proof PROVEN against eslint. Reviewed (opus, 3 findings fixed).

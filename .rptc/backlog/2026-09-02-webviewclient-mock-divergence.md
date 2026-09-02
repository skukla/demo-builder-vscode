---
id: PL-38
kind: question
area: platform
needs: []
value: med
status: open
---

# 47 files mock `WebviewClient`. There are 33 different versions of it.

Measured 2026-09-02 during the clone-ledger burn-down, by hashing every
`jest.mock('@/core/ui/utils/WebviewClient', …)` body in `tests/` with comments
stripped:

| identical copies | how many groups |
|---|---|
| 7 | 1 (the whole PrerequisitesStep family) |
| 5 | 2 |
| 4 | 1 |
| 3 | 1 |
| 2 | 5 |
| 1 | 23 |

47 files, 33 distinct bodies. Reproduce with the script in the commit that added
`tests/features/eds/ui/hooks/edsAuthHooks.testUtils.tsx`, or by grouping
`grep -rl "jest.mock('@/core/ui/utils/WebviewClient'" tests/` on a
whitespace-and-comment-stripped hash of each body.

## Why this is a question, not a chore

There is no "done" to ship here until someone decides WHAT the canonical mock
is, and that is a judgement call with a real trade-off on both sides:

- The 23 one-offs are not obviously wrong. A suite that only needs
  `postMessage` to exist is right to mock only that, and handing it a full
  client with a handler registry is the over-mocking the directory convention
  exists to prevent.
- But 33 versions of one module's double means no reader can know which one
  describes the client's actual contract, and a change to `WebviewClient`
  cannot be audited against its mocks — the failure `CLAUDE.md` names as
  "changing a contract means auditing its MOCKS, not just its callers".

So the question is: is there ONE shape with options (a `createWebviewClientMock({...})`
in `tests/helpers/`), or a small number of named shapes (bare / with-handlers /
with-request), or is this divergence fine and only the exact-duplicate clusters
worth collapsing?

## What is already known

- The exact-duplicate CLUSTERS are cheap and safe to collapse: the two EDS auth
  hook suites were done on 2026-09-02 and their 17 tests did not move.
  The 7-file PrerequisitesStep group and the two 5-file groups are the same
  shape of work.
- Whatever is shared must be imported BEFORE the subject in every consumer —
  `jest.mock` hoists above the imports of the module it appears in, not across
  modules. `tests/sop/mock-wall-import-order.test.ts` enforces that and has
  already caught two real instances.
- `tests/helpers/webviewFixtures.ts` is where a house version would belong. It
  is typechecked by `npm run typecheck:tests`, which is the point: the mock
  would then have to match the real interface instead of being remembered.

## Related

- `test-divergence-scan` — this is exactly the class that skill measures
  (26 StateManager fakes across 48 uses; 32 Project shapes across 38).
- [[PL-9]] — the clone-ledger burn-down that surfaced it. The ledger only sees
  byte-identical pairs, so it found the 2-file cluster and is blind to the
  other 31 versions.

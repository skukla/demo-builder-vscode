---
id: PL-38
kind: question
area: platform
needs: []
value: med
status: open
---

# Our two most-mocked modules are faked 122 different ways

Two measurements, same question. Both taken 2026-09-02 during the clone-ledger
burn-down by hashing every `jest.mock` body for the module with comments
stripped.

## `vscode` — 101 files, 89 versions

| identical copies | how many groups |
|---|---|
| 5 | 2 |
| 2 | 4 |
| 1 | **83** |

One directory alone (`tests/features/dashboard/handlers`) holds 16 files with
15 distinct walls.

## `WebviewClient` — 47 files, 33 versions

| identical copies | how many groups |
|---|---|
| 7 | 1 (the whole PrerequisitesStep family) |
| 5 | 2 |
| 4 | 1 |
| 3 | 1 |
| 2 | 5 |
| 1 | 23 |

Reproduce either by grouping `grep -rl "jest.mock('<module>'" tests/` on a
whitespace-and-comment-stripped hash of each wall body.

## The two are not the same case, and that is part of the question

`vscode` is a huge surface and no suite needs all of it, so a long tail of
one-offs there may be exactly right — mocking only what the tree renders is the
directory convention. `WebviewClient` is one small client with one contract, so
33 versions of it is harder to defend. A single answer may not fit both.

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
worth collapsing? And separately, does `vscode` want the same treatment or is
its long tail correct?

## What is already known

- The exact-duplicate CLUSTERS are cheap and safe to collapse: the two EDS auth
  hook suites were done on 2026-09-02 and their 17 tests did not move.
  The 7-file PrerequisitesStep group and the two 5-file groups are the same
  shape of work.
- **Whichever `jest.mock` registration runs LAST wins**, and a suite's own calls
  are hoisted to the very top of the suite — so a wall file the suite imports
  runs after them and takes precedence. Measured directly on 2026-09-02 with a
  throwaway suite that declared one factory and imported a file declaring
  another: the imported file's value is what the subject saw.

  An earlier line here said the opposite, on weaker evidence: deleting
  `dashboardHandlers-lifecycle`'s own `vscode` wall failed six tests, which
  shows only that the two walls DIFFER, not which one wins. The corrected rule
  is the one to build on — a shared wall cannot be partially overridden by a
  suite that imports it, so anything a suite needs different has to stay out of
  the shared file rather than be re-declared beside it.
- That is what blocks the `dashboardHandlers-actions` / `navigateBack` pair,
  which is adjudicated in the clone ledger for this reason: they agree on four
  walls the directory's testUtils already carries identically, and disagree on
  the fifth.
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

## Shipped so far

- 2026-09-02  docs(backlog): our two most-mocked modules are faked 122 different ways (PL-38) (`72175f000`)

---
id: PL-115
kind: chore
area: platform
parent: PL-38
needs: []
value: low
status: built
---

# WebviewClient suites use the shared double

Filed 2026-11-21 from the backlog reconciliation. PL-38 named 21 handle-delegating WebviewClient
suites as follow-on work; no item carried them.

On 2026-11-21, 35 test files mock WebviewClient without `tests/helpers/webviewClientMock.ts`, including
the nine-file PrerequisitesStep family PL-38 called "the same shape of work". One suite is a recorded
exception: `ProjectDashboardScreen.testUtils` needs `ready` left unresolved.

Done when every other suite uses the shared double.

## Shipped so far

- 2026-11-23  Loop 2026-11-23: built (dea97a50f, on loop/2026-11-23-backlog). 33 files converted to tests/helpers/webviewClientMock.ts; only the recorded exception (ProjectDashboardScreen.testUtils and its 11 suites) keeps its own wall. Full suite 39,858 tests, same per-file counts. Review found the import-order check blind to bare imports and to helpers that only import a wall; fixed in tests/sop/mock-wall-import-order.test.ts with two controls and a planted misorder that it now catches.

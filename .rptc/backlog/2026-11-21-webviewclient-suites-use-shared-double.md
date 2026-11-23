---
id: PL-115
kind: chore
area: platform
parent: PL-38
needs: []
value: low
status: backlog
---

# WebviewClient suites use the shared double

Filed 2026-11-21 from the backlog reconciliation. PL-38 named 21 handle-delegating WebviewClient
suites as follow-on work; no item carried them.

On 2026-11-21, 35 test files mock WebviewClient without `tests/helpers/webviewClientMock.ts`, including
the nine-file PrerequisitesStep family PL-38 called "the same shape of work". One suite is a recorded
exception: `ProjectDashboardScreen.testUtils` needs `ready` left unresolved.

Done when every other suite uses the shared double.
